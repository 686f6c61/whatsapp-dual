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
// Dependencies injected from outside (single container, set via inject())
// ---------------------------------------------------------------------------
const deps = {
  isPINEnabled: null,
  verifyPIN: null,
  store: null,
  SECURITY_DEFAULTS: null,
};

/**
 * Inject dependencies from the facade so this module stays decoupled
 * from pin-manager.js (no circular require).
 *
 * @param {object} injected
 * @param {Function} injected.isPINEnabled
 * @param {Function} injected.verifyPIN
 * @param {object}   injected.store
 * @param {object}   injected.SECURITY_DEFAULTS
 */
function inject(injected) {
  deps.isPINEnabled = injected.isPINEnabled;
  deps.verifyPIN = injected.verifyPIN;
  deps.store = injected.store;
  deps.SECURITY_DEFAULTS = injected.SECURITY_DEFAULTS;
}

// ---------------------------------------------------------------------------
// Module state (single container)
// ---------------------------------------------------------------------------
const state = {
  lockTimer: null,
  isLocked: false,
  mainWindowRef: null,
  onLockCallback: null,
  onUnlockCallback: null,
  powerMonitorInitialized: false,
};

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
  state.mainWindowRef = mainWindow;
  state.onLockCallback = onLock;
  state.onUnlockCallback = onUnlock;

  // System power events (register once, check settings at event time)
  if (!state.powerMonitorInitialized) {
    state.powerMonitorInitialized = true;

    powerMonitor.on('suspend', () => {
      if (deps.isPINEnabled() && deps.store.get('security.lockOnSuspend', deps.SECURITY_DEFAULTS.lockOnSuspend)) {
        lockApp();
      }
    });

    powerMonitor.on('lock-screen', () => {
      if (deps.isPINEnabled() && deps.store.get('security.lockOnScreenLock', deps.SECURITY_DEFAULTS.lockOnScreenLock)) {
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
  clearTimeout(state.lockTimer);
  state.lockTimer = null;

  if (!deps.store.get('security.autoLockEnabled', deps.SECURITY_DEFAULTS.autoLockEnabled)) {
    return;
  }

  if (!deps.isPINEnabled()) {
    return;
  }

  const timeout = deps.store.get('security.autoLockTimeout', deps.SECURITY_DEFAULTS.autoLockTimeout) * 60 * 1000;

  state.lockTimer = setTimeout(() => {
    lockApp();
  }, timeout);
}

/**
 * Lock the application.
 */
function lockApp() {
  if (state.isLocked || !deps.isPINEnabled()) {
    return;
  }

  state.isLocked = true;
  clearTimeout(state.lockTimer);
  state.lockTimer = null;

  if (state.onLockCallback) {
    state.onLockCallback();
  }
}

/**
 * Unlock the application.
 *
 * @param {string} pin - The PIN to verify
 * @returns {object} Result of unlock attempt
 */
function unlockApp(pin) {
  const result = deps.verifyPIN(pin);

  if (result.success) {
    state.isLocked = false;
    resetLockTimer();

    if (state.onUnlockCallback) {
      state.onUnlockCallback();
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
  return state.isLocked;
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
