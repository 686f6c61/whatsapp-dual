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
// Dependencies injected from the facade
// ---------------------------------------------------------------------------
const deps = {
  store: null,
  secureDeleteAllSessions: null,
};

/**
 * Inject dependencies from the facade.
 *
 * secureDeleteAllSessions is injected (rather than required) to avoid a
 * circular dependency with session-protection.js.
 *
 * @param {object} injected
 * @param {object}   injected.store - The electron-store instance
 * @param {Function} [injected.secureDeleteAllSessions] - Paranoia-mode session wipe
 */
function inject(injected) {
  deps.store = injected.store;
  if (injected.secureDeleteAllSessions) {
    deps.secureDeleteAllSessions = injected.secureDeleteAllSessions;
  }
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

// PBKDF2-SHA512 work factor (OWASP baseline). Records created before the
// iterations field existed used LEGACY_PBKDF2_ITERATIONS and are upgraded
// transparently on the next successful verification.
const PBKDF2_ITERATIONS = 210000;
const LEGACY_PBKDF2_ITERATIONS = 100000;

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
 * @param {number} [iterations] - PBKDF2 iteration count (defaults to current work factor)
 * @returns {string} The hashed PIN as hex string
 */
function hashPIN(pin, salt, iterations = PBKDF2_ITERATIONS) {
  return crypto.pbkdf2Sync(pin, salt, iterations, 64, 'sha512').toString('hex');
}

/**
 * Compare two hex-encoded hashes in constant time.
 *
 * @param {string} a - Hex hash
 * @param {string} b - Hex hash
 * @returns {boolean} True if equal
 */
function hashesMatch(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Check if PIN is set up.
 *
 * @returns {boolean} True if PIN is configured
 */
function isPINSet() {
  return deps.store.has('security.pinData');
}

/**
 * Check if PIN protection is enabled.
 *
 * @returns {boolean} True if PIN is enabled
 */
function isPINEnabled() {
  return deps.store.get('security.pinEnabled', false) && isPINSet();
}

/**
 * Persist a PIN record, encrypted via the OS keychain when available.
 *
 * @param {{salt: string, hash: string, iterations: number}} record - PIN record
 */
function persistPinRecord(record) {
  const pinData = JSON.stringify(record);

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(pinData);
    deps.store.set('security.pinData', encrypted.toString('base64'));
  } else {
    // Fallback: store with basic obfuscation (less secure)
    deps.store.set('security.pinData', Buffer.from(pinData).toString('base64'));
  }
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

    persistPinRecord({ salt, hash, iterations: PBKDF2_ITERATIONS });
    deps.store.set('security.pinEnabled', true);
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
    const storedData = deps.store.get('security.pinData');
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
    const iterations = pinData.iterations || LEGACY_PBKDF2_ITERATIONS;
    const inputHash = hashPIN(pin, salt, iterations);

    if (hashesMatch(inputHash, hash)) {
      // Success — upgrade records still using an outdated work factor
      if (iterations !== PBKDF2_ITERATIONS) {
        const newSalt = crypto.randomBytes(32).toString('hex');
        persistPinRecord({
          salt: newSalt,
          hash: hashPIN(pin, newSalt),
          iterations: PBKDF2_ITERATIONS,
        });
      }
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

  deps.store.delete('security.pinData');
  deps.store.set('security.pinEnabled', false);
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
 * @returns {object} Result object with attempt info
 */
function handleFailedAttempt() {
  const attempts = deps.store.get('security.failedAttempts', 0) + 1;
  const maxAttempts = deps.store.get('security.maxAttempts', SECURITY_DEFAULTS.maxAttempts);

  deps.store.set('security.failedAttempts', attempts);
  deps.store.set('security.lastFailedAttempt', Date.now());

  const delay = getDelayForAttempts(attempts);
  const remaining = Math.max(0, maxAttempts - attempts);

  // Check if paranoia mode is enabled and max attempts reached
  if (attempts >= maxAttempts && deps.store.get('security.deleteOnMaxAttempts', false)) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Security Alert',
      message: 'Maximum attempts reached.',
      detail: 'All WhatsApp sessions will be permanently deleted.',
      buttons: ['Delete Sessions'],
      defaultId: 0,
      noLink: true,
    }).then(() => {
      if (deps.secureDeleteAllSessions) deps.secureDeleteAllSessions();
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
  const attempts = deps.store.get('security.failedAttempts', 0);
  const maxAttempts = deps.store.get('security.maxAttempts', SECURITY_DEFAULTS.maxAttempts);
  const lastFailed = deps.store.get('security.lastFailedAttempt', 0);
  const lockoutDuration = deps.store.get('security.lockoutDuration', SECURITY_DEFAULTS.lockoutDuration) * 60 * 1000;

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
  deps.store.set('security.failedAttempts', 0);
  deps.store.delete('security.lastFailedAttempt');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  inject,
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
};
