/**
 * WhatsApp Dual - Application Constants
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * This module centralizes all application constants to ensure consistency
 * across the codebase and simplify configuration management.
 *
 * Constants are organized into logical groups:
 * - URL: WhatsApp Web endpoint
 * - ACCOUNTS: Account configurations with isolated session partitions
 * - WINDOW_CONFIG: Default window dimensions
 *
 * Session Partition System:
 * Each account uses a persistent partition (persist:name) which ensures:
 * - Complete cookie isolation between accounts
 * - Separate localStorage/sessionStorage
 * - Independent login sessions that survive app restarts
 */

// =============================================================================
// URL Constants
// =============================================================================

/**
 * WhatsApp Web URL.
 * This is the endpoint loaded in both BrowserViews.
 * @constant {string}
 */
const WHATSAPP_URL = 'https://web.whatsapp.com';

// =============================================================================
// Account Configuration
// =============================================================================

/**
 * Account definitions for Personal and Business WhatsApp.
 *
 * Each account includes:
 * - id: Unique identifier used for switching and storage
 * - partition: Electron session partition for data isolation
 * - name: Display name for UI elements
 *
 * The partition format 'persist:name' ensures data persists across sessions.
 * Different partitions guarantee complete separation between accounts.
 *
 * @constant {Object}
 */
const ACCOUNTS = {
  /** Personal WhatsApp account configuration */
  PERSONAL: {
    id: 'personal',
    partition: 'persist:whatsapp-personal',
    name: 'Personal'
  },
  /** Business WhatsApp account configuration */
  BUSINESS: {
    id: 'business',
    partition: 'persist:whatsapp-business',
    name: 'Business'
  }
};

// =============================================================================
// Window Configuration
// =============================================================================

/**
 * Default window dimensions.
 *
 * These values provide a comfortable default size while ensuring
 * the app remains usable on smaller screens through minimum constraints.
 *
 * @constant {Object}
 * @property {number} width - Default window width (1200px)
 * @property {number} height - Default window height (800px)
 * @property {number} minWidth - Minimum allowed width (800px)
 * @property {number} minHeight - Minimum allowed height (600px)
 */
const WINDOW_CONFIG = {
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600
};

/**
 * GitHub repository ("owner/name") used for release update checks.
 * @constant {string}
 */
const GITHUB_REPO = '686f6c61/whatsapp-dual';

// =============================================================================
// Module Exports
// =============================================================================

module.exports = {
  WHATSAPP_URL,
  ACCOUNTS,
  WINDOW_CONFIG,
  GITHUB_REPO
};
