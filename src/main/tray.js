/**
 * WhatsApp Dual - System Tray Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This module manages the system tray (notification area) integration.
 * It provides quick access to the app from the system tray, allowing
 * users to show/hide the window and switch accounts without opening
 * the main window.
 *
 * Features:
 * - Tray icon in the system notification area
 * - Right-click context menu with:
 *   - Show/Hide window toggle
 *   - Quick account switching (Personal/Business)
 *   - Quit option
 * - Click to toggle window visibility
 * - Internationalized menu labels
 */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const i18n = require('../shared/i18n');

// =============================================================================
// Module State
// =============================================================================

/** @type {Tray|null} The system tray instance */
let tray = null;

/** @type {BrowserWindow|null} Reference to the main window */
let mainWindow = null;

// =============================================================================
// Tray Creation
// =============================================================================

/**
 * Creates and initializes the system tray.
 *
 * Sets up:
 * - Tray icon (resized for optimal display)
 * - Tooltip text
 * - Context menu
 * - Click handler for show/hide toggle
 *
 * @param {BrowserWindow} window - The main application window
 * @returns {Tray} The created tray instance
 */
function createTray(window) {
  mainWindow = window;

  // Load and resize the tray icon
  const iconPath = path.join(__dirname, '../../assets/icons/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  // Resize icon for tray (recommended 16x16 or 22x22 for Linux)
  const trayIcon = icon.resize({ width: 22, height: 22 });

  tray = new Tray(trayIcon);
  tray.setToolTip('WhatsApp Dual');

  // Initialize context menu
  updateContextMenu();

  // Toggle window visibility on tray icon click
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  return tray;
}

// =============================================================================
// Context Menu
// =============================================================================

/**
 * Updates the tray context menu with current state and translations.
 *
 * The context menu provides:
 * - Show/Hide toggle (label changes based on window visibility)
 * - Personal account shortcut
 * - Business account shortcut
 * - Quit option
 *
 * This function should be called when:
 * - The tray is first created
 * - The window visibility changes
 * - The language setting changes
 *
 * @returns {void}
 */
function updateContextMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    // Show/Hide toggle - label reflects current state
    {
      label: mainWindow?.isVisible()
        ? i18n.t('tray.hide', 'Hide')
        : i18n.t('tray.show', 'Show'),
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      }
    },
    { type: 'separator' },

    // Quick account switching
    {
      label: i18n.t('menu.personal', 'Personal'),
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('switch-to-account', 'personal');
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: i18n.t('menu.business', 'Business'),
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('switch-to-account', 'business');
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },

    // Quit option
    {
      label: i18n.t('tray.quit', 'Quit'),
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Destroys the tray icon and cleans up resources.
 *
 * Should be called when the app is quitting to ensure
 * proper cleanup of system resources.
 *
 * @returns {void}
 */
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Updates the main window reference.
 *
 * Used when the main window is recreated (e.g., on macOS
 * when activating the app after all windows were closed).
 *
 * @param {BrowserWindow} window - The new main window reference
 * @returns {void}
 */
function setMainWindow(window) {
  mainWindow = window;
}

// =============================================================================
// Module Exports
// =============================================================================

module.exports = {
  createTray,
  updateContextMenu,
  destroyTray,
  setMainWindow
};
