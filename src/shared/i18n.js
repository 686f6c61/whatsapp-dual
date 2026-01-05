/**
 * WhatsApp Dual - Internationalization (i18n) Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This module provides internationalization support for the main process.
 * It handles loading and retrieving translations from JSON locale files,
 * enabling the application to display UI text in multiple languages.
 *
 * Supported Languages:
 * - English (en) - Default
 * - Spanish (es)
 *
 * Translation File Format:
 * Translations are stored in JSON files (locales/en.json, locales/es.json)
 * with a nested structure for organization:
 * {
 *   "menu": {
 *     "personal": "Personal",
 *     "business": "Business"
 *   }
 * }
 *
 * Usage:
 * const i18n = require('./i18n');
 * i18n.init('es');
 * const text = i18n.t('menu.personal', 'Personal');
 */

const path = require('path');
const fs = require('fs');

// =============================================================================
// Module State
// =============================================================================

/** @type {string} Currently active language code */
let currentLanguage = 'en';

/** @type {Object} Loaded translations for the current language */
let translations = {};

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolves the path to the locales directory.
 *
 * The locales directory location varies between development and production:
 * - Development: <project>/locales/
 * - Packaged app: <app>/resources/app/locales/
 *
 * This function checks multiple possible paths and returns the first
 * one that exists, ensuring compatibility across environments.
 *
 * @returns {string} Absolute path to the locales directory
 */
function getLocalesPath() {
  const possiblePaths = [
    // Development: relative to src/shared/
    path.join(__dirname, '../../locales'),
    // Packaged app: in resources
    path.join(process.resourcesPath || '', 'app/locales'),
    // Alternative development path
    path.join(__dirname, '../../../locales')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Default to first path if none exist (will fail gracefully)
  return possiblePaths[0];
}

// =============================================================================
// Language Loading
// =============================================================================

/**
 * Loads translations for the specified language.
 *
 * Reads the corresponding JSON file from the locales directory and
 * parses it into the translations object. If the requested language
 * file doesn't exist or fails to parse, falls back to English.
 *
 * @param {string} lang - Language code (e.g., 'en', 'es')
 * @returns {boolean} True if language loaded successfully, false otherwise
 */
function loadLanguage(lang) {
  const localesPath = getLocalesPath();
  const filePath = path.join(localesPath, `${lang}.json`);

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      translations = JSON.parse(content);
      currentLanguage = lang;
      return true;
    }
  } catch (err) {
    console.error(`Error loading language ${lang}:`, err);
  }

  // Fallback to English if requested language unavailable
  if (lang !== 'en') {
    return loadLanguage('en');
  }

  return false;
}

// =============================================================================
// Translation Functions
// =============================================================================

/**
 * Retrieves a translated string by its key.
 *
 * Supports nested keys using dot notation (e.g., 'menu.personal').
 * If the key is not found, returns the provided fallback or the key itself.
 *
 * @param {string} key - Translation key (supports dot notation for nesting)
 * @param {string} [fallback] - Fallback text if translation not found
 * @returns {string} Translated string, fallback, or key if not found
 *
 * @example
 * // With translation file: { "menu": { "personal": "Personal" } }
 * t('menu.personal') // Returns: "Personal"
 * t('missing.key', 'Default') // Returns: "Default"
 * t('missing.key') // Returns: "missing.key"
 */
function t(key, fallback) {
  const keys = key.split('.');
  let value = translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return fallback || key;
    }
  }

  return typeof value === 'string' ? value : (fallback || key);
}

// =============================================================================
// Language Management
// =============================================================================

/**
 * Returns the currently active language code.
 *
 * @returns {string} Current language code (e.g., 'en', 'es')
 */
function getLanguage() {
  return currentLanguage;
}

/**
 * Changes the active language.
 *
 * Loads the translation file for the new language. If the language
 * file doesn't exist, falls back to English.
 *
 * @param {string} lang - Language code to switch to
 * @returns {boolean} True if language changed successfully
 */
function setLanguage(lang) {
  return loadLanguage(lang);
}

/**
 * Initializes the i18n system with the specified language.
 *
 * Should be called once at application startup, typically with
 * the user's saved language preference from electron-store.
 *
 * @param {string} [savedLanguage='en'] - Initial language code
 * @returns {void}
 *
 * @example
 * const savedLang = store.get('language', 'en');
 * i18n.init(savedLang);
 */
function init(savedLanguage) {
  const lang = savedLanguage || 'en';
  loadLanguage(lang);
}

// =============================================================================
// Module Exports
// =============================================================================

module.exports = {
  t,
  init,
  getLanguage,
  setLanguage,
  loadLanguage
};
