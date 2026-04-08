/**
 * Resolves the electron-store constructor across CommonJS/ESM interop shapes.
 *
 * In development `require('electron-store')` usually returns `{ default: Store }`,
 * but packaged Electron builds can expose nested namespace wrappers instead.
 *
 * @param {*} electronStoreModule - Raw module export returned by require()
 * @returns {Function} The ElectronStore constructor
 * @throws {TypeError} When no constructor can be found
 */
function resolveStoreConstructor(electronStoreModule) {
  const candidates = [
    electronStoreModule,
    electronStoreModule?.default,
    electronStoreModule?.default?.default
  ];

  const Store = candidates.find(candidate => typeof candidate === 'function');
  if (Store) {
    return Store;
  }

  throw new TypeError('Could not resolve electron-store constructor from module export');
}

module.exports = {
  resolveStoreConstructor
};
