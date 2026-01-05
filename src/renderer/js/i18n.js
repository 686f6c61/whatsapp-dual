/**
 * WhatsApp Dual - Renderer Internationalization (i18n) Module
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This module provides internationalization support for the renderer process.
 * Unlike the main process i18n module, this one runs in the browser context
 * and can detect the system language from navigator.language.
 *
 * Features:
 * - Automatic system language detection
 * - Fallback to English when translation missing
 * - DOM updating via data-i18n attributes
 * - Support for placeholders and titles (tooltips)
 * - Persistent language preference via electron-store
 *
 * Usage:
 * const { i18n } = require('./i18n');
 * i18n.updateDOM(); // Translates all data-i18n elements
 * const text = i18n.t('menu.settings'); // Get single translation
 */

const Store = require('electron-store');
const path = require('path');
const fs = require('fs');

// =============================================================================
// Constants
// =============================================================================

/** @type {Store} Persistent storage for user preferences */
const store = new Store();

/** @type {string} Storage key for language preference */
const LANGUAGE_KEY = 'language';

// =============================================================================
// I18nManager Class
// =============================================================================

/**
 * Internationalization manager for the renderer process.
 *
 * Handles loading translations, language switching, and DOM updates.
 * Implements a fallback system to English when translations are missing.
 *
 * @class
 */
class I18nManager {
  /**
   * Creates a new I18nManager instance.
   *
   * Initializes language from storage or system default,
   * loads available languages, and loads translations.
   */
  constructor() {
    /** @type {Object} Loaded translations keyed by language code */
    this.translations = {};

    /** @type {string} Currently active language code */
    this.currentLanguage = store.get(LANGUAGE_KEY, this.detectSystemLanguage());

    /** @type {string} Fallback language when translation missing */
    this.fallbackLanguage = 'en';

    /** @type {string[]} List of available language codes */
    this.availableLanguages = [];

    this.loadAvailableLanguages();
    this.loadTranslations();
  }

  /**
   * Detects the system's preferred language.
   *
   * Uses navigator.language to get the browser/system language,
   * extracts the language code (e.g., 'en-US' -> 'en').
   *
   * @returns {string} Two-letter language code
   */
  detectSystemLanguage() {
    const systemLang = navigator.language || navigator.userLanguage || 'en';
    return systemLang.split('-')[0];
  }

  /**
   * Resolves the path to the locales directory.
   *
   * Handles both development and production environments.
   *
   * @returns {string} Absolute path to locales directory
   */
  getLocalesPath() {
    // Works both in development and production
    const basePath = process.env.NODE_ENV === 'development'
      ? path.join(__dirname, '../../../locales')
      : path.join(process.resourcesPath, 'locales');

    // Fallback for development without NODE_ENV
    if (!fs.existsSync(basePath)) {
      return path.join(__dirname, '../../../locales');
    }
    return basePath;
  }

  /**
   * Scans the locales directory for available language files.
   *
   * Populates the availableLanguages array with language codes
   * found in the locales directory. Falls back to ['en', 'es']
   * if directory cannot be read.
   *
   * @returns {void}
   */
  loadAvailableLanguages() {
    try {
      const localesPath = this.getLocalesPath();
      const files = fs.readdirSync(localesPath);

      this.availableLanguages = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      console.error('Error loading available languages:', error);
      this.availableLanguages = ['en', 'es'];
    }
  }

  /**
   * Loads translation files for current and fallback languages.
   *
   * Reads and parses JSON translation files from the locales directory.
   * Always loads fallback language to ensure translations are available.
   *
   * @returns {void}
   */
  loadTranslations() {
    try {
      const localesPath = this.getLocalesPath();

      // Load current language
      const currentLangPath = path.join(localesPath, `${this.currentLanguage}.json`);
      if (fs.existsSync(currentLangPath)) {
        this.translations[this.currentLanguage] = JSON.parse(
          fs.readFileSync(currentLangPath, 'utf8')
        );
      }

      // Load fallback language
      if (this.currentLanguage !== this.fallbackLanguage) {
        const fallbackPath = path.join(localesPath, `${this.fallbackLanguage}.json`);
        if (fs.existsSync(fallbackPath)) {
          this.translations[this.fallbackLanguage] = JSON.parse(
            fs.readFileSync(fallbackPath, 'utf8')
          );
        }
      }
    } catch (error) {
      console.error('Error loading translations:', error);
    }
  }

  /**
   * Retrieves a translated string by its key.
   *
   * Supports nested keys using dot notation (e.g., 'menu.settings').
   * Falls back to English if translation not found, then to the key itself.
   *
   * @param {string} key - Translation key (supports dot notation)
   * @returns {string} Translated string or key if not found
   *
   * @example
   * i18n.t('menu.settings') // Returns: "Settings"
   * i18n.t('missing.key') // Returns: "missing.key"
   */
  t(key) {
    const keys = key.split('.');
    let translation = this.translations[this.currentLanguage];

    // Try current language
    for (const k of keys) {
      if (translation && translation[k] !== undefined) {
        translation = translation[k];
      } else {
        translation = null;
        break;
      }
    }

    // If not found, try fallback language
    if (translation === null && this.currentLanguage !== this.fallbackLanguage) {
      translation = this.translations[this.fallbackLanguage];
      for (const k of keys) {
        if (translation && translation[k] !== undefined) {
          translation = translation[k];
        } else {
          translation = null;
          break;
        }
      }
    }

    // Return key if translation not found
    return translation !== null ? translation : key;
  }

  /**
   * Changes the active language.
   *
   * Validates the language is available, updates storage,
   * and reloads translations.
   *
   * @param {string} lang - Language code to switch to
   * @returns {boolean} True if language was changed successfully
   */
  setLanguage(lang) {
    if (!this.availableLanguages.includes(lang)) {
      console.error(`Language '${lang}' is not available`);
      return false;
    }

    this.currentLanguage = lang;
    store.set(LANGUAGE_KEY, lang);
    this.loadTranslations();

    return true;
  }

  /**
   * Returns the currently active language code.
   *
   * @returns {string} Current language code (e.g., 'en', 'es')
   */
  getLanguage() {
    return this.currentLanguage;
  }

  /**
   * Returns the list of available language codes.
   *
   * @returns {string[]} Array of available language codes
   */
  getAvailableLanguages() {
    return this.availableLanguages;
  }

  /**
   * Returns available languages with human-readable names.
   *
   * Useful for populating language selector dropdowns.
   *
   * @returns {Array<{code: string, name: string}>} Languages with codes and names
   */
  getLanguageNames() {
    // Human-readable language names
    const names = {
      en: 'English',
      es: 'Espanol',
      pt: 'Portugues',
      fr: 'Francais',
      de: 'Deutsch',
      it: 'Italiano',
      ru: 'Russkiy',
      zh: 'Zhongwen',
      ja: 'Nihongo',
      ko: 'Hangugeo',
      ar: 'Al-Arabiyya'
    };

    return this.availableLanguages.map(code => ({
      code,
      name: names[code] || code
    }));
  }

  /**
   * Updates all DOM elements with translation attributes.
   *
   * Scans the document for elements with these attributes:
   * - data-i18n: Updates textContent
   * - data-i18n-placeholder: Updates placeholder attribute
   * - data-i18n-title: Updates title attribute (tooltips)
   *
   * @returns {void}
   */
  updateDOM() {
    // Update text content
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });

    // Update placeholders
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });

    // Update titles (tooltips)
    const titles = document.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.t(key);
    });
  }
}

// =============================================================================
// Module Exports
// =============================================================================

/** @type {I18nManager} Singleton instance */
const i18n = new I18nManager();

module.exports = { i18n };
