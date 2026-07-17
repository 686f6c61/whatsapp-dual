/**
 * WhatsApp Dual - Security Module (facade)
 *
 * Thin entry point that wires the three focused sub-modules together
 * and re-exports their public API so that nothing else in the codebase
 * needs to change its imports.
 *
 * Sub-modules:
 *   security/pin-manager.js        - PIN CRUD + failed-attempts / lockout
 *   security/lock-controller.js    - auto-lock timer + power-monitor events
 *   security/session-protection.js - file permissions, integrity, secure delete
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 */

const { ipcMain } = require('electron');

const pinManager = require('./security/pin-manager');
const lockController = require('./security/lock-controller');
const sessionProtection = require('./security/session-protection');

// ---------------------------------------------------------------------------
// Store — shared across sub-modules
// ---------------------------------------------------------------------------
let store = null;

/**
 * Initialize the security module with the shared store instance.
 * Propagates the store to every sub-module that needs it and wires
 * cross-module dependencies (lock-controller needs isPINEnabled/verifyPIN,
 * pin-manager needs secureDeleteAllSessions for paranoia mode, etc.).
 *
 * @param {object} sharedStore - The electron-store instance from main.js
 */
function initStore(sharedStore) {
  store = sharedStore;

  // 1) PIN manager gets the store first (other modules depend on it);
  //    paranoia mode calls secureDeleteAllSessions from session-protection
  pinManager.inject({
    store: sharedStore,
    secureDeleteAllSessions: sessionProtection.secureDeleteAllSessions,
  });

  // 2) Lock controller needs PIN helpers + store + defaults
  lockController.inject({
    isPINEnabled: pinManager.isPINEnabled,
    verifyPIN: pinManager.verifyPIN,
    store: sharedStore,
    SECURITY_DEFAULTS: pinManager.SECURITY_DEFAULTS,
  });

  // 3) Session protection needs store + resetFailedAttempts
  sessionProtection.inject({
    store: sharedStore,
    resetFailedAttempts: pinManager.resetFailedAttempts,
  });
}

// ---------------------------------------------------------------------------
// Settings (touch multiple domains, so they stay in the facade)
// ---------------------------------------------------------------------------

/**
 * Get all security settings.
 *
 * @returns {object} Security settings
 */
function getSecuritySettings() {
  const DEFAULTS = pinManager.SECURITY_DEFAULTS;
  return {
    pinEnabled: store.get('security.pinEnabled', DEFAULTS.pinEnabled),
    pinSet: pinManager.isPINSet(),
    autoLockEnabled: store.get('security.autoLockEnabled', DEFAULTS.autoLockEnabled),
    autoLockTimeout: store.get('security.autoLockTimeout', DEFAULTS.autoLockTimeout),
    lockOnSuspend: store.get('security.lockOnSuspend', DEFAULTS.lockOnSuspend),
    lockOnScreenLock: store.get('security.lockOnScreenLock', DEFAULTS.lockOnScreenLock),
    maxAttempts: store.get('security.maxAttempts', DEFAULTS.maxAttempts),
    lockoutDuration: store.get('security.lockoutDuration', DEFAULTS.lockoutDuration),
    deleteOnMaxAttempts: store.get('security.deleteOnMaxAttempts', DEFAULTS.deleteOnMaxAttempts)
  };
}

/**
 * Update security settings.
 *
 * @param {object} settings - Settings to update
 */
function updateSecuritySettings(settings) {
  const validators = {
    autoLockEnabled:     (v) => typeof v === 'boolean',
    autoLockTimeout:     (v) => Number.isInteger(v) && v >= 1 && v <= 30,
    lockOnSuspend:       (v) => typeof v === 'boolean',
    lockOnScreenLock:    (v) => typeof v === 'boolean',
    maxAttempts:         (v) => Number.isInteger(v) && v >= 3 && v <= 20,
    lockoutDuration:     (v) => Number.isInteger(v) && v >= 1 && v <= 120,
    deleteOnMaxAttempts: (v) => typeof v === 'boolean',
  };

  for (const [key, validate] of Object.entries(validators)) {
    if (Object.hasOwn(settings, key) && validate(settings[key])) {
      store.set(`security.${key}`, settings[key]);
    }
  }

  // Reinitialize auto-lock timer with new settings
  lockController.resetLockTimer();
}

// ---------------------------------------------------------------------------
// IPC handlers (wire IPC to all sub-modules)
// ---------------------------------------------------------------------------

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
    const authorizedContents = [];

    for (const value of Object.values(windows)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item?.webContents && !item.webContents.isDestroyed()) {
            authorizedContents.push(item.webContents);
          }
        }
        continue;
      }

      if (value?.webContents && !value.webContents.isDestroyed()) {
        authorizedContents.push(value.webContents);
      }
    }

    return authorizedContents.includes(event.sender);
  }
  // PIN operations (read-only — no sender validation needed)
  ipcMain.handle('security:isPINSet', () => pinManager.isPINSet());
  ipcMain.handle('security:isPINEnabled', () => pinManager.isPINEnabled());

  // PIN operations (mutating — validate sender)
  ipcMain.handle('security:setPIN', (event, pin) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    if (typeof pin !== 'string') return { success: false, message: 'Invalid input' };
    return { success: pinManager.setPIN(pin) };
  });
  ipcMain.handle('security:verifyPIN', (event, pin) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    if (typeof pin !== 'string') return { success: false, message: 'Invalid input' };
    return pinManager.verifyPIN(pin);
  });
  ipcMain.handle('security:changePIN', (event, currentPIN, newPIN) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    if (typeof currentPIN !== 'string' || typeof newPIN !== 'string') return { success: false, message: 'Invalid input' };
    return pinManager.changePIN(currentPIN, newPIN);
  });
  ipcMain.handle('security:removePIN', (event, pin) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    if (typeof pin !== 'string' || !pin) return { success: false, message: 'PIN is required' };
    return pinManager.removePIN(pin);
  });

  // Lock operations (read-only)
  ipcMain.handle('security:isLocked', () => lockController.isAppLocked());
  // Lock operations (mutating — validate sender)
  ipcMain.handle('security:unlock', (event, pin) => {
    if (!validateSender(event)) return { success: false, message: 'Unauthorized' };
    if (typeof pin !== 'string') return { success: false, message: 'Invalid input' };
    return lockController.unlockApp(pin);
  });
  ipcMain.handle('security:lock', (event) => {
    if (!validateSender(event)) return false;
    lockController.lockApp();
    return true;
  });

  // Lockout check (read-only — B4 fix)
  ipcMain.handle('security:checkLockout', () => pinManager.checkLockout());

  // Settings (read-only)
  ipcMain.handle('security:getSettings', () => getSecuritySettings());
  // Settings (mutating — validate sender)
  ipcMain.handle('security:updateSettings', (event, settings) => {
    if (!validateSender(event)) return false;
    if (typeof settings !== 'object' || settings === null) return false;
    updateSecuritySettings(settings);
    return true;
  });
  ipcMain.handle('security:saveSettings', (event, settings) => {
    if (!validateSender(event)) return false;
    if (typeof settings !== 'object' || settings === null) return false;
    // Handle pinEnabled separately (can only enable if a PIN is set)
    let pinEnabledApplied = true;
    if (Object.hasOwn(settings, 'pinEnabled')) {
      if (settings.pinEnabled && !pinManager.isPINSet()) {
        pinEnabledApplied = false;
      } else {
        store.set('security.pinEnabled', settings.pinEnabled);
      }
    }
    // Update other settings
    updateSecuritySettings(settings);
    // Report failure if part of the payload could not be applied so the
    // renderer never believes an ignored pinEnabled request was saved
    return pinEnabledApplied;
  });

  // Reset (mutating — validate sender)
  ipcMain.handle('security:resetApp', async (event) => {
    if (!validateSender(event)) return false;
    return await sessionProtection.resetApp();
  });

  // Activity (to reset timer)
  ipcMain.on('security:activity', (event) => {
    if (!validateSender(event)) return;
    lockController.resetLockTimer();
  });
}

// ---------------------------------------------------------------------------
// Module exports — same public API as before
// ---------------------------------------------------------------------------
module.exports = {
  // Init
  initStore,

  // PIN (from pin-manager)
  isPINSet: pinManager.isPINSet,
  isPINEnabled: pinManager.isPINEnabled,
  setPIN: pinManager.setPIN,
  verifyPIN: pinManager.verifyPIN,
  changePIN: pinManager.changePIN,
  removePIN: pinManager.removePIN,

  // Lock (from lock-controller)
  initAutoLock: lockController.initAutoLock,
  resetLockTimer: lockController.resetLockTimer,
  lockApp: lockController.lockApp,
  unlockApp: lockController.unlockApp,
  isAppLocked: lockController.isAppLocked,

  // File protection (from session-protection)
  secureSessionFiles: sessionProtection.secureSessionFiles,
  saveSessionHashes: sessionProtection.saveSessionHashes,
  verifySessionIntegrity: sessionProtection.verifySessionIntegrity,
  showIntegrityWarning: sessionProtection.showIntegrityWarning,

  // Secure delete (from session-protection)
  secureDeleteSession: sessionProtection.secureDeleteSession,
  secureDeleteAllSessions: sessionProtection.secureDeleteAllSessions,
  resetApp: sessionProtection.resetApp,

  // Settings (facade)
  getSecuritySettings,
  updateSecuritySettings,

  // IPC (facade)
  registerIPCHandlers,

  // Constants (from pin-manager)
  SECURITY_DEFAULTS: pinManager.SECURITY_DEFAULTS,
};
