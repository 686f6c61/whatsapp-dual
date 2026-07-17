/**
 * WhatsApp Dual - Auto-Update Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * This module handles automatic application updates using electron-updater.
 * It checks for new versions from GitHub Releases and provides a seamless
 * update experience for users.
 *
 * Update Flow:
 * 1. On app start, silently check for updates
 * 2. If update found, show notification and menu indicator
 * 3. User can choose to download the update
 * 4. After download, prompt to restart and install
 *
 * Features:
 * - Silent background update checking
 * - Manual update check from Help menu
 * - Visual indicator (red dot) when update available
 * - Native notifications for new versions
 * - Download progress tracking
 * - Automatic installation on quit
 */

const path = require('node:path');
const { autoUpdater } = require('electron-updater');
const { app, dialog, Notification } = require('electron');
const i18n = require('../shared/i18n');
const help = require('./help');
const logger = require('../shared/logger');

const APP_ICON_PATH = path.join(__dirname, '../../assets/icons/icon.png');

// =============================================================================
// Module State
// =============================================================================

const state = {
  /** @type {boolean} Whether an update is available */
  updateAvailable: false,
  /** @type {object|null} Info about the available update */
  updateInfo: null,
  /** @type {Function|null} Callback fired when update status changes */
  onUpdateStatusChange: null,
};


// =============================================================================
// Auto-Updater Configuration
// =============================================================================

/**
 * Configure electron-updater behavior.
 *
 * autoDownload: false - Don't download automatically, let user decide
 * autoInstallOnAppQuit: true - Install update when app is closed
 */
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// =============================================================================
// Update Check Functions
// =============================================================================

/**
 * Returns whether electron-updater can update the current build.
 *
 * On Linux, electron-updater only supports automatic updates for AppImage
 * builds. Running the updater from source, .deb, or snap builds prints noisy
 * APPIMAGE warnings that look like launch errors.
 *
 * @returns {boolean} True if automatic updates are supported
 */
function isAutoUpdaterSupported() {
  if (!app.isPackaged) {
    return false;
  }

  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return false;
  }

  return true;
}

/**
 * Checks for available updates.
 *
 * Connects to GitHub Releases to check if a newer version exists.
 * Can run silently (no error dialogs) or show feedback to user.
 *
 * @param {boolean} [silent=true] - If true, don't show error dialogs
 * @returns {void}
 */
function checkForUpdates(silent = true) {
  if (!isAutoUpdaterSupported()) {
    return;
  }

  autoUpdater.checkForUpdates().catch(err => {
    if (!silent) {
      dialog.showMessageBox({
        type: 'info',
        title: i18n.t('updates.title', 'Updates'),
        message: i18n.t('updates.checkError', 'Could not check for updates'),
        detail: err.message
      });
    }
  });
}

/**
 * Manually checks for updates with user feedback.
 *
 * Unlike checkForUpdates(), this always shows a dialog with the result,
 * whether an update is found or not.
 *
 * @param {BrowserWindow} mainWindow - Parent window for dialogs
 * @returns {void}
 */
function checkForUpdatesManual(mainWindow) {
  if (!isAutoUpdaterSupported()) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.unsupportedBuild', 'Automatic updates are not available for this build'),
      detail: i18n.t(
        'updates.unsupportedBuildDetail',
        'On Linux, automatic updates are available only in the AppImage build. Install the latest release manually or use your package manager.'
      ),
      buttons: [i18n.t('menu.changelog', 'Changelog'), i18n.t('about.ok', 'OK')]
    }).then(result => {
      if (result.response === 0) {
        help.openChangelog();
      }
    });
    return;
  }

  autoUpdater.checkForUpdates().then(result => {
    if (result?.updateInfo && result.updateInfo.version !== app.getVersion()) {
      state.updateAvailable = true;
      state.updateInfo = result.updateInfo;

      if (state.onUpdateStatusChange) {
        state.onUpdateStatusChange(true, result.updateInfo);
      }

      showUpdateDialog(mainWindow);
      return;
    }

    if (!result?.updateInfo || result.updateInfo.version === app.getVersion()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: i18n.t('updates.title', 'Updates'),
        message: i18n.t('updates.noUpdates', 'No updates available'),
        detail: i18n.t('updates.upToDate', 'You are using the latest version.'),
        buttons: [i18n.t('menu.changelog', 'Changelog'), i18n.t('about.ok', 'OK')]
      }).then(result => {
        if (result.response === 0) {
          help.openChangelog();
        }
      });
    }
  }).catch(err => {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.checkError', 'Could not check for updates'),
      detail: err.message
    });
  });
}

// =============================================================================
// Auto-Updater Event Handlers
// =============================================================================

/**
 * Fired when update check starts.
 */
autoUpdater.on('checking-for-update', () => {
  logger.debug('Checking for updates...');
});

/**
 * Fired when a new version is available.
 *
 * Updates module state, notifies callback, and shows desktop notification.
 */
autoUpdater.on('update-available', (info) => {
  logger.debug('Update available:', info.version);
  state.updateAvailable = true;
  state.updateInfo = info;

  // Notify callback to update menu/tray with indicator
  if (state.onUpdateStatusChange) {
    state.onUpdateStatusChange(true, info);
  }

  // Show desktop notification if supported
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'WhatsApp Dual',
      body: i18n.t('updates.available', 'Update available') + `: v${info.version}`,
      icon: APP_ICON_PATH
    });
    notification.show();
  }
});

/**
 * Fired when no updates are available.
 */
autoUpdater.on('update-not-available', (info) => {
  logger.debug('No updates available');
  state.updateAvailable = false;
  state.updateInfo = null;

  if (state.onUpdateStatusChange) {
    state.onUpdateStatusChange(false, null);
  }
});

/**
 * Fired when an error occurs during update check/download.
 */
autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
});

/**
 * Fired during update download with progress information.
 */
autoUpdater.on('download-progress', (progressObj) => {
  logger.debug(`Download progress: ${progressObj.percent}%`);
});

/**
 * Fired when update download completes.
 *
 * Prompts user to restart the app to install the update.
 */
autoUpdater.on('update-downloaded', (info) => {
  logger.debug('Update downloaded');

  dialog.showMessageBox({
    type: 'info',
    title: i18n.t('updates.title', 'Updates'),
    message: i18n.t('updates.downloaded', 'Update downloaded'),
    detail: i18n.t('updates.restartToInstall', 'Restart the app to install the update.'),
    icon: APP_ICON_PATH,
    buttons: [i18n.t('updates.restartNow', 'Restart now'), i18n.t('menu.changelog', 'Changelog'), i18n.t('updates.later', 'Later')]
  }).then(result => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    } else if (result.response === 1) {
      help.openChangelog();
    }
  });
});

// =============================================================================
// Download Functions
// =============================================================================

/**
 * Initiates download of the available update.
 *
 * Only downloads if an update is actually available.
 *
 * @returns {void}
 */
function downloadUpdate() {
  if (state.updateAvailable && isAutoUpdaterSupported()) {
    autoUpdater.downloadUpdate();
  }
}

// =============================================================================
// UI Functions
// =============================================================================

/**
 * Shows a dialog about the available update or current status.
 *
 * If update available: Shows version comparison and download option
 * If no update: Shows "up to date" message
 *
 * @param {BrowserWindow} mainWindow - Parent window for the dialog
 * @returns {void}
 */
function showUpdateDialog(mainWindow) {
  if (state.updateAvailable && state.updateInfo) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.newVersion', 'New version available'),
      icon: APP_ICON_PATH,
      detail: `${i18n.t('updates.currentVersion', 'Current version')}: ${app.getVersion()}\n${i18n.t('updates.availableVersion', 'Available version')}: ${state.updateInfo.version}`,
      buttons: [i18n.t('updates.download', 'Download'), i18n.t('menu.changelog', 'Changelog'), i18n.t('updates.later', 'Later')]
    }).then(result => {
      if (result.response === 0) {
        downloadUpdate();
      } else if (result.response === 1) {
        help.openChangelog();
      }
    });
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.noUpdates', 'No updates available'),
      icon: APP_ICON_PATH,
      detail: i18n.t('updates.upToDate', 'You are using the latest version.'),
      buttons: [i18n.t('menu.changelog', 'Changelog'), i18n.t('about.ok', 'OK')]
    }).then(result => {
      if (result.response === 0) {
        help.openChangelog();
      }
    });
  }
}

// =============================================================================
// Callback Management
// =============================================================================

/**
 * Sets a callback function for update status changes.
 *
 * The callback is invoked when:
 * - An update is found (hasUpdate=true, info=update details)
 * - No update is found (hasUpdate=false, info=null)
 *
 * Used by main.js to rebuild menu with update indicator.
 *
 * @param {Function} callback - Function(hasUpdate: boolean, info: Object|null)
 * @returns {void}
 */
function setUpdateStatusCallback(callback) {
  state.onUpdateStatusChange = callback;
}

// =============================================================================
// Status Getters
// =============================================================================

/**
 * Returns whether an update is currently available.
 *
 * @returns {boolean} True if update available
 */
function isUpdateAvailable() {
  return state.updateAvailable;
}

function getUpdateInfo() {
  return state.updateInfo;
}

// =============================================================================
// Module Exports
// =============================================================================

module.exports = {
  checkForUpdates,
  checkForUpdatesManual,
  downloadUpdate,
  showUpdateDialog,
  setUpdateStatusCallback,
  isUpdateAvailable,
  getUpdateInfo,
  isAutoUpdaterSupported
};
