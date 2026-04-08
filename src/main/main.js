/**
 * WhatsApp Dual - Main Process Entry Point
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * This is the main Electron process that orchestrates the entire application.
 * It creates and manages the main window with two isolated WebContentsViews,
 * one for WhatsApp Personal and one for WhatsApp Business.
 *
 * Architecture:
 * The app is split into focused modules:
 * - window-manager.js: Window creation and lifecycle (main, settings, lock)
 * - view-manager.js:   WebContentsView management and account switching
 * - ipc-handlers.js:   All IPC communication with renderer processes
 *
 * This file (main.js) is the glue layer responsible for:
 * - Singleton store initialization and i18n init
 * - Security initialization
 * - App lifecycle events (ready, quit, activate, single instance)
 * - Wiring the modules together
 */

const { app, BrowserWindow } = require('electron');
const ElectronStore = require('electron-store');
const { ACCOUNTS } = require('../shared/constants');
const { createTray, destroyTray, updateContextMenu } = require('./tray');
const { createMenu } = require('./menu');
const i18n = require('../shared/i18n');
const updater = require('./updater');
const security = require('./security');
const windowManager = require('./window-manager');
const viewManager = require('./view-manager');
const { registerIPCHandlers } = require('./ipc-handlers');

// =============================================================================
// Configuration and State (singletons)
// =============================================================================

/**
 * electron-store v11 is ESM-first and is exposed under `default` when loaded
 * via CommonJS require(). Fall back to the module itself for test mocks.
 */
const Store = ElectronStore.default || ElectronStore;

/** @type {Store} Persistent storage for user preferences (singleton) */
const store = new Store();
security.initStore(store);

// Initialize i18n with saved language preference
const savedLanguage = store.get('language', 'en');
i18n.init(savedLanguage);

/** @type {boolean} Tracks whether security IPC handlers are registered */
let securityInitialized = false;

// =============================================================================
// Helper: Rebuild Menus
// =============================================================================

/**
 * Rebuilds application menu and tray context menu.
 * Called after language change, update detection, etc.
 */
function rebuildMenus() {
  const mainWindow = windowManager.getMainWindow();
  createMenu({
    switchAccount: (id) => viewManager.switchAccount(id, windowManager.getMainWindow()),
    openSettings: () => windowManager.createSettingsWindow(),
    openAbout: () => windowManager.createAboutWindow(app),
    mainWindow,
    quit: () => windowManager.quitApp(app),
    reload: () => viewManager.reloadActiveView()
  });
  updateContextMenu();
}

// =============================================================================
// IPC Handler Registration (once, before app.whenReady)
// =============================================================================

registerIPCHandlers({
  store,
  windowManager,
  viewManager,
  security,
  rebuildMenus
});

// =============================================================================
// Window Initialization
// =============================================================================

/**
 * Creates the main window and initializes all components.
 * Called from app.whenReady and app.on('activate').
 */
function initializeWindow() {
  const defaultAccount = store.get('defaultAccount', ACCOUNTS.PERSONAL.id);

  // Create main window
  const mainWindow = windowManager.createWindow({ store });

  // Build menus
  rebuildMenus();

  // Set up updater callback to rebuild menu when update is found
  updater.setUpdateStatusCallback(() => {
    rebuildMenus();
  });

  // Check for updates on startup (silent)
  updater.checkForUpdates(true);

  // Create WebContentsViews for each WhatsApp account
  viewManager.createWhatsAppViews();

  // Set initial view based on default account setting
  viewManager.switchAccount(defaultAccount, mainWindow);

  // Create system tray
  createTray(
    mainWindow,
    (id) => viewManager.switchAccount(id, windowManager.getMainWindow()),
    () => windowManager.quitApp(app)
  );

  // Handle window resize
  mainWindow.on('resize', () => {
    viewManager.updateViewBounds(windowManager.getMainWindow());
  });

  // Update bounds and tray menu when window is shown (Q4)
  mainWindow.on('show', () => {
    viewManager.updateViewBounds(windowManager.getMainWindow());
    updateContextMenu();
  });

  // Handle close button - minimize to tray if enabled
  mainWindow.on('close', (event) => {
    const minimizeToTray = store.get('minimizeToTray', true);

    if (!windowManager.getIsQuitting() && minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      updateContextMenu();
    }
  });

  mainWindow.on('hide', () => {
    updateContextMenu();
  });
}

// =============================================================================
// Security Initialization
// =============================================================================

/**
 * Initialize security features.
 *
 * Sets up auto-lock, file protection, and integrity checks.
 */
function initializeSecurity() {
  // Guard against double-registering IPC handlers (Q12)
  if (!securityInitialized) {
    securityInitialized = true;
    // Register IPC handlers with window references for sender validation (S5)
    security.registerIPCHandlers(() => ({
      settings: windowManager.getSettingsWindow(),
      lock: windowManager.getLockWindow(),
      main: windowManager.getMainWindow(),
      views: Object.values(viewManager.getViews())
    }));
  }

  // Secure session files with restrictive permissions
  security.secureSessionFiles();

  // Verify session integrity on startup
  const integrity = security.verifySessionIntegrity();
  if (!integrity.verified && !integrity.firstRun) {
    security.showIntegrityWarning();
  }

  const mainWindow = windowManager.getMainWindow();

  // Initialize auto-lock with callbacks
  security.initAutoLock(
    mainWindow,
    () => {
      // onLock callback
      windowManager.showLockScreen({
        removeAllViews: () => viewManager.removeAllViews(windowManager.getMainWindow())
      });
    },
    () => {
      // onUnlock callback
      windowManager.hideLockScreen({
        restoreCurrentView: () => viewManager.restoreCurrentView(windowManager.getMainWindow())
      });
    }
  );
}

// =============================================================================
// Single Instance Lock
// =============================================================================

const gotTheLock = app.requestSingleInstanceLock();

if (gotTheLock) {
  app.on('second-instance', () => {
    const mainWindow = windowManager.getMainWindow();
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
} else {
  app.quit();
}

// =============================================================================
// Application Lifecycle
// =============================================================================

/**
 * Application initialization.
 * Called when Electron has finished initialization and is ready
 * to create browser windows.
 */
app.whenReady().then(() => {
  initializeWindow();
  initializeSecurity();

  // Show lock screen on startup if PIN is enabled
  if (security.isPINEnabled()) {
    windowManager.showLockScreen({
      removeAllViews: () => viewManager.removeAllViews(windowManager.getMainWindow())
    });
  }
});

/**
 * Pre-quit handler.
 * Sets the quitting flag and saves session hashes.
 */
app.on('before-quit', () => {
  windowManager.setIsQuitting(true);
  security.saveSessionHashes();
});

/**
 * Handle all windows being closed.
 * On Linux/Windows, quit the app. On macOS, the app stays active.
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    destroyTray();
    app.quit();
  }
});

/**
 * Handle app activation (macOS).
 * Re-create the window if it was closed but the app is still running.
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    initializeWindow();
    initializeSecurity();
  } else {
    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      mainWindow.show();
    }
  }
});

/**
 * Cleanup before app exit.
 * Destroys the system tray for clean shutdown.
 */
app.on('will-quit', () => {
  destroyTray();
});
