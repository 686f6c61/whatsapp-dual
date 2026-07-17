/**
 * WhatsApp Dual - Renderer Translation Helper
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * Shared dot-notation translation lookup for the sandboxed renderer pages
 * (settings, lock, lock-setup). Loaded as a classic script before each
 * page script; each page keeps its own `translations` object and wraps
 * this helper in a local `t()` closure.
 */

/**
 * Retrieves a translated string by dot-notation key.
 *
 * @param {object} translations - Translations object to traverse
 * @param {string} key - Dot-notation key, e.g. "settings.title"
 * @param {string} [fallback] - Value returned when the key is not found
 * @returns {string} The translated string, the fallback, or the key itself
 */
function translate(translations, key, fallback) {
  const parts = key.split('.');
  let current = translations;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || !Object.hasOwn(current, part)) {
      return fallback !== undefined ? fallback : key;
    }
    current = current[part];
  }
  if (typeof current === 'string') {
    return current;
  }
  return fallback !== undefined ? fallback : key;
}

// CommonJS export for unit tests; in the renderer this file only defines
// the global `translate` function.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { translate };
}
