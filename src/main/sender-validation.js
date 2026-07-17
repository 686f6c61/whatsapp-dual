/**
 * WhatsApp Dual - IPC Sender Validation Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * Shared validation of IPC event senders against the application's known
 * windows and views. Used by both ipc-handlers.js and security.js so the
 * authorization logic lives in exactly one place.
 */

/**
 * Collect the live webContents from a map of windows/views.
 *
 * Map values may be a window-like object ({ webContents, isDestroyed? })
 * or an array of them. Destroyed windows, destroyed webContents, and
 * null entries are skipped.
 *
 * @param {Object.<string, object|object[]>} windowsMap - Named windows/views
 * @returns {Electron.WebContents[]} Live, authorized webContents
 */
function collectAuthorizedWebContents(windowsMap) {
  const contents = [];

  const push = (win) => {
    if (!win) return;
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return;
    const wc = win.webContents;
    if (!wc) return;
    if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return;
    contents.push(wc);
  };

  for (const value of Object.values(windowsMap)) {
    if (Array.isArray(value)) {
      value.forEach(push);
    } else {
      push(value);
    }
  }

  return contents;
}

/**
 * Check whether an IPC event comes from one of the authorized windows.
 *
 * @param {Electron.IpcMainEvent|Electron.IpcMainInvokeEvent} event - IPC event
 * @param {Object.<string, object|object[]>} windowsMap - Named windows/views
 * @returns {boolean} True if the sender is authorized
 */
function isAuthorizedSender(event, windowsMap) {
  return collectAuthorizedWebContents(windowsMap).includes(event.sender);
}

module.exports = {
  collectAuthorizedWebContents,
  isAuthorizedSender,
};
