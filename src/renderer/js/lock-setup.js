/**
 * WhatsApp Dual - PIN Setup Screen Logic
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * Handles PIN creation with two-step confirmation.
 */

// =============================================================================
// State
// =============================================================================
let currentPIN = '';
let firstPIN = '';
let step = 1; // 0 = verify current PIN, 1 = enter new PIN, 2 = confirm PIN
let translations = {}; // Q8 — i18n translations
const setupMode = new URLSearchParams(globalThis.location.search).get('mode') === 'change' ? 'change' : 'setup';
let verifiedCurrentPIN = '';

// =============================================================================
// Translation Helper (Q8)
// =============================================================================

/**
 * Retrieves a translated string by dot-notation key.
 * Delegates to the shared helper loaded from js/i18n-helper.js.
 *
 * @param {string} key - Dot-notation key
 * @param {string} [fallback] - Fallback if key not found
 * @returns {string}
 */
const t = (key, fallback) => translate(translations, key, fallback);

/**
 * Applies loaded translations to static DOM elements.
 *
 * @returns {void}
 */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n;
    const translation = t(key);
    if (translation && translation !== key) {
      element.textContent = translation;
    }
  });
}

// =============================================================================
// DOM Elements
// =============================================================================
const pinInput = document.getElementById('pin-input');
const pinDots = document.querySelectorAll('.pin-dot');
const statusMessage = document.getElementById('status-message');
const lockTitle = document.querySelector('.lock-title');
const setupSubtitle = document.getElementById('setup-subtitle');
const numpadButtons = document.querySelectorAll('.numpad-btn');
const submitBtn = document.querySelector('.numpad-submit');
const skipBtn = document.getElementById('btn-skip');
const stepIndicator = document.querySelector('.step-indicator');
const stepIndicators = document.querySelectorAll('.step');
const stepLine = document.querySelector('.step-line');
const reqLength = document.getElementById('req-length');
const reqNumbers = document.getElementById('req-numbers');

// =============================================================================
// PIN Input Handling
// =============================================================================

/**
 * Add a digit to the PIN.
 *
 * @param {string} digit - The digit to add
 */
function addDigit(digit) {
  if (currentPIN.length >= 8) {
    return;
  }

  currentPIN += digit;
  updatePINDisplay();
  validatePIN();
}

/**
 * Remove the last digit from the PIN.
 */
function removeDigit() {
  if (currentPIN.length === 0) {
    return;
  }

  currentPIN = currentPIN.slice(0, -1);
  updatePINDisplay();
  validatePIN();
  clearStatus();
}

/**
 * Clear the entire PIN.
 */
function clearPIN() {
  currentPIN = '';
  updatePINDisplay();
  validatePIN();
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
 * Validate PIN and update requirements display.
 */
function validatePIN() {
  const isValidLength = currentPIN.length >= 4 && currentPIN.length <= 8;
  const isValidNumbers = /^\d*$/.test(currentPIN);

  // Update requirements display
  if (reqLength) {
    reqLength.classList.toggle('valid', isValidLength);
  }
  if (reqNumbers) {
    reqNumbers.classList.toggle('valid', isValidNumbers && currentPIN.length > 0);
  }

  // Enable/disable submit button
  const isValid = isValidLength && isValidNumbers;
  if (submitBtn) {
    submitBtn.disabled = !isValid;
  }

  return isValid;
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

  setTimeout(() => {
    pinDots.forEach(dot => dot.classList.remove('error'));
    clearPIN();
  }, 500);
}

// =============================================================================
// Setup Steps
// =============================================================================

/**
 * Submit the current step.
 */
async function submitStep() {
  if (step === 0) {
    await verifyCurrentPIN();
    return;
  }

  if (!validatePIN()) {
    return;
  }

  if (step === 1) {
    // Save first PIN and move to confirmation
    firstPIN = currentPIN;
    step = 2;
    updateStepUI();
    clearPIN();
  } else if (step === 2) {
    // Confirm PIN matches
    if (currentPIN === firstPIN) {
      await savePIN();
    } else {
      showPINError();
      showStatus(t('setup.pinMismatch', 'PINs do not match. Try again.'), 'error');
      // Reset to step 1
      step = 1;
      firstPIN = '';
      updateStepUI();
    }
  }
}

/**
 * Verify the current PIN before allowing a PIN change.
 *
 * @returns {Promise<void>}
 */
async function verifyCurrentPIN() {
  try {
    const result = await globalThis.electronAPI.security.verifyPIN(currentPIN);

    if (result?.success) {
      verifiedCurrentPIN = currentPIN;
      step = 1;
      clearPIN();
      clearStatus();
      updateStepUI();
      return;
    }

    showPINError();
    showStatus(result?.message || t('lock.incorrectPin', 'Incorrect PIN'), 'error');
  } catch (error) {
    console.error('Error verifying current PIN:', error);
    showStatus(t('lock.verificationError', 'Verification error'), 'error');
  }
}

/**
 * Update the header texts (title, skip button) for the current mode.
 *
 * @param {boolean} isChangeMode - True when changing an existing PIN
 */
function updateStepHeader(isChangeMode) {
  if (lockTitle) {
    lockTitle.textContent = isChangeMode
      ? t('settings.changePin', 'Change PIN')
      : t('setup.title', 'Set Up PIN');
  }

  if (skipBtn) {
    skipBtn.textContent = isChangeMode
      ? t('settings.cancel', 'Cancel')
      : t('setup.skip', 'Skip for now');
  }
}

/**
 * Update the step indicator dots and connecting line.
 */
function updateStepIndicators() {
  stepIndicators.forEach((indicator, index) => {
    const stepNum = index + 1;
    indicator.classList.toggle('active', stepNum === step);
    indicator.classList.toggle('completed', stepNum < step);
  });

  if (stepLine) {
    stepLine.classList.toggle('active', step > 1);
  }
}

/**
 * Update the subtitle text for the current step.
 *
 * @param {boolean} isCurrentPinStep - True while verifying the current PIN
 */
function updateStepSubtitle(isCurrentPinStep) {
  if (!setupSubtitle) return;

  let key = 'setup.confirmPin';
  let fallback = 'Confirm your PIN';
  if (isCurrentPinStep) {
    key = 'setup.enterCurrent';
    fallback = 'Enter your current PIN';
  } else if (step === 1) {
    key = 'setup.enterNew';
    fallback = 'Enter a new PIN (4-8 digits)';
  }

  setupSubtitle.textContent = t(key, fallback);
  setupSubtitle.dataset.i18n = key;
}

/**
 * Update the UI for the current step.
 */
function updateStepUI() {
  const isChangeMode = setupMode === 'change';
  const isCurrentPinStep = isChangeMode && step === 0;

  if (stepIndicator) {
    stepIndicator.hidden = isCurrentPinStep;
  }

  updateStepHeader(isChangeMode);
  updateStepIndicators();
  updateStepSubtitle(isCurrentPinStep);

  // Reset validation display for step 2
  if (step === 2 || isCurrentPinStep) {
    if (reqLength) reqLength.classList.remove('valid');
    if (reqNumbers) reqNumbers.classList.remove('valid');
  }
}

/**
 * Save the PIN.
 */
async function savePIN() {
  try {
    const result = setupMode === 'change'
      ? await globalThis.electronAPI.security.changePIN(verifiedCurrentPIN, currentPIN)
      : await globalThis.electronAPI.security.setPIN(currentPIN);

    if (result?.success) {
      showStatus(
        setupMode === 'change'
          ? t('setup.pinUpdated', 'PIN updated successfully!')
          : t('setup.pinSet', 'PIN set successfully!'),
        'success'
      );

      // Notify main process to continue to main app
      setTimeout(() => {
        globalThis.electronAPI.security.pinSetupComplete();
      }, 500);
    } else {
      showStatus(t('setup.pinSetFailed', 'Failed to set PIN. Try again.'), 'error');
      step = 1;
      firstPIN = '';
      updateStepUI();
      clearPIN();
    }
  } catch (error) {
    console.error('Error setting PIN:', error);
    showStatus(t('setup.pinSetError', 'Error setting PIN'), 'error');
  }
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

// =============================================================================
// Skip Setup
// =============================================================================

/**
 * Skip PIN setup.
 */
function skipSetup() {
  globalThis.electronAPI.security.skipPINSetup();
}

// =============================================================================
// Event Listeners
// =============================================================================

// Numpad buttons
numpadButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const num = btn.dataset.num;
    const action = btn.dataset.action;

    if (num !== undefined) {
      addDigit(num);
    } else if (action === 'clear') {
      removeDigit();
    } else if (action === 'submit') {
      submitStep();
    }
  });
});

// Keyboard input
document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') {
    addDigit(e.key);
  } else if (e.key === 'Backspace') {
    removeDigit();
  } else if (e.key === 'Enter') {
    submitStep();
  } else if (e.key === 'Escape') {
    clearPIN();
  }
});

// Skip button
if (skipBtn) {
  skipBtn.addEventListener('click', skipSetup);
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the setup screen.
 */
async function init() {
  // Focus for keyboard input
  document.body.focus();

  if (setupMode === 'change') {
    step = 0;
  }

  // Q8 — Load translations
  try {
    if (globalThis.electronAPI?.i18n) {
      translations = await globalThis.electronAPI.i18n.getTranslations() || {};
      applyTranslations();
    }
  } catch (error) {
    console.error('Error loading translations:', error);
  }

  // Initial validation
  validatePIN();
  updateStepUI();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
