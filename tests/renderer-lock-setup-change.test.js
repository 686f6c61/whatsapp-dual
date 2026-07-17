// @vitest-environment happy-dom
/**
 * DOM tests for the PIN setup screen in "change" mode (?mode=change):
 * current-PIN verification gate before the two-step flow.
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
    setPIN: vi.fn(),
    changePIN: vi.fn().mockResolvedValue({ success: true }),
    verifyPIN: vi.fn(),
    pinSetupComplete: vi.fn(),
    skipPINSetup: vi.fn(),
  },
  i18n: {
    getTranslations: vi.fn().mockResolvedValue({}),
  },
};

beforeAll(async () => {
  window.happyDOM.setURL('http://localhost/lock-setup.html?mode=change');

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

describe('change mode', () => {
  it('starts by asking for the current PIN and hides the step indicator', () => {
    expect(document.getElementById('setup-subtitle').dataset.i18n).toBe('setup.enterCurrent');
    expect(document.querySelector('.step-indicator').hidden).toBe(true);
  });

  it('rejects a wrong current PIN and stays on the verification step', async () => {
    api.security.verifyPIN.mockResolvedValue({ success: false, message: 'Incorrect PIN' });
    enterPin('0000');
    pressKey('Enter');
    await flush();
    expect(api.security.verifyPIN).toHaveBeenCalledWith('0000');
    expect(document.getElementById('status-message').classList.contains('error')).toBe(true);
    expect(document.getElementById('setup-subtitle').dataset.i18n).toBe('setup.enterCurrent');
    await new Promise((resolve) => setTimeout(resolve, 550));
  });

  it('after verifying the current PIN, changes it through the two-step flow', async () => {
    api.security.verifyPIN.mockResolvedValue({ success: true });
    enterPin('1111');
    pressKey('Enter'); // verify current
    await flush();
    expect(document.getElementById('setup-subtitle').dataset.i18n).toBe('setup.enterNew');

    enterPin('2222');
    pressKey('Enter'); // new PIN
    await flush();
    enterPin('2222');
    pressKey('Enter'); // confirm
    await flush();

    expect(api.security.changePIN).toHaveBeenCalledWith('1111', '2222');
    expect(api.security.setPIN).not.toHaveBeenCalled();
    expect(document.getElementById('status-message').classList.contains('success')).toBe(true);
  });
});
