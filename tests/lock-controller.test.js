import { beforeEach, describe, expect, it, vi } from 'vitest';

let lockController;
let storeData;
let pinEnabled;
let onLock;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();

  storeData = new Map();
  pinEnabled = true;
  onLock = vi.fn();

  lockController = await import('../src/main/security/lock-controller.js');
  lockController.inject({
    isPINEnabled: () => pinEnabled,
    verifyPIN: () => ({ success: true }),
    store: {
      get: (key, fallback) => storeData.has(key) ? storeData.get(key) : fallback,
    },
    SECURITY_DEFAULTS: {
      autoLockEnabled: true,
      autoLockTimeout: 5,
      lockOnSuspend: true,
      lockOnScreenLock: true,
    },
  });
});

describe('lock-controller', () => {
  it('clears any existing timer when auto-lock gets disabled', () => {
    lockController.initAutoLock({}, onLock, () => {});

    storeData.set('security.autoLockEnabled', false);
    lockController.resetLockTimer();

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('clears any existing timer when PIN protection is disabled', () => {
    lockController.initAutoLock({}, onLock, () => {});

    pinEnabled = false;
    lockController.resetLockTimer();

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(onLock).not.toHaveBeenCalled();
  });
});
