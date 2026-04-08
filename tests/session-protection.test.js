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
