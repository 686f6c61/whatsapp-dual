/**
 * Tests for the .deb update logic (deb-updater.js): manifest parsing,
 * version comparison, asset selection, checksum, download URL, and the
 * install invocation builder. Pure logic and injected-dependency flows.
 */
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const debUpdater = require_('../src/main/deb-updater.js');

const SAMPLE_YML = `version: 1.6.0
files:
  - url: WhatsAppDual-1.6.0-x86_64.AppImage
    sha512: AAAAsha512forappimage==
    size: 119875614
    blockMapSize: 124978
  - url: whatsapp-dual_1.6.0_amd64.deb
    sha512: BBBBsha512forthedeb==
    size: 93509704
path: WhatsAppDual-1.6.0-x86_64.AppImage
sha512: AAAAsha512forappimage==
releaseDate: '2026-07-17T18:12:52.515Z'
`;

describe('parseLatestManifest', () => {
  it('extracts the version and every file entry', () => {
    const m = debUpdater.parseLatestManifest(SAMPLE_YML);
    expect(m.version).toBe('1.6.0');
    expect(m.files).toHaveLength(2);
    expect(m.files[1]).toEqual({
      url: 'whatsapp-dual_1.6.0_amd64.deb',
      sha512: 'BBBBsha512forthedeb==',
      size: 93509704,
    });
  });
});

describe('pickDebAsset', () => {
  it('returns the .deb file entry', () => {
    const m = debUpdater.parseLatestManifest(SAMPLE_YML);
    const deb = debUpdater.pickDebAsset(m.files);
    expect(deb.url).toBe('whatsapp-dual_1.6.0_amd64.deb');
    expect(deb.sha512).toBe('BBBBsha512forthedeb==');
  });

  it('returns null when there is no .deb file', () => {
    expect(debUpdater.pickDebAsset([{ url: 'x.AppImage', sha512: 'z', size: 1 }])).toBeNull();
  });
});

describe('isNewerVersion', () => {
  it('detects newer versions across all segments', () => {
    expect(debUpdater.isNewerVersion('1.6.0', '1.5.3')).toBe(true);
    expect(debUpdater.isNewerVersion('1.5.4', '1.5.3')).toBe(true);
    expect(debUpdater.isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    expect(debUpdater.isNewerVersion('1.10.0', '1.9.9')).toBe(true);
  });

  it('returns false for equal or older versions', () => {
    expect(debUpdater.isNewerVersion('1.5.3', '1.5.3')).toBe(false);
    expect(debUpdater.isNewerVersion('1.5.2', '1.5.3')).toBe(false);
    expect(debUpdater.isNewerVersion('1.4.9', '1.5.0')).toBe(false);
  });

  it('tolerates a leading v on either side', () => {
    expect(debUpdater.isNewerVersion('v1.6.0', '1.5.3')).toBe(true);
    expect(debUpdater.isNewerVersion('1.6.0', 'v1.6.0')).toBe(false);
  });
});

describe('buildDebDownloadUrl', () => {
  it('points at the latest release download for the given filename', () => {
    expect(debUpdater.buildDebDownloadUrl('686f6c61/whatsapp-dual', 'whatsapp-dual_1.6.0_amd64.deb'))
      .toBe('https://github.com/686f6c61/whatsapp-dual/releases/latest/download/whatsapp-dual_1.6.0_amd64.deb');
  });
});

describe('sha512Base64 / verifyChecksum', () => {
  it('computes the base64 sha512 of a buffer', () => {
    const buf = Buffer.from('hello whatsapp dual');
    const expected = crypto.createHash('sha512').update(buf).digest('base64');
    expect(debUpdater.sha512Base64(buf)).toBe(expected);
  });

  it('verifyChecksum accepts a matching digest and rejects a mismatch', () => {
    const buf = Buffer.from('payload');
    const good = crypto.createHash('sha512').update(buf).digest('base64');
    expect(debUpdater.verifyChecksum(buf, good)).toBe(true);
    expect(debUpdater.verifyChecksum(buf, 'not-the-hash==')).toBe(false);
  });
});

describe('checkForNewerDeb', () => {
  it('reports an available update when the manifest is newer', async () => {
    const result = await debUpdater.checkForNewerDeb({
      currentVersion: '1.5.3',
      fetchManifest: async () => SAMPLE_YML,
    });
    expect(result.available).toBe(true);
    expect(result.version).toBe('1.6.0');
    expect(result.deb.url).toBe('whatsapp-dual_1.6.0_amd64.deb');
  });

  it('reports no update when already on the manifest version', async () => {
    const result = await debUpdater.checkForNewerDeb({
      currentVersion: '1.6.0',
      fetchManifest: async () => SAMPLE_YML,
    });
    expect(result.available).toBe(false);
    expect(result.version).toBe('1.6.0');
  });
});

describe('buildInstallInvocation', () => {
  it('uses pkexec + apt-get when pkexec is available', () => {
    const inv = debUpdater.buildInstallInvocation('/tmp/app_1.6.0_amd64.deb', { pkexecPath: '/usr/bin/pkexec' });
    expect(inv).toEqual({
      mode: 'pkexec',
      command: '/usr/bin/pkexec',
      args: ['apt-get', 'install', '-y', '/tmp/app_1.6.0_amd64.deb'],
    });
  });

  it('falls back to opening the package when pkexec is missing', () => {
    const inv = debUpdater.buildInstallInvocation('/tmp/app.deb', { pkexecPath: null });
    expect(inv).toEqual({ mode: 'open', target: '/tmp/app.deb' });
  });
});

describe('installDeb', () => {
  it('relaunches after a successful pkexec install', async () => {
    const events = {};
    const child = { on: (ev, cb) => { events[ev] = cb; } };
    const spawn = vi.fn(() => child);
    const onDone = vi.fn();

    debUpdater.installDeb('/tmp/app.deb', { pkexecPath: '/usr/bin/pkexec', spawn, onDone });
    expect(spawn).toHaveBeenCalledWith('/usr/bin/pkexec', ['apt-get', 'install', '-y', '/tmp/app.deb'], expect.any(Object));

    events.exit(0);
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('reports failure on a non-zero exit code', () => {
    const events = {};
    const child = { on: (ev, cb) => { events[ev] = cb; } };
    const onDone = vi.fn();
    debUpdater.installDeb('/tmp/app.deb', { pkexecPath: '/usr/bin/pkexec', spawn: () => child, onDone });
    events.exit(1);
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it('opens the package with the graphical installer when pkexec is missing', () => {
    const openPath = vi.fn();
    const onDone = vi.fn();
    debUpdater.installDeb('/tmp/app.deb', { pkexecPath: null, openPath, onDone });
    expect(openPath).toHaveBeenCalledWith('/tmp/app.deb');
  });
});

describe('debTempPath sanitization', () => {
  it('accepts plain asset filenames', () => {
    expect(debUpdater.debTempPath('/tmp', 'whatsapp-dual_1.6.0_amd64.deb'))
      .toBe('/tmp/whatsapp-dual_1.6.0_amd64.deb');
  });

  it('rejects path traversal and odd names from a tampered manifest', () => {
    expect(() => debUpdater.debTempPath('/tmp', '../../home/r/evil.deb')).toThrow();
    expect(() => debUpdater.debTempPath('/tmp', '/etc/evil.deb')).toThrow();
    expect(() => debUpdater.debTempPath('/tmp', 'evil.deb.exe')).toThrow();
    expect(() => debUpdater.debTempPath('/tmp', 'a b.deb')).toThrow();
  });
});
