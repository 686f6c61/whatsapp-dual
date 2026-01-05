/**
 * WhatsApp Dual - PIN Setup Screen Logic
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * Handles PIN creation with two-step confirmation.
 */

// =============================================================================
// State
// =============================================================================
let currentPIN = '';
let firstPIN = '';
let step = 1; // 1 = enter new PIN, 2 = confirm PIN

// =============================================================================
// DOM Elements
// =============================================================================
const pinInput = document.getElementById('pin-input');
const pinDots = document.querySelectorAll('.pin-dot');
const statusMessage = document.getElementById('status-message');
const setupSubtitle = document.getElementById('setup-subtitle');
const numpadButtons = document.querySelectorAll('.numpad-btn');
const submitBtn = document.querySelector('.numpad-submit');
const skipBtn = document.getElementById('btn-skip');
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
      showStatus('PINs do not match. Try again.', 'error');
      // Reset to step 1
      step = 1;
      firstPIN = '';
      updateStepUI();
    }
  }
}

/**
 * Update the UI for the current step.
 */
function updateStepUI() {
  // Update step indicators
  stepIndicators.forEach((indicator, index) => {
    const stepNum = index + 1;
    indicator.classList.toggle('active', stepNum === step);
    indicator.classList.toggle('completed', stepNum < step);
  });

  // Update step line
  if (stepLine) {
    stepLine.classList.toggle('active', step > 1);
  }

  // Update subtitle
  if (setupSubtitle) {
    if (step === 1) {
      setupSubtitle.textContent = 'Enter a new PIN (4-8 digits)';
      setupSubtitle.setAttribute('data-i18n', 'setup.enterNew');
    } else {
      setupSubtitle.textContent = 'Confirm your PIN';
      setupSubtitle.setAttribute('data-i18n', 'setup.confirmPin');
    }
  }

  // Reset validation display for step 2
  if (step === 2) {
    if (reqLength) reqLength.classList.remove('valid');
    if (reqNumbers) reqNumbers.classList.remove('valid');
  }
}

/**
 * Save the PIN.
 */
async function savePIN() {
  try {
    const result = await window.electronAPI.security.setPIN(currentPIN);

    if (result) {
      showStatus('PIN set successfully!', 'success');

      // Notify main process to continue to main app
      setTimeout(() => {
        window.electronAPI.security.pinSetupComplete();
      }, 500);
    } else {
      showStatus('Failed to set PIN. Try again.', 'error');
      step = 1;
      firstPIN = '';
      updateStepUI();
      clearPIN();
    }
  } catch (error) {
    console.error('Error setting PIN:', error);
    showStatus('Error setting PIN', 'error');
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
  window.electronAPI.security.skipPINSetup();
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
function init() {
  // Focus for keyboard input
  document.body.focus();

  // Initial validation
  validatePIN();
  updateStepUI();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
