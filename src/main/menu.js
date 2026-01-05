/**
 * WhatsApp Dual - Application Menu Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This module creates and manages the native application menu bar.
 * The menu provides quick access to all app features and is fully
 * internationalized (i18n) to support multiple languages.
 *
 * Menu Structure:
 * - Personal (Ctrl+1): Switch to Personal WhatsApp account
 * - Business (Ctrl+2): Switch to Business WhatsApp account
 * - Settings: Preferences, Reload, Quit
 * - Help: Updates, Shortcuts, About, GitHub
 *
 * Features:
 * - Update indicator (red dot) when new version is available
 * - Keyboard shortcuts for all major actions
 * - Dynamic language switching without restart
 */

const { Menu, app, dialog } = require('electron');
const i18n = require('../shared/i18n');
const updater = require('./updater');
const security = require('./security');

// =============================================================================
// Menu Creation
// =============================================================================

/**
 * Creates and sets the application menu.
 *
 * This function builds the entire menu structure with:
 * - Account switching items (Personal/Business)
 * - Settings submenu (Preferences, Reload, Quit)
 * - Help submenu (Updates, Shortcuts, About, GitHub)
 *
 * The menu is rebuilt when:
 * - The app starts
 * - The language setting changes
 * - An update becomes available
 *
 * @param {Function} switchAccountFn - Callback to switch WhatsApp accounts
 * @param {Function} openSettingsFn - Callback to open settings window
 * @param {Function} openAboutFn - Callback to open about dialog
 * @param {BrowserWindow} mainWindow - Reference to the main window (for dialogs)
 * @returns {void}
 */
function createMenu(switchAccountFn, openSettingsFn, openAboutFn, mainWindow) {
  // Add visual indicator to Help menu when update is available
  const helpLabel = updater.isUpdateAvailable()
    ? `${i18n.t('menu.help', 'Help')} (!)`
    : i18n.t('menu.help', 'Help');

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
          click: (item, focusedWindow) => {
            if (focusedWindow) focusedWindow.reload();
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('menu.quit', 'Quit'),
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },

    // =========================================================================
    // Help Submenu
    // =========================================================================
    {
      label: helpLabel,
      submenu: [
        // Update check / download item
        {
          label: updater.isUpdateAvailable()
            ? `${i18n.t('updates.updateAvailable', 'Update available!')} (!)`
            : i18n.t('updates.checkForUpdates', 'Check for updates'),
          click: () => {
            if (updater.isUpdateAvailable()) {
              updater.showUpdateDialog(mainWindow);
            } else {
              updater.checkForUpdatesManual(mainWindow);
            }
          }
        },
        { type: 'separator' },

        // Keyboard shortcuts reference
        {
          label: i18n.t('menu.shortcuts', 'Keyboard shortcuts'),
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: i18n.t('menu.shortcuts', 'Keyboard shortcuts'),
              message: i18n.t('menu.shortcuts', 'Keyboard shortcuts'),
              detail: `Ctrl+1 → Personal\nCtrl+2 → Business\nCtrl+, → ${i18n.t('menu.preferences', 'Preferences')}\nCtrl+L → ${i18n.t('menu.lockNow', 'Lock now')}\nCtrl+R → ${i18n.t('menu.reload', 'Reload')}\nCtrl+Q → ${i18n.t('menu.quit', 'Quit')}`,
              buttons: [i18n.t('about.ok', 'OK')]
            });
          }
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
          click: () => {
            require('electron').shell.openExternal('https://github.com/686f6c61/whatsapp-dual');
          }
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
