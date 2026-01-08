/**
 * WhatsApp Dual - Main Process Entry Point
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.5
 *
 * This is the main Electron process that orchestrates the entire application.
 * It creates and manages the main window with two isolated BrowserViews,
 * one for WhatsApp Personal and one for WhatsApp Business.
 *
 * Key responsibilities:
 * - Window creation and lifecycle management
 * - BrowserView management for dual WhatsApp sessions
 * - Account switching between Personal and Business
 * - System tray integration
 * - Global keyboard shortcuts
 * - IPC communication with renderer processes
 * - Auto-update checking
 *
 * Architecture:
 * The app uses Electron's BrowserView with isolated session partitions
 * (persist:whatsapp-personal and persist:whatsapp-business) to ensure
 * complete separation between the two WhatsApp accounts. Each partition
 * maintains its own cookies, localStorage, and session data.
 */

const { app, BrowserWindow, BrowserView, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { WHATSAPP_URL, ACCOUNTS, WINDOW_CONFIG, SHORTCUTS } = require('../shared/constants');
const { createTray, destroyTray, updateContextMenu, setNotificationState } = require('./tray');
const { createMenu } = require('./menu');
const i18n = require('../shared/i18n');
const updater = require('./updater');
const security = require('./security');

// =============================================================================
// Configuration and State
// =============================================================================

/** @type {Store} Persistent storage for user preferences */
const store = new Store();

// Initialize i18n with saved language preference
const savedLanguage = store.get('language', 'en');
i18n.init(savedLanguage);

/** @type {BrowserWindow|null} Main application window */
let mainWindow = null;

/** @type {BrowserWindow|null} Settings modal window */
let settingsWindow = null;

/** @type {Object.<string, BrowserView>} BrowserViews for each WhatsApp account */
let views = {};

/** @type {string} Currently active account ID */
let currentAccount = ACCOUNTS.PERSONAL.id;

/** @type {boolean} Flag to track if app is in quitting state */
let isQuitting = false;

/** @type {boolean} Flag to track if app is showing lock screen */
let isShowingLockScreen = false;

/** @type {BrowserWindow|null} Lock screen window */
let lockWindow = null;

/**
 * Custom User-Agent string to avoid WhatsApp Web blocking.
 * WhatsApp Web may block requests from Electron's default user agent.
 * @constant {string}
 */
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// =============================================================================
// Window Management
// =============================================================================

/**
 * Creates the main application window and initializes all components.
 *
 * This function is the primary initialization point for the UI. It:
 * 1. Creates the main BrowserWindow with configured dimensions
 * 2. Sets up the application menu with i18n support
 * 3. Initializes the auto-updater
 * 4. Creates BrowserViews for both WhatsApp accounts
 * 5. Sets up the system tray
 * 6. Registers window event handlers
 *
 * @returns {void}
 */
function createWindow() {
  const defaultAccount = store.get('defaultAccount', ACCOUNTS.PERSONAL.id);
  const startMinimized = store.get('startMinimized', false);

  mainWindow = new BrowserWindow({
    width: WINDOW_CONFIG.width,
    height: WINDOW_CONFIG.height,
    minWidth: WINDOW_CONFIG.minWidth,
    minHeight: WINDOW_CONFIG.minHeight,
    title: 'WhatsApp Dual',
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    show: !startMinimized,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Create custom menu
  createMenu(switchAccount, createSettingsWindow, createAboutWindow, mainWindow);

  // Set up updater callback to rebuild menu when update is found
  updater.setUpdateStatusCallback((hasUpdate, info) => {
    createMenu(switchAccount, createSettingsWindow, createAboutWindow, mainWindow);
    updateContextMenu();
  });

  // Check for updates on startup (silent)
  updater.checkForUpdates(true);

  // Create BrowserViews for each WhatsApp account
  createWhatsAppViews();

  // Set initial view based on default account setting
  switchAccount(defaultAccount);

  // Create system tray
  createTray(mainWindow);

  // Handle window resize
  mainWindow.on('resize', () => {
    updateViewBounds();
  });

  // Handle close button - minimize to tray if enabled
  mainWindow.on('close', (event) => {
    const minimizeToTray = store.get('minimizeToTray', true);

    if (!isQuitting && minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      updateContextMenu();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('show', () => {
    updateContextMenu();
  });

  mainWindow.on('hide', () => {
    updateContextMenu();
  });
}

// =============================================================================
// BrowserView Management
// =============================================================================

/**
 * Checks if either WhatsApp view has unread messages.
 *
 * WhatsApp Web shows unread count in the page title as "(X) WhatsApp"
 * where X is the number of unread messages/chats.
 *
 * @returns {void}
 */
function checkForUnreadMessages() {
  const unreadPattern = /^\(\d+\)/;
  let hasUnread = false;

  // Check both views for unread messages
  Object.values(views).forEach(view => {
    if (view && view.webContents) {
      const title = view.webContents.getTitle();
      if (unreadPattern.test(title)) {
        hasUnread = true;
      }
    }
  });

  setNotificationState(hasUnread);
}

/**
 * Checks if a URL is a WhatsApp internal URL.
 *
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL is a WhatsApp URL
 */
function isWhatsAppURL(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.endsWith('whatsapp.com') || urlObj.hostname.endsWith('whatsapp.net');
  } catch {
    return false;
  }
}

/**
 * Configures external link handling for a BrowserView's webContents.
 *
 * This ensures that:
 * - Links to WhatsApp domains open within the app
 * - All other links open in the user's default browser
 *
 * @param {Electron.WebContents} webContents - The webContents to configure
 * @returns {void}
 */
function setupExternalLinkHandler(webContents) {
  // Handle new window requests (target="_blank" links)
  webContents.setWindowOpenHandler(({ url }) => {
    if (!isWhatsAppURL(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle navigation within the same window
  webContents.on('will-navigate', (event, url) => {
    if (!isWhatsAppURL(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

/**
 * Creates isolated BrowserViews for Personal and Business WhatsApp accounts.
 *
 * Each BrowserView uses a separate session partition to ensure complete
 * isolation between accounts. This means:
 * - Separate cookies for each account
 * - Independent localStorage/sessionStorage
 * - No cross-contamination of login sessions
 *
 * The partition format 'persist:name' ensures data persists across app restarts.
 *
 * @returns {void}
 */
function createWhatsAppViews() {
  // Create Personal WhatsApp view with isolated session
  views.personal = new BrowserView({
    webPreferences: {
      partition: ACCOUNTS.PERSONAL.partition,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  views.personal.webContents.setUserAgent(USER_AGENT);
  views.personal.webContents.loadURL(WHATSAPP_URL);

  // Configure external link handling
  setupExternalLinkHandler(views.personal.webContents);

  // Listen for title changes to detect unread messages
  views.personal.webContents.on('page-title-updated', () => {
    checkForUnreadMessages();
  });

  // Create Business view
  views.business = new BrowserView({
    webPreferences: {
      partition: ACCOUNTS.BUSINESS.partition,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  views.business.webContents.setUserAgent(USER_AGENT);
  views.business.webContents.loadURL(WHATSAPP_URL);

  // Configure external link handling
  setupExternalLinkHandler(views.business.webContents);

  // Listen for title changes to detect unread messages
  views.business.webContents.on('page-title-updated', () => {
    checkForUnreadMessages();
  });
}

/**
 * Updates the bounds of all BrowserViews to match the window size.
 *
 * Called whenever the window is resized to ensure BrowserViews
 * fill the entire content area.
 *
 * @returns {void}
 */
function updateViewBounds() {
  if (!mainWindow) return;

  const bounds = mainWindow.getContentBounds();

  const viewBounds = {
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height
  };

  Object.values(views).forEach(view => {
    view.setBounds(viewBounds);
  });
}

// =============================================================================
// Account Switching
// =============================================================================

/**
 * Switches the active WhatsApp account view.
 *
 * This function handles the core functionality of switching between
 * Personal and Business accounts by:
 * 1. Removing the currently visible BrowserView
 * 2. Adding the target account's BrowserView
 * 3. Updating the window title to reflect the active account
 *
 * @param {string} accountId - The account to switch to ('personal' or 'business')
 * @returns {void}
 */
function switchAccount(accountId) {
  if (!mainWindow || !views[accountId]) return;

  currentAccount = accountId;

  // Remove current view
  const currentView = mainWindow.getBrowserView();
  if (currentView) {
    mainWindow.removeBrowserView(currentView);
  }

  // Add new view
  mainWindow.addBrowserView(views[accountId]);
  updateViewBounds();

  // Update window title
  const accountName = accountId === 'personal' ? 'Personal' : 'Business';
  mainWindow.setTitle(`WhatsApp Dual - ${accountName}`);
}

// =============================================================================
// Secondary Windows
// =============================================================================

/**
 * Creates and displays the Settings window.
 *
 * The settings window is a modal dialog that allows users to configure:
 * - Language preference
 * - Default account (Personal/Business)
 * - Minimize to tray behavior
 * - Start with system
 * - Start minimized
 *
 * Only one settings window can be open at a time.
 *
 * @returns {void}
 */
function createSettingsWindow() {
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
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * Displays the About dialog with application information.
 *
 * Shows a native message box with:
 * - Application version
 * - Description
 * - Author information
 * - License
 * - Repository link
 *
 * All text is localized based on the current language setting.
 *
 * @returns {void}
 */
function createAboutWindow() {
  const appVersion = app.getVersion();

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: i18n.t('about.title', 'About WhatsApp Dual'),
    message: 'WhatsApp Dual',
    detail: `${i18n.t('about.version', 'Version')}: ${appVersion}\n\n${i18n.t('about.description', 'Use WhatsApp Personal and Business in a single app.')}\n\n${i18n.t('about.author', 'Author')}: 686f6c61\n${i18n.t('about.license', 'License')}: MIT\n\nhttps://github.com/686f6c61/whatsapp-dual`,
    buttons: [i18n.t('about.ok', 'OK')],
    icon: path.join(__dirname, '../../assets/icons/icon.png')
  });
}

// =============================================================================
// Security - Lock Screen
// =============================================================================

/**
 * Shows the lock screen window.
 *
 * Creates a fullscreen modal window that requires PIN entry to unlock.
 * This is called on app start (if PIN is enabled), on auto-lock timeout,
 * and when the system is suspended/locked.
 *
 * @returns {void}
 */
function showLockScreen() {
  if (lockWindow) {
    lockWindow.focus();
    return;
  }

  isShowingLockScreen = true;

  // Hide main window views
  if (mainWindow) {
    const currentView = mainWindow.getBrowserView();
    if (currentView) {
      mainWindow.removeBrowserView(currentView);
    }
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
 * Called after successful PIN verification.
 *
 * @returns {void}
 */
function hideLockScreen() {
  isShowingLockScreen = false;

  if (lockWindow) {
    lockWindow.close();
    lockWindow = null;
  }

  // Restore main window view
  if (mainWindow) {
    // Re-add the view for current account
    const view = views[currentAccount];
    if (view) {
      mainWindow.setBrowserView(view);
      updateViewBounds();
    }
    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * Shows the PIN setup screen for first-time configuration.
 *
 * @returns {void}
 */
function showPINSetupScreen() {
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
      preload: path.join(__dirname, 'preload-lock.js')
    }
  });

  lockWindow.loadFile(path.join(__dirname, '../renderer/lock-setup.html'));

  lockWindow.on('closed', () => {
    lockWindow = null;
    isShowingLockScreen = false;
  });
}

/**
 * Initialize security features.
 *
 * Sets up auto-lock, file protection, and integrity checks.
 *
 * @returns {void}
 */
function initializeSecurity() {
  // Register IPC handlers for security operations
  security.registerIPCHandlers();

  // Secure session files with restrictive permissions
  security.secureSessionFiles();

  // Verify session integrity on startup
  const integrity = security.verifySessionIntegrity();
  if (!integrity.verified && !integrity.firstRun) {
    security.showIntegrityWarning();
  }

  // Initialize auto-lock with callbacks
  security.initAutoLock(
    mainWindow,
    () => {
      // onLock callback
      showLockScreen();
    },
    () => {
      // onUnlock callback
      hideLockScreen();
    }
  );
}

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

/**
 * Registers global keyboard shortcuts for the application.
 *
 * Shortcuts are active even when the app is not focused:
 * - Ctrl+1: Switch to Personal account
 * - Ctrl+2: Switch to Business account
 * - Ctrl+,: Open Settings
 * - Ctrl+Q: Quit application
 *
 * @returns {void}
 */
function registerShortcuts() {
  globalShortcut.register(SHORTCUTS.PERSONAL, () => {
    switchAccount(ACCOUNTS.PERSONAL.id);
  });

  globalShortcut.register(SHORTCUTS.BUSINESS, () => {
    switchAccount(ACCOUNTS.BUSINESS.id);
  });

  globalShortcut.register(SHORTCUTS.SETTINGS, () => {
    createSettingsWindow();
  });

  globalShortcut.register(SHORTCUTS.QUIT, () => {
    isQuitting = true;
    app.quit();
  });
}

// =============================================================================
// IPC Communication Handlers
// =============================================================================

/**
 * IPC handlers for communication between main and renderer processes.
 *
 * These handlers respond to messages from the renderer process (settings window)
 * to perform actions that require main process privileges.
 */

/** Handle account switch requests from renderer */
ipcMain.on('switch-account', (event, accountId) => {
  switchAccount(accountId);
});

/** Return current active account to renderer */
ipcMain.on('get-current-account', (event) => {
  event.reply('current-account', currentAccount);
});

/** Open settings window from renderer request */
ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

/** Close settings window from renderer request */
ipcMain.on('close-settings', () => {
  if (settingsWindow) {
    settingsWindow.close();
  }
});

/** Open about dialog from renderer request */
ipcMain.on('open-about', () => {
  createAboutWindow();
});

/**
 * Handle settings changes from the settings window.
 *
 * When settings are saved, this handler:
 * 1. Updates the language and rebuilds UI if changed
 * 2. Configures system login items for auto-start
 *
 * @param {Object} settings - The updated settings object
 * @param {string} [settings.language] - New language code
 * @param {boolean} [settings.startWithSystem] - Auto-start preference
 * @param {boolean} [settings.startMinimized] - Start minimized preference
 */
ipcMain.on('settings-changed', (event, settings) => {
  // Handle language change - rebuild menu and tray with new translations
  if (settings.language) {
    i18n.setLanguage(settings.language);
    createMenu(switchAccount, createSettingsWindow, createAboutWindow, mainWindow);
    updateContextMenu();
  }

  // Configure system auto-start settings
  if (settings.startWithSystem !== undefined) {
    app.setLoginItemSettings({
      openAtLogin: settings.startWithSystem,
      openAsHidden: settings.startMinimized
    });
  }
});

/** Handle quit request from renderer or tray */
ipcMain.on('quit-app', () => {
  isQuitting = true;
  app.quit();
});

// =============================================================================
// Security IPC Handlers
// =============================================================================

/** Handle PIN setup completion - close setup window and show main app */
ipcMain.on('security:pinSetupComplete', () => {
  hideLockScreen();
});

/** Handle skip PIN setup - close setup window and show main app */
ipcMain.on('security:skipPINSetup', () => {
  hideLockScreen();
});

/** Handle manual lock request from settings or menu */
ipcMain.on('security:lockNow', () => {
  if (security.isPINEnabled()) {
    security.lockApp();
  }
});

/** Handle opening PIN setup from settings */
ipcMain.on('security:setupPIN', () => {
  showPINSetupScreen();
});

// =============================================================================
// Application Lifecycle
// =============================================================================

// =============================================================================
// Single Instance Lock
// =============================================================================

/**
 * Ensures only one instance of the application runs at a time.
 * If another instance is already running, focus the existing window
 * instead of opening a new one.
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the primary instance
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * Application initialization.
 *
 * Called when Electron has finished initialization and is ready
 * to create browser windows. This is the entry point for the UI.
 */
app.whenReady().then(() => {
  createWindow();
  registerShortcuts();
  initializeSecurity();

  // Show lock screen on startup if PIN is enabled
  if (security.isPINEnabled()) {
    showLockScreen();
  }
});

/**
 * Pre-quit handler.
 *
 * Sets the quitting flag to prevent the minimize-to-tray behavior
 * from blocking the actual quit operation. Also saves session hashes
 * for integrity verification on next startup.
 */
app.on('before-quit', () => {
  isQuitting = true;
  security.saveSessionHashes();
});

/**
 * Handle all windows being closed.
 *
 * On Linux/Windows, quit the app when all windows are closed.
 * On macOS (darwin), the app typically stays active until explicitly quit.
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    destroyTray();
    app.quit();
  }
});

/**
 * Handle app activation (macOS).
 *
 * Re-create the window if it was closed but the app is still running.
 * This is standard macOS behavior.
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

/**
 * Cleanup before app exit.
 *
 * Unregisters all global shortcuts and destroys the system tray
 * to ensure clean shutdown.
 */
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  destroyTray();
});
