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
      {
        NODE_ENV: 'production',
        DATABASE_SCHEMA: 'theonetrust',
        AUTH_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
      },
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
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@h/d',
        DATABASE_SCHEMA: 'theonetrust',
      }),
    ).toThrow(expect.objectContaining({ invalidKeys: ['AUTH_SECRET_KEY'] }));
  });
});

describe('loadEnv — donation QR (client, Nov 2026)', () => {
  it('is off by default with a ₹2,000 cap and a 15-minute expiry', () => {
    const env = loadEnv({});
    expect(env.RAZORPAY_QR_ENABLED).toBe(false);
    expect(env.DONATION_QR_MAX_PAISE).toBe(200_000);
    expect(env.DONATION_QR_EXPIRY_MINUTES).toBe(15);
    expect(loadEnv({ RAZORPAY_QR_ENABLED: 'true' }).RAZORPAY_QR_ENABLED).toBe(true);
    expect(() => loadEnv({ DONATION_QR_EXPIRY_MINUTES: '500' })).toThrow();
  });
});

describe('loadEnv — trusted proxy (#38)', () => {
  it('defaults to private and loopback networks and refuses odd values', () => {
    expect(loadEnv({}).TRUST_PROXY).toBe('loopback, linklocal, uniquelocal');
    expect(loadEnv({ TRUST_PROXY: '10.0.0.0/8, 172.16.0.1' }).TRUST_PROXY).toBe(
      '10.0.0.0/8, 172.16.0.1',
    );
    expect(() => loadEnv({ TRUST_PROXY: 'x;rm' })).toThrow();
  });
});

describe('loadEnv — public content', () => {
  it('defaults the cache and leaves the documents URL unset', () => {
    const env = loadEnv({ PUBLIC_DOCUMENTS_BASE_URL: '' });
    expect(env.PUBLIC_CACHE_SECONDS).toBe(300);
    expect(env.PUBLIC_DOCUMENTS_BASE_URL).toBeUndefined();
    expect(env.DOCUMENT_STORAGE_DIR).toBeUndefined();
    expect(env.DOCUMENT_MAX_BYTES).toBe(10_485_760);
    expect(loadEnv({ DOCUMENT_STORAGE_DIR: '/var/tot/docs' }).DOCUMENT_STORAGE_DIR).toBe(
      '/var/tot/docs',
    );
  });

  it.each([
    ['PUBLIC_DOCUMENTS_BASE_URL', { PUBLIC_DOCUMENTS_BASE_URL: 'ftp://files.example' }],
    ['PUBLIC_CACHE_SECONDS', { PUBLIC_CACHE_SECONDS: '-1' }],
    ['DOCUMENT_MAX_BYTES', { DOCUMENT_MAX_BYTES: '100' }],
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
    ['RAZORPAY_KEY_ID', { ...test, RAZORPAY_KEY_ID: ['rzp', 'live', 'abcdefgh12'].join('_') }],
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

describe('loadEnv — payment safety windows (Phase 0)', () => {
  it('defaults the webhook lease and the FAILED re-check window, and bounds both', () => {
    const env = loadEnv({ NODE_ENV: 'test' });
    expect(env.WEBHOOK_REPROCESS_AFTER_MS).toBe(120_000);
    expect(env.FAILED_RECHECK_WINDOW_MS).toBe(86_400_000);
    expect(() => loadEnv({ NODE_ENV: 'test', FAILED_RECHECK_WINDOW_MS: '1000' })).toThrow();
    expect(() =>
      loadEnv({ NODE_ENV: 'test', FAILED_RECHECK_WINDOW_MS: String(8 * 86_400_000) }),
    ).toThrow();
    expect(loadEnv({ NODE_ENV: 'test', FAILED_RECHECK_WINDOW_MS: '3600000' })).toMatchObject({
      FAILED_RECHECK_WINDOW_MS: 3_600_000,
    });
  });
});

describe('loadEnv — payment gateway (Phase 1)', () => {
  it('defaults to razorpay, accepts none, refuses anything else', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).PAYMENT_PROVIDER).toBe('razorpay');
    expect(loadEnv({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'none' }).PAYMENT_PROVIDER).toBe('none');
    expect(() => loadEnv({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'stripe' })).toThrow();
  });
});

describe('loadEnv — database schema (Phase 2b)', () => {
  const prod = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://app@db.example.org:6543/postgres',
    AUTH_SECRET_KEY: Buffer.alloc(32, 3).toString('base64'),
  };

  it('is optional outside production and required in production (never a silent `public`)', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).DATABASE_SCHEMA).toBeUndefined();
    expect(() => loadEnv(prod)).toThrow(
      expect.objectContaining({ invalidKeys: ['DATABASE_SCHEMA'] }),
    );
    expect(loadEnv({ ...prod, DATABASE_SCHEMA: 'theonetrust' }).DATABASE_SCHEMA).toBe(
      'theonetrust',
    );
  });

  it('accepts only a plain lowercase schema name', () => {
    for (const bad of ['Theonetrust', 'theonetrust;drop', 'trust-schema', '"x"', '1abc', '']) {
      expect(() => loadEnv({ NODE_ENV: 'test', DATABASE_SCHEMA: bad })).toThrow();
    }
  });
});

describe('loadEnv — Cashfree (Phase 4)', () => {
  const keys = {
    CASHFREE_ENV: 'sandbox',
    CASHFREE_CLIENT_ID: 'TEST0123456789',
    CASHFREE_CLIENT_SECRET: 'cf-secret-0123456789',
  };

  it('keeps Razorpay the default, no Cashfree mode until chosen, a pinned API version', () => {
    const env = loadEnv({});
    expect(env.PAYMENT_PROVIDER).toBe('razorpay');
    expect(env.CASHFREE_ENV).toBeUndefined();
    expect(env.CASHFREE_API_VERSION).toBe('2026-01-01');
    expect(env.CASHFREE_ORDER_EXPIRY_MINUTES).toBe(30);
    expect(loadEnv({ PAYMENT_PROVIDER: 'cashfree', ...keys }).PAYMENT_PROVIDER).toBe('cashfree');
  });

  it('needs both keys or neither, and treats empty values as unset', () => {
    expect(() => loadEnv({ CASHFREE_CLIENT_ID: keys.CASHFREE_CLIENT_ID })).toThrow(
      expect.objectContaining({ invalidKeys: ['CASHFREE_CLIENT_SECRET'] }),
    );
    expect(() => loadEnv({ CASHFREE_CLIENT_SECRET: keys.CASHFREE_CLIENT_SECRET })).toThrow(
      expect.objectContaining({ invalidKeys: ['CASHFREE_CLIENT_ID'] }),
    );
    expect(loadEnv({ CASHFREE_CLIENT_ID: '', CASHFREE_CLIENT_SECRET: '' }).CASHFREE_CLIENT_ID).toBe(
      undefined,
    );
  });

  it('Cashfree must name its mode: sandbox or production, chosen explicitly (plan §2.4)', () => {
    const { CASHFREE_ENV: _mode, ...noMode } = keys;
    void _mode;
    expect(() => loadEnv({ PAYMENT_PROVIDER: 'cashfree', ...noMode })).toThrow(
      expect.objectContaining({ invalidKeys: ['CASHFREE_ENV'] }),
    );
  });

  it('live Cashfree only on the production deployment; the sandbox never there', () => {
    const prod = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@h/d',
      DATABASE_SCHEMA: 'theonetrust',
      AUTH_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
      PAYMENT_PROVIDER: 'cashfree',
      ...keys,
    };
    const invalid = (extra: Record<string, string>) =>
      expect(() => loadEnv({ ...prod, ...extra })).toThrow(
        expect.objectContaining({ invalidKeys: ['CASHFREE_ENV'] }),
      );
    // sandbox on the production deployment: refused
    invalid({ VERCEL_ENV: 'production', CASHFREE_ENV: 'sandbox' });
    // live keys on a preview, or outside production: refused
    invalid({ VERCEL_ENV: 'preview', CASHFREE_ENV: 'production' });
    expect(() => loadEnv({ CASHFREE_ENV: 'production' })).toThrow(
      expect.objectContaining({ invalidKeys: ['CASHFREE_ENV'] }),
    );
    // allowed: sandbox on a preview, live on production
    expect(loadEnv({ ...prod, VERCEL_ENV: 'preview' }).CASHFREE_ENV).toBe('sandbox');
    expect(
      loadEnv({ ...prod, VERCEL_ENV: 'production', CASHFREE_ENV: 'production' }).CASHFREE_ENV,
    ).toBe('production');
    expect(() => loadEnv({ VERCEL_ENV: 'staging' })).toThrow();
  });

  it('refuses odd versions and expiries', () => {
    expect(() => loadEnv({ CASHFREE_API_VERSION: 'latest' })).toThrow();
    expect(() => loadEnv({ CASHFREE_ORDER_EXPIRY_MINUTES: '5' })).toThrow();
  });

  it('needs a public site URL that fits Cashfree’s 250-character return URL', () => {
    expect(() =>
      loadEnv({
        PAYMENT_PROVIDER: 'cashfree',
        ...keys,
        PUBLIC_SITE_URL: `https://${'a'.repeat(200)}.example`,
      }),
    ).toThrow(expect.objectContaining({ invalidKeys: ['PUBLIC_SITE_URL'] }));
    expect(() => loadEnv({ PAYMENT_PROVIDER: 'cashfree', ...keys, CORS_ORIGINS: '' })).toThrow();
  });

  it('never echoes the client secret in the error', () => {
    try {
      loadEnv({ CASHFREE_CLIENT_SECRET: 'short' });
    } catch (error) {
      expect(String(error)).not.toContain('short');
    }
    expect.assertions(1);
  });
});
