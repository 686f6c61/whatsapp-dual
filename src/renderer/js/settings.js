/**
 * WhatsApp Dual - Settings Window Script
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.0.3
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
const i18n = require('../../shared/i18n');

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
function loadSettings() {
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
function saveSettings() {
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

  // Close window
  window.close();
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
// Initialization
// =============================================================================

// Load settings when the window opens
loadSettings();
