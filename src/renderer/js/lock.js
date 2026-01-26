/**
 * WhatsApp Dual - Lock Screen Logic
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * Handles PIN input, verification, and lockout management
 * for the lock screen.
 */

// =============================================================================
// State
// =============================================================================
let currentPIN = '';
let isLocked = false;
let lockoutEndTime = null;
let lockoutInterval = null;
let isSubmitting = false; // Q14 — debounce flag
let translations = {}; // Q8 — i18n translations

// =============================================================================
// DOM Elements
// =============================================================================
const pinInput = document.getElementById('pin-input');
const pinDots = document.querySelectorAll('.pin-dot');
const statusMessage = document.getElementById('status-message');
const attemptsInfo = document.getElementById('attempts-info');
const lockoutTimer = document.getElementById('lockout-timer');
const lockoutCountdown = document.getElementById('lockout-countdown');
const numpadButtons = document.querySelectorAll('.numpad-btn');
const forgotPinBtn = document.getElementById('btn-forgot-pin');
const resetModal = document.getElementById('reset-modal');
const cancelResetBtn = document.getElementById('btn-cancel-reset');
const confirmResetBtn = document.getElementById('btn-confirm-reset');
const lockIcon = document.querySelector('.lock-icon');

// =============================================================================
// Translation Helper (Q8)
// =============================================================================

/**
 * Retrieves a translated string by dot-notation key.
 *
 * @param {string} key - Dot-notation key
 * @param {string} [fallback] - Fallback if key not found
 * @returns {string}
 */
function t(key, fallback) {
  const parts = key.split('.');
  let current = translations;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return fallback !== undefined ? fallback : key;
    }
    current = current[part];
  }
  return typeof current === 'string' ? current : (fallback !== undefined ? fallback : key);
}

// =============================================================================
// PIN Input Handling
// =============================================================================

/**
 * Add a digit to the PIN.
 *
 * @param {string} digit - The digit to add
 */
function addDigit(digit) {
  if (isLocked || isSubmitting || currentPIN.length >= 8) {
    return;
  }

  currentPIN += digit;
  updatePINDisplay();

  // Auto-submit when 6+ digits entered
  if (currentPIN.length >= 6) {
    setTimeout(() => {
      if (currentPIN.length >= 4 && !isSubmitting) {
        submitPIN();
      }
    }, 300);
  }
}

/**
 * Remove the last digit from the PIN.
 */
function removeDigit() {
  if (isLocked || currentPIN.length === 0) {
    return;
  }

  currentPIN = currentPIN.slice(0, -1);
  updatePINDisplay();
  clearStatus();
}

/**
 * Clear the entire PIN.
 */
function clearPIN() {
  currentPIN = '';
  updatePINDisplay();
  clearStatus();
}

/**
 * Update the PIN dots display.
 */
function updatePINDisplay() {
  pinDots.forEach((dot, index) => {
    if (index < currentPIN.length) {
      dot.classList.add('filled');
      dot.classList.remove('error');
    } else {
      dot.classList.remove('filled', 'error');
    }
  });
}

/**
 * Show error animation on PIN dots.
 */
function showPINError() {
  pinDots.forEach(dot => {
    if (dot.classList.contains('filled')) {
      dot.classList.add('error');
    }
  });

  lockIcon.classList.add('error');

  setTimeout(() => {
    pinDots.forEach(dot => dot.classList.remove('error'));
    lockIcon.classList.remove('error');
    clearPIN();
  }, 500);
}

// =============================================================================
// PIN Verification
// =============================================================================

/**
 * Submit the PIN for verification.
 */
async function submitPIN() {
  if (isLocked || isSubmitting || currentPIN.length < 4) {
    return;
  }

  isSubmitting = true;

  try {
    // Use unlock instead of verifyPIN to trigger the callback
    const result = await window.electronAPI.security.unlock(currentPIN);

    if (result.success) {
      showStatus(t('lock.unlocked', 'Unlocked!'), 'success');
      // The main process onUnlockCallback will hide lock screen and show app
    } else if (result.locked) {
      handleLockout(result.remainingTime);
    } else if (result.deleted) {
      showStatus(result.message, 'error');
    } else {
      showPINError();
      showStatus(result.message, 'error');
      updateAttemptsInfo(result.remaining);

      // Apply delay if needed
      if (result.delay > 0) {
        disableInput(result.delay);
      }
    }
  } catch (error) {
    console.error('Error verifying PIN:', error);
    showStatus(t('lock.verificationError', 'Verification error'), 'error');
    showPINError();
  } finally {
    isSubmitting = false;
  }
}

// =============================================================================
// Lockout Handling
// =============================================================================

/**
 * Handle lockout state.
 *
 * @param {number} remainingTime - Time remaining in lockout (ms)
 */
function handleLockout(remainingTime) {
  isLocked = true;
  lockoutEndTime = Date.now() + remainingTime;

  lockoutTimer.classList.remove('hidden');
  disableNumpad(true);

  updateLockoutCountdown();
  lockoutInterval = setInterval(updateLockoutCountdown, 1000);
}

/**
 * Update the lockout countdown display.
 */
function updateLockoutCountdown() {
  const remaining = lockoutEndTime - Date.now();

  if (remaining <= 0) {
    clearInterval(lockoutInterval);
    lockoutTimer.classList.add('hidden');
    isLocked = false;
    disableNumpad(false);
    clearPIN();
    clearStatus();
    attemptsInfo.textContent = '';
    return;
  }

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  lockoutCountdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Disable input for a specified duration.
 *
 * @param {number} duration - Duration in milliseconds
 */
function disableInput(duration) {
  disableNumpad(true);

  setTimeout(() => {
    disableNumpad(false);
  }, duration);
}

/**
 * Enable or disable the numpad.
 *
 * @param {boolean} disabled - Whether to disable
 */
function disableNumpad(disabled) {
  numpadButtons.forEach(btn => {
    btn.disabled = disabled;
  });
}

// =============================================================================
// Status Display
// =============================================================================

/**
 * Show a status message.
 *
 * @param {string} message - Message to show
 * @param {string} type - Message type ('error', 'success', '')
 */
function showStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message';
  if (type) {
    statusMessage.classList.add(type);
  }
}

/**
 * Clear the status message.
 */
function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.className = 'status-message';
}

/**
 * Update the attempts info display.
 *
 * @param {number} remaining - Attempts remaining
 */
function updateAttemptsInfo(remaining) {
  if (remaining === undefined) {
    attemptsInfo.textContent = '';
    return;
  }

  attemptsInfo.textContent = `${remaining} ${t('lock.attemptsRemaining', 'attempts remaining')}`;
  attemptsInfo.className = 'attempts-info';

  if (remaining <= 3) {
    attemptsInfo.classList.add('danger');
  } else if (remaining <= 5) {
    attemptsInfo.classList.add('warning');
  }
}

// =============================================================================
// Reset App
// =============================================================================

/**
 * Show the reset confirmation modal.
 */
function showResetModal() {
  resetModal.classList.remove('hidden');
}

/**
 * Hide the reset confirmation modal.
 */
function hideResetModal() {
  resetModal.classList.add('hidden');
}

/**
 * Confirm app reset.
 */
async function confirmReset() {
  try {
    await window.electronAPI.security.resetApp();
  } catch (error) {
    console.error('Error resetting app:', error);
  }
}

// =============================================================================
// Event Listeners
// =============================================================================

// Numpad buttons
numpadButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const num = btn.getAttribute('data-num');
    const action = btn.getAttribute('data-action');

    if (num !== null) {
      addDigit(num);
    } else if (action === 'clear') {
      removeDigit();
    } else if (action === 'submit') {
      submitPIN();
    }
  });
});

// Keyboard input
document.addEventListener('keydown', (e) => {
  if (isLocked) return;

  if (e.key >= '0' && e.key <= '9') {
    addDigit(e.key);
  } else if (e.key === 'Backspace') {
    removeDigit();
  } else if (e.key === 'Enter') {
    submitPIN();
  } else if (e.key === 'Escape') {
    clearPIN();
  }
});

// Forgot PIN button
if (forgotPinBtn) {
  forgotPinBtn.addEventListener('click', showResetModal);
}

// Reset modal buttons
if (cancelResetBtn) {
  cancelResetBtn.addEventListener('click', hideResetModal);
}

if (confirmResetBtn) {
  confirmResetBtn.addEventListener('click', confirmReset);
}

// Close modal on background click
if (resetModal) {
  resetModal.addEventListener('click', (e) => {
    if (e.target === resetModal) {
      hideResetModal();
    }
  });
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the lock screen.
 */
async function init() {
  // Focus for keyboard input
  document.body.focus();

  // Q8 — Load translations
  try {
    if (window.electronAPI && window.electronAPI.i18n) {
      translations = await window.electronAPI.i18n.getTranslations() || {};
    }
  } catch (error) {
    console.error('Error loading translations:', error);
  }

  // B4 — Check initial lockout status
  try {
    const lockoutStatus = await window.electronAPI.security.checkLockout();
    if (lockoutStatus && lockoutStatus.locked) {
      handleLockout(lockoutStatus.remainingTime);
    }
  } catch (error) {
    console.error('Error checking lockout status:', error);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
