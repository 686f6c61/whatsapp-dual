/**
 * Unit tests for the security module.
 *
 * Mocks are set up in tests/setup.js which patches Node's require
 * to intercept 'electron' and 'electron-store'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let security;

beforeEach(async () => {
  global.__testStoreData = new Map();
  vi.resetModules();
  security = await import('../src/main/security.js');
  // Inject the mock store (singleton pattern)
  const mockStore = {
    get: (key, def) => global.__testStoreData.has(key) ? global.__testStoreData.get(key) : def,
    set: (key, val) => global.__testStoreData.set(key, val),
    has: (key) => global.__testStoreData.has(key),
    delete: (key) => global.__testStoreData.delete(key),
  };
  security.initStore(mockStore);
});

describe('PIN management', () => {
  it('rejects PINs shorter than 4 digits', () => {
    expect(security.setPIN('123')).toBe(false);
  });

  it('rejects PINs longer than 8 digits', () => {
    expect(security.setPIN('123456789')).toBe(false);
  });

  it('accepts a valid 4-digit PIN', () => {
    expect(security.setPIN('1234')).toBe(true);
    expect(global.__testStoreData.get('security.pinEnabled')).toBe(true);
  });

  it('accepts a valid 8-digit PIN', () => {
    expect(security.setPIN('12345678')).toBe(true);
  });

  it('isPINSet returns true after setting a PIN', () => {
    security.setPIN('5555');
    expect(security.isPINSet()).toBe(true);
  });

  it('isPINEnabled requires both flag and data', () => {
    expect(security.isPINEnabled()).toBe(false);
    security.setPIN('5555');
    expect(security.isPINEnabled()).toBe(true);
  });
});

describe('PIN verification', () => {
  beforeEach(() => {
    security.setPIN('4321');
  });

  it('succeeds with correct PIN', () => {
    expect(security.verifyPIN('4321').success).toBe(true);
  });

  it('fails with wrong PIN', () => {
    expect(security.verifyPIN('0000').success).toBe(false);
  });

  it('resets failed attempts on success', () => {
    security.verifyPIN('0000');
    security.verifyPIN('0000');
    expect(security.verifyPIN('4321').success).toBe(true);
    expect(global.__testStoreData.get('security.failedAttempts')).toBe(0);
  });
});

describe('Failed attempts and lockout', () => {
  beforeEach(() => {
    security.setPIN('9999');
  });

  it('increments failed attempts counter', () => {
    const r1 = security.verifyPIN('0000');
    expect(r1.success).toBe(false);
    expect(r1.attempts).toBe(1);
    expect(security.verifyPIN('0000').attempts).toBe(2);
  });

  it('reports remaining attempts', () => {
    expect(security.verifyPIN('0000').remaining).toBe(9);
  });

  it('applies delay after 3 failed attempts', () => {
    for (let i = 0; i < 3; i++) security.verifyPIN('0000');
    expect(security.verifyPIN('0000').delay).toBe(5000);
  });

  it('increases delay at higher attempt counts', () => {
    for (let i = 0; i < 5; i++) security.verifyPIN('0000');
    expect(security.verifyPIN('0000').delay).toBe(30000);
  });
});

describe('changePIN', () => {
  beforeEach(() => {
    security.setPIN('1111');
  });

  it('changes PIN with correct current PIN', () => {
    expect(security.changePIN('1111', '2222').success).toBe(true);
    expect(security.verifyPIN('2222').success).toBe(true);
  });

  it('rejects change with wrong current PIN', () => {
    expect(security.changePIN('0000', '2222').success).toBe(false);
  });
});

describe('removePIN', () => {
  beforeEach(() => {
    security.setPIN('3333');
  });

  it('removes PIN with correct current PIN', () => {
    expect(security.removePIN('3333').success).toBe(true);
    expect(security.isPINSet()).toBe(false);
  });

  it('rejects removal with wrong PIN', () => {
    expect(security.removePIN('0000').success).toBe(false);
    expect(security.isPINSet()).toBe(true);
  });
});

describe('getSecuritySettings', () => {
  it('returns defaults when nothing is configured', () => {
    const s = security.getSecuritySettings();
    expect(s.pinEnabled).toBe(false);
    expect(s.autoLockEnabled).toBe(true);
    expect(s.autoLockTimeout).toBe(5);
    expect(s.maxAttempts).toBe(10);
    expect(s.deleteOnMaxAttempts).toBe(false);
  });
});

describe('updateSecuritySettings', () => {
  it('persists allowed keys', () => {
    security.updateSecuritySettings({ autoLockTimeout: 10, maxAttempts: 5 });
    expect(global.__testStoreData.get('security.autoLockTimeout')).toBe(10);
    expect(global.__testStoreData.get('security.maxAttempts')).toBe(5);
  });

  it('ignores keys not in allowedKeys', () => {
    security.updateSecuritySettings({ pinData: 'hacked', evil: true });
    expect(global.__testStoreData.has('security.pinData')).toBe(false);
    expect(global.__testStoreData.has('security.evil')).toBe(false);
  });

  it('rejects invalid types', () => {
    security.updateSecuritySettings({ autoLockEnabled: 'yes', maxAttempts: 'ten' });
    expect(global.__testStoreData.has('security.autoLockEnabled')).toBe(false);
    expect(global.__testStoreData.has('security.maxAttempts')).toBe(false);
  });

  it('rejects out-of-range values', () => {
    security.updateSecuritySettings({ autoLockTimeout: 0, maxAttempts: 100 });
    expect(global.__testStoreData.has('security.autoLockTimeout')).toBe(false);
    expect(global.__testStoreData.has('security.maxAttempts')).toBe(false);
  });
});
