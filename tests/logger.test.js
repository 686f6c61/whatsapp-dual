/**
 * Tests for the conditional logger: debug output only in development
 * (unpackaged app) or when explicitly enabled; errors always logged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const electron = require_('electron');
const logger = require_('../src/shared/logger.js');

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WHATSAPP_DUAL_DEBUG;
  delete electron.app.isPackaged;
});

describe('logger.debug', () => {
  it('logs in development (app not packaged)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    electron.app.isPackaged = false;
    logger.debug('dev message');
    expect(spy).toHaveBeenCalledWith('dev message');
  });

  it('is silent when the app is packaged', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    electron.app.isPackaged = true;
    logger.debug('prod message');
    expect(spy).not.toHaveBeenCalled();
  });

  it('can be re-enabled in packaged builds via WHATSAPP_DUAL_DEBUG=1', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    electron.app.isPackaged = true;
    process.env.WHATSAPP_DUAL_DEBUG = '1';
    logger.debug('forced message');
    expect(spy).toHaveBeenCalledWith('forced message');
  });
});

describe('logger.error', () => {
  it('always logs errors, even when packaged', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    electron.app.isPackaged = true;
    logger.error('boom');
    expect(spy).toHaveBeenCalledWith('boom');
  });
});
