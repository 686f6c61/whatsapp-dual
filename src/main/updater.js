/**
 * WhatsApp Dual - Auto-Update Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.0.3
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

const { autoUpdater } = require('electron-updater');
const { dialog, Notification } = require('electron');
const i18n = require('../shared/i18n');

// =============================================================================
// Module State
// =============================================================================

/** @type {boolean} Whether an update is available */
let updateAvailable = false;

/** @type {Object|null} Information about the available update */
let updateInfo = null;

/** @type {Function|null} Callback for update status changes */
let onUpdateStatusChange = null;

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
 * Checks for available updates.
 *
 * Connects to GitHub Releases to check if a newer version exists.
 * Can run silently (no error dialogs) or show feedback to user.
 *
 * @param {boolean} [silent=true] - If true, don't show error dialogs
 * @returns {void}
 */
function checkForUpdates(silent = true) {
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
  autoUpdater.checkForUpdates().then(result => {
    if (!result || !result.updateInfo || result.updateInfo.version === require('electron').app.getVersion()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: i18n.t('updates.title', 'Updates'),
        message: i18n.t('updates.noUpdates', 'No updates available'),
        detail: i18n.t('updates.upToDate', 'You are using the latest version.')
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
  console.log('Checking for updates...');
});

/**
 * Fired when a new version is available.
 *
 * Updates module state, notifies callback, and shows desktop notification.
 */
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  updateAvailable = true;
  updateInfo = info;

  // Notify callback to update menu/tray with indicator
  if (onUpdateStatusChange) {
    onUpdateStatusChange(true, info);
  }

  // Show desktop notification if supported
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'WhatsApp Dual',
      body: i18n.t('updates.available', 'Update available') + `: v${info.version}`,
      icon: undefined
    });
    notification.show();
  }
});

/**
 * Fired when no updates are available.
 */
autoUpdater.on('update-not-available', (info) => {
  console.log('No updates available');
  updateAvailable = false;
  updateInfo = null;

  if (onUpdateStatusChange) {
    onUpdateStatusChange(false, null);
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
  console.log(`Download progress: ${progressObj.percent}%`);
});

/**
 * Fired when update download completes.
 *
 * Prompts user to restart the app to install the update.
 */
autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded');

  dialog.showMessageBox({
    type: 'info',
    title: i18n.t('updates.title', 'Updates'),
    message: i18n.t('updates.downloaded', 'Update downloaded'),
    detail: i18n.t('updates.restartToInstall', 'Restart the app to install the update.'),
    buttons: [i18n.t('updates.restartNow', 'Restart now'), i18n.t('updates.later', 'Later')]
  }).then(result => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
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
  if (updateAvailable) {
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
  if (updateAvailable && updateInfo) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.newVersion', 'New version available'),
      detail: `${i18n.t('updates.currentVersion', 'Current version')}: ${require('electron').app.getVersion()}\n${i18n.t('updates.availableVersion', 'Available version')}: ${updateInfo.version}`,
      buttons: [i18n.t('updates.download', 'Download'), i18n.t('updates.later', 'Later')]
    }).then(result => {
      if (result.response === 0) {
        downloadUpdate();
      }
    });
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.noUpdates', 'No updates available'),
      detail: i18n.t('updates.upToDate', 'You are using the latest version.')
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
  onUpdateStatusChange = callback;
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
  return updateAvailable;
}

/**
 * Returns information about the available update.
 *
 * @returns {Object|null} Update info object or null if no update
 */
function getUpdateInfo() {
  return updateInfo;
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
  getUpdateInfo
};
