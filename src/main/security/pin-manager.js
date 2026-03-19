/**
 * WhatsApp Dual - PIN Manager
 *
 * Handles PIN creation, verification, change, removal,
 * failed-attempt tracking, and lockout logic.
 *
 * @author 686f6c61
 * @license MIT
 */

const crypto = require('node:crypto');
const { app, dialog, safeStorage } = require('electron');

// ---------------------------------------------------------------------------
// Store (injected via initStore)
// ---------------------------------------------------------------------------
let store = null;

/**
 * Inject the shared electron-store instance.
 *
 * @param {object} sharedStore - The electron-store instance
 */
function initStore(sharedStore) {
  store = sharedStore;
}

// ---------------------------------------------------------------------------
// Constants (shared with other sub-modules via re-export)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// PIN management
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Failed attempts handling
// ---------------------------------------------------------------------------

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
  return DELAY_SCHEDULE.at(-1).delay;
}

/**
 * Handle a failed PIN attempt.
 *
 * NOTE: secureDeleteAllSessions is injected lazily from the facade to
 * avoid a circular dependency with session-protection.js.
 *
 * @returns {object} Result object with attempt info
 */
let _secureDeleteAllSessions = null;

function setSecureDeleteAllSessions(fn) {
  _secureDeleteAllSessions = fn;
}

function handleFailedAttempt() {
  const attempts = store.get('security.failedAttempts', 0) + 1;
  const maxAttempts = store.get('security.maxAttempts', SECURITY_DEFAULTS.maxAttempts);

  store.set('security.failedAttempts', attempts);
  store.set('security.lastFailedAttempt', Date.now());

  const delay = getDelayForAttempts(attempts);
  const remaining = Math.max(0, maxAttempts - attempts);

  // Check if paranoia mode is enabled and max attempts reached
  if (attempts >= maxAttempts && store.get('security.deleteOnMaxAttempts', false)) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Security Alert',
      message: 'Maximum attempts reached.',
      detail: 'All WhatsApp sessions will be permanently deleted.',
      buttons: ['Delete Sessions'],
      defaultId: 0,
      noLink: true,
    }).then(() => {
      if (_secureDeleteAllSessions) _secureDeleteAllSessions();
      app.relaunch();
      app.exit(0);
    });
    return {
      success: false,
      deleted: true,
      message: 'Maximum attempts reached. All sessions will be deleted.'
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

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  initStore,
  SECURITY_DEFAULTS,
  DELAY_SCHEDULE,

  // PIN
  hashPIN,
  isPINSet,
  isPINEnabled,
  setPIN,
  verifyPIN,
  changePIN,
  removePIN,

  // Failed attempts
  getDelayForAttempts,
  handleFailedAttempt,
  checkLockout,
  resetFailedAttempts,

  // Wiring helper (called by facade)
  setSecureDeleteAllSessions,
};
