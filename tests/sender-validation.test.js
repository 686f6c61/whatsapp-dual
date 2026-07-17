/**
 * Tests for the shared IPC sender validation helper, which unifies the
 * previously duplicated logic in ipc-handlers.js and security.js.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { collectAuthorizedWebContents, isAuthorizedSender } = require_('../src/main/sender-validation.js');

const liveWC = { id: 'wc-1', isDestroyed: () => false };
const deadWC = { id: 'wc-2', isDestroyed: () => true };
const arrayWC = { id: 'wc-3', isDestroyed: () => false };

const windowsMap = {
  main: { isDestroyed: () => false, webContents: liveWC },
  dead: { isDestroyed: () => false, webContents: deadWC },
  closedWindow: { isDestroyed: () => true, webContents: { id: 'wc-4', isDestroyed: () => false } },
  missing: null,
  views: [{ webContents: arrayWC }, null],
};

describe('collectAuthorizedWebContents', () => {
  it('collects live webContents from single entries and arrays', () => {
    const contents = collectAuthorizedWebContents(windowsMap);
    expect(contents).toContain(liveWC);
    expect(contents).toContain(arrayWC);
  });

  it('excludes destroyed webContents, destroyed windows and null entries', () => {
    const contents = collectAuthorizedWebContents(windowsMap);
    expect(contents).not.toContain(deadWC);
    expect(contents.map(c => c.id)).not.toContain('wc-4');
    expect(contents).toHaveLength(2);
  });
});

describe('isAuthorizedSender', () => {
  it('accepts events whose sender is an authorized webContents', () => {
    expect(isAuthorizedSender({ sender: liveWC }, windowsMap)).toBe(true);
    expect(isAuthorizedSender({ sender: arrayWC }, windowsMap)).toBe(true);
  });

  it('rejects unknown or destroyed senders', () => {
    expect(isAuthorizedSender({ sender: deadWC }, windowsMap)).toBe(false);
    expect(isAuthorizedSender({ sender: { id: 'rogue' } }, windowsMap)).toBe(false);
  });
});
