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

/** @type {BrowserWindow|null} Main application window */
let mainWindow = null;

/** @type {BrowserWindow|null} Settings modal window */
let settingsWindow = null;

/** @type {BrowserWindow|null} Lock screen window */
let lockWindow = null;

/** @type {boolean} Flag to track if app is in quitting state */
let isQuitting = false;

/** @type {boolean} Flag to track if lock screen is showing */
let isShowingLockScreen = false;

// =============================================================================
// Getters
// =============================================================================

/** @returns {BrowserWindow|null} */
function getMainWindow() { return mainWindow; }

/** @returns {BrowserWindow|null} */
function getSettingsWindow() { return settingsWindow; }

/** @returns {BrowserWindow|null} */
function getLockWindow() { return lockWindow; }

/** @returns {boolean} */
function getIsQuitting() { return isQuitting; }

/** @returns {boolean} */
function getIsShowingLockScreen() { return isShowingLockScreen; }

// =============================================================================
// Setters
// =============================================================================

/** Sets the quitting flag. */
function setIsQuitting(value) { isQuitting = value; }

/** Sets quitting flag and quits the app. Used by menu and tray. */
function quitApp(app) {
  isQuitting = true;
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

  mainWindow = new BrowserWindow({
    width: WINDOW_CONFIG.width,
    height: WINDOW_CONFIG.height,
    minWidth: WINDOW_CONFIG.minWidth,
    minHeight: WINDOW_CONFIG.minHeight,
    useContentSize: true,
    title: 'WhatsApp Dual',
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    show: !startMinimized,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
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
  if (isShowingLockScreen) return;

  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 700,
    minWidth: 400,
    minHeight: 600,
    parent: mainWindow,
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

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
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

  dialog.showMessageBox(mainWindow, {
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
  if (lockWindow) {
    lockWindow.focus();
    return;
  }

  isShowingLockScreen = true;

  // Hide main window views
  if (mainWindow) {
    removeAllViews();
  }

  lockWindow = new BrowserWindow({
    width: 400,
    height: 600,
    parent: mainWindow,
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

  lockWindow.loadFile(path.join(__dirname, '../renderer/lock.html'));

  lockWindow.on('closed', () => {
    lockWindow = null;
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
  isShowingLockScreen = false;

  if (lockWindow) {
    lockWindow.close();
    lockWindow = null;
  }

  // Restore main window view
  if (mainWindow) {
    restoreCurrentView();
    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * Shows the PIN setup screen for first-time configuration.
 *
 * @param {'setup'|'change'} [mode='setup'] - Setup flow mode
 * @returns {void}
 */
function showPINSetupScreen(mode = 'setup') {
  if (lockWindow) {
    lockWindow.close();
  }

  lockWindow = new BrowserWindow({
    width: 360,
    height: 580,
    parent: mainWindow,
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

  lockWindow.loadFile(path.join(__dirname, '../renderer/lock-setup.html'), {
    query: { mode }
  });

  lockWindow.on('closed', () => {
    lockWindow = null;
    isShowingLockScreen = false;
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
