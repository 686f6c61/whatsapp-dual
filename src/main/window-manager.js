/**
 * WhatsApp Dual - Window Manager Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * Manages creation and lifecycle of all application windows:
 * - Main window (BrowserWindow with WebContentsViews)
 * - Settings modal window
 * - About dialog
 * - Lock screen and PIN setup windows
 *
 * All window references are encapsulated here. External code accesses
 * them through getter functions to avoid tight coupling.
 */

const { BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const { WINDOW_CONFIG } = require('../shared/constants');
const i18n = require('../shared/i18n');
const help = require('./help');

// =============================================================================
// Window State
// =============================================================================

const state = {
  /** @type {BrowserWindow|null} Main application window */
  mainWindow: null,
  /** @type {BrowserWindow|null} Settings modal window */
  settingsWindow: null,
  /** @type {BrowserWindow|null} Lock screen window */
  lockWindow: null,
  /** @type {boolean} Flag to track if app is in quitting state */
  isQuitting: false,
  /** @type {boolean} Flag to track if lock screen is showing */
  isShowingLockScreen: false,
};

// =============================================================================
// Getters
// =============================================================================

/** @returns {BrowserWindow|null} */
function getMainWindow() { return state.mainWindow; }

/** @returns {BrowserWindow|null} */
function getSettingsWindow() { return state.settingsWindow; }

/** @returns {BrowserWindow|null} */
function getLockWindow() { return state.lockWindow; }

/** @returns {boolean} */
function getIsQuitting() { return state.isQuitting; }

/** @returns {boolean} */
function getIsShowingLockScreen() { return state.isShowingLockScreen; }

// =============================================================================
// Setters
// =============================================================================

/** Sets the quitting flag. */
function setIsQuitting(value) { state.isQuitting = value; }

/** Sets quitting flag and quits the app. Used by menu and tray. */
function quitApp(app) {
  state.isQuitting = true;
  app.quit();
}

// =============================================================================
// Main Window
// =============================================================================

/**
 * Creates the main application window.
 *
 * @param {object} deps - Dependencies
 * @param {Store} deps.store - electron-store instance
 * @returns {BrowserWindow} The created main window
 */
function createWindow({ store }) {
  const startMinimized = store.get('startMinimized', false);

  state.mainWindow = new BrowserWindow({
    width: WINDOW_CONFIG.width,
    height: WINDOW_CONFIG.height,
    minWidth: WINDOW_CONFIG.minWidth,
    minHeight: WINDOW_CONFIG.minHeight,
    useContentSize: true,
    title: 'WhatsApp Dual',
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    backgroundColor: '#111b21',
    show: !startMinimized,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  state.mainWindow.contentView.setBackgroundColor('#111b21');

  state.mainWindow.on('closed', () => {
    state.mainWindow = null;
  });

  return state.mainWindow;
}

// =============================================================================
// Settings Window
// =============================================================================

/**
 * Creates and displays the Settings window.
 *
 * Only one settings window can be open at a time.
 * Blocked while lock screen is showing (S3).
 *
 * @returns {void}
 */
function createSettingsWindow() {
  if (state.isShowingLockScreen) return;

  if (state.settingsWindow) {
    state.settingsWindow.focus();
    return;
  }

  state.settingsWindow = new BrowserWindow({
    width: 480,
    height: 700,
    minWidth: 400,
    minHeight: 600,
    parent: state.mainWindow,
    modal: true,
    title: 'Settings',
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload-settings.js')
    }
  });

  state.settingsWindow.setMenuBarVisibility(false);
  state.settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  state.settingsWindow.on('closed', () => {
    state.settingsWindow = null;
  });
}

// =============================================================================
// About Dialog
// =============================================================================

/**
 * Displays the About dialog with application information.
 *
 * @param {Electron.App} app - The Electron app object (for getVersion)
 * @returns {void}
 */
function createAboutWindow(app) {
  const appVersion = app.getVersion();

  dialog.showMessageBox(state.mainWindow, {
    type: 'info',
    title: i18n.t('about.title', 'About WhatsApp Dual'),
    message: 'WhatsApp Dual',
    detail: help.getAboutDetail(appVersion),
    buttons: [
      i18n.t('menu.changelog', 'Changelog'),
      i18n.t('menu.github', 'GitHub Repository'),
      i18n.t('about.ok', 'OK')
    ],
    icon: path.join(__dirname, '../../assets/icons/icon.png')
  }).then(result => {
    if (result.response === 0) {
      help.openChangelog();
    } else if (result.response === 1) {
      help.openRepository();
    }
  });
}

// =============================================================================
// Lock Screen
// =============================================================================

/**
 * Shows the lock screen window.
 *
 * Creates a fullscreen modal window that requires PIN entry to unlock.
 *
 * @param {object} deps - Dependencies
 * @param {Function} deps.removeAllViews - Callback to remove all WebContentsViews
 * @returns {void}
 */
function showLockScreen({ removeAllViews }) {
  if (state.lockWindow) {
    state.lockWindow.focus();
    return;
  }

  state.isShowingLockScreen = true;

  // Hide main window views
  if (state.mainWindow) {
    removeAllViews();
  }

  state.lockWindow = new BrowserWindow({
    width: 400,
    height: 600,
    parent: state.mainWindow,
    modal: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    title: 'WhatsApp Dual - Locked',
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload-lock.js')
    }
  });

  state.lockWindow.loadFile(path.join(__dirname, '../renderer/lock.html'));

  state.lockWindow.on('closed', () => {
    state.lockWindow = null;
  });
}

/**
 * Hides the lock screen and shows the main app.
 *
 * @param {object} deps - Dependencies
 * @param {Function} deps.restoreCurrentView - Callback to restore the current account view
 * @returns {void}
 */
function hideLockScreen({ restoreCurrentView }) {
  state.isShowingLockScreen = false;

  if (state.lockWindow) {
    state.lockWindow.close();
    state.lockWindow = null;
  }

  // Restore main window view
  if (state.mainWindow) {
    restoreCurrentView();
    state.mainWindow.show();
    state.mainWindow.focus();
  }
}

/**
 * Shows the PIN setup screen for first-time configuration.
 *
 * @param {'setup'|'change'} [mode='setup'] - Setup flow mode
 * @returns {void}
 */
function showPINSetupScreen(mode = 'setup') {
  if (state.lockWindow) {
    state.lockWindow.close();
  }

  state.lockWindow = new BrowserWindow({
    width: 360,
    height: 580,
    parent: state.mainWindow,
    modal: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    title: 'WhatsApp Dual - Setup PIN',
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload-lock.js')
    }
  });

  state.lockWindow.loadFile(path.join(__dirname, '../renderer/lock-setup.html'), {
    query: { mode }
  });

  state.lockWindow.on('closed', () => {
    state.lockWindow = null;
    state.isShowingLockScreen = false;
  });
}

// =============================================================================
// Module Exports
// =============================================================================

module.exports = {
  // Getters
  getMainWindow,
  getSettingsWindow,
  getLockWindow,
  getIsQuitting,
  getIsShowingLockScreen,
  // Setters
  setIsQuitting,
  quitApp,
  // Window creators
  createWindow,
  createSettingsWindow,
  createAboutWindow,
  // Lock screen
  showLockScreen,
  hideLockScreen,
  showPINSetupScreen
};
