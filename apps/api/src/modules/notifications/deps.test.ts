import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../config/env.ts';
import type { Db } from '../../db/client.ts';
import { outboxDeps } from './deps.ts';

const db = {} as Db;

describe('outboxDeps (Phase 2d)', () => {
  it('is undefined with no email provider and no sheet: rows wait safely', () => {
    expect(outboxDeps(loadEnv({ NODE_ENV: 'test' }), db)).toBeUndefined();
  });

  it('with an email provider: the provider, site URL and link keys, never a missing key', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      EMAIL_PROVIDER: 'resend',
      EMAIL_API_KEY: 'synthetic-email-key',
      EMAIL_FROM: 'Theonetrust.in <noreply@theonetrust.example>',
      PUBLIC_SITE_URL: 'https://theonetrust.example',
      AUTH_SECRET_KEY: randomBytes(32).toString('base64'),
      OWNER_NOTIFICATION_EMAIL: 'owner@theonetrust.example',
    });
    const deps = outboxDeps(env, db);
    expect(deps?.provider?.name).toBe('resend');
    expect(deps).toMatchObject({
      db,
      siteUrl: 'https://theonetrust.example',
      ownerEmail: 'owner@theonetrust.example',
    });
    expect(deps?.receiptKey).toHaveLength(32);
    expect(deps?.manageKey).toHaveLength(32);
    expect(deps?.now()).toBeInstanceOf(Date);
  });

  it('falls back to the first allowed origin for links when no site URL is set', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      EMAIL_PROVIDER: 'resend',
      EMAIL_API_KEY: 'synthetic-email-key',
      EMAIL_FROM: 'Theonetrust.in <noreply@theonetrust.example>',
      CORS_ORIGINS: 'https://preview.example',
    });
    expect(outboxDeps(env, db)?.siteUrl).toBe('https://preview.example');
    expect(outboxDeps(env, db)?.receiptKey).toBeUndefined();
  });
});
