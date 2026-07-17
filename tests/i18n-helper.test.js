/**
 * Tests for the shared renderer translation helper (js/i18n-helper.js),
 * which replaces the three duplicated t() implementations.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { translate } = require_('../src/renderer/js/i18n-helper.js');

const translations = {
  menu: { personal: 'Personal', nested: { deep: 'Deep value' } },
  plain: 'Plain value',
  notAString: { child: 'x' },
};

describe('translate', () => {
  it('resolves dot-notation keys', () => {
    expect(translate(translations, 'menu.personal')).toBe('Personal');
    expect(translate(translations, 'menu.nested.deep')).toBe('Deep value');
    expect(translate(translations, 'plain')).toBe('Plain value');
  });

  it('returns the fallback when the key is missing', () => {
    expect(translate(translations, 'missing.key', 'Fallback')).toBe('Fallback');
  });

  it('returns the key itself when missing and no fallback is given', () => {
    expect(translate(translations, 'missing.key')).toBe('missing.key');
  });

  it('does not return non-string nodes', () => {
    expect(translate(translations, 'notAString', 'Fallback')).toBe('Fallback');
    expect(translate(translations, 'notAString')).toBe('notAString');
  });

  it('tolerates empty or null translation objects', () => {
    expect(translate(null, 'menu.personal', 'Fallback')).toBe('Fallback');
    expect(translate({}, 'menu.personal')).toBe('menu.personal');
  });
});
