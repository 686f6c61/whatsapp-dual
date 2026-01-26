/**
 * WhatsApp Dual - Security Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This module handles all security-related functionality:
 * - PIN/password protection with secure hashing
 * - Auto-lock after inactivity
 * - Lock on system suspend/screen lock
 * - Failed attempts handling with incremental delays
 * - Session file protection (permissions, integrity, secure delete)
 */

const { app, dialog, powerMonitor, ipcMain, safeStorage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');

// =============================================================================
// Store Instance
// =============================================================================
const store = new Store();

// =============================================================================
// Constants
// =============================================================================
const SECURITY_DEFAULTS = {
  pinEnabled: false,
  autoLockEnabled: true,
  autoLockTimeout: 5, // minutes
  lockOnSuspend: true,
  lockOnScreenLock: true,
  maxAttempts: 10,
  lockoutDuration: 30, // minutes
  deleteOnMaxAttempts: false // paranoia mode
};

const DELAY_SCHEDULE = [
  { attempts: 3, delay: 0 },
  { attempts: 5, delay: 5000 },      // 5 seconds
  { attempts: 7, delay: 30000 },     // 30 seconds
  { attempts: 9, delay: 300000 },    // 5 minutes
  { attempts: Infinity, delay: 1800000 } // 30 minutes lockout
];

// =============================================================================
// Security State
// =============================================================================
let lockTimer = null;
let isLocked = false;
let mainWindowRef = null;
let onLockCallback = null;
let onUnlockCallback = null;

// =============================================================================
// PIN Management
// =============================================================================

/**
 * Hash a PIN using PBKDF2 with a salt.
 *
 * @param {string} pin - The PIN to hash
 * @param {string} salt - The salt for hashing
 * @returns {string} The hashed PIN as hex string
 */
function hashPIN(pin, salt) {
  return crypto.pbkdf2Sync(pin, salt, 100000, 64, 'sha512').toString('hex');
}

/**
 * Check if PIN is set up.
 *
 * @returns {boolean} True if PIN is configured
 */
function isPINSet() {
  return store.has('security.pinData');
}

/**
 * Check if PIN protection is enabled.
 *
 * @returns {boolean} True if PIN is enabled
 */
function isPINEnabled() {
  return store.get('security.pinEnabled', false) && isPINSet();
}

/**
 * Set up a new PIN.
 *
 * @param {string} pin - The PIN to set (4-8 digits)
 * @returns {boolean} True if PIN was set successfully
 */
function setPIN(pin) {
  try {
    if (!pin || pin.length < 4 || pin.length > 8) {
      return false;
    }

    const salt = crypto.randomBytes(32).toString('hex');
    const hash = hashPIN(pin, salt);

    // Use safeStorage to encrypt the PIN data (uses OS keychain)
    const pinData = JSON.stringify({ salt, hash });

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(pinData);
      store.set('security.pinData', encrypted.toString('base64'));
    } else {
      // Fallback: store with basic obfuscation (less secure)
      store.set('security.pinData', Buffer.from(pinData).toString('base64'));
    }

    store.set('security.pinEnabled', true);
    resetFailedAttempts();

    return true;
  } catch (error) {
    console.error('Error setting PIN:', error);
    return false;
  }
}

/**
 * Verify a PIN against the stored hash.
 *
 * @param {string} pin - The PIN to verify
 * @returns {object} Result object with success status and attempt info
 */
function verifyPIN(pin) {
  try {
    // Check if locked out
    const lockoutStatus = checkLockout();
    if (lockoutStatus.locked) {
      return {
        success: false,
        locked: true,
        remainingTime: lockoutStatus.remainingTime,
        message: `Locked out. Try again in ${Math.ceil(lockoutStatus.remainingTime / 60000)} minutes.`
      };
    }

    // Get stored PIN data
    const storedData = store.get('security.pinData');
    if (!storedData) {
      return { success: false, message: 'PIN not set' };
    }

    let pinData;
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = Buffer.from(storedData, 'base64');
      pinData = JSON.parse(safeStorage.decryptString(encrypted));
    } else {
      pinData = JSON.parse(Buffer.from(storedData, 'base64').toString());
    }

    const { salt, hash } = pinData;
    const inputHash = hashPIN(pin, salt);

    if (inputHash === hash) {
      // Success
      resetFailedAttempts();
      return { success: true };
    } else {
      // Failed attempt
      return handleFailedAttempt();
    }
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return { success: false, message: 'Verification error' };
  }
}

/**
 * Change the PIN.
 *
 * @param {string} currentPIN - The current PIN
 * @param {string} newPIN - The new PIN
 * @returns {object} Result object
 */
function changePIN(currentPIN, newPIN) {
  const verification = verifyPIN(currentPIN);
  if (!verification.success) {
    return { success: false, message: 'Current PIN is incorrect' };
  }

  if (setPIN(newPIN)) {
    return { success: true };
  } else {
    return { success: false, message: 'Failed to set new PIN' };
  }
}

/**
 * Remove PIN protection.
 *
 * @param {string} currentPIN - The current PIN to verify
 * @returns {object} Result object
 */
function removePIN(currentPIN) {
  const verification = verifyPIN(currentPIN);
  if (!verification.success) {
    return { success: false, message: 'PIN is incorrect' };
  }

  store.delete('security.pinData');
  store.set('security.pinEnabled', false);
  resetFailedAttempts();

  return { success: true };
}

// =============================================================================
// Failed Attempts Handling
// =============================================================================

/**
 * Get the delay for the current number of attempts.
 *
 * @param {number} attempts - Number of failed attempts
 * @returns {number} Delay in milliseconds
 */
function getDelayForAttempts(attempts) {
  for (const schedule of DELAY_SCHEDULE) {
    if (attempts <= schedule.attempts) {
      return schedule.delay;
    }
  }
  return DELAY_SCHEDULE[DELAY_SCHEDULE.length - 1].delay;
}

/**
 * Handle a failed PIN attempt.
 *
 * @returns {object} Result object with attempt info
 */
function handleFailedAttempt() {
  const attempts = store.get('security.failedAttempts', 0) + 1;
  const maxAttempts = store.get('security.maxAttempts', SECURITY_DEFAULTS.maxAttempts);

  store.set('security.failedAttempts', attempts);
  store.set('security.lastFailedAttempt', Date.now());

  const delay = getDelayForAttempts(attempts);
  const remaining = Math.max(0, maxAttempts - attempts);

  // Check if paranoia mode is enabled and max attempts reached
  if (attempts >= maxAttempts && store.get('security.deleteOnMaxAttempts', false)) {
    // Delete all sessions
    secureDeleteAllSessions();
    resetApp();
    return {
      success: false,
      deleted: true,
      message: 'Maximum attempts reached. All sessions have been deleted.'
    };
  }

  return {
    success: false,
    attempts,
    remaining,
    delay,
    locked: attempts >= maxAttempts,
    message: remaining > 0
      ? `Incorrect PIN. ${remaining} attempts remaining.`
      : 'Maximum attempts reached. Please wait.'
  };
}

/**
 * Check if user is locked out.
 *
 * @returns {object} Lockout status
 */
function checkLockout() {
  const attempts = store.get('security.failedAttempts', 0);
  const maxAttempts = store.get('security.maxAttempts', SECURITY_DEFAULTS.maxAttempts);
  const lastFailed = store.get('security.lastFailedAttempt', 0);
  const lockoutDuration = store.get('security.lockoutDuration', SECURITY_DEFAULTS.lockoutDuration) * 60 * 1000;

  if (attempts >= maxAttempts) {
    const elapsed = Date.now() - lastFailed;
    if (elapsed < lockoutDuration) {
      return {
        locked: true,
        remainingTime: lockoutDuration - elapsed
      };
    } else {
      // Lockout expired, reset attempts
      resetFailedAttempts();
    }
  }

  return { locked: false };
}

/**
 * Reset failed attempts counter.
 */
function resetFailedAttempts() {
  store.set('security.failedAttempts', 0);
  store.delete('security.lastFailedAttempt');
}

// =============================================================================
// Auto-Lock
// =============================================================================

/**
 * Initialize auto-lock timer.
 *
 * @param {BrowserWindow} mainWindow - The main application window
 * @param {Function} onLock - Callback when app locks
 * @param {Function} onUnlock - Callback when app unlocks
 */
function initAutoLock(mainWindow, onLock, onUnlock) {
  mainWindowRef = mainWindow;
  onLockCallback = onLock;
  onUnlockCallback = onUnlock;

  // System power events
  if (store.get('security.lockOnSuspend', SECURITY_DEFAULTS.lockOnSuspend)) {
    powerMonitor.on('suspend', () => {
      if (isPINEnabled()) {
        lockApp();
      }
    });
  }

  if (store.get('security.lockOnScreenLock', SECURITY_DEFAULTS.lockOnScreenLock)) {
    powerMonitor.on('lock-screen', () => {
      if (isPINEnabled()) {
        lockApp();
      }
    });
  }

  // Start inactivity timer
  resetLockTimer();
}

/**
 * Reset the auto-lock timer.
 */
function resetLockTimer() {
  if (!store.get('security.autoLockEnabled', SECURITY_DEFAULTS.autoLockEnabled)) {
    return;
  }

  if (!isPINEnabled()) {
    return;
  }

  clearTimeout(lockTimer);

  const timeout = store.get('security.autoLockTimeout', SECURITY_DEFAULTS.autoLockTimeout) * 60 * 1000;

  lockTimer = setTimeout(() => {
    lockApp();
  }, timeout);
}

/**
 * Lock the application.
 */
function lockApp() {
  if (isLocked || !isPINEnabled()) {
    return;
  }

  isLocked = true;
  clearTimeout(lockTimer);

  if (onLockCallback) {
    onLockCallback();
  }
}

/**
 * Unlock the application.
 *
 * @param {string} pin - The PIN to verify
 * @returns {object} Result of unlock attempt
 */
function unlockApp(pin) {
  const result = verifyPIN(pin);

  if (result.success) {
    isLocked = false;
    resetLockTimer();

    if (onUnlockCallback) {
      onUnlockCallback();
    }
  }

  return result;
}

/**
 * Check if app is locked.
 *
 * @returns {boolean} True if app is locked
 */
function isAppLocked() {
  return isLocked;
}

// =============================================================================
// File Protection
// =============================================================================

/**
 * Secure session files with restrictive permissions.
 */
function secureSessionFiles() {
  try {
    const partitionsPath = path.join(app.getPath('userData'), 'Partitions');

    if (!fs.existsSync(partitionsPath)) {
      return;
    }

    setPermissionsRecursive(partitionsPath);
    console.log('Session files secured with restrictive permissions');
  } catch (error) {
    console.error('Error securing session files:', error);
  }
}

/**
 * Set restrictive permissions recursively.
 *
 * @param {string} dirPath - Directory path
 */
function setPermissionsRecursive(dirPath) {
  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        fs.chmodSync(fullPath, 0o700); // rwx------
        setPermissionsRecursive(fullPath);
      } else {
        fs.chmodSync(fullPath, 0o600); // rw-------
      }
    }
  } catch (error) {
    // Ignore permission errors (EPERM/EACCES) — log others
    if (error.code !== 'EPERM' && error.code !== 'EACCES') {
      console.error(`Error setting permissions on ${dirPath}:`, error);
    }
  }
}

/**
 * Calculate hash of session files for integrity verification.
 *
 * @param {string} partition - Partition name
 * @returns {string|null} Hash or null if error
 */
function calculateSessionHash(partition) {
  try {
    const sessionPath = path.join(app.getPath('userData'), 'Partitions', partition);

    if (!fs.existsSync(sessionPath)) {
      return null;
    }

    const hash = crypto.createHash('sha256');
    const files = getFilesRecursive(sessionPath);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file);
        hash.update(content);
      } catch (e) {
        // Skip files that can't be read
      }
    }

    return hash.digest('hex');
  } catch (error) {
    console.error('Error calculating session hash:', error);
    return null;
  }
}

/**
 * Get all files recursively from a directory.
 *
 * @param {string} dirPath - Directory path
 * @returns {string[]} Array of file paths
 */
function getFilesRecursive(dirPath) {
  const files = [];

  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...getFilesRecursive(fullPath));
      } else {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore errors
  }

  return files;
}

/**
 * Save session hashes for integrity verification.
 */
function saveSessionHashes() {
  try {
    const hashes = {
      personal: calculateSessionHash('persist:whatsapp-personal'),
      business: calculateSessionHash('persist:whatsapp-business'),
      timestamp: Date.now()
    };

    store.set('security.sessionHashes', hashes);
  } catch (error) {
    console.error('Error saving session hashes:', error);
  }
}

/**
 * Verify session integrity.
 *
 * @returns {object} Integrity status for each account
 */
function verifySessionIntegrity() {
  const saved = store.get('security.sessionHashes');

  if (!saved) {
    return { verified: true, firstRun: true };
  }

  const currentPersonal = calculateSessionHash('persist:whatsapp-personal');
  const currentBusiness = calculateSessionHash('persist:whatsapp-business');

  const personalOk = !saved.personal || currentPersonal === saved.personal;
  const businessOk = !saved.business || currentBusiness === saved.business;

  return {
    verified: personalOk && businessOk,
    personal: personalOk,
    business: businessOk,
    lastCheck: saved.timestamp
  };
}

/**
 * Show integrity warning dialog.
 */
function showIntegrityWarning() {
  dialog.showMessageBox({
    type: 'warning',
    title: 'Security Alert',
    message: 'Session files may have been modified externally.',
    detail: 'Your WhatsApp sessions may have been accessed or tampered with while the app was closed. Consider logging out and scanning the QR code again for security.',
    buttons: ['OK', 'Logout All Sessions'],
    defaultId: 0
  }).then(result => {
    if (result.response === 1) {
      secureDeleteAllSessions();
      app.relaunch();
      app.exit(0);
    }
  });
}

// =============================================================================
// Secure Delete
// =============================================================================

/**
 * Securely delete a file by overwriting with random data.
 *
 * @param {string} filePath - Path to file
 */
function secureDeleteFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const stat = fs.statSync(filePath);
    const size = stat.size;

    // 3 passes of random data
    for (let pass = 0; pass < 3; pass++) {
      const randomData = crypto.randomBytes(size);
      fs.writeFileSync(filePath, randomData);
    }

    // Final delete
    fs.unlinkSync(filePath);
  } catch (error) {
    // Try regular delete as fallback
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // Ignore
    }
  }
}

/**
 * Securely delete a session partition.
 *
 * @param {string} partition - Partition name
 */
function secureDeleteSession(partition) {
  try {
    const sessionPath = path.join(app.getPath('userData'), 'Partitions', partition);

    if (!fs.existsSync(sessionPath)) {
      return;
    }

    const files = getFilesRecursive(sessionPath);

    for (const file of files) {
      secureDeleteFile(file);
    }

    // Remove empty directories
    fs.rmSync(sessionPath, { recursive: true, force: true });

    console.log(`Session ${partition} securely deleted`);
  } catch (error) {
    console.error(`Error deleting session ${partition}:`, error);
  }
}

/**
 * Securely delete all sessions.
 */
function secureDeleteAllSessions() {
  secureDeleteSession('persist:whatsapp-personal');
  secureDeleteSession('persist:whatsapp-business');
  store.delete('security.sessionHashes');
}

/**
 * Reset the entire app (delete PIN and sessions).
 */
function resetApp() {
  return new Promise((resolve) => {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Reset App',
      message: 'This will delete all WhatsApp sessions and remove PIN protection.',
      detail: 'You will need to scan QR codes again to log in.',
      buttons: ['Cancel', 'Reset Everything'],
      defaultId: 0,
      cancelId: 0
    }).then(result => {
      if (result.response === 1) {
        // Delete PIN
        store.delete('security.pinData');
        store.set('security.pinEnabled', false);
        resetFailedAttempts();

        // Delete sessions
        secureDeleteAllSessions();

        // Relaunch app
        app.relaunch();
        app.exit(0);

        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// =============================================================================
// Settings Management
// =============================================================================

/**
 * Get all security settings.
 *
 * @returns {object} Security settings
 */
function getSecuritySettings() {
  return {
    pinEnabled: store.get('security.pinEnabled', SECURITY_DEFAULTS.pinEnabled),
    pinSet: isPINSet(),
    autoLockEnabled: store.get('security.autoLockEnabled', SECURITY_DEFAULTS.autoLockEnabled),
    autoLockTimeout: store.get('security.autoLockTimeout', SECURITY_DEFAULTS.autoLockTimeout),
    lockOnSuspend: store.get('security.lockOnSuspend', SECURITY_DEFAULTS.lockOnSuspend),
    lockOnScreenLock: store.get('security.lockOnScreenLock', SECURITY_DEFAULTS.lockOnScreenLock),
    maxAttempts: store.get('security.maxAttempts', SECURITY_DEFAULTS.maxAttempts),
    lockoutDuration: store.get('security.lockoutDuration', SECURITY_DEFAULTS.lockoutDuration),
    deleteOnMaxAttempts: store.get('security.deleteOnMaxAttempts', SECURITY_DEFAULTS.deleteOnMaxAttempts)
  };
}

/**
 * Update security settings.
 *
 * @param {object} settings - Settings to update
 */
function updateSecuritySettings(settings) {
  const allowedKeys = [
    'autoLockEnabled',
    'autoLockTimeout',
    'lockOnSuspend',
    'lockOnScreenLock',
    'maxAttempts',
    'lockoutDuration',
    'deleteOnMaxAttempts'
  ];

  for (const key of allowedKeys) {
    if (Object.hasOwn(settings, key)) {
      store.set(`security.${key}`, settings[key]);
    }
  }

  // Reinitialize auto-lock timer with new settings
  resetLockTimer();
}

// =============================================================================
// IPC Handlers
// =============================================================================

/**
 * Register IPC handlers for security operations.
 *
 * @param {Function} [getWindows] - Callback that returns { settings, lock, main } window refs
 */
function registerIPCHandlers(getWindows) {
  /**
   * Validates that the IPC event sender is one of our known windows.
   * Prevents rogue webContents from invoking security-sensitive handlers.
   *
   * @param {Electron.IpcMainInvokeEvent} event - IPC event
   * @returns {boolean} True if sender is authorized
   */
  function validateSender(event) {
    if (!getWindows) return true;
    const windows = getWindows();
    return Object.values(windows).some(win =>
      win && !win.isDestroyed() && win.webContents === event.sender
    );
  }
  // PIN operations (read-only — no sender validation needed)
  ipcMain.handle('security:isPINSet', () => isPINSet());
  ipcMain.handle('security:isPINEnabled', () => isPINEnabled());

  // PIN operations (mutating — validate sender)
  ipcMain.handle('security:setPIN', (event, pin) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    return { success: setPIN(pin) };
  });
  ipcMain.handle('security:verifyPIN', (event, pin) => verifyPIN(pin));
  ipcMain.handle('security:changePIN', (event, currentPIN, newPIN) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    return changePIN(currentPIN, newPIN);
  });
  ipcMain.handle('security:removePIN', (event, pin) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    // Always require PIN verification (S4 fix)
    if (!pin) {
      return { success: false, message: 'PIN is required' };
    }
    return removePIN(pin);
  });

  // Lock operations (read-only)
  ipcMain.handle('security:isLocked', () => isAppLocked());
  // Lock operations (mutating — validate sender)
  ipcMain.handle('security:unlock', (event, pin) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    return unlockApp(pin);
  });
  ipcMain.handle('security:lock', (event) => {
    if (!validateSender(event)) return false;
    lockApp();
    return true;
  });

  // Lockout check (read-only — B4 fix)
  ipcMain.handle('security:checkLockout', () => checkLockout());

  // Settings (read-only)
  ipcMain.handle('security:getSettings', () => getSecuritySettings());
  // Settings (mutating — validate sender)
  ipcMain.handle('security:updateSettings', (event, settings) => {
    if (!validateSender(event)) return false;
    updateSecuritySettings(settings);
    return true;
  });
  ipcMain.handle('security:saveSettings', (event, settings) => {
    if (!validateSender(event)) return false;
    // Handle pinEnabled separately (can only disable if PIN is set)
    if (Object.hasOwn(settings, 'pinEnabled')) {
      if (settings.pinEnabled && !isPINSet()) {
        // Can't enable PIN if not set - will be handled by UI
      } else {
        store.set('security.pinEnabled', settings.pinEnabled);
      }
    }
    // Update other settings
    updateSecuritySettings(settings);
    return true;
  });

  // Reset (mutating — validate sender)
  ipcMain.handle('security:resetApp', (event) => {
    if (!validateSender(event)) return false;
    return resetApp();
  });

  // Activity (to reset timer)
  ipcMain.on('security:activity', () => resetLockTimer());
}

// =============================================================================
// Module Exports
// =============================================================================
module.exports = {
  // PIN
  isPINSet,
  isPINEnabled,
  setPIN,
  verifyPIN,
  changePIN,
  removePIN,

  // Lock
  initAutoLock,
  resetLockTimer,
  lockApp,
  unlockApp,
  isAppLocked,

  // File protection
  secureSessionFiles,
  saveSessionHashes,
  verifySessionIntegrity,
  showIntegrityWarning,

  // Secure delete
  secureDeleteSession,
  secureDeleteAllSessions,
  resetApp,

  // Settings
  getSecuritySettings,
  updateSecuritySettings,

  // IPC
  registerIPCHandlers,

  // Constants
  SECURITY_DEFAULTS
};
