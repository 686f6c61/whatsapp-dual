/**
 * WhatsApp Dual - Main Renderer Script
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This is the main renderer process script for the application's
 * index.html page. It handles the dropdown menu UI, account switching,
 * and communication with the main process via IPC.
 *
 * Key Responsibilities:
 * - Initialize theme and translations on page load
 * - Manage the dropdown menu visibility and interactions
 * - Handle account switching between Personal and Business
 * - Update visual indicators for the active account
 * - Communicate with main process for settings, about, and quit
 *
 * IPC Communication:
 * - Sends: switch-account, open-settings, open-about, quit-app
 * - Receives: account-changed, current-account, settings-updated
 */

const { ipcRenderer } = require('electron');
const { themeManager } = require('./theme');
const { i18n } = require('./i18n');

// =============================================================================
// Initialization
// =============================================================================

// Initialize theme and translations on load
themeManager.init();
i18n.updateDOM();

// =============================================================================
// DOM Elements
// =============================================================================

/** @type {HTMLElement} Menu toggle button */
const menuToggle = document.getElementById('menu-toggle');

/** @type {HTMLElement} Dropdown menu container */
const dropdownMenu = document.getElementById('dropdown-menu');

/** @type {NodeList} Account switch buttons */
const accountButtons = document.querySelectorAll('[data-account]');

/** @type {HTMLElement} Settings button in menu */
const btnSettings = document.getElementById('btn-settings');

/** @type {HTMLElement} About button in menu */
const btnAbout = document.getElementById('btn-about');

/** @type {HTMLElement} Quit button in menu */
const btnQuit = document.getElementById('btn-quit');

// =============================================================================
// State
// =============================================================================

/** @type {string} Currently active account ID */
let currentAccount = 'personal';

// =============================================================================
// Menu Functions
// =============================================================================

/**
 * Toggles the dropdown menu visibility.
 *
 * @returns {void}
 */
function toggleMenu() {
  dropdownMenu.classList.toggle('hidden');
}

/**
 * Closes the menu when clicking outside of it.
 *
 * This function is attached to the document click event
 * to provide expected dropdown behavior.
 *
 * @param {MouseEvent} event - The click event
 * @returns {void}
 */
function closeMenuOnClickOutside(event) {
  if (!menuToggle.contains(event.target) && !dropdownMenu.contains(event.target)) {
    dropdownMenu.classList.add('hidden');
  }
}

// =============================================================================
// Account Management
// =============================================================================

/**
 * Updates the visual indicator for the active account.
 *
 * Removes the 'active' class from all indicators and adds it
 * to the indicator for the specified account.
 *
 * @param {string} accountId - The account ID ('personal' or 'business')
 * @returns {void}
 */
function updateActiveIndicator(accountId) {
  document.querySelectorAll('.active-indicator').forEach(indicator => {
    indicator.classList.remove('active');
  });

  const activeIndicator = document.getElementById(`indicator-${accountId}`);
  if (activeIndicator) {
    activeIndicator.classList.add('active');
  }
}

/**
 * Switches to the specified WhatsApp account.
 *
 * Updates local state, sends IPC message to main process,
 * updates the visual indicator, and closes the dropdown menu.
 *
 * @param {string} accountId - The account ID to switch to
 * @returns {void}
 */
function switchAccount(accountId) {
  currentAccount = accountId;
  ipcRenderer.send('switch-account', accountId);
  updateActiveIndicator(accountId);
  dropdownMenu.classList.add('hidden');
}

// =============================================================================
// Event Listeners
// =============================================================================

// Menu toggle click handler (Q9 — null check)
if (menuToggle) {
  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });
}

// Close menu when clicking outside
document.addEventListener('click', closeMenuOnClickOutside);

// Account button click handlers
accountButtons.forEach(button => {
  button.addEventListener('click', () => {
    const accountId = button.dataset.account;
    switchAccount(accountId);
  });
});

// Settings button handler (Q9 — null check)
if (btnSettings) {
  btnSettings.addEventListener('click', () => {
    dropdownMenu.classList.add('hidden');
    ipcRenderer.send('open-settings');
  });
}

// About button handler (Q9 — null check)
if (btnAbout) {
  btnAbout.addEventListener('click', () => {
    dropdownMenu.classList.add('hidden');
    ipcRenderer.send('open-about');
  });
}

// Quit button handler (Q9 — null check)
if (btnQuit) {
  btnQuit.addEventListener('click', () => {
    ipcRenderer.send('quit-app');
  });
}

// =============================================================================
// IPC Event Handlers
// =============================================================================

/**
 * Handle settings updates from the main process.
 *
 * When settings are changed, reload theme and translations
 * to reflect any changes.
 */
ipcRenderer.on('settings-updated', () => {
  themeManager.init();
  i18n.updateDOM();
});

/**
 * Handle account changes initiated from main process.
 *
 * This can happen via keyboard shortcuts or tray menu.
 */
ipcRenderer.on('account-changed', (event, accountId) => {
  currentAccount = accountId;
  updateActiveIndicator(accountId);
});

/**
 * Receive current account from main process.
 *
 * Used to sync the renderer state with main process on load.
 */
ipcRenderer.on('current-account', (event, accountId) => {
  currentAccount = accountId;
  updateActiveIndicator(accountId);
});

// Request current account state on load
ipcRenderer.send('get-current-account');

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

/**
 * Handle keyboard shortcuts in the renderer.
 *
 * - Escape: Close the dropdown menu
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    dropdownMenu.classList.add('hidden');
  }
});
