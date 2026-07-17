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
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { autoUpdater } = require('electron-updater');
const { app, dialog, shell, Notification } = require('electron');
const i18n = require('../shared/i18n');
const help = require('./help');
const logger = require('../shared/logger');
const { GITHUB_REPO } = require('../shared/constants');
const debUpdater = require('./deb-updater');

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
 * Determine how the current build receives updates.
 *
 *   'none'     - Development build running from source; cannot update.
 *   'appimage' - electron-updater can self-update in place.
 *   'deb'      - Packaged Linux build that is not an AppImage (.deb/snap);
 *                updates through the assisted download-and-install flow.
 *
 * @returns {'none'|'appimage'|'deb'} The update strategy
 */
function getUpdateStrategy() {
  if (!app.isPackaged) {
    return 'none';
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return 'deb';
  }
  return 'appimage';
}

/**
 * Returns whether electron-updater can update the current build in place.
 *
 * @returns {boolean} True if the AppImage self-update path is available
 */
function isAutoUpdaterSupported() {
  return getUpdateStrategy() === 'appimage';
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
  const strategy = getUpdateStrategy();

  if (strategy === 'none') {
    return;
  }

  if (strategy === 'deb') {
    // Silent startup check: notify + menu indicator only, no modal dialog
    checkForDebUpdate(null, { silent: true });
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
  const strategy = getUpdateStrategy();

  if (strategy === 'deb') {
    checkForDebUpdate(mainWindow, { silent: false });
    return;
  }

  if (strategy === 'none') {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.unsupportedBuild', 'Automatic updates are not available for this build'),
      detail: i18n.t(
        'updates.unsupportedBuildDetail',
        'This is a development build running from source. Install a packaged release (.deb or AppImage) to receive updates.'
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
// Assisted .deb Update Flow
// =============================================================================

/**
 * Check GitHub for a newer .deb and, when found, offer to install it.
 *
 * Silent mode (startup) only raises the menu indicator and a desktop
 * notification. Interactive mode shows a dialog offering to download and
 * install the update.
 *
 * @param {BrowserWindow|null} mainWindow - Parent window for dialogs
 * @param {object} opts
 * @param {boolean} opts.silent - If true, no modal dialogs
 * @returns {Promise<void>}
 */
async function checkForDebUpdate(mainWindow, { silent }) {
  let result;
  try {
    result = await debUpdater.checkForNewerDeb({
      currentVersion: app.getVersion(),
      fetchManifest: () => debUpdater.fetchManifestText(debUpdater.buildManifestUrl(GITHUB_REPO)),
    });
  } catch (err) {
    logger.debug('deb update check failed:', err.message);
    if (!silent) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: i18n.t('updates.title', 'Updates'),
        message: i18n.t('updates.checkError', 'Could not check for updates'),
        detail: err.message
      });
    }
    return;
  }

  if (!result.available || !result.deb) {
    state.updateAvailable = false;
    state.updateInfo = null;
    if (state.onUpdateStatusChange) {
      state.onUpdateStatusChange(false, null);
    }
    if (!silent) {
      showNoUpdatesDialog(mainWindow);
    }
    return;
  }

  // Update available — keep the .deb asset so the menu "update available"
  // path can install it without re-fetching the manifest
  state.updateAvailable = true;
  state.updateInfo = { version: result.version, deb: result.deb };
  if (state.onUpdateStatusChange) {
    state.onUpdateStatusChange(true, state.updateInfo);
  }

  if (silent) {
    if (Notification.isSupported()) {
      new Notification({
        title: 'WhatsApp Dual',
        body: i18n.t('updates.available', 'Update available') + `: v${result.version}`,
        icon: APP_ICON_PATH
      }).show();
    }
    return;
  }

  await confirmAndInstallDeb(mainWindow, state.updateInfo);
}

/**
 * Show the "download and install?" dialog for a .deb update and, on
 * confirmation, run the download-and-install flow.
 *
 * @param {BrowserWindow|null} mainWindow - Parent window for dialogs
 * @param {{version: string, deb: object}} update - Update info (with .deb asset)
 * @returns {Promise<void>}
 */
async function confirmAndInstallDeb(mainWindow, update) {
  // The .deb asset may be missing if the menu was built from a partial
  // state; re-fetch the manifest to recover it.
  if (!update || !update.deb) {
    try {
      const fresh = await debUpdater.checkForNewerDeb({
        currentVersion: app.getVersion(),
        fetchManifest: () => debUpdater.fetchManifestText(debUpdater.buildManifestUrl(GITHUB_REPO)),
      });
      if (!fresh.available || !fresh.deb) {
        showNoUpdatesDialog(mainWindow);
        return;
      }
      update = { version: fresh.version, deb: fresh.deb };
      state.updateInfo = update;
    } catch (err) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: i18n.t('updates.title', 'Updates'),
        message: i18n.t('updates.checkError', 'Could not check for updates'),
        detail: err.message
      });
      return;
    }
  }

  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: i18n.t('updates.title', 'Updates'),
    message: i18n.t('updates.debInstallMessage', 'Download and install the update?'),
    icon: APP_ICON_PATH,
    detail: `${i18n.t('updates.currentVersion', 'Current version')}: ${app.getVersion()}\n` +
            `${i18n.t('updates.availableVersion', 'Available version')}: ${update.version}\n\n` +
            i18n.t('updates.debInstallDetail', 'The new package will be downloaded and installed. Your system will ask for your password to complete the update, and the app will restart automatically.'),
    buttons: [
      i18n.t('updates.downloadAndInstall', 'Download and install'),
      i18n.t('menu.changelog', 'Changelog'),
      i18n.t('updates.later', 'Later')
    ],
    defaultId: 0,
    cancelId: 2
  });

  if (choice.response === 0) {
    await downloadAndInstallDeb(mainWindow, update);
  } else if (choice.response === 1) {
    help.openChangelog();
  }
}

/**
 * Download the .deb, verify its checksum, and install it via pkexec.
 *
 * @param {BrowserWindow|null} mainWindow - Parent window for dialogs
 * @param {{version: string, deb: {url: string, sha512: string}}} update - Update info
 * @returns {Promise<void>}
 */
async function downloadAndInstallDeb(mainWindow, update) {
  const url = debUpdater.buildDebDownloadUrl(GITHUB_REPO, update.deb.url);

  // Immediate feedback: the download can take several seconds
  if (Notification.isSupported()) {
    new Notification({
      title: 'WhatsApp Dual',
      body: i18n.t('updates.downloading', 'Downloading update…'),
      icon: APP_ICON_PATH
    }).show();
  }

  let buffer;
  try {
    buffer = await debUpdater.downloadToBuffer(url);
  } catch (err) {
    logger.debug('deb download failed:', err.message);
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.downloadFailed', 'Could not download the update'),
      detail: err.message
    });
    return;
  }

  // Integrity check before touching the system
  if (!debUpdater.verifyChecksum(buffer, update.deb.sha512)) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.checksumFailed', 'The downloaded update failed its integrity check and was not installed.')
    });
    return;
  }

  const debPath = debUpdater.debTempPath(app.getPath('temp') || os.tmpdir(), update.deb.url);
  try {
    fs.writeFileSync(debPath, buffer);
  } catch (err) {
    logger.debug('writing deb failed:', err.message);
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: i18n.t('updates.title', 'Updates'),
      message: i18n.t('updates.downloadFailed', 'Could not download the update'),
      detail: err.message
    });
    return;
  }

  debUpdater.installDeb(debPath, {
    pkexecPath: debUpdater.findPkexec(),
    spawn,
    openPath: (p) => shell.openPath(p),
    onDone: (success) => {
      if (success) {
        app.relaunch();
        app.exit(0);
      } else if (success === false) {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: i18n.t('updates.title', 'Updates'),
          message: i18n.t('updates.installFailed', 'The update could not be installed.')
        });
      }
      // success === null: fallback installer opened; leave the app running
    }
  });
}

/**
 * Show the "no updates available" dialog.
 *
 * @param {BrowserWindow|null} mainWindow - Parent window
 * @returns {void}
 */
function showNoUpdatesDialog(mainWindow) {
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
/**
 * Decide how a download request should be fulfilled for a given strategy.
 *
 * Regression guard: on 'deb' this must be the assisted install, never the
 * AppImage-only electron-updater path (which silently no-ops on .deb).
 *
 * @param {'none'|'appimage'|'deb'} strategy - Current update strategy
 * @returns {'deb-install'|'appimage-download'|'none'} The download action
 */
function chooseDownloadAction(strategy) {
  if (strategy === 'deb') return 'deb-install';
  if (strategy === 'appimage') return 'appimage-download';
  return 'none';
}

function downloadUpdate() {
  if (!state.updateAvailable) {
    return;
  }
  const action = chooseDownloadAction(getUpdateStrategy());
  if (action === 'deb-install') {
    downloadAndInstallDeb(null, state.updateInfo);
  } else if (action === 'appimage-download') {
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
  // On .deb builds, downloading means the assisted download-and-install flow
  if (getUpdateStrategy() === 'deb') {
    confirmAndInstallDeb(mainWindow, state.updateInfo);
    return;
  }

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
  isAutoUpdaterSupported,
  getUpdateStrategy,
  chooseDownloadAction
};
