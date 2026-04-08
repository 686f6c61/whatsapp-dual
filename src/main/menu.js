/**
 * WhatsApp Dual - Application Menu Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * This module creates and manages the native application menu bar.
 * The menu provides quick access to all app features and is fully
 * internationalized (i18n) to support multiple languages.
 *
 * Menu Structure:
 * - Personal (Ctrl+1): Switch to Personal WhatsApp account
 * - Business (Ctrl+2): Switch to Business WhatsApp account
 * - Settings: Preferences, Reload, Quit
 * - Help: Quick help, troubleshooting, updates, support, About
 *
 * Features:
 * - Update badge with version when a new release is available
 * - Keyboard shortcuts for all major actions
 * - Dynamic language switching without restart
 */

const { Menu, app } = require('electron');
const i18n = require('../shared/i18n');
const updater = require('./updater');
const security = require('./security');
const help = require('./help');

// =============================================================================
// Menu Creation
// =============================================================================

/**
 * Creates and sets the application menu.
 *
 * This function builds the entire menu structure with:
 * - Account switching items (Personal/Business)
 * - Settings submenu (Preferences, Reload, Quit)
 * - Help submenu (Quick help, troubleshooting, updates, support, About)
 *
 * The menu is rebuilt when:
 * - The app starts
 * - The language setting changes
 * - An update becomes available
 *
 * @param {object} options - Menu configuration
 * @param {Function} options.switchAccount - Callback to switch WhatsApp accounts
 * @param {Function} options.openSettings - Callback to open settings window
 * @param {Function} options.openAbout - Callback to open about dialog
 * @param {BrowserWindow} options.mainWindow - Reference to the main window
 * @param {Function} options.quit - Callback to quit the application
 * @param {Function} options.reload - Callback to reload the active view
 * @returns {void}
 */
function createMenu({ switchAccount: switchAccountFn, openSettings: openSettingsFn, openAbout: openAboutFn, mainWindow, quit: quitFn, reload: reloadFn }) {
  const availableUpdate = updater.getUpdateInfo();
  const updateLabel = availableUpdate?.version
    ? `● ${i18n.t('updates.updateAvailable', 'Update available!')} · v${availableUpdate.version}`
    : i18n.t('updates.checkForUpdates', 'Check for updates');

  // Define the complete menu template
  const template = [
    // =========================================================================
    // Personal Account Menu Item
    // =========================================================================
    {
      label: i18n.t('menu.personal', 'Personal'),
      accelerator: 'CmdOrCtrl+1',
      click: () => switchAccountFn('personal')
    },

    // =========================================================================
    // Business Account Menu Item
    // =========================================================================
    {
      label: i18n.t('menu.business', 'Business'),
      accelerator: 'CmdOrCtrl+2',
      click: () => switchAccountFn('business')
    },

    // =========================================================================
    // Settings Submenu
    // =========================================================================
    {
      label: i18n.t('menu.settings', 'Settings'),
      submenu: [
        {
          label: i18n.t('menu.preferences', 'Preferences'),
          accelerator: 'CmdOrCtrl+,',
          click: () => openSettingsFn()
        },
        {
          label: i18n.t('menu.lockNow', 'Lock now'),
          accelerator: 'CmdOrCtrl+L',
          visible: security.isPINEnabled(),
          click: () => {
            if (security.isPINEnabled()) {
              security.lockApp();
            }
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('menu.reload', 'Reload'),
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (reloadFn) reloadFn();
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('menu.quit', 'Quit'),
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            if (quitFn) {
              quitFn();
            } else {
              app.quit();
            }
          }
        }
      ]
    },

    // =========================================================================
    // Help Submenu
    // =========================================================================
    {
      label: i18n.t('menu.help', 'Help'),
      submenu: [
        {
          label: i18n.t('menu.quickHelp', 'Quick help'),
          click: () => help.showQuickHelp(mainWindow)
        },
        {
          label: i18n.t('menu.troubleshooting', 'Troubleshooting'),
          click: () => help.showTroubleshooting(mainWindow)
        },
        { type: 'separator' },

        // Update check / download item
        {
          label: updateLabel,
          click: () => {
            if (updater.isUpdateAvailable()) {
              updater.showUpdateDialog(mainWindow);
            } else {
              updater.checkForUpdatesManual(mainWindow);
            }
          }
        },
        { type: 'separator' },

        {
          label: i18n.t('menu.changelog', 'Changelog'),
          click: () => help.openChangelog()
        },
        {
          label: i18n.t('menu.reportIssue', 'Report an issue'),
          click: () => help.openIssueTracker()
        },
        { type: 'separator' },

        {
          label: i18n.t('menu.shortcuts', 'Keyboard shortcuts'),
          click: () => help.showKeyboardShortcuts(mainWindow)
        },
        { type: 'separator' },

        // About dialog
        {
          label: i18n.t('menu.about', 'About WhatsApp Dual'),
          click: () => openAboutFn()
        },
        { type: 'separator' },

        // GitHub repository link
        {
          label: i18n.t('menu.github', 'GitHub Repository'),
          click: () => help.openRepository()
        }
      ]
    }
  ];

  // Build and apply the menu
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// =============================================================================
// Module Exports
// =============================================================================

module.exports = { createMenu };
