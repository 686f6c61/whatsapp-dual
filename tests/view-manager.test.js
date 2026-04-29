import { describe, expect, it } from 'vitest';

import viewManager from '../src/main/view-manager.js';

describe('view-manager permission allowlist', () => {
  it('allows desktop notifications only for trusted WhatsApp origins', () => {
    expect(viewManager.isAllowedPermissionRequest('notifications', 'https://web.whatsapp.com')).toBe(true);
    expect(viewManager.isAllowedPermissionRequest('notifications', 'https://business.whatsapp.com')).toBe(true);
    expect(viewManager.isAllowedPermissionRequest('notifications', 'https://example.com')).toBe(false);
    expect(viewManager.isAllowedPermissionRequest('media', 'https://web.whatsapp.com')).toBe(false);
  });
});

describe('view-manager bounds', () => {
  it('uses the root contentView bounds when available', () => {
    const mainWindow = {
      contentView: {
        getBounds: () => ({ x: 0, y: 0, width: 1200.9, height: 800.8 }),
      },
      getContentSize: () => [1100, 700],
    };

    expect(viewManager.getWebContentsViewBounds(mainWindow)).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    });
  });

  it('falls back to BrowserWindow content size for older mocks or zero-sized views', () => {
    const mainWindow = {
      contentView: {
        getBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      },
      getContentSize: () => [1100, 700],
    };

    expect(viewManager.getWebContentsViewBounds(mainWindow)).toEqual({
      x: 0,
      y: 0,
      width: 1100,
      height: 700,
    });
  });
});
