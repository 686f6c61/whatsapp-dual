/**
 * Tests for menu.js dependency injection: security and updater must be
 * injected via options instead of required directly, so the menu can be
 * built against any implementation (and tested without global state).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const electron = require_('electron');
const { createMenu } = require_('../src/main/menu.js');

function buildMenu({ pinEnabled = false, updateVersion = null } = {}) {
  const lockCalls = [];
  createMenu({
    switchAccount: () => {},
    openSettings: () => {},
    openAbout: () => {},
    mainWindow: null,
    quit: () => {},
    reload: () => {},
    security: {
      isPINEnabled: () => pinEnabled,
      lockApp: () => lockCalls.push('lock'),
    },
    updater: {
      getUpdateInfo: () => (updateVersion ? { version: updateVersion } : null),
      isUpdateAvailable: () => Boolean(updateVersion),
      showUpdateDialog: () => {},
      checkForUpdatesManual: () => {},
    },
  });
  return { template: electron.__lastAppliedMenu.template, lockCalls };
}

function findItem(items, predicate) {
  for (const item of items) {
    if (predicate(item)) return item;
    if (item.submenu) {
      const found = findItem(item.submenu, predicate);
      if (found) return found;
    }
  }
  return null;
}

beforeEach(() => {
  electron.__lastAppliedMenu = null;
});

describe('createMenu dependency injection', () => {
  it('shows the lock entry according to the injected security.isPINEnabled', () => {
    const withPin = buildMenu({ pinEnabled: true });
    const lockItemOn = findItem(withPin.template, (i) => i.accelerator === 'CmdOrCtrl+L');
    expect(lockItemOn.visible).toBe(true);

    const withoutPin = buildMenu({ pinEnabled: false });
    const lockItemOff = findItem(withoutPin.template, (i) => i.accelerator === 'CmdOrCtrl+L');
    expect(lockItemOff.visible).toBe(false);
  });

  it('locks through the injected security when the lock entry is clicked', () => {
    const { template, lockCalls } = buildMenu({ pinEnabled: true });
    const lockItem = findItem(template, (i) => i.accelerator === 'CmdOrCtrl+L');
    lockItem.click();
    expect(lockCalls).toEqual(['lock']);
  });

  it('labels the update entry from the injected updater.getUpdateInfo', () => {
    const { template } = buildMenu({ updateVersion: '9.9.9' });
    const updateItem = findItem(template, (i) => typeof i.label === 'string' && i.label.includes('9.9.9'));
    expect(updateItem).not.toBeNull();
  });
});
