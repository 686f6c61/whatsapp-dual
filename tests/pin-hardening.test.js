/**
 * PIN hardening tests: PBKDF2 iteration count (OWASP baseline),
 * transparent migration of legacy 100k-iteration records, and
 * constant-time hash comparison.
 */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const pinManager = require_('../src/main/security/pin-manager.js');

const LEGACY_ITERATIONS = 100000;

function readStoredPinData() {
  // safeStorage mock reports encryption unavailable, so records are base64 JSON
  return JSON.parse(Buffer.from(global.__testStoreData.get('security.pinData'), 'base64').toString());
}

function writeLegacyPinRecord(pin) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(pin, salt, LEGACY_ITERATIONS, 64, 'sha512').toString('hex');
  const record = JSON.stringify({ salt, hash }); // legacy: no iterations field
  global.__testStoreData.set('security.pinData', Buffer.from(record).toString('base64'));
  global.__testStoreData.set('security.pinEnabled', true);
  return { salt, hash };
}

beforeEach(() => {
  global.__testStoreData = new Map();
  const mockStore = {
    get: (key, def) => (global.__testStoreData.has(key) ? global.__testStoreData.get(key) : def),
    set: (key, val) => global.__testStoreData.set(key, val),
    has: (key) => global.__testStoreData.has(key),
    delete: (key) => global.__testStoreData.delete(key),
  };
  pinManager.inject({ store: mockStore });
  vi.restoreAllMocks();
});

describe('PBKDF2 work factor', () => {
  it('stores new PINs with at least 210000 iterations (OWASP SHA512 baseline)', () => {
    expect(pinManager.setPIN('1234')).toBe(true);

    const record = readStoredPinData();
    expect(record.iterations).toBeGreaterThanOrEqual(210000);
    const expectedHash = crypto
      .pbkdf2Sync('1234', record.salt, record.iterations, 64, 'sha512')
      .toString('hex');
    expect(record.hash).toBe(expectedHash);
  });

  it('verifies PINs created with the stored iteration count', () => {
    pinManager.setPIN('4321');
    expect(pinManager.verifyPIN('4321')).toEqual({ success: true });
    expect(pinManager.verifyPIN('0000').success).toBe(false);
  });
});

describe('legacy record migration', () => {
  it('still verifies legacy 100k-iteration records without an iterations field', () => {
    writeLegacyPinRecord('5678');
    expect(pinManager.verifyPIN('5678')).toEqual({ success: true });
  });

  it('transparently upgrades a legacy record to the current work factor on successful verify', () => {
    const legacy = writeLegacyPinRecord('5678');

    expect(pinManager.verifyPIN('5678')).toEqual({ success: true });

    const upgraded = readStoredPinData();
    expect(upgraded.iterations).toBeGreaterThanOrEqual(210000);
    expect(upgraded.hash).not.toBe(legacy.hash);
    // And the upgraded record must keep verifying
    expect(pinManager.verifyPIN('5678')).toEqual({ success: true });
    expect(pinManager.verifyPIN('9999').success).toBe(false);
  });

  it('does not upgrade the record on a failed verify', () => {
    const legacy = writeLegacyPinRecord('5678');
    expect(pinManager.verifyPIN('1111').success).toBe(false);
    const stored = readStoredPinData();
    expect(stored.hash).toBe(legacy.hash);
    expect(stored.iterations).toBeUndefined();
  });
});

describe('constant-time comparison', () => {
  it('compares PIN hashes with crypto.timingSafeEqual', () => {
    pinManager.setPIN('1234');
    const spy = vi.spyOn(crypto, 'timingSafeEqual');

    pinManager.verifyPIN('1234');
    expect(spy).toHaveBeenCalled();

    spy.mockClear();
    pinManager.verifyPIN('0000');
    expect(spy).toHaveBeenCalled();
  });
});
