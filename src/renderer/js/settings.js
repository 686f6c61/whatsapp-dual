/**
 * WhatsApp Dual - Settings Window Script (Preload API version)
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 2.0.0
 *
 * This script handles the Settings modal window functionality.
 * It manages user preferences for the application behavior,
 * including language, startup options, tray behavior, theme, and security.
 *
 * This version does NOT use nodeIntegration. All Electron communication
 * goes through window.electronAPI.* exposed by the preload script.
 *
 * Available Settings:
 * - Language: UI language (English/Spanish/...)
 * - Start with system: Launch app on system startup
 * - Start minimized: Start hidden in system tray
 * - Minimize to tray: Hide to tray instead of closing
 * - Default account: Which account to show on startup
 * - Theme: Light / Dark / System
 * - Security: PIN lock, auto-lock, advanced security options
 *
 * Data Flow:
 * 1. Settings are loaded via window.electronAPI.settings.getAll() on window open
 * 2. User modifies settings in the UI
 * 3. On save, settings are sent to main process via window.electronAPI.settings.save()
 * 4. Main process updates menu, tray, and system settings
 */

// =============================================================================
// Preload API Reference (no require() calls)
// =============================================================================

const api = window.electronAPI;

// =============================================================================
// Translation State
// =============================================================================

/**
 * Module-level translations object.
 * Populated asynchronously during loadSettings() via the i18n preload API.
 *
 * @type {Object}
 */
let translations = {};

// =============================================================================
// Translation Functions
// =============================================================================

/**
 * Retrieves a translated string for the given dot-notation key.
 *
 * Traverses the module-level `translations` object using the key segments.
 * Returns the fallback (or the key itself) when the lookup fails.
 *
 * @param {string} key   - Dot-notation translation key, e.g. "settings.title"
 * @param {string} [fallback] - Value to return when the key is not found
 * @returns {string} The translated string or the fallback / key
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
  if (typeof current === 'string') {
    return current;
  }
  return fallback !== undefined ? fallback : key;
}

/**
 * Applies translations to all elements with a data-i18n attribute.
 *
 * Finds every DOM element marked with [data-i18n] and replaces its
 * text content with the corresponding translation. Also updates the
 * document title.
 *
 * @returns {void}
 */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = t(key);
    if (translation && translation !== key) {
      element.textContent = translation;
    }
  });

  // Update window title
  document.title = t('settings.title', 'Settings');
}

// =============================================================================
// Theme Helper
// =============================================================================

/**
 * Applies the given theme setting to the document.
 *
 * Supports three values:
 *   - "light"  : Always apply light theme
 *   - "dark"   : Always apply dark theme
 *   - "system" : Detect the OS preference via matchMedia
 *
 * The actual theme is applied by setting the `data-theme` attribute on
 * the document root element, which the CSS selectors rely on.
 *
 * Also registers a listener for system theme changes so that when the
 * setting is "system", the UI reacts in real time.
 *
 * @param {string} theme - One of "system", "light", or "dark"
 * @returns {void}
 */
function applyThemeFromSetting(theme) {
  let effective;
  if (theme === 'dark') {
    effective = 'dark';
  } else if (theme === 'light') {
    effective = 'light';
  } else {
    // "system" or any unrecognised value -> detect OS preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      effective = 'dark';
    } else {
      effective = 'light';
    }
  }

  document.documentElement.setAttribute('data-theme', effective);

  // Listen for OS theme changes when following system preference
  if (theme === 'system' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    // Remove any previous listener by replacing via a named handler stored on
    // the element (avoids leaking multiple listeners).
    if (applyThemeFromSetting._systemListener) {
      mq.removeEventListener('change', applyThemeFromSetting._systemListener);
    }
    applyThemeFromSetting._systemListener = (e) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', applyThemeFromSetting._systemListener);
  }
}

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

/** @type {HTMLButtonElement} Save button */
const btnSave = document.getElementById('btn-save');

/** @type {HTMLButtonElement} Cancel button */
const btnCancel = document.getElementById('btn-cancel');

/** @type {HTMLButtonElement} Close button (X) */
const btnClose = document.getElementById('btn-close');

// =============================================================================
// State
// =============================================================================

/** @type {boolean} Flag indicating if PIN is currently set */
let isPinSet = false;

// =============================================================================
// Settings Management
// =============================================================================

/**
 * Loads current settings from the main process and populates the form.
 *
 * Retrieves saved preferences via the preload API and sets the appropriate
 * values for all form controls. Also loads translations for the saved
 * language and applies them to the UI.
 *
 * @returns {Promise<void>}
 */
async function loadSettings() {
  try {
    // Fetch all settings from main process
    const settings = await api.settings.getAll();

    // Language
    const savedLanguage = settings.language || 'en';
    selectLanguage.value = savedLanguage;

    // Load translations for the saved language
    translations = await api.i18n.getTranslations();
    applyTranslations();

    // Theme
    const savedTheme = settings.theme || 'system';
    applyThemeFromSetting(savedTheme);

    // Behavior
    checkStartup.checked = settings.startWithSystem || false;
    checkMinimized.checked = settings.startMinimized || false;
    checkTray.checked = settings.minimizeToTray !== undefined ? settings.minimizeToTray : true;
    selectDefaultAccount.value = settings.defaultAccount || 'personal';

    // Security - Load from main process
    await loadSecuritySettings();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
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
    isPinSet = await api.security.isPINSet();

    // Get security settings from main process
    const settings = await api.security.getSettings();

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
 * Uses the .js-hidden CSS class for visibility toggling (CSP safe).
 *
 * @returns {void}
 */
function updatePinButtonsVisibility() {
  if (isPinSet) {
    btnSetupPin.classList.add('js-hidden');
    btnChangePin.classList.remove('js-hidden');
    btnRemovePin.classList.remove('js-hidden');
  } else {
    btnSetupPin.classList.remove('js-hidden');
    btnChangePin.classList.add('js-hidden');
    btnRemovePin.classList.add('js-hidden');
  }
}

/**
 * Updates visibility of security sections based on PIN enabled state.
 *
 * Auto-lock and advanced security options are only relevant when
 * PIN protection is enabled. Hide these sections when disabled
 * to reduce UI complexity.
 *
 * Uses the .js-hidden CSS class for visibility toggling (CSP safe).
 *
 * @returns {void}
 */
function updateSecuritySectionsVisibility() {
  const show = checkPinEnabled.checked && isPinSet;
  autolockSection.classList.toggle('js-hidden', !show);
  advancedSecuritySection.classList.toggle('js-hidden', !show);
  lockNowRow.classList.toggle('js-hidden', !show);
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
 * Saves all settings and notifies the main process.
 *
 * Persists user preferences via the preload API so the main process
 * can update the application menu, tray, and system login items.
 *
 * After saving, the settings window is closed.
 *
 * @returns {Promise<void>}
 */
async function saveSettings() {
  try {
    // Build the settings object
    const settingsData = {
      language: selectLanguage.value,
      startWithSystem: checkStartup.checked,
      startMinimized: checkMinimized.checked,
      minimizeToTray: checkTray.checked,
      defaultAccount: selectDefaultAccount.value
    };

    // Save general settings (this also notifies the main process)
    await api.settings.save(settingsData);

    // Save security settings to main process
    await saveSecuritySettings();

    // Close window via preload API
    api.window.close();
  } catch (error) {
    console.error('Error saving settings:', error);
  }
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

    await api.security.saveSettings(securitySettings);
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
  api.window.close();
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
 * When the user selects a different language, fetch the translations
 * for that language via the preload API and immediately update the UI.
 * This allows users to preview before saving.
 */
selectLanguage.addEventListener('change', async () => {
  try {
    const lang = selectLanguage.value;
    translations = await api.i18n.getTranslationsForLanguage(lang);
    applyTranslations();
  } catch (error) {
    console.error('Error loading translations for preview:', error);
  }
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
 * When enabling PIN protection without a PIN set, opens the PIN setup
 * window and waits for the setup to complete via the onPINSetupComplete
 * callback (fixes the B5 race condition that existed with setTimeout).
 *
 * Updates visibility of related sections accordingly.
 */
checkPinEnabled.addEventListener('change', async () => {
  if (checkPinEnabled.checked && !isPinSet) {
    // Need to set up PIN first - open PIN setup window
    api.security.setupPIN();

    // Wait for PIN setup to complete instead of using setTimeout (fixes B5)
    api.security.onPINSetupComplete(async () => {
      await loadSecuritySettings();
    });
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
 * Opens the PIN setup window and listens for completion.
 */
btnSetupPin.addEventListener('click', () => {
  api.security.setupPIN();

  // Listen for PIN setup completion and reload settings
  api.security.onPINSetupComplete(async () => {
    await loadSecuritySettings();
  });
});

/**
 * Change PIN button click handler.
 *
 * Opens the PIN setup window to change existing PIN and listens for completion.
 */
btnChangePin.addEventListener('click', () => {
  api.security.setupPIN();

  // Listen for PIN setup completion and reload settings
  api.security.onPINSetupComplete(async () => {
    await loadSecuritySettings();
  });
});

/**
 * Lock Now button click handler.
 *
 * Locks the app immediately and closes the settings window.
 */
btnLockNow.addEventListener('click', () => {
  api.security.lockNow();
  api.window.close();
});

/**
 * Remove PIN button click handler.
 *
 * Prompts the user for their current PIN before removing it (fixes S4).
 * If the PIN is correct the lock is removed and the UI is updated.
 */
btnRemovePin.addEventListener('click', async () => {
  // Prompt for current PIN before removal (security fix S4)
  const currentPin = prompt(
    t('lock.enterPin', 'Enter your PIN to confirm removal')
  );

  // User cancelled the prompt
  if (currentPin === null) {
    return;
  }

  try {
    const result = await api.security.removePIN(currentPin);

    if (result && result.success) {
      isPinSet = false;
      checkPinEnabled.checked = false;
      updatePinButtonsVisibility();
      updateSecuritySectionsVisibility();
    } else {
      // PIN was incorrect or removal failed
      const msg = (result && result.message)
        ? result.message
        : t('lock.incorrectPin', 'Incorrect PIN');
      alert(msg);
    }
  } catch (error) {
    console.error('Error removing PIN:', error);
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
      t('settings.deleteOnMaxAttemptsWarning',
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
