/**
 * WhatsApp Dual - Lock Controller
 *
 * Manages auto-lock timers, power-monitor events
 * (suspend / lock-screen) and lock/unlock state.
 *
 * @author 686f6c61
 * @license MIT
 */

const { powerMonitor } = require('electron');

// ---------------------------------------------------------------------------
// Dependencies injected from outside
// ---------------------------------------------------------------------------
let _isPINEnabled = null;
let _verifyPIN = null;
let _store = null;
let _SECURITY_DEFAULTS = null;

/**
 * Inject dependencies from the facade so this module stays decoupled
 * from pin-manager.js (no circular require).
 *
 * @param {object} deps
 * @param {Function} deps.isPINEnabled
 * @param {Function} deps.verifyPIN
 * @param {object}   deps.store
 * @param {object}   deps.SECURITY_DEFAULTS
 */
function inject(deps) {
  _isPINEnabled = deps.isPINEnabled;
  _verifyPIN = deps.verifyPIN;
  _store = deps.store;
  _SECURITY_DEFAULTS = deps.SECURITY_DEFAULTS;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let lockTimer = null;
let isLocked = false;
let mainWindowRef = null;
let onLockCallback = null;
let onUnlockCallback = null;
let powerMonitorInitialized = false;

// ---------------------------------------------------------------------------
// Auto-lock
// ---------------------------------------------------------------------------

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

  // System power events (register once, check settings at event time)
  if (!powerMonitorInitialized) {
    powerMonitorInitialized = true;

    powerMonitor.on('suspend', () => {
      if (_isPINEnabled() && _store.get('security.lockOnSuspend', _SECURITY_DEFAULTS.lockOnSuspend)) {
        lockApp();
      }
    });

    powerMonitor.on('lock-screen', () => {
      if (_isPINEnabled() && _store.get('security.lockOnScreenLock', _SECURITY_DEFAULTS.lockOnScreenLock)) {
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
  clearTimeout(lockTimer);
  lockTimer = null;

  if (!_store.get('security.autoLockEnabled', _SECURITY_DEFAULTS.autoLockEnabled)) {
    return;
  }

  if (!_isPINEnabled()) {
    return;
  }

  const timeout = _store.get('security.autoLockTimeout', _SECURITY_DEFAULTS.autoLockTimeout) * 60 * 1000;

  lockTimer = setTimeout(() => {
    lockApp();
  }, timeout);
}

/**
 * Lock the application.
 */
function lockApp() {
  if (isLocked || !_isPINEnabled()) {
    return;
  }

  isLocked = true;
  clearTimeout(lockTimer);
  lockTimer = null;

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
  const result = _verifyPIN(pin);

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

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  inject,
  initAutoLock,
  resetLockTimer,
  lockApp,
  unlockApp,
  isAppLocked,
};
