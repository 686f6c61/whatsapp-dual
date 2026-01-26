/**
 * WhatsApp Dual - Main Process Entry Point
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.2.1
 *
 * This is the main Electron process that orchestrates the entire application.
 * It creates and manages the main window with two isolated BrowserViews,
 * one for WhatsApp Personal and one for WhatsApp Business.
 *
 * Key responsibilities:
 * - Window creation and lifecycle management
 * - BrowserView management for dual WhatsApp sessions
 * - Account switching between Personal and Business
 * - File download handling for both sessions
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

const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { WHATSAPP_URL, ACCOUNTS, WINDOW_CONFIG } = require('../shared/constants');
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
const USER_AGENT = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

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

  // Quit helper — sets flag so minimize-to-tray doesn't block quit (B2 fix)
  const quitApp = () => { isQuitting = true; app.quit(); };

  // Reload helper — reloads the active BrowserView, not the main window (B3 fix)
  const reloadActiveView = () => {
    const view = views[currentAccount];
    if (view && view.webContents) {
      view.webContents.reload();
    }
  };

  // Create custom menu
  createMenu(switchAccount, createSettingsWindow, createAboutWindow, mainWindow, quitApp, reloadActiveView);

  // Set up updater callback to rebuild menu when update is found
  updater.setUpdateStatusCallback((hasUpdate, info) => {
    createMenu(switchAccount, createSettingsWindow, createAboutWindow, mainWindow, quitApp, reloadActiveView);
    updateContextMenu();
  });

  // Check for updates on startup (silent)
  updater.checkForUpdates(true);

  // Create BrowserViews for each WhatsApp account
  createWhatsAppViews();

  // Set initial view based on default account setting
  switchAccount(defaultAccount);

  // Create system tray (B1/B2 fix — pass switchAccount and quitApp callbacks)
  createTray(mainWindow, switchAccount, quitApp);

  // Handle window resize
  mainWindow.on('resize', () => {
    updateViewBounds();
  });

  // Update bounds and tray menu when window is shown (Q4 — deduplicated)
  mainWindow.on('show', () => {
    updateViewBounds();
    updateContextMenu();
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
 * Checks if a URL scheme is allowed for opening externally.
 * Only http: and https: are permitted (S8 — blocks file://, javascript:, etc.).
 *
 * @param {string} url - The URL to check
 * @returns {boolean} True if scheme is allowed
 */
function isAllowedScheme(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:' || urlObj.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Configures external link handling for a BrowserView's webContents.
 *
 * This ensures that:
 * - Links to WhatsApp domains open within the app
 * - All other links with allowed schemes open in the user's default browser
 * - Links with disallowed schemes (file://, javascript://) are blocked
 *
 * @param {Electron.WebContents} webContents - The webContents to configure
 * @returns {void}
 */
function setupExternalLinkHandler(webContents) {
  // Handle new window requests (target="_blank" links)
  webContents.setWindowOpenHandler(({ url }) => {
    if (!isWhatsAppURL(url) && isAllowedScheme(url)) {
      shell.openExternal(url).catch(err => console.error('Error opening external URL:', err));
    }
    return { action: 'deny' };
  });

  // Handle navigation within the same window
  webContents.on('will-navigate', (event, url) => {
    if (!isWhatsAppURL(url)) {
      event.preventDefault();
      if (isAllowedScheme(url)) {
        shell.openExternal(url).catch(err => console.error('Error opening external URL:', err));
      }
    }
  });
}

/**
 * Configures file download handling for a BrowserView's session.
 *
 * Attaches a 'will-download' listener to the session so that file downloads
 * from WhatsApp Web (images, documents, audio, video) are handled properly.
 * By not calling item.setSavePath(), Electron shows a native "Save As" dialog
 * that lets the user choose where to save the file.
 *
 * @param {Electron.WebContents} webContents - The webContents whose session to configure
 * @returns {void}
 */
function setupDownloadHandler(webContents) {
  webContents.session.on('will-download', (event, item) => {
    item.on('updated', (event, state) => {
      if (state === 'interrupted') {
        console.log(`Download interrupted: ${item.getFilename()}`);
      }
    });

    item.once('done', (event, state) => {
      if (state === 'completed') {
        console.log(`Download completed: ${item.getFilename()}`);
      } else {
        console.log(`Download failed (${state}): ${item.getFilename()}`);
      }
    });
  });
}

/**
 * Creates a single isolated BrowserView for a WhatsApp account.
 *
 * @param {Object} accountConfig - Account configuration from ACCOUNTS
 * @param {string} accountConfig.partition - Session partition name
 * @returns {BrowserView} The configured BrowserView
 */
function createAccountView(accountConfig) {
  const view = new BrowserView({
    webPreferences: {
      partition: accountConfig.partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  view.webContents.setUserAgent(USER_AGENT);
  view.webContents.loadURL(WHATSAPP_URL);
  setupExternalLinkHandler(view.webContents);
  setupDownloadHandler(view.webContents);

  view.webContents.on('page-title-updated', () => {
    checkForUnreadMessages();
  });

  return view;
}

/**
 * Creates isolated BrowserViews for Personal and Business WhatsApp accounts.
 *
 * Each BrowserView uses a separate session partition to ensure complete
 * isolation between accounts (cookies, localStorage, login sessions).
 *
 * @returns {void}
 */
function createWhatsAppViews() {
  views.personal = createAccountView(ACCOUNTS.PERSONAL);
  views.business = createAccountView(ACCOUNTS.BUSINESS);
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

  // Remove all current views (Q5 — uses non-deprecated getBrowserViews())
  mainWindow.getBrowserViews().forEach(v => mainWindow.removeBrowserView(v));

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
  // S3 — Block settings while lock screen is showing
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

  // Hide main window views (Q5 — uses non-deprecated getBrowserViews())
  if (mainWindow) {
    mainWindow.getBrowserViews().forEach(v => mainWindow.removeBrowserView(v));
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

  // Restore main window view (Q5 — uses non-deprecated addBrowserView())
  if (mainWindow) {
    // Re-add the view for current account
    const view = views[currentAccount];
    if (view) {
      mainWindow.getBrowserViews().forEach(v => mainWindow.removeBrowserView(v));
      mainWindow.addBrowserView(view);
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

/** @type {boolean} Tracks whether security IPC handlers are registered */
let securityInitialized = false;

/**
 * Initialize security features.
 *
 * Sets up auto-lock, file protection, and integrity checks.
 *
 * @returns {void}
 */
function initializeSecurity() {
  // Guard against double-registering IPC handlers (Q12)
  if (!securityInitialized) {
    securityInitialized = true;
    // Register IPC handlers with window references for sender validation (S5)
    security.registerIPCHandlers(() => ({
      settings: settingsWindow,
      lock: lockWindow,
      main: mainWindow
    }));
  }

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

// Q1 — Global shortcuts removed; menu accelerators provide the same
// functionality without conflicting with other applications.

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

/** Open settings window from renderer request (S3 — guard added in createSettingsWindow) */
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
    const quitApp = () => { isQuitting = true; app.quit(); };
    const reloadActiveView = () => {
      const view = views[currentAccount];
      if (view && view.webContents) view.webContents.reload();
    };
    createMenu(switchAccount, createSettingsWindow, createAboutWindow, mainWindow, quitApp, reloadActiveView);
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

// =============================================================================
// Settings Window IPC Handlers (S1 — contextIsolation support)
// =============================================================================

/** Return all settings to the settings window */
ipcMain.handle('settings:getAll', () => {
  return {
    language: store.get('language', 'en'),
    theme: store.get('theme', 'system'),
    startWithSystem: store.get('startWithSystem', false),
    startMinimized: store.get('startMinimized', false),
    minimizeToTray: store.get('minimizeToTray', true),
    defaultAccount: store.get('defaultAccount', 'personal')
  };
});

/** Save settings from the settings window */
ipcMain.handle('settings:save', (event, settings) => {
  // Persist each setting
  if (settings.language !== undefined) store.set('language', settings.language);
  if (settings.startWithSystem !== undefined) store.set('startWithSystem', settings.startWithSystem);
  if (settings.startMinimized !== undefined) store.set('startMinimized', settings.startMinimized);
  if (settings.minimizeToTray !== undefined) store.set('minimizeToTray', settings.minimizeToTray);
  if (settings.defaultAccount !== undefined) store.set('defaultAccount', settings.defaultAccount);

  // Apply language change
  if (settings.language) {
    i18n.setLanguage(settings.language);
    const quitApp = () => { isQuitting = true; app.quit(); };
    const reloadActiveView = () => {
      const view = views[currentAccount];
      if (view && view.webContents) view.webContents.reload();
    };
    createMenu(switchAccount, createSettingsWindow, createAboutWindow, mainWindow, quitApp, reloadActiveView);
    updateContextMenu();
  }

  // Apply auto-start settings
  if (settings.startWithSystem !== undefined) {
    app.setLoginItemSettings({
      openAtLogin: settings.startWithSystem,
      openAsHidden: settings.startMinimized || false
    });
  }

  return true;
});

// =============================================================================
// i18n IPC Handlers (S1 — contextIsolation support)
// =============================================================================

/** Return translations for the current language */
ipcMain.handle('i18n:getTranslations', () => {
  return i18n.getAllTranslations();
});

/** Return current language code */
ipcMain.handle('i18n:getLanguage', () => {
  return i18n.getLanguage();
});

/** Return list of available language codes */
ipcMain.handle('i18n:getAvailableLanguages', () => {
  return i18n.getAvailableLanguages();
});

/** Return translations for a specific language (for preview) */
ipcMain.handle('i18n:getTranslationsForLanguage', (event, lang) => {
  // Load the requested language, get its translations, then restore current
  const currentLang = i18n.getLanguage();
  i18n.loadLanguage(lang);
  const translations = i18n.getAllTranslations();
  // Restore original language
  i18n.loadLanguage(currentLang);
  return translations;
});

/** Handle quit request from renderer or tray */
ipcMain.on('quit-app', () => {
  isQuitting = true;
  app.quit();
});

// =============================================================================
// Security IPC Handlers
// =============================================================================

/** Handle PIN setup completion - close setup window and notify settings (B5 fix) */
ipcMain.on('security:pinSetupComplete', () => {
  hideLockScreen();
  // Notify settings window that PIN setup is done
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('security:pinSetupDone');
  }
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
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
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
    initializeSecurity();
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
  destroyTray();
});
