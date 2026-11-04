import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from './env.ts';

describe('loadEnv', () => {
  it('applies safe defaults for local development', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('parses a comma-separated CORS allowlist and trims spaces', () => {
    const env = loadEnv({ CORS_ORIGINS: 'https://theonetrust.in, https://www.theonetrust.in ,' });
    expect(env.CORS_ORIGINS).toEqual(['https://theonetrust.in', 'https://www.theonetrust.in']);
  });

  it.each([
    ['API_PORT', { API_PORT: 'abc' }],
    ['API_PORT', { API_PORT: '70000' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['CORS_ORIGINS', { CORS_ORIGINS: 'not-a-url' }],
    ['CORS_ORIGINS', { CORS_ORIGINS: ' , ' }],
  ])('rejects invalid %s', (key, source) => {
    expect(() => loadEnv(source)).toThrow(EnvValidationError);
    try {
      loadEnv(source);
    } catch (error) {
      expect((error as EnvValidationError).invalidKeys).toEqual([key]);
    }
  });

  it('never echoes the invalid value in the error message', () => {
    const secretLooking = 'postgres://user:SuperSecret@host/db';
    expect(() => loadEnv({ CORS_ORIGINS: secretLooking, API_PORT: secretLooking })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('SuperSecret') }),
    );
  });
});

describe('loadEnv — request limits', () => {
  it('defaults the rate limit and body limit', () => {
    const env = loadEnv({});
    expect(env.RATE_LIMIT_MAX).toBe(120);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(env.BODY_LIMIT_BYTES).toBe(65_536);
  });

  it.each([
    ['RATE_LIMIT_MAX', { RATE_LIMIT_MAX: '0' }],
    ['RATE_LIMIT_WINDOW_MS', { RATE_LIMIT_WINDOW_MS: '10' }],
    ['BODY_LIMIT_BYTES', { BODY_LIMIT_BYTES: '99999999' }],
  ])('rejects invalid %s', (key, source) => {
    expect(() => loadEnv(source)).toThrow(expect.objectContaining({ invalidKeys: [key] }));
  });
});

describe('loadEnv — database URLs', () => {
  const pooled = 'postgresql://app:SuperSecret@pooler.example/app?sslmode=require';

  it('treats empty values (as copied from .env.example) as not set', () => {
    const env = loadEnv({ DATABASE_URL: '', DIRECT_URL: '' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it('accepts postgres:// and postgresql:// URLs', () => {
    const env = loadEnv({
      DATABASE_URL: pooled,
      DIRECT_URL: 'postgres://app:pw@direct.example/app',
    });
    expect(env.DATABASE_URL).toBe(pooled);
    expect(env.DIRECT_URL).toBe('postgres://app:pw@direct.example/app');
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: 'mysql://x@y/z' }],
    ['DIRECT_URL', { DIRECT_URL: 'not a url' }],
    [
      'DATABASE_URL',
      { NODE_ENV: 'production', AUTH_SECRET_KEY: Buffer.alloc(32, 7).toString('base64') },
    ],
  ])('rejects invalid or missing %s', (key, source) => {
    expect(() => loadEnv(source)).toThrow(expect.objectContaining({ invalidKeys: [key] }));
  });

  it('never echoes the database URL or password in the error', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://app:SuperSecret@host/db' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('SuperSecret') }),
    );
  });
});

describe('loadEnv — sign-in settings', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('defaults session and lockout limits', () => {
    expect(loadEnv({})).toMatchObject({
      SESSION_IDLE_MINUTES: 30,
      SESSION_MAX_HOURS: 12,
      LOGIN_MAX_FAILURES: 5,
      LOGIN_LOCKOUT_MINUTES: 15,
    });
  });

  it('accepts a 32-byte base64 AUTH_SECRET_KEY and treats empty as unset', () => {
    expect(loadEnv({ AUTH_SECRET_KEY: key }).AUTH_SECRET_KEY).toBe(key);
    expect(loadEnv({ AUTH_SECRET_KEY: '' }).AUTH_SECRET_KEY).toBeUndefined();
  });

  it.each([
    ['AUTH_SECRET_KEY', { AUTH_SECRET_KEY: 'too-short' }],
    ['SESSION_IDLE_MINUTES', { SESSION_IDLE_MINUTES: '1' }],
    ['LOGIN_MAX_FAILURES', { LOGIN_MAX_FAILURES: '1' }],
  ])('rejects invalid %s', (name, source) => {
    expect(() => loadEnv(source)).toThrow(expect.objectContaining({ invalidKeys: [name] }));
  });

  it('requires AUTH_SECRET_KEY in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@h/d' })).toThrow(
      expect.objectContaining({ invalidKeys: ['AUTH_SECRET_KEY'] }),
    );
  });
});

describe('loadEnv — public content', () => {
  it('defaults the cache and leaves the documents URL unset', () => {
    const env = loadEnv({ PUBLIC_DOCUMENTS_BASE_URL: '' });
    expect(env.PUBLIC_CACHE_SECONDS).toBe(300);
    expect(env.PUBLIC_DOCUMENTS_BASE_URL).toBeUndefined();
  });

  it.each([
    ['PUBLIC_DOCUMENTS_BASE_URL', { PUBLIC_DOCUMENTS_BASE_URL: 'ftp://files.example' }],
    ['PUBLIC_CACHE_SECONDS', { PUBLIC_CACHE_SECONDS: '-1' }],
  ])('rejects invalid %s', (key, source) => {
    expect(() => loadEnv(source)).toThrow(expect.objectContaining({ invalidKeys: [key] }));
  });
});

describe('loadEnv — Razorpay keys', () => {
  const test = { RAZORPAY_KEY_ID: 'rzp_test_abcdefgh12', RAZORPAY_KEY_SECRET: 'secret-secret-123' };

  it('accepts a test key pair, and neither', () => {
    expect(loadEnv(test).RAZORPAY_KEY_ID).toBe('rzp_test_abcdefgh12');
    expect(
      loadEnv({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }).RAZORPAY_KEY_ID,
    ).toBeUndefined();
    expect(loadEnv({}).DONATION_RATE_LIMIT_PER_HOUR).toBe(20);
  });

  it.each([
    ['RAZORPAY_KEY_SECRET', { RAZORPAY_KEY_ID: 'rzp_test_abcdefgh12' }],
    ['RAZORPAY_KEY_ID', { RAZORPAY_KEY_SECRET: 'secret-secret-123' }],
    ['RAZORPAY_KEY_ID', { ...test, RAZORPAY_KEY_ID: 'rzp_live_abcdefgh12' }],
    ['RAZORPAY_KEY_ID', { ...test, RAZORPAY_KEY_ID: 'not-a-key' }],
  ])('rejects %s', (key, source) => {
    expect(() => loadEnv(source)).toThrow(expect.objectContaining({ invalidKeys: [key] }));
  });

  it('never echoes the secret', () => {
    expect(() => loadEnv({ RAZORPAY_KEY_SECRET: 'super-secret-value-1' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('super-secret') }),
    );
  });
});
