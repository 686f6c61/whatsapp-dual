/**
 * WhatsApp Dual - Theme Manager Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This module manages the application's visual theme (light/dark mode).
 * It supports three modes: light, dark, and system (follows OS preference).
 *
 * Features:
 * - Automatic system theme detection via prefers-color-scheme
 * - Real-time theme switching when system preference changes
 * - Persistent theme preference via electron-store
 * - CSS variable-based theming via data-theme attribute
 *
 * How it works:
 * 1. Theme preference is read from storage (defaults to 'system')
 * 2. If 'system', detects OS preference using matchMedia
 * 3. Applies theme by setting data-theme attribute on <html>
 * 4. CSS uses [data-theme="dark"] selectors for dark styles
 *
 * Usage:
 * const { themeManager } = require('./theme');
 * themeManager.init(); // Apply saved theme
 * themeManager.setTheme('dark'); // Change theme
 */

const Store = require('electron-store');

// =============================================================================
// Constants
// =============================================================================

/** @type {Store} Persistent storage for user preferences */
const store = new Store();

/** @type {string} Storage key for theme preference */
const THEME_KEY = 'theme';

/**
 * Available theme options.
 *
 * @constant {Object}
 * @property {string} SYSTEM - Follow OS dark/light preference
 * @property {string} LIGHT - Always use light theme
 * @property {string} DARK - Always use dark theme
 */
const THEMES = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark'
};

// =============================================================================
// ThemeManager Class
// =============================================================================

/**
 * Theme manager for the application.
 *
 * Handles theme detection, persistence, and application.
 * Listens for system theme changes to update automatically
 * when 'system' mode is selected.
 *
 * @class
 */
class ThemeManager {
  /**
   * Creates a new ThemeManager instance.
   *
   * Loads saved theme preference, detects system theme,
   * and sets up listener for system theme changes.
   */
  constructor() {
    /** @type {string} User's theme preference (system/light/dark) */
    this.currentTheme = store.get(THEME_KEY, THEMES.SYSTEM);

    /** @type {string} Current system theme (light/dark) */
    this.systemTheme = this.detectSystemTheme();

    // Listen for system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this.systemTheme = e.matches ? THEMES.DARK : THEMES.LIGHT;
        // Only update if following system theme
        if (this.currentTheme === THEMES.SYSTEM) {
          this.applyTheme();
        }
      });
    }
  }

  /**
   * Detects the operating system's preferred color scheme.
   *
   * Uses the CSS prefers-color-scheme media query to determine
   * if the user prefers dark or light mode.
   *
   * @returns {string} 'dark' or 'light'
   */
  detectSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return THEMES.DARK;
    }
    return THEMES.LIGHT;
  }

  /**
   * Gets the theme that should actually be applied.
   *
   * If user selected 'system', returns the detected system theme.
   * Otherwise, returns the user's explicit selection.
   *
   * @returns {string} 'dark' or 'light'
   */
  getEffectiveTheme() {
    if (this.currentTheme === THEMES.SYSTEM) {
      return this.systemTheme;
    }
    return this.currentTheme;
  }

  /**
   * Applies the current theme to the document.
   *
   * Sets the data-theme attribute on the document element,
   * which CSS uses to apply theme-specific styles.
   *
   * @returns {void}
   */
  applyTheme() {
    const effectiveTheme = this.getEffectiveTheme();
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }

  /**
   * Changes the theme and persists the preference.
   *
   * Validates the theme value, saves to storage, and applies immediately.
   *
   * @param {string} theme - Theme to set ('system', 'light', or 'dark')
   * @returns {void}
   */
  setTheme(theme) {
    if (!Object.values(THEMES).includes(theme)) {
      console.error(`Invalid theme: ${theme}`);
      return;
    }

    this.currentTheme = theme;
    store.set(THEME_KEY, theme);
    this.applyTheme();
  }

  /**
   * Returns the current theme preference.
   *
   * @returns {string} Current theme setting ('system', 'light', or 'dark')
   */
  getTheme() {
    return this.currentTheme;
  }

  /**
   * Returns all available theme options.
   *
   * Useful for populating theme selector UI.
   *
   * @returns {Object} Object with SYSTEM, LIGHT, DARK properties
   */
  getAvailableThemes() {
    return THEMES;
  }

  /**
   * Initializes the theme manager and applies the saved theme.
   *
   * Should be called once when the page loads.
   *
   * @returns {void}
   */
  init() {
    this.applyTheme();
  }
}

// =============================================================================
// Module Exports
// =============================================================================

/** @type {ThemeManager} Singleton instance */
const themeManager = new ThemeManager();

module.exports = { themeManager, THEMES };
