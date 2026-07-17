/**
 * Tests for the update strategy routing in updater.js: which update
 * mechanism applies to the current build (source / AppImage / .deb).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const electron = require_('electron');

let updater;
const originalPlatform = process.platform;

function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

beforeAll(() => {
  updater = require_('../src/main/updater.js');
});

afterEach(() => {
  setPlatform(originalPlatform);
  delete electron.app.isPackaged;
  delete process.env.APPIMAGE;
});

describe('getUpdateStrategy', () => {
  it('returns "none" for an unpackaged (source) build', () => {
    electron.app.isPackaged = false;
    setPlatform('linux');
    expect(updater.getUpdateStrategy()).toBe('none');
  });

  it('returns "deb" for a packaged Linux build that is not an AppImage', () => {
    electron.app.isPackaged = true;
    setPlatform('linux');
    delete process.env.APPIMAGE;
    expect(updater.getUpdateStrategy()).toBe('deb');
  });

  it('returns "appimage" for a packaged AppImage build', () => {
    electron.app.isPackaged = true;
    setPlatform('linux');
    process.env.APPIMAGE = '/tmp/WhatsAppDual.AppImage';
    expect(updater.getUpdateStrategy()).toBe('appimage');
    expect(updater.isAutoUpdaterSupported()).toBe(true);
  });
});

describe('chooseDownloadAction (regression: .deb download must not no-op)', () => {
  it('routes .deb builds to the assisted install, never the AppImage path', () => {
    // The original bug: the download button was gated on the AppImage-only
    // path and silently did nothing on .deb.
    expect(updater.chooseDownloadAction('deb')).toBe('deb-install');
  });

  it('routes AppImage builds to the electron-updater download', () => {
    expect(updater.chooseDownloadAction('appimage')).toBe('appimage-download');
  });

  it('does nothing for source builds', () => {
    expect(updater.chooseDownloadAction('none')).toBe('none');
  });
});
