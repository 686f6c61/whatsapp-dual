import { describe, expect, it } from 'vitest';

import storeLoader from '../src/main/store-loader.js';

const { resolveStoreConstructor } = storeLoader;

class MockStore {}

describe('store-loader', () => {
  it('accepts a direct constructor export', () => {
    expect(resolveStoreConstructor(MockStore)).toBe(MockStore);
  });

  it('accepts a default export wrapper', () => {
    expect(resolveStoreConstructor({ default: MockStore })).toBe(MockStore);
  });

  it('accepts nested default wrappers from packaged builds', () => {
    expect(resolveStoreConstructor({ default: { default: MockStore } })).toBe(MockStore);
  });

  it('throws when no constructor exists in the module export', () => {
    expect(() => resolveStoreConstructor({ default: { nope: true } }))
      .toThrow('Could not resolve electron-store constructor');
  });
});
