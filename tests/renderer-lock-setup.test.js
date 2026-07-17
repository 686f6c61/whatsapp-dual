// @vitest-environment happy-dom
/**
 * DOM tests for the PIN setup screen renderer (lock-setup.html +
 * js/lock-setup.js) in "setup" mode, against the real page markup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function pressKey(key) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function enterPin(pin) {
  for (const d of pin) pressKey(d);
}

const api = {
  security: {
    setPIN: vi.fn().mockResolvedValue({ success: true }),
    changePIN: vi.fn().mockResolvedValue({ success: true }),
    verifyPIN: vi.fn().mockResolvedValue({ success: true }),
    pinSetupComplete: vi.fn(),
    skipPINSetup: vi.fn(),
  },
  i18n: {
    getTranslations: vi.fn().mockResolvedValue({}),
  },
};

beforeAll(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/lock-setup.html'), 'utf8');
  document.body.innerHTML = html
    .match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
    .replace(/<script[^>]*><\/script>/g, '');

  globalThis.translate = require_('../src/renderer/js/i18n-helper.js').translate;
  globalThis.electronAPI = api;

  await import('../src/renderer/js/lock-setup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush();
});

describe('PIN validation requirements', () => {
  it('disables submit until the PIN is 4-8 digits and marks requirements', () => {
    const submitBtn = document.querySelector('.numpad-submit');
    const reqLength = document.getElementById('req-length');

    enterPin('12');
    expect(submitBtn.disabled).toBe(true);
    expect(reqLength.classList.contains('valid')).toBe(false);

    enterPin('34');
    expect(submitBtn.disabled).toBe(false);
    expect(reqLength.classList.contains('valid')).toBe(true);
    expect(document.getElementById('req-numbers').classList.contains('valid')).toBe(true);

    pressKey('Escape');
    expect(submitBtn.disabled).toBe(true);
  });
});

describe('two-step confirmation', () => {
  it('rejects a mismatched confirmation and returns to step 1', async () => {
    enterPin('1234');
    pressKey('Enter'); // step 1 -> 2
    await flush();
    expect(document.getElementById('setup-subtitle').dataset.i18n).toBe('setup.confirmPin');

    enterPin('9999');
    pressKey('Enter'); // mismatch
    await flush();
    expect(api.security.setPIN).not.toHaveBeenCalled();
    expect(document.getElementById('status-message').classList.contains('error')).toBe(true);
    expect(document.getElementById('setup-subtitle').dataset.i18n).toBe('setup.enterNew');
    await new Promise((resolve) => setTimeout(resolve, 550)); // error animation clears the PIN
  });

  it('reports a failed save and returns to step 1', async () => {
    api.security.setPIN.mockClear().mockResolvedValue({ success: false });
    enterPin('1234');
    pressKey('Enter');
    await flush();
    enterPin('1234');
    pressKey('Enter');
    await flush();
    expect(api.security.setPIN).toHaveBeenCalledWith('1234');
    expect(document.getElementById('status-message').textContent).toContain('Failed to set PIN');
    expect(document.getElementById('setup-subtitle').dataset.i18n).toBe('setup.enterNew');
  });

  it('saves the PIN when both entries match and notifies the main process', async () => {
    api.security.setPIN.mockClear().mockResolvedValue({ success: true });
    enterPin('4321');
    pressKey('Enter');
    await flush();
    enterPin('4321');
    pressKey('Enter');
    await flush();
    expect(api.security.setPIN).toHaveBeenCalledWith('4321');
    expect(document.getElementById('status-message').classList.contains('success')).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(api.security.pinSetupComplete).toHaveBeenCalled();
  });
});

describe('skip', () => {
  it('notifies the main process when setup is skipped', () => {
    document.getElementById('btn-skip').click();
    expect(api.security.skipPINSetup).toHaveBeenCalled();
  });
});
