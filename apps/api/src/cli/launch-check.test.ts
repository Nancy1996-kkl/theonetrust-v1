import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.ts';
import { formatReport, launchReadiness } from './launch-check.ts';

const READY = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db.example/app?sslmode=require',
  DIRECT_URL: 'postgresql://u:p@db-direct.example/app?sslmode=require',
  DATABASE_SCHEMA: 'theonetrust',
  AUTH_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
  PAYMENT_PROVIDER: 'cashfree',
  CASHFREE_ENV: 'production',
  CASHFREE_CLIENT_ID: 'SYNTHETIC_APP_ID_123',
  CASHFREE_CLIENT_SECRET: 'synthetic-secret-value',
  PUBLIC_SITE_URL: 'https://theonetrust.in',
  CORS_ORIGINS: 'https://theonetrust.in',
  EMAIL_PROVIDER: 'resend',
  EMAIL_API_KEY: 'synthetic-email-key',
  EMAIL_FROM: 'Theonetrust.in <noreply@example.org>',
  OWNER_NOTIFICATION_EMAIL: 'owner@example.org',
  DOCUMENT_STORAGE_DIR: '/var/lib/tot/documents',
  PUBLIC_DOCUMENTS_BASE_URL: 'https://api.theonetrust.in/api/v1/documents',
};

describe('launch readiness (#39)', () => {
  it('a complete production configuration is ready', () => {
    const checks = launchReadiness(loadEnv(READY));
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(formatReport(checks)).toMatch(/Ready\.$/);
  });

  it('names what is missing and never prints a secret value', () => {
    const checks = launchReadiness(
      loadEnv({
        ...READY,
        PAYMENT_PROVIDER: 'none',
        DATABASE_URL: 'postgresql://u:p@db.example/app',
        CORS_ORIGINS: 'https://theonetrust.in,http://localhost:5173',
        EMAIL_PROVIDER: 'none',
        TRUST_PROXY: 'none',
      }),
    );
    expect(checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([
      'database_tls',
      'cashfree_live',
      'site_https',
      'email',
      'trust_proxy',
    ]);
    const report = formatReport(checks);
    expect(report).toContain('5 item(s) not ready.');
    for (const secret of ['synthetic-secret-value', 'SYNTHETIC_APP_ID_123', 'u:p@']) {
      expect(report).not.toContain(secret);
    }
  });

  it('development defaults are not ready', () => {
    const checks = launchReadiness(loadEnv({}));
    expect(checks.find((c) => c.id === 'production')?.ok).toBe(false);
  });
});
