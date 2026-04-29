/**
 * WhatsApp Dual - View Manager Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * Manages WebContentsViews for the dual WhatsApp sessions:
 * - Creates isolated views with separate session partitions
 * - Handles account switching (show/hide views)
 * - Sets up external link handling and download handling
 * - Monitors page titles for unread message badges
 *
 * Each view uses a persistent Electron session partition to ensure
 * complete isolation between the Personal and Business accounts.
 */

const { WebContentsView, shell } = require('electron');
const path = require('node:path');
const { WHATSAPP_URL, ACCOUNTS } = require('../shared/constants');
const { setNotificationState } = require('./tray');

// =============================================================================
// State
// =============================================================================

/** @type {Object.<string, WebContentsView>} WebContentsViews for each WhatsApp account */
let views = {};

/** @type {string} Currently active account ID */
let currentAccount = ACCOUNTS.PERSONAL.id;

/**
 * Custom User-Agent string to avoid WhatsApp Web blocking.
 * @constant {string}
 */
const USER_AGENT = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

// =============================================================================
// Getters
// =============================================================================

/** @returns {Object.<string, WebContentsView>} */
function getViews() { return views; }

/** @returns {string} */
function getCurrentAccount() { return currentAccount; }

// =============================================================================
// URL Validation Helpers
// =============================================================================

/**
 * Checks if a URL is a WhatsApp internal URL.
 *
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL is a WhatsApp URL
 */
function isWhatsAppURL(url) {
  try {
    const urlObj = new URL(url);
    const h = urlObj.hostname;
    return h === 'whatsapp.com' || h.endsWith('.whatsapp.com')
        || h === 'whatsapp.net' || h.endsWith('.whatsapp.net');
  } catch {
    return false;
  }
}

/**
 * Checks if a URL scheme is allowed for opening externally.
 * Only http: and https: are permitted (S8 -- blocks file://, javascript:, etc.).
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
 * Checks whether a permission request should be allowed.
 *
 * Only desktop notifications from trusted WhatsApp origins are allowed.
 *
 * @param {string} permission - Electron permission name
 * @param {string} [requestingOrigin] - Origin requesting the permission
 * @returns {boolean} True if permission is allowed
 */
function isAllowedPermissionRequest(permission, requestingOrigin = '') {
  return permission === 'notifications' && isWhatsAppURL(requestingOrigin);
}

// =============================================================================
// Unread Message Detection
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

  Object.values(views).forEach(view => {
    if (view?.webContents) {
      const title = view.webContents.getTitle();
      if (unreadPattern.test(title)) {
        hasUnread = true;
      }
    }
  });

  setNotificationState(hasUnread);
}

// =============================================================================
// External Link and Download Handlers
// =============================================================================

/**
 * Configures external link handling for a WebContentsView's webContents.
 *
 * - Links to WhatsApp domains open within the app
 * - All other links with allowed schemes open in the default browser
 * - Links with disallowed schemes (file://, javascript://) are blocked
 *
 * @param {Electron.WebContents} webContents - The webContents to configure
 * @returns {void}
 */
function setupExternalLinkHandler(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (!isWhatsAppURL(url) && isAllowedScheme(url)) {
      shell.openExternal(url).catch(err => console.error('Error opening external URL:', err));
    }
    return { action: 'deny' };
  });

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
 * Configures file download handling for a WebContentsView's session.
 *
 * By not calling item.setSavePath(), Electron shows a native "Save As" dialog.
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
 * Configures permission handling for a WebContentsView session.
 *
 * Desktop notifications are allowed only for trusted WhatsApp origins.
 * All other permission checks and requests are denied.
 *
 * @param {Electron.WebContents} webContents - The webContents whose session to configure
 * @returns {void}
 */
function setupPermissionHandlers(webContents) {
  webContents.session.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return isAllowedPermissionRequest(permission, requestingOrigin);
  });

  webContents.session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(isAllowedPermissionRequest(permission, details?.requestingOrigin));
  });
}

// =============================================================================
// View Creation
// =============================================================================

/**
 * Creates a single isolated WebContentsView for a WhatsApp account.
 *
 * @param {Object} accountConfig - Account configuration from ACCOUNTS
 * @param {string} accountConfig.partition - Session partition name
 * @returns {WebContentsView} The configured view
 */
function createAccountView(accountConfig) {
  const view = new WebContentsView({
    webPreferences: {
      partition: accountConfig.partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload-whatsapp.js')
    }
  });

  view.webContents.setUserAgent(USER_AGENT);
  setupPermissionHandlers(view.webContents);

  view.webContents.loadURL(WHATSAPP_URL);
  setupExternalLinkHandler(view.webContents);
  setupDownloadHandler(view.webContents);

  view.webContents.on('page-title-updated', () => {
    checkForUnreadMessages();
  });

  return view;
}

/**
 * Creates isolated WebContentsViews for Personal and Business WhatsApp accounts.
 *
 * @returns {void}
 */
function createWhatsAppViews() {
  views.personal = createAccountView(ACCOUNTS.PERSONAL);
  views.business = createAccountView(ACCOUNTS.BUSINESS);
}

// =============================================================================
// View Bounds and Account Switching
// =============================================================================

/**
 * Returns the bounds that child WebContentsViews should use.
 *
 * BrowserWindow.getContentSize() can be stale during the first Wayland layout
 * pass on Linux. The root contentView owns the actual available area for child
 * views, so prefer its current bounds and fall back only for older Electron
 * shapes or mocks.
 *
 * @param {BrowserWindow} mainWindow - The main application window
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
function getWebContentsViewBounds(mainWindow) {
  if (!mainWindow) return;

  const contentBounds = mainWindow.contentView?.getBounds?.();
  if (contentBounds?.width > 0 && contentBounds?.height > 0) {
    return {
      x: 0,
      y: 0,
      width: Math.floor(contentBounds.width),
      height: Math.floor(contentBounds.height)
    };
  }

  const [width, height] = mainWindow.getContentSize();
  return { x: 0, y: 0, width, height };
}

/**
 * Updates the bounds of all WebContentsViews to match the window size.
 *
 * @param {BrowserWindow} mainWindow - The main application window
 * @returns {void}
 */
function updateViewBounds(mainWindow) {
  const viewBounds = getWebContentsViewBounds(mainWindow);
  if (!viewBounds) return;

  Object.values(views).forEach(view => {
    view.setBounds(viewBounds);
  });
}

/**
 * Switches the active WhatsApp account view.
 *
 * @param {string} accountId - The account to switch to ('personal' or 'business')
 * @param {BrowserWindow} mainWindow - The main application window
 * @returns {void}
 */
function switchAccount(accountId, mainWindow) {
  if (!mainWindow || !views[accountId]) return;

  currentAccount = accountId;

  // Remove all current views
  mainWindow.contentView.children.slice().forEach(v => mainWindow.contentView.removeChildView(v));

  // Add new view
  mainWindow.contentView.addChildView(views[accountId]);
  updateViewBounds(mainWindow);

  // Update window title
  const accountName = accountId === 'personal' ? 'Personal' : 'Business';
  mainWindow.setTitle(`WhatsApp Dual - ${accountName}`);
}

/**
 * Reloads the currently active WebContentsView.
 *
 * @returns {void}
 */
function reloadActiveView() {
  const view = views[currentAccount];
  if (view?.webContents) {
    view.webContents.reload();
  }
}

/**
 * Removes all child views from the main window's contentView.
 *
 * @param {BrowserWindow} mainWindow - The main application window
 * @returns {void}
 */
function removeAllViews(mainWindow) {
  if (mainWindow) {
    mainWindow.contentView.children.slice().forEach(v => mainWindow.contentView.removeChildView(v));
  }
}

/**
 * Restores the current account view to the main window.
 *
 * @param {BrowserWindow} mainWindow - The main application window
 * @returns {void}
 */
function restoreCurrentView(mainWindow) {
  const view = views[currentAccount];
  if (view && mainWindow) {
    mainWindow.contentView.children.slice().forEach(v => mainWindow.contentView.removeChildView(v));
    mainWindow.contentView.addChildView(view);
    updateViewBounds(mainWindow);
  }
}

// =============================================================================
// Module Exports
// =============================================================================

module.exports = {
  // Getters
  getViews,
  getCurrentAccount,
  // URL helpers (exported for potential testing)
  isWhatsAppURL,
  isAllowedScheme,
  isAllowedPermissionRequest,
  getWebContentsViewBounds,
  // View management
  createWhatsAppViews,
  createAccountView,
  updateViewBounds,
  switchAccount,
  reloadActiveView,
  removeAllViews,
  restoreCurrentView,
  // Handlers
  setupExternalLinkHandler,
  setupPermissionHandlers,
  setupDownloadHandler,
  checkForUnreadMessages
};
