// @vitest-environment happy-dom
/**
 * DOM tests for the lock screen renderer (lock.html + js/lock.js),
 * loaded against the real page markup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function clickDigit(digit) {
  document.querySelector(`.numpad-btn[data-num="${digit}"]`).click();
}

function clickSubmit() {
  document.querySelector('.numpad-btn[data-action="submit"]').click();
}

function pressKey(key) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

const api = {
  security: {
    unlock: vi.fn().mockResolvedValue({ success: true }),
    checkLockout: vi.fn().mockResolvedValue({ locked: false }),
    resetApp: vi.fn().mockResolvedValue(true),
  },
  i18n: {
    getTranslations: vi.fn().mockResolvedValue({ lock: { cancel: 'Cancelar' } }),
  },
};

beforeAll(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/lock.html'), 'utf8');
  document.body.innerHTML = html
    .match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
    .replace(/<script[^>]*><\/script>/g, '');

  globalThis.translate = require_('../src/renderer/js/i18n-helper.js').translate;
  globalThis.electronAPI = api;

  await import('../src/renderer/js/lock.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush();
});

describe('initialization', () => {
  it('loads translations and applies them to data-i18n elements', () => {
    expect(api.i18n.getTranslations).toHaveBeenCalled();
    const cancelEl = document.querySelector('[data-i18n="lock.cancel"]');
    expect(cancelEl.textContent).toBe('Cancelar');
  });

  it('checks the lockout status on startup', () => {
    expect(api.security.checkLockout).toHaveBeenCalled();
  });
});

describe('PIN entry', () => {
  it('fills one dot per digit entered through the numpad', () => {
    clickDigit('1');
    clickDigit('2');
    const filled = document.querySelectorAll('.pin-dot.filled');
    expect(filled).toHaveLength(2);
    pressKey('Escape');
    expect(document.querySelectorAll('.pin-dot.filled')).toHaveLength(0);
  });

  it('removes the last digit with Backspace', () => {
    pressKey('1');
    pressKey('2');
    pressKey('Backspace');
    expect(document.querySelectorAll('.pin-dot.filled')).toHaveLength(1);
    pressKey('Escape');
  });

  it('does not submit PINs shorter than 4 digits', async () => {
    api.security.unlock.mockClear();
    clickDigit('1');
    clickDigit('2');
    clickDigit('3');
    clickSubmit();
    await flush();
    expect(api.security.unlock).not.toHaveBeenCalled();
    pressKey('Escape');
  });
});

describe('unlock flow', () => {
  it('submits the PIN via Enter and shows the success status', async () => {
    api.security.unlock.mockClear().mockResolvedValue({ success: true });
    for (const d of ['1', '2', '3', '4']) pressKey(d);
    pressKey('Enter');
    await flush();
    expect(api.security.unlock).toHaveBeenCalledWith('1234');
    expect(document.getElementById('status-message').textContent).toBe('Unlocked!');
    expect(document.getElementById('status-message').classList.contains('success')).toBe(true);
    pressKey('Escape');
  });

  it('shows the error state and remaining attempts on a wrong PIN', async () => {
    api.security.unlock.mockClear().mockResolvedValue({
      success: false,
      message: 'Incorrect PIN. 3 attempts remaining.',
      remaining: 3,
      delay: 0,
    });
    for (const d of ['9', '9', '9', '9']) pressKey(d);
    pressKey('Enter');
    await flush();
    expect(document.getElementById('status-message').classList.contains('error')).toBe(true);
    expect(document.querySelectorAll('.pin-dot.error').length).toBeGreaterThan(0);
    const attempts = document.getElementById('attempts-info');
    expect(attempts.textContent).toContain('3');
    expect(attempts.classList.contains('danger')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 550)); // error animation clears the PIN
  });
});

describe('reset modal', () => {
  it('opens on "forgot PIN", closes on cancel, and resets on confirm', async () => {
    const modal = document.getElementById('reset-modal');
    document.getElementById('btn-forgot-pin').click();
    expect(modal.classList.contains('hidden')).toBe(false);

    document.getElementById('btn-cancel-reset').click();
    expect(modal.classList.contains('hidden')).toBe(true);

    document.getElementById('btn-forgot-pin').click();
    document.getElementById('btn-confirm-reset').click();
    await flush();
    expect(api.security.resetApp).toHaveBeenCalled();
  });
});

describe('lockout', () => {
  it('shows the countdown and disables the numpad when locked out', async () => {
    api.security.unlock.mockClear().mockResolvedValue({
      success: false,
      locked: true,
      remainingTime: 90000,
    });
    for (const d of ['1', '1', '1', '1']) pressKey(d);
    pressKey('Enter');
    await flush();

    expect(document.getElementById('lockout-timer').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('lockout-countdown').textContent).toMatch(/^1:(30|29|28)$/);
    const buttons = [...document.querySelectorAll('.numpad-btn')];
    expect(buttons.every((btn) => btn.disabled)).toBe(true);

    // While locked, keyboard input is ignored (dot count stays unchanged)
    const filledBefore = document.querySelectorAll('.pin-dot.filled').length;
    pressKey('5');
    expect(document.querySelectorAll('.pin-dot.filled')).toHaveLength(filledBefore);
  });
});
