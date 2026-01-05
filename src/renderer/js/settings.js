/**
 * WhatsApp Dual - Settings Window Script
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This script handles the Settings modal window functionality.
 * It manages user preferences for the application behavior,
 * including language, startup options, and tray behavior.
 *
 * Available Settings:
 * - Language: UI language (English/Spanish)
 * - Start with system: Launch app on system startup
 * - Start minimized: Start hidden in system tray
 * - Minimize to tray: Hide to tray instead of closing
 * - Default account: Which account to show on startup
 *
 * Data Flow:
 * 1. Settings are loaded from electron-store on window open
 * 2. User modifies settings in the UI
 * 3. On save, settings are stored locally and sent to main process
 * 4. Main process updates menu, tray, and system settings
 */

const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const i18n = require('../shared/i18n');

// =============================================================================
// State
// =============================================================================

/** @type {Store} Persistent storage for user preferences */
const store = new Store();

// =============================================================================
// DOM Elements
// =============================================================================

/** @type {HTMLSelectElement} Language selector dropdown */
const selectLanguage = document.getElementById('select-language');

/** @type {HTMLInputElement} Checkbox for start with system */
const checkStartup = document.getElementById('check-startup');

/** @type {HTMLInputElement} Checkbox for start minimized */
const checkMinimized = document.getElementById('check-minimized');

/** @type {HTMLInputElement} Checkbox for minimize to tray */
const checkTray = document.getElementById('check-tray');

/** @type {HTMLSelectElement} Default account selector */
const selectDefaultAccount = document.getElementById('select-default-account');

// Security Settings Elements
/** @type {HTMLInputElement} Checkbox for PIN lock enabled */
const checkPinEnabled = document.getElementById('check-pin-enabled');

/** @type {HTMLButtonElement} Set up PIN button */
const btnSetupPin = document.getElementById('btn-setup-pin');

/** @type {HTMLButtonElement} Change PIN button */
const btnChangePin = document.getElementById('btn-change-pin');

/** @type {HTMLButtonElement} Remove PIN button */
const btnRemovePin = document.getElementById('btn-remove-pin');

/** @type {HTMLInputElement} Checkbox for auto-lock */
const checkAutolock = document.getElementById('check-autolock');

/** @type {HTMLSelectElement} Auto-lock timeout selector */
const selectAutolockTimeout = document.getElementById('select-autolock-timeout');

/** @type {HTMLInputElement} Checkbox for lock on suspend */
const checkLockSuspend = document.getElementById('check-lock-suspend');

/** @type {HTMLInputElement} Checkbox for lock on screen lock */
const checkLockScreenlock = document.getElementById('check-lock-screenlock');

/** @type {HTMLSelectElement} Maximum attempts selector */
const selectMaxAttempts = document.getElementById('select-max-attempts');

/** @type {HTMLSelectElement} Lockout duration selector */
const selectLockoutDuration = document.getElementById('select-lockout-duration');

/** @type {HTMLInputElement} Checkbox for delete on max attempts */
const checkDeleteOnMax = document.getElementById('check-delete-on-max');

/** @type {HTMLButtonElement} Lock Now button */
const btnLockNow = document.getElementById('btn-lock-now');

/** @type {HTMLElement} Lock Now row */
const lockNowRow = document.getElementById('lock-now-row');

/** @type {HTMLElement} Auto-lock section container */
const autolockSection = document.getElementById('autolock-section');

/** @type {HTMLElement} Advanced security section container */
const advancedSecuritySection = document.getElementById('advanced-security-section');

/** @type {HTMLElement} Auto-lock timeout row */
const autolockTimeoutRow = document.getElementById('autolock-timeout-row');

/** @type {boolean} Flag indicating if PIN is currently set */
let isPinSet = false;

/** @type {HTMLButtonElement} Save button */
const btnSave = document.getElementById('btn-save');

/** @type {HTMLButtonElement} Cancel button */
const btnCancel = document.getElementById('btn-cancel');

/** @type {HTMLButtonElement} Close button (X) */
const btnClose = document.getElementById('btn-close');

// =============================================================================
// Translation Functions
// =============================================================================

/**
 * Applies translations to all elements with data-i18n attribute.
 *
 * Finds all DOM elements marked with the data-i18n attribute and
 * updates their text content with the corresponding translation.
 * Also updates the window title.
 *
 * @returns {void}
 */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = i18n.t(key);
    if (translation && translation !== key) {
      element.textContent = translation;
    }
  });

  // Update window title
  document.title = i18n.t('settings.title', 'Settings');
}

// =============================================================================
// Settings Management
// =============================================================================

/**
 * Loads current settings from electron-store and populates the form.
 *
 * Retrieves saved preferences and sets the appropriate values
 * for all form controls. Also initializes i18n with the saved
 * language and applies translations to the UI.
 *
 * @returns {void}
 */
async function loadSettings() {
  // Language
  const savedLanguage = store.get('language', 'en');
  selectLanguage.value = savedLanguage;
  i18n.init(savedLanguage);
  applyTranslations();

  // Behavior
  checkStartup.checked = store.get('startWithSystem', false);
  checkMinimized.checked = store.get('startMinimized', false);
  checkTray.checked = store.get('minimizeToTray', true);
  selectDefaultAccount.value = store.get('defaultAccount', 'personal');

  // Security - Load from main process
  await loadSecuritySettings();
}

/**
 * Loads security settings from the main process and updates UI.
 *
 * Security settings are managed by the main process security module
 * to ensure secure handling of PIN data. This function retrieves
 * the current state and updates the form controls.
 *
 * @returns {Promise<void>}
 */
async function loadSecuritySettings() {
  try {
    // Check if PIN is set
    isPinSet = await ipcRenderer.invoke('security:isPINSet');

    // Get security settings from main process
    const settings = await ipcRenderer.invoke('security:getSettings');

    // PIN enabled checkbox
    checkPinEnabled.checked = settings.pinEnabled || false;

    // Update PIN buttons visibility
    updatePinButtonsVisibility();

    // Auto-lock settings
    checkAutolock.checked = settings.autoLockEnabled || false;
    selectAutolockTimeout.value = settings.autoLockTimeout || 5;
    checkLockSuspend.checked = settings.lockOnSuspend !== false; // Default true
    checkLockScreenlock.checked = settings.lockOnScreenLock !== false; // Default true

    // Advanced security
    selectMaxAttempts.value = settings.maxAttempts || 5;
    selectLockoutDuration.value = settings.lockoutDuration || 30;
    checkDeleteOnMax.checked = settings.deleteOnMaxAttempts || false;

    // Update UI visibility based on PIN state
    updateSecuritySectionsVisibility();
    updateAutolockTimeoutVisibility();
  } catch (error) {
    console.error('Error loading security settings:', error);
  }
}

/**
 * Updates the visibility of PIN action buttons.
 *
 * Shows different buttons depending on whether a PIN is already set:
 * - PIN not set: Show "Set up PIN" button
 * - PIN set: Show "Change PIN" and "Remove PIN" buttons
 *
 * @returns {void}
 */
function updatePinButtonsVisibility() {
  if (isPinSet) {
    btnSetupPin.style.display = 'none';
    btnChangePin.style.display = 'inline-block';
    btnRemovePin.style.display = 'inline-block';
  } else {
    btnSetupPin.style.display = 'inline-block';
    btnChangePin.style.display = 'none';
    btnRemovePin.style.display = 'none';
  }
}

/**
 * Updates visibility of security sections based on PIN enabled state.
 *
 * Auto-lock and advanced security options are only relevant when
 * PIN protection is enabled. Hide these sections when disabled
 * to reduce UI complexity.
 *
 * @returns {void}
 */
function updateSecuritySectionsVisibility() {
  const show = checkPinEnabled.checked && isPinSet;
  autolockSection.style.display = show ? 'block' : 'none';
  advancedSecuritySection.style.display = show ? 'block' : 'none';
  lockNowRow.style.display = show ? 'flex' : 'none';
}

/**
 * Updates visibility of auto-lock timeout row.
 *
 * The timeout selector is only relevant when auto-lock is enabled.
 *
 * @returns {void}
 */
function updateAutolockTimeoutVisibility() {
  autolockTimeoutRow.style.opacity = checkAutolock.checked ? '1' : '0.5';
  selectAutolockTimeout.disabled = !checkAutolock.checked;
}

/**
 * Saves all settings to electron-store and notifies the main process.
 *
 * Persists user preferences to disk and sends an IPC message
 * to the main process so it can update the application menu,
 * tray, and system login items accordingly.
 *
 * After saving, the settings window is closed.
 *
 * @returns {void}
 */
async function saveSettings() {
  // Save to store
  store.set('language', selectLanguage.value);
  store.set('startWithSystem', checkStartup.checked);
  store.set('startMinimized', checkMinimized.checked);
  store.set('minimizeToTray', checkTray.checked);
  store.set('defaultAccount', selectDefaultAccount.value);

  // Notify main process to rebuild menu with new language
  ipcRenderer.send('settings-changed', {
    language: selectLanguage.value,
    startWithSystem: checkStartup.checked,
    startMinimized: checkMinimized.checked,
    minimizeToTray: checkTray.checked,
    defaultAccount: selectDefaultAccount.value
  });

  // Save security settings to main process
  await saveSecuritySettings();

  // Close window
  window.close();
}

/**
 * Saves security settings to the main process.
 *
 * Security settings are handled by the main process security module
 * to ensure proper encryption and secure storage.
 *
 * @returns {Promise<void>}
 */
async function saveSecuritySettings() {
  try {
    const securitySettings = {
      pinEnabled: checkPinEnabled.checked,
      autoLockEnabled: checkAutolock.checked,
      autoLockTimeout: parseInt(selectAutolockTimeout.value, 10),
      lockOnSuspend: checkLockSuspend.checked,
      lockOnScreenLock: checkLockScreenlock.checked,
      maxAttempts: parseInt(selectMaxAttempts.value, 10),
      lockoutDuration: parseInt(selectLockoutDuration.value, 10),
      deleteOnMaxAttempts: checkDeleteOnMax.checked
    };

    await ipcRenderer.invoke('security:saveSettings', securitySettings);
  } catch (error) {
    console.error('Error saving security settings:', error);
  }
}

// =============================================================================
// Window Management
// =============================================================================

/**
 * Closes the settings window without saving changes.
 *
 * @returns {void}
 */
function closeWindow() {
  window.close();
}

// =============================================================================
// Event Listeners
// =============================================================================

// Button click handlers
btnSave.addEventListener('click', saveSettings);
btnCancel.addEventListener('click', closeWindow);
btnClose.addEventListener('click', closeWindow);

/**
 * Preview language changes in real-time.
 *
 * When the user selects a different language, immediately
 * update the UI to show translations in that language.
 * This allows users to preview before saving.
 */
selectLanguage.addEventListener('change', () => {
  i18n.setLanguage(selectLanguage.value);
  applyTranslations();
});

/**
 * Keyboard shortcuts for the settings window.
 *
 * - Escape: Close window without saving
 * - Ctrl+Enter / Cmd+Enter: Save and close
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeWindow();
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    saveSettings();
  }
});

// =============================================================================
// Security Event Listeners
// =============================================================================

/**
 * PIN enabled checkbox change handler.
 *
 * When enabling PIN protection without a PIN set, opens the PIN setup.
 * Updates visibility of related sections accordingly.
 */
checkPinEnabled.addEventListener('change', async () => {
  if (checkPinEnabled.checked && !isPinSet) {
    // Need to set up PIN first
    ipcRenderer.send('security:setupPIN');
    // Reload settings after PIN setup
    setTimeout(async () => {
      await loadSecuritySettings();
    }, 500);
  }
  updateSecuritySectionsVisibility();
});

/**
 * Auto-lock checkbox change handler.
 *
 * Updates visibility of the timeout selector.
 */
checkAutolock.addEventListener('change', () => {
  updateAutolockTimeoutVisibility();
});

/**
 * Set up PIN button click handler.
 *
 * Opens the PIN setup window.
 */
btnSetupPin.addEventListener('click', () => {
  ipcRenderer.send('security:setupPIN');
  // Close settings to show PIN setup
  window.close();
});

/**
 * Change PIN button click handler.
 *
 * Opens the PIN setup window to change existing PIN.
 */
btnChangePin.addEventListener('click', () => {
  ipcRenderer.send('security:setupPIN');
  // Close settings to show PIN setup
  window.close();
});

/**
 * Lock Now button click handler.
 *
 * Locks the app immediately.
 */
btnLockNow.addEventListener('click', () => {
  ipcRenderer.send('security:lockNow');
  window.close();
});

/**
 * Remove PIN button click handler.
 *
 * Removes the current PIN after confirmation.
 */
btnRemovePin.addEventListener('click', async () => {
  const confirmed = confirm(
    i18n.t('lock.resetWarning', 'This will remove PIN protection. Are you sure?')
  );

  if (confirmed) {
    try {
      await ipcRenderer.invoke('security:removePIN');
      isPinSet = false;
      checkPinEnabled.checked = false;
      updatePinButtonsVisibility();
      updateSecuritySectionsVisibility();
    } catch (error) {
      console.error('Error removing PIN:', error);
    }
  }
});

/**
 * Delete on max attempts checkbox change handler.
 *
 * Shows a warning when enabling this dangerous option.
 */
checkDeleteOnMax.addEventListener('change', () => {
  if (checkDeleteOnMax.checked) {
    const confirmed = confirm(
      i18n.t('settings.deleteOnMaxAttemptsWarning',
        'Warning: This will delete all WhatsApp sessions if max attempts are reached. Are you sure?')
    );

    if (!confirmed) {
      checkDeleteOnMax.checked = false;
    }
  }
});

// =============================================================================
// Initialization
// =============================================================================

// Load settings when the window opens
loadSettings();
