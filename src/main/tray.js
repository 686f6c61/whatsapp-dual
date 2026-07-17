/**
 * WhatsApp Dual - System Tray Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
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
const path = require('node:path');
const i18n = require('../shared/i18n');

// =============================================================================
// Module State (single container)
// =============================================================================

const state = {
  /** @type {Tray|null} The system tray instance */
  tray: null,
  /** @type {BrowserWindow|null} Reference to the main window */
  mainWindow: null,
  /** @type {NativeImage|null} Normal tray icon */
  normalIcon: null,
  /** @type {NativeImage|null} Message notification icon */
  messageIcon: null,
  /** @type {boolean} Current notification state */
  hasNotification: false,
  /** @type {Function|null} Callback to switch accounts */
  switchAccountFn: null,
  /** @type {Function|null} Callback to quit app properly */
  quitFn: null,
};

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
function createTray(window, switchAccountFn, quitFn) {
  state.mainWindow = window;
  state.switchAccountFn = switchAccountFn;
  state.quitFn = quitFn;

  // Load and resize the normal tray icon
  const iconPath = path.join(__dirname, '../../assets/icons/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  state.normalIcon = icon.resize({ width: 22, height: 22 });

  // Load and resize the message notification icon
  const messageIconPath = path.join(__dirname, '../../assets/icons/icon-message.png');
  const msgIcon = nativeImage.createFromPath(messageIconPath);
  state.messageIcon = msgIcon.resize({ width: 22, height: 22 });

  state.tray = new Tray(state.normalIcon);
  state.tray.setToolTip('WhatsApp Dual');

  // Initialize context menu
  updateContextMenu();

  // Toggle window visibility on tray icon click
  state.tray.on('click', () => {
    toggleMainWindow();
  });

  return state.tray;
}

/**
 * Shows the main window (focused) or hides it if already visible.
 *
 * @returns {void}
 */
function toggleMainWindow() {
  if (!state.mainWindow) return;

  if (state.mainWindow.isVisible()) {
    state.mainWindow.hide();
  } else {
    state.mainWindow.show();
    state.mainWindow.focus();
  }
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
  if (!state.tray) return;

  const contextMenu = Menu.buildFromTemplate([
    // Show/Hide toggle - label reflects current state
    {
      label: state.mainWindow?.isVisible()
        ? i18n.t('tray.hide', 'Hide')
        : i18n.t('tray.show', 'Show'),
      click: () => {
        toggleMainWindow();
      }
    },
    { type: 'separator' },

    // Quick account switching (uses callback instead of IPC — B1 fix)
    {
      label: i18n.t('menu.personal', 'Personal'),
      click: () => {
        if (state.switchAccountFn) {
          state.switchAccountFn('personal');
        }
        if (state.mainWindow) {
          state.mainWindow.show();
          state.mainWindow.focus();
        }
      }
    },
    {
      label: i18n.t('menu.business', 'Business'),
      click: () => {
        if (state.switchAccountFn) {
          state.switchAccountFn('business');
        }
        if (state.mainWindow) {
          state.mainWindow.show();
          state.mainWindow.focus();
        }
      }
    },
    { type: 'separator' },

    // Quit option (uses callback to set isQuitting — B2 fix)
    {
      label: i18n.t('tray.quit', 'Quit'),
      click: () => {
        if (state.quitFn) {
          state.quitFn();
        } else {
          app.quit();
        }
      }
    }
  ]);

  state.tray.setContextMenu(contextMenu);
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
  if (state.tray) {
    state.tray.destroy();
    state.tray = null;
  }
}

// =============================================================================
// Notification Icon
// =============================================================================

/**
 * Sets the notification state and updates the tray icon accordingly.
 *
 * When there are unread messages, shows the message notification icon.
 * When all messages are read, shows the normal icon.
 *
 * @param {boolean} hasMessages - Whether there are unread messages
 * @returns {void}
 */
function setNotificationState(hasMessages) {
  if (!state.tray) return;

  // Only update if state changed
  if (state.hasNotification === hasMessages) return;

  state.hasNotification = hasMessages;

  if (hasMessages && state.messageIcon) {
    state.tray.setImage(state.messageIcon);
    state.tray.setToolTip('WhatsApp Dual - New messages');
  } else if (state.normalIcon) {
    state.tray.setImage(state.normalIcon);
    state.tray.setToolTip('WhatsApp Dual');
  }
}

// =============================================================================
// Module Exports
// =============================================================================

module.exports = {
  createTray,
  updateContextMenu,
  destroyTray,
  setNotificationState
};
