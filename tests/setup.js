/**
 * Vitest setup file.
 *
 * Patches Node's native require so that security.js gets mocked
 * versions of 'electron' and 'electron-store'.
 */

import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

// Electron mock
const electronMock = {
  app: {
    getPath: () => '/tmp/whatsapp-dual-test',
    getVersion: () => '1.5.3',
    getName: () => 'whatsapp-dual',
    relaunch: () => {},
    exit: () => {},
  },
  dialog: {
    showMessageBox: () => Promise.resolve({ response: 0 }),
  },
  powerMonitor: { on: () => {} },
  ipcMain: { handle: () => {}, on: () => {} },
  Menu: {
    buildFromTemplate: (template) => ({ template }),
    setApplicationMenu: (menu) => { electronMock.__lastAppliedMenu = menu; },
  },
  shell: { openExternal: () => Promise.resolve() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
};

// Electron-store mock
if (!global.__testStoreData) {
  global.__testStoreData = new Map();
}

class MockStore {
  get(key, def) { return global.__testStoreData.has(key) ? global.__testStoreData.get(key) : def; }
  set(key, val) { global.__testStoreData.set(key, val); }
  has(key) { return global.__testStoreData.has(key); }
  delete(key) { global.__testStoreData.delete(key); }
}

// Patch Module._cache to inject mocks
const Module = await import('module');
const builtinModule = Module.default || Module;

// Store original _resolveFilename
const origResolveFilename = builtinModule._resolveFilename;

builtinModule._resolveFilename = function(request, parent, isMain, options) {
  if (request === 'electron') {
    return '__electron_mock__';
  }
  if (request === 'electron-store') {
    return '__electron_store_mock__';
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

// Pre-populate module cache with mocks
const cache = builtinModule._cache || require.cache;
cache['__electron_mock__'] = {
  id: '__electron_mock__',
  filename: '__electron_mock__',
  loaded: true,
  exports: electronMock,
};
cache['__electron_store_mock__'] = {
  id: '__electron_store_mock__',
  filename: '__electron_store_mock__',
  loaded: true,
  exports: MockStore,
};
