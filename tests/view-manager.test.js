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
