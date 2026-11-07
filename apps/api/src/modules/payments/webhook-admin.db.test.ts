import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';

/** Webhook delivery view (#39) and the readiness check. IDs use the evt_W prefix. */
const db = useTestDb();
const ORIGIN = 'http://localhost:5173';
const AUTH_SECRET_KEY = randomBytes(32).toString('base64');
// Far future, so these rows are always the newest whatever other files left behind.
const NOW = new Date('2099-01-05T10:00:00.000Z');
let app: FastifyInstance;
let get: (url: string) => Promise<LightMyRequestResponse>;

beforeAll(async () => {
  app = buildApp(
    loadEnv({
      NODE_ENV: 'test',
      AUTH_SECRET_KEY,
      CORS_ORIGINS: ORIGIN,
      ADMIN_STALE_PENDING_MINUTES: '30',
    }),
    { db, now: () => NOW },
  );
  const email = `${unique('wh-owner')}@example.org`;
  await setOwnerPassword(db, email, 'river mango lamp seventeen');
  let cookie = '';
  let csrf = '';
  const send = async (method: 'GET' | 'POST', url: string, body?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: {
        origin: ORIGIN,
        ...(csrf && { 'x-csrf-token': csrf }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(cookie && { cookies: { tot_admin: cookie } }),
      ...(body !== undefined && { payload: JSON.stringify(body) }),
    });
    const set = res.cookies.find((c) => c.name === 'tot_admin');
    if (set) cookie = set.value;
    if (res.headers['content-type']?.includes('json')) {
      const token = (res.json() as { csrfToken?: string }).csrfToken;
      if (token) csrf = token;
    }
    return res;
  };
  await send('POST', '/api/v1/auth/login', { email, password: 'river mango lamp seventeen' });
  const { secret } = (await send('POST', '/api/v1/auth/mfa/setup')).json() as { secret: string };
  await send('POST', '/api/v1/auth/mfa/enable', {
    code: hotp(base32Decode(secret), timeStep(NOW)),
  });
  get = (url) => send('GET', url);

  const intent = await db.donationIntent.create({
    data: {
      publicReference: unique('TOT-WH'),
      giftPaise: 100_000,
      amountPaise: 100_000,
      donorName: 'Synthetic Donor',
      consentAt: NOW,
    },
  });
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
  await db.webhookEvent.createMany({
    data: [
      {
        providerEventId: 'evt_W001',
        eventType: 'payment.captured',
        signatureValid: true,
        processingStatus: 'PROCESSED',
        attempts: 1,
        receivedAt: minutesAgo(90),
        processedAt: minutesAgo(90),
        donationIntentId: intent.id,
      },
      {
        providerEventId: 'evt_W002',
        eventType: 'payment.captured',
        signatureValid: true,
        processingStatus: 'FAILED',
        processingError: 'processing_failed',
        attempts: 3,
        receivedAt: minutesAgo(60),
      },
      {
        providerEventId: 'evt_W003',
        eventType: 'payment.failed',
        signatureValid: true,
        processingStatus: 'RECEIVED',
        attempts: 0,
        receivedAt: minutesAgo(5),
      },
      {
        providerEventId: 'evt_W004',
        eventType: 'order.paid',
        signatureValid: true,
        processingStatus: 'IGNORED',
        processingError: 'event_not_handled',
        attempts: 1,
        receivedAt: minutesAgo(2),
      },
    ],
  });
});

afterAll(async () => {
  await db.webhookEvent.deleteMany({ where: { providerEventId: { startsWith: 'evt_W' } } });
  await app.close();
});

describe('webhook delivery view (#39)', () => {
  it('lists deliveries newest first with status, note, attempts and the donation', async () => {
    const res = await get('/api/v1/admin/webhooks');
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{
        eventType: string;
        status: string;
        needsAttention: boolean;
        donation: unknown;
      }>;
      counts: Record<string, number>;
      staleAfterMinutes: number;
    };
    const mine = body.items.filter((i) =>
      ['payment.captured', 'payment.failed', 'order.paid'].includes(i.eventType),
    );
    expect(mine.map((i) => i.status).slice(0, 4)).toEqual([
      'IGNORED',
      'RECEIVED',
      'FAILED',
      'PROCESSED',
    ]);
    expect(body.items.find((i) => i.status === 'PROCESSED' && i.donation)).toMatchObject({
      donation: { reference: expect.stringMatching(/^TOT-WH/) },
      needsAttention: false,
    });
    // FAILED for an hour needs attention; RECEIVED 5 minutes ago does not yet.
    expect(body.items.find((i) => i.status === 'FAILED')).toMatchObject({
      needsAttention: true,
      note: 'processing_failed',
      attempts: 3,
    });
    expect(body.items.find((i) => i.status === 'RECEIVED')).toMatchObject({
      needsAttention: false,
    });
    expect(body.counts.FAILED).toBeGreaterThanOrEqual(1);
    expect(body.staleAfterMinutes).toBe(30);
    expect(res.body).not.toMatch(/payload|signature/i);
  });

  it('filters by status and by "needs attention"; bad filters are refused', async () => {
    const failed = (await get('/api/v1/admin/webhooks?status=FAILED')).json() as {
      items: Array<{ status: string }>;
    };
    expect(failed.items.every((i) => i.status === 'FAILED')).toBe(true);
    const attention = (await get('/api/v1/admin/webhooks?attention=1')).json() as {
      items: Array<{ needsAttention: boolean }>;
    };
    expect(attention.items.length).toBeGreaterThan(0);
    expect(attention.items.every((i) => i.needsAttention)).toBe(true);
    expect((await get('/api/v1/admin/webhooks?status=DONE')).statusCode).toBe(400);
  });

  it('is owner-only', async () => {
    expect((await app.inject('/api/v1/admin/webhooks')).statusCode).toBe(401);
  });

  it('readiness answers 200 with a working database', async () => {
    const res = await app.inject('/api/v1/health/ready');
    expect(res.json()).toEqual({ status: 'ok', database: 'ok' });
  });
});
