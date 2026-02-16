import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env';

describe('Runtime config', () => {
  it('loads defaults for local mode', () => {
    const cfg = loadConfig({});
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.PORT).toBe(3000);
    expect(cfg.CRON_SCHEDULE).toBe('0 * * * *');
    expect(cfg.DATABASE_URL).toBeUndefined();
  });

  it('requires database url in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow();
  });

  it('accepts production config with database url', () => {
    const cfg = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/scheduler',
      PORT: '8080',
      CRON_SCHEDULE: '0 0 * * *'
    });

    expect(cfg.PORT).toBe(8080);
    expect(cfg.CRON_SCHEDULE).toBe('0 0 * * *');
  });
});
