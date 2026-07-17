/**
 * WhatsApp Dual - Conditional Logger
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * Small logging helper for the main process. Debug messages are printed
 * only during development (unpackaged app) or when explicitly enabled
 * with WHATSAPP_DUAL_DEBUG=1, so packaged builds stay quiet. Errors are
 * always printed.
 */

const { app } = require('electron');

/**
 * Whether debug logging is currently enabled.
 * Evaluated per call so packaging state and env changes are respected.
 *
 * @returns {boolean} True if debug messages should be printed
 */
function isDebugEnabled() {
  return process.env.WHATSAPP_DUAL_DEBUG === '1' || !app?.isPackaged;
}

/**
 * Log a debug message (development builds or WHATSAPP_DUAL_DEBUG=1 only).
 *
 * @param {...*} args - Values to log
 */
function debug(...args) {
  if (isDebugEnabled()) {
    console.log(...args);
  }
}

/**
 * Log an error (always printed).
 *
 * @param {...*} args - Values to log
 */
function error(...args) {
  console.error(...args);
}

module.exports = { debug, error };
