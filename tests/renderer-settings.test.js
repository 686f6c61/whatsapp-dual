// @vitest-environment happy-dom
/**
 * DOM tests for the settings window renderer (settings.html +
 * js/settings.js), against the real page markup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const api = {
  settings: {
    getAll: vi.fn().mockResolvedValue({
      language: 'es',
      theme: 'dark',
      startWithSystem: true,
      startMinimized: false,
      minimizeToTray: true,
      defaultAccount: 'business',
    }),
    save: vi.fn().mockResolvedValue(true),
  },
  i18n: {
    getTranslations: vi.fn().mockResolvedValue({ settings: { title: 'Ajustes' } }),
    getLanguage: vi.fn().mockResolvedValue('es'),
    getAvailableLanguages: vi.fn().mockResolvedValue(['en', 'es']),
    getTranslationsForLanguage: vi.fn().mockResolvedValue({ settings: { title: 'Settings EN' } }),
  },
  security: {
    isPINSet: vi.fn().mockResolvedValue(true),
    isPINEnabled: vi.fn().mockResolvedValue(true),
    getSettings: vi.fn().mockResolvedValue({
      pinEnabled: true,
      autoLockEnabled: true,
      autoLockTimeout: 15,
      lockOnSuspend: true,
      lockOnScreenLock: false,
      maxAttempts: 10,
      lockoutDuration: 30,
      deleteOnMaxAttempts: false,
    }),
    saveSettings: vi.fn().mockResolvedValue(true),
    removePIN: vi.fn().mockResolvedValue({ success: true }),
    setupPIN: vi.fn(),
    lockNow: vi.fn(),
    onPINSetupComplete: vi.fn(),
  },
  window: {
    close: vi.fn(),
  },
};

beforeAll(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/settings.html'), 'utf8');
  document.body.innerHTML = html
    .match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
    .replace(/<script[^>]*><\/script>/g, '');

  globalThis.translate = require_('../src/renderer/js/i18n-helper.js').translate;
  globalThis.electronAPI = api;
  globalThis.prompt = vi.fn();
  globalThis.alert = vi.fn();
  globalThis.confirm = vi.fn();

  await import('../src/renderer/js/settings.js'); // runs loadSettings() at import
  await flush();
});

describe('loading', () => {
  it('populates the form from the stored settings', () => {
    expect(document.getElementById('select-language').value).toBe('es');
    expect(document.getElementById('select-theme').value).toBe('dark');
    expect(document.getElementById('check-startup').checked).toBe(true);
    expect(document.getElementById('select-default-account').value).toBe('business');
    expect(document.getElementById('check-pin-enabled').checked).toBe(true);
    expect(document.getElementById('select-autolock-timeout').value).toBe('15');
    expect(document.getElementById('check-lock-screenlock').checked).toBe(false);
  });

  it('applies the saved theme to the document root', () => {
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies translations to data-i18n elements', () => {
    const el = document.querySelector('[data-i18n="settings.title"]');
    expect(el.textContent).toBe('Ajustes');
  });

  it('shows change/remove PIN buttons when a PIN is set', () => {
    expect(document.getElementById('btn-setup-pin').classList.contains('js-hidden')).toBe(true);
    expect(document.getElementById('btn-change-pin').classList.contains('js-hidden')).toBe(false);
    expect(document.getElementById('btn-remove-pin').classList.contains('js-hidden')).toBe(false);
  });
});

describe('interactions', () => {
  it('disables the auto-lock timeout selector when auto-lock is unchecked', () => {
    const checkAutolock = document.getElementById('check-autolock');
    checkAutolock.checked = false;
    checkAutolock.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.getElementById('select-autolock-timeout').disabled).toBe(true);

    checkAutolock.checked = true;
    checkAutolock.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.getElementById('select-autolock-timeout').disabled).toBe(false);
  });

  it('previews another language through getTranslationsForLanguage', async () => {
    const select = document.getElementById('select-language');
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(api.i18n.getTranslationsForLanguage).toHaveBeenCalledWith('en');
    expect(document.querySelector('[data-i18n="settings.title"]').textContent).toBe('Settings EN');
  });

  it('reverts the paranoia checkbox when the warning is not confirmed', () => {
    globalThis.confirm.mockReturnValue(false);
    const check = document.getElementById('check-delete-on-max');
    check.checked = true;
    check.dispatchEvent(new Event('change', { bubbles: true }));
    expect(check.checked).toBe(false);
  });

  it('removes the PIN after prompting and flips the button visibility', async () => {
    globalThis.prompt.mockReturnValue('1234');
    document.getElementById('btn-remove-pin').click();
    await flush();
    expect(api.security.removePIN).toHaveBeenCalledWith('1234');
    expect(document.getElementById('btn-setup-pin').classList.contains('js-hidden')).toBe(false);
    expect(document.getElementById('check-pin-enabled').checked).toBe(false);
  });
});

describe('saving', () => {
  it('saves general and security settings and closes the window', async () => {
    api.window.close.mockClear();
    document.getElementById('btn-save').click();
    await flush();

    expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({
      language: 'en',
      theme: 'dark',
      defaultAccount: 'business',
    }));
    expect(api.security.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      autoLockTimeout: 15,
      lockoutDuration: 30,
    }));
    expect(api.window.close).toHaveBeenCalled();
  });

  it('keeps the window open when the main process rejects the security settings', async () => {
    api.window.close.mockClear();
    api.security.saveSettings.mockResolvedValueOnce(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    document.getElementById('btn-save').click();
    await flush();

    expect(api.window.close).not.toHaveBeenCalled();
  });
});
