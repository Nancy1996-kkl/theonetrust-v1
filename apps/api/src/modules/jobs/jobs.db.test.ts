import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import { fakeCashfree } from '../../test/fake-cashfree.ts';
import type { EmailMessage, EmailProvider } from '../notifications/provider.ts';
import { RATE_LIMIT_KEEP_MS, RECHECK_MAX_AGE_MS, RECHECK_MIN_AGE_MS } from './daily.ts';

/** Phase 2d: the daily safety-net job Vercel Cron calls with `Authorization: Bearer <secret>`. */
const db = useTestDb();
const CRON_SECRET = randomBytes(24).toString('hex'); // 48 chars
const NOW = new Date();

const sent: EmailMessage[] = [];
const email: EmailProvider = {
  name: 'resend',
  send: async (m) => {
    sent.push(m);
    return { id: `msg_${sent.length}` };
  },
};
const cf = fakeCashfree('jobs-cashfree-secret-0001');
let seq = 0;

let app: FastifyInstance;
beforeAll(async () => {
  app = buildApp(loadEnv({ NODE_ENV: 'test', ...cf.env, CRON_SECRET }), {
    db,
    now: () => NOW,
    paymentProvider: cf.provider,
    outbox: {
      db,
      provider: email,
      ownerEmail: 'owner@example.org',
      siteUrl: 'https://theonetrust.example',
      now: () => new Date(), // rows are queued "now"; a frozen clock would never reach them
    },
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

const run = (authorization?: string) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/internal/jobs/daily',
    remoteAddress: '10.66.0.1',
    headers: authorization ? { authorization } : {},
  });

let ip = 0;
async function donation(ageMs: number) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: `10.66.1.${(ip++ % 250) + 1}`,
    payload: {
      giftPaise: 100_000,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Donor',
      donorEmail: 'donor@example.org',
      donorPhone: '+919876543210',
      hideNamePublicly: true,
      wantsReceipt: false,
      coverFee: false,
      consent: true,
      locale: 'en',
    },
  });
  const { publicReference } = res.json() as { publicReference: string };
  await db.donationIntent.update({
    where: { publicReference },
    data: { createdAt: new Date(NOW.getTime() - ageMs) },
  });
  return { ref: publicReference };
}
function captured(ref: string) {
  seq += 1;
  cf.pay(ref);
}
const status = async (ref: string) =>
  (await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } })).status;

describe('daily job route (Phase 2d)', () => {
  it('is hidden without the right secret (404), and with no secret configured at all', async () => {
    expect((await run()).statusCode).toBe(404);
    expect((await run(`Bearer ${'x'.repeat(48)}`)).statusCode).toBe(404);
    expect((await run(CRON_SECRET)).statusCode).toBe(404); // missing "Bearer "
    const bare = buildApp(loadEnv({ NODE_ENV: 'test' }), { db });
    expect(
      (
        await bare.inject({
          method: 'GET',
          url: '/api/v1/internal/jobs/daily',
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        })
      ).statusCode,
    ).toBe(404);
    await bare.close();
  });

  it('heals lost payments in the window, sends queued emails, clears old counters', async () => {
    const lost = await donation(RECHECK_MIN_AGE_MS + 60_000); // webhook never arrived
    captured(lost.ref);
    const fresh = await donation(60_000); // the donor may still be paying: left alone
    captured(fresh.ref);
    const old = await donation(RECHECK_MAX_AGE_MS + 60_000); // too old: owner re-check only
    captured(old.ref);
    const hex = (s: string) => createHash('sha256').update(s).digest('hex');
    await db.rateLimitBucket.createMany({
      data: [
        {
          key: hex(`old-${seq}`),
          windowStart: new Date(Date.now() - RATE_LIMIT_KEEP_MS - 60_000),
          hits: 3,
        },
        { key: hex(`new-${seq}`), windowStart: new Date(), hits: 1 },
      ],
    });
    sent.length = 0;

    const res = await run(`Bearer ${CRON_SECRET}`);
    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.payments).toMatchObject({ ok: true, paid: 1 });
    expect(await status(lost.ref)).toBe('PAID');
    expect(await status(fresh.ref)).not.toBe('PAID');
    expect(await status(old.ref)).not.toBe('PAID');
    // The PAID donation queued emails; the outbox step (same run) or the next run sends them.
    const again = (await run(`Bearer ${CRON_SECRET}`)).json();
    expect(report.outbox.ok && again.outbox.ok).toBe(true);
    expect(sent.some((m) => m.to === 'donor@example.org')).toBe(true);
    expect(report.rateLimits).toMatchObject({ ok: true });
    expect(report.rateLimits.deleted).toBeGreaterThanOrEqual(1);
    expect(await db.rateLimitBucket.count({ where: { key: hex(`new-${seq}`) } })).toBe(1);
    expect(res.body).not.toMatch(/donor@|Synthetic|TOT-D-|\d{12}/); // counts only
  });

  it('a failing step is reported by name and never stops the others', async () => {
    const spy = vi
      .spyOn(db.notificationOutbox, 'findMany')
      .mockRejectedValueOnce(new TypeError('boom'));
    const report = (await run(`Bearer ${CRON_SECRET}`)).json();
    spy.mockRestore();
    expect(report.outbox).toEqual({ ok: false, error: 'TypeError' });
    expect(report.payments.ok).toBe(true);
    expect(report.rateLimits.ok).toBe(true);
  });
});
