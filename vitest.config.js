import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    coverage: {
      include: ['src/**/*.js'],
      exclude: ['src/main/preload-*.js']
    }
  }
});
