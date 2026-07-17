import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

let tempDir = null;

afterEach(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
  vi.restoreAllMocks();
});

describe('session-protection', () => {
  it('skips symbolic links when collecting files recursively', async () => {
    const sessionProtection = await import('../src/main/security/session-protection.js');

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-dual-session-'));
    const nestedDir = path.join(tempDir, 'nested');
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-dual-outside-'));
    const realFile = path.join(nestedDir, 'session.txt');
    const outsideFile = path.join(outsideDir, 'outside.txt');
    const symlinkPath = path.join(tempDir, 'outside-link');

    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(realFile, 'session');
    fs.writeFileSync(outsideFile, 'outside');
    fs.symlinkSync(outsideFile, symlinkPath);

    const files = sessionProtection.getFilesRecursive(tempDir);

    expect(files).toContain(realFile);
    expect(files).not.toContain(symlinkPath);

    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});

// Partitions live under the mocked userData path (see tests/setup.js)
const USER_DATA = '/tmp/whatsapp-dual-test';
const PARTITIONS = path.join(USER_DATA, 'Partitions');

function makeInjectedStore() {
  const data = new Map();
  return {
    data,
    get: (key, def) => (data.has(key) ? data.get(key) : def),
    set: (key, val) => data.set(key, val),
    has: (key) => data.has(key),
    delete: (key) => data.delete(key),
  };
}

describe('secureDeleteFile', () => {
  afterEach(() => {
    fs.rmSync(PARTITIONS, { recursive: true, force: true });
  });

  it('overwrites the full file 3 times before unlinking it', async () => {
    const sessionProtection = await import('../src/main/security/session-protection.js');

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-dual-del-'));
    const target = path.join(tempDir, 'session.bin');
    const content = 'super-secret-session';
    fs.writeFileSync(target, content);

    const writeSpy = vi.spyOn(fs, 'writeSync');
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

    sessionProtection.secureDeleteFile(target);

    expect(writeSpy).toHaveBeenCalledTimes(3);
    for (const call of writeSpy.mock.calls) {
      const [, buffer, offset, length, position] = call;
      expect(buffer.length).toBe(content.length);
      expect(offset).toBe(0);
      expect(length).toBe(content.length);
      expect(position).toBe(0);
    }
    // Every overwrite pass must happen before the unlink
    const lastWriteOrder = Math.max(...writeSpy.mock.invocationCallOrder);
    expect(lastWriteOrder).toBeLessThan(unlinkSpy.mock.invocationCallOrder[0]);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('is a silent no-op for files that do not exist (ENOENT)', async () => {
    const sessionProtection = await import('../src/main/security/session-protection.js');
    const errorSpy = vi.spyOn(console, 'error');

    expect(() =>
      sessionProtection.secureDeleteFile('/tmp/whatsapp-dual-test/no-such-file.bin')
    ).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still unlinks the file when the overwrite fails', async () => {
    const sessionProtection = await import('../src/main/security/session-protection.js');

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-dual-del-'));
    const target = path.join(tempDir, 'session.bin');
    fs.writeFileSync(target, 'data');

    vi.spyOn(fs, 'writeSync').mockImplementation(() => {
      const err = new Error('EIO: i/o error');
      err.code = 'EIO';
      throw err;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    sessionProtection.secureDeleteFile(target);

    expect(fs.existsSync(target)).toBe(false);
  });
});

describe('session integrity', () => {
  const personalDir = path.join(PARTITIONS, 'persist:whatsapp-personal');
  const businessDir = path.join(PARTITIONS, 'persist:whatsapp-business');

  afterEach(() => {
    fs.rmSync(PARTITIONS, { recursive: true, force: true });
  });

  it('calculateSessionHash is stable for identical content and changes on tampering', async () => {
    const sessionProtection = await import('../src/main/security/session-protection.js');

    fs.mkdirSync(personalDir, { recursive: true });
    fs.writeFileSync(path.join(personalDir, 'Cookies'), 'cookie-data');

    const hash1 = sessionProtection.calculateSessionHash('persist:whatsapp-personal');
    const hash2 = sessionProtection.calculateSessionHash('persist:whatsapp-personal');
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash2).toBe(hash1);

    fs.writeFileSync(path.join(personalDir, 'Cookies'), 'tampered-data');
    expect(sessionProtection.calculateSessionHash('persist:whatsapp-personal')).not.toBe(hash1);

    expect(sessionProtection.calculateSessionHash('persist:missing')).toBeNull();
  });

  it('verifySessionIntegrity reports firstRun, then verified, then detects tampering', async () => {
    const sessionProtection = await import('../src/main/security/session-protection.js');
    const store = makeInjectedStore();
    sessionProtection.inject({ store, resetFailedAttempts: () => {} });

    fs.mkdirSync(personalDir, { recursive: true });
    fs.mkdirSync(businessDir, { recursive: true });
    fs.writeFileSync(path.join(personalDir, 'Cookies'), 'personal-session');
    fs.writeFileSync(path.join(businessDir, 'Cookies'), 'business-session');

    expect(sessionProtection.verifySessionIntegrity()).toEqual({ verified: true, firstRun: true });

    sessionProtection.saveSessionHashes();
    expect(sessionProtection.verifySessionIntegrity()).toMatchObject({
      verified: true,
      personal: true,
      business: true,
    });

    fs.writeFileSync(path.join(personalDir, 'Cookies'), 'tampered');
    expect(sessionProtection.verifySessionIntegrity()).toMatchObject({
      verified: false,
      personal: false,
      business: true,
    });
  });

  it('secureDeleteAllSessions removes both partitions and the stored hashes', async () => {
    const sessionProtection = await import('../src/main/security/session-protection.js');
    const store = makeInjectedStore();
    sessionProtection.inject({ store, resetFailedAttempts: () => {} });

    fs.mkdirSync(personalDir, { recursive: true });
    fs.mkdirSync(businessDir, { recursive: true });
    fs.writeFileSync(path.join(personalDir, 'Cookies'), 'personal-session');
    fs.writeFileSync(path.join(businessDir, 'Cookies'), 'business-session');
    sessionProtection.saveSessionHashes();
    expect(store.has('security.sessionHashes')).toBe(true);

    sessionProtection.secureDeleteAllSessions();

    expect(fs.existsSync(personalDir)).toBe(false);
    expect(fs.existsSync(businessDir)).toBe(false);
    expect(store.has('security.sessionHashes')).toBe(false);
  });
});
