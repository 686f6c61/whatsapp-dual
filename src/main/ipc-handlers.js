/**
 * WhatsApp Dual - IPC Handlers Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * Registers all ipcMain handlers for communication between the main
 * process and renderer processes (settings window, lock screen).
 *
 * Handler categories:
 * - Settings: get/save user preferences
 * - i18n: translation loading for renderer windows
 * - Security: PIN setup, lock/unlock, manual lock
 * - Window: close-settings
 *
 * All dependencies are injected via the register() function to avoid
 * circular imports back into main.js.
 */

const { ipcMain, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const i18n = require('../shared/i18n');

// =============================================================================
// Settings Validation Helper
// =============================================================================

/**
 * Validates and persists individual settings to the store.
 *
 * Returns false if any value fails validation; true if all present
 * values are valid and persisted.
 *
 * @param {object} settings - The settings object from the renderer
 * @param {Store} store - electron-store instance
 * @returns {boolean} True if all validations passed
 */
function validateAndPersistSettings(settings, store) {
  const availableLanguages = i18n.getAvailableLanguages();
  const validAccounts = new Set(['personal', 'business']);
  const validThemes = new Set(['system', 'light', 'dark']);

  const validators = {
    language:        (v) => typeof v === 'string' && availableLanguages.includes(v),
    startWithSystem: (v) => typeof v === 'boolean',
    startMinimized:  (v) => typeof v === 'boolean',
    minimizeToTray:  (v) => typeof v === 'boolean',
    defaultAccount:  (v) => typeof v === 'string' && validAccounts.has(v),
    theme:           (v) => typeof v === 'string' && validThemes.has(v),
  };

  for (const [key, validate] of Object.entries(validators)) {
    if (settings[key] !== undefined) {
      if (!validate(settings[key])) return false;
      store.set(key, settings[key]);
    }
  }

  return true;
}

// =============================================================================
// Registration
// =============================================================================

/**
 * Registers all IPC handlers.
 *
 * This function is called once from main.js during initialization.
 * All needed references are passed as dependencies.
 *
 * @param {object} deps - Dependencies
 * @param {Store} deps.store - electron-store instance
 * @param {object} deps.windowManager - window-manager module
 * @param {object} deps.viewManager - view-manager module
 * @param {object} deps.security - security module
 * @param {Function} deps.rebuildMenus - callback to rebuild menus after settings change
 * @returns {void}
 */
function registerIPCHandlers({ store, windowManager, viewManager, security, rebuildMenus }) {
  /**
   * Validate that the sender matches one of the allowed application windows.
   *
   * @param {Electron.IpcMainEvent|Electron.IpcMainInvokeEvent} event - IPC event
   * @param {Array<'settings'|'lock'|'main'>} allowedWindowNames - Allowed senders
   * @returns {boolean} True if sender is one of the allowed windows
   */
  function validateWindowSender(event, allowedWindowNames) {
    const windows = {
      settings: windowManager.getSettingsWindow(),
      lock: windowManager.getLockWindow(),
      main: windowManager.getMainWindow(),
    };

    return allowedWindowNames.some(name => {
      const win = windows[name];
      return win && !win.isDestroyed() && win.webContents === event.sender;
    });
  }

  // ===========================================================================
  // Window IPC
  // ===========================================================================

  /** Close settings window from renderer request */
  ipcMain.on('close-settings', (event) => {
    if (!validateWindowSender(event, ['settings'])) return;
    const settingsWindow = windowManager.getSettingsWindow();
    if (settingsWindow) {
      settingsWindow.close();
    }
  });

  // ===========================================================================
  // Settings IPC (S1 -- contextIsolation support)
  // ===========================================================================

  /** Return all settings to the settings window */
  ipcMain.handle('settings:getAll', (event) => {
    if (!validateWindowSender(event, ['settings'])) return null;
    return {
      language: store.get('language', 'en'),
      theme: store.get('theme', 'system'),
      startWithSystem: store.get('startWithSystem', false),
      startMinimized: store.get('startMinimized', false),
      minimizeToTray: store.get('minimizeToTray', true),
      defaultAccount: store.get('defaultAccount', 'personal')
    };
  });

  /** Save settings from the settings window */
  ipcMain.handle('settings:save', (event, settings) => {
    if (!validateWindowSender(event, ['settings'])) return false;
    if (typeof settings !== 'object' || settings === null) return false;

    if (!validateAndPersistSettings(settings, store)) return false;

    // Apply language change
    if (settings.language) {
      i18n.setLanguage(settings.language);
      rebuildMenus();
    }

    // Apply auto-start settings
    if (settings.startWithSystem !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: settings.startWithSystem,
        openAsHidden: settings.startMinimized || false
      });
    }

    return true;
  });

  // ===========================================================================
  // i18n IPC (S1 -- contextIsolation support)
  // ===========================================================================

  /** Return translations for the current language */
  ipcMain.handle('i18n:getTranslations', (event) => {
    if (!validateWindowSender(event, ['settings', 'lock'])) return {};
    return i18n.getAllTranslations();
  });

  /** Return current language code */
  ipcMain.handle('i18n:getLanguage', (event) => {
    if (!validateWindowSender(event, ['settings'])) return 'en';
    return i18n.getLanguage();
  });

  /** Return list of available language codes */
  ipcMain.handle('i18n:getAvailableLanguages', (event) => {
    if (!validateWindowSender(event, ['settings'])) return [];
    return i18n.getAvailableLanguages();
  });

  /** Return translations for a specific language (for preview) */
  ipcMain.handle('i18n:getTranslationsForLanguage', (event, lang) => {
    if (!validateWindowSender(event, ['settings'])) return i18n.getAllTranslations();
    // Validate lang to prevent path traversal (S-01)
    if (typeof lang !== 'string' || !/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) {
      return i18n.getAllTranslations();
    }
    const localesPath = path.resolve(__dirname, '../../locales');
    const filePath = path.join(localesPath, `${lang}.json`);
    // Ensure resolved path stays within locales directory
    if (!filePath.startsWith(localesPath)) {
      return i18n.getAllTranslations();
    }
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      console.error(`Error loading preview translations for ${lang}:`, err);
    }
    return i18n.getAllTranslations();
  });

  // ===========================================================================
  // Security IPC
  // ===========================================================================

  /** Handle PIN setup completion - close setup window and notify settings (B5 fix) */
  ipcMain.on('security:pinSetupComplete', (event) => {
    if (!validateWindowSender(event, ['lock'])) return;
    windowManager.hideLockScreen({
      restoreCurrentView: () => viewManager.restoreCurrentView(windowManager.getMainWindow())
    });
    // Notify settings window that PIN setup is done
    const settingsWindow = windowManager.getSettingsWindow();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('security:pinSetupDone');
    }
  });

  /** Handle skip PIN setup - close setup window and show main app */
  ipcMain.on('security:skipPINSetup', (event) => {
    if (!validateWindowSender(event, ['lock'])) return;
    windowManager.hideLockScreen({
      restoreCurrentView: () => viewManager.restoreCurrentView(windowManager.getMainWindow())
    });
  });

  /** Handle manual lock request from settings or menu */
  ipcMain.on('security:lockNow', (event) => {
    if (!validateWindowSender(event, ['settings'])) return;
    if (security.isPINEnabled()) {
      security.lockApp();
    }
  });

  /** Handle opening PIN setup from settings */
  ipcMain.on('security:setupPIN', (event, mode) => {
    if (!validateWindowSender(event, ['settings'])) return;
    windowManager.showPINSetupScreen(mode === 'change' ? 'change' : 'setup');
  });
}

// =============================================================================
// Module Exports
// =============================================================================

module.exports = { registerIPCHandlers };
