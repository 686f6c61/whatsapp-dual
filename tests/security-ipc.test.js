/**
 * Tests for the security facade IPC layer: sender validation and
 * handler registration (security.js registerIPCHandlers/validateSender).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);

const handlers = {};
let security;

const authorizedWC = { id: 'lock-wc', isDestroyed: () => false };
const destroyedWC = { id: 'dead-wc', isDestroyed: () => true };
const strangerWC = { id: 'rogue-wc', isDestroyed: () => false };

const windowsMap = {
  lock: { webContents: authorizedWC },
  settings: null,
  dead: { webContents: destroyedWC },
  extras: [{ webContents: { id: 'extra-wc', isDestroyed: () => false } }],
};

beforeAll(() => {
  const electron = require_('electron');
  electron.ipcMain.handle = (channel, fn) => { handlers[channel] = fn; };
  electron.ipcMain.on = (channel, fn) => { handlers[channel] = fn; };

  security = require_('../src/main/security.js');
});

beforeEach(() => {
  global.__testStoreData = new Map();
  const mockStore = {
    get: (key, def) => (global.__testStoreData.has(key) ? global.__testStoreData.get(key) : def),
    set: (key, val) => global.__testStoreData.set(key, val),
    has: (key) => global.__testStoreData.has(key),
    delete: (key) => global.__testStoreData.delete(key),
  };
  security.initStore(mockStore);
  security.registerIPCHandlers(() => windowsMap);
});

describe('validateSender via mutating security handlers', () => {
  it('rejects senders that are not a known window', () => {
    const event = { sender: strangerWC };
    expect(handlers['security:setPIN'](event, '1234')).toEqual({ success: false, message: 'Unauthorized' });
    expect(handlers['security:verifyPIN'](event, '1234')).toEqual({ success: false, message: 'Unauthorized' });
    expect(handlers['security:updateSettings'](event, { autoLockTimeout: 10 })).toBe(false);
    expect(handlers['security:saveSettings'](event, {})).toBe(false);
    expect(handlers['security:lock'](event)).toBe(false);
  });

  it('rejects senders whose window webContents is destroyed', () => {
    const event = { sender: destroyedWC };
    expect(handlers['security:setPIN'](event, '1234')).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('accepts an authorized window sender', () => {
    const event = { sender: authorizedWC };
    expect(handlers['security:setPIN'](event, '1234')).toEqual({ success: true });
    expect(security.isPINSet()).toBe(true);
  });

  it('accepts senders declared inside array entries of the windows map', () => {
    const event = { sender: windowsMap.extras[0].webContents };
    expect(handlers['security:setPIN'](event, '1234')).toEqual({ success: true });
  });

  it('validates input types even for authorized senders', () => {
    const event = { sender: authorizedWC };
    expect(handlers['security:setPIN'](event, 1234)).toEqual({ success: false, message: 'Invalid input' });
    expect(handlers['security:verifyPIN'](event, null)).toEqual({ success: false, message: 'Invalid input' });
    expect(handlers['security:updateSettings'](event, 'nope')).toBe(false);
    expect(handlers['security:removePIN'](event, '')).toEqual({ success: false, message: 'PIN is required' });
  });

  it('updates settings through the store when the sender is authorized', () => {
    const event = { sender: authorizedWC };
    expect(handlers['security:updateSettings'](event, { autoLockTimeout: 10 })).toBe(true);
    expect(global.__testStoreData.get('security.autoLockTimeout')).toBe(10);
  });
});

describe('security:saveSettings pinEnabled contract', () => {
  const event = { sender: authorizedWC };

  it('returns false when asked to enable PIN while no PIN is set', () => {
    expect(security.isPINSet()).toBe(false);
    const result = handlers['security:saveSettings'](event, { pinEnabled: true });
    expect(result).toBe(false);
    expect(global.__testStoreData.get('security.pinEnabled')).not.toBe(true);
  });

  it('still applies the other settings of the same payload before reporting the failure', () => {
    const result = handlers['security:saveSettings'](event, { pinEnabled: true, autoLockTimeout: 15 });
    expect(result).toBe(false);
    expect(global.__testStoreData.get('security.autoLockTimeout')).toBe(15);
  });

  it('enables PIN when a PIN is already set', () => {
    handlers['security:setPIN'](event, '1234');
    global.__testStoreData.set('security.pinEnabled', false);
    const result = handlers['security:saveSettings'](event, { pinEnabled: true });
    expect(result).toBe(true);
    expect(global.__testStoreData.get('security.pinEnabled')).toBe(true);
  });

  it('always allows disabling PIN', () => {
    handlers['security:setPIN'](event, '1234');
    const result = handlers['security:saveSettings'](event, { pinEnabled: false });
    expect(result).toBe(true);
    expect(global.__testStoreData.get('security.pinEnabled')).toBe(false);
  });
});
