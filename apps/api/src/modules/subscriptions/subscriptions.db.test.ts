import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { deriveAuthKeys } from '../../security/crypto.ts';
import { useTestDb } from '../../test/db.ts';
import type { PaymentProvider } from '../donations/provider.ts';
import { PaymentProviderError } from '../donations/provider.ts';
import { processDueNotifications } from '../notifications/worker.ts';
import type { EmailMessage } from '../notifications/provider.ts';
import {
  razorpaySubscriptions,
  type ProviderSubscription,
  type SubscriptionProvider,
} from './provider.ts';

/**
 * Monthly giving (#32) through the real API, Razorpay stubbed in test mode: plan reuse, method
 * routing, consent, signature + fetched status, manage link view and cancel at the provider.
 */
const db = useTestDb();
const SECRET = 'subs-key-secret-000001';
const AUTH_SECRET_KEY = randomBytes(32).toString('base64');
const MANAGE_KEY = deriveAuthKeys(AUTH_SECRET_KEY).manage;
let app: FastifyInstance;
let seq = 0;
let ip = 0;
let clock = new Date('2026-11-10T05:00:00Z');

const remote = new Map<string, ProviderSubscription>();
const real = razorpaySubscriptions({ keyId: 'rzp_test_subs000001', keySecret: SECRET });
const failNext: string[] = [];
const subs = {
  createPlan: vi.fn(async ({ amountPaise }: { amountPaise: number }) => ({
    planId: `plan_S${String(amountPaise).padStart(9, '0')}`,
  })),
  createSubscription: vi.fn(
    async (input: { planId: string; startAt?: number; notes: Record<string, string> }) => {
      const s: ProviderSubscription = {
        subscriptionId: `sub_S${String(++seq).padStart(10, '0')}`,
        planId: input.planId,
        status: 'created',
        startAt: input.startAt ?? null,
        chargeAt: null,
      };
      remote.set(s.subscriptionId, s);
      return s;
    },
  ),
  fetchSubscription: vi.fn(async (id: string) => {
    if (failNext[0] === 'fetch') {
      failNext.shift();
      throw new PaymentProviderError('network');
    }
    const s = remote.get(id);
    if (!s) throw new PaymentProviderError('rejected');
    return s;
  }),
  cancelSubscription: vi.fn(async (id: string) => {
    if (failNext[0] === 'cancel') {
      failNext.shift();
      throw new PaymentProviderError('network');
    }
    const s = { ...remote.get(id)!, status: 'cancelled' };
    remote.set(id, s);
    return s;
  }),
  verifySubscriptionSignature: real.verifySubscriptionSignature,
} satisfies SubscriptionProvider;
const payments = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_subs000001',
} as unknown as PaymentProvider;

const env = (extra: Record<string, string> = {}) =>
  loadEnv({ NODE_ENV: 'test', AUTH_SECRET_KEY, RAZORPAY_SUBSCRIPTIONS_ENABLED: 'true', ...extra });

beforeAll(() => {
  app = buildApp(env(), {
    db,
    paymentProvider: payments,
    subscriptionProvider: subs,
    now: () => clock,
  });
});
beforeEach(() => {
  failNext.length = 0;
  clock = new Date('2026-11-10T05:00:00Z');
});
afterAll(async () => {
  await app.close();
});

const nextIp = () => `10.32.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;
const body = (amountPaise: number, patch: Record<string, unknown> = {}) => ({
  amountPaise,
  currency: 'INR',
  programme: null,
  donorName: 'Synthetic Monthly Donor',
  donorEmail: 'monthly.donor@example.org',
  donorPhone: '98765 43210',
  consent: true,
  mandateConsent: true,
  consentVersion: 'monthly-v1',
  locale: 'en',
  ...patch,
});
const create = (amountPaise: number, patch: Record<string, unknown> = {}, key?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/subscriptions',
    remoteAddress: nextIp(),
    headers: key ? { 'idempotency-key': key } : {},
    payload: body(amountPaise, patch),
  });
const verify = (ref: string, subscriptionId: string, signature?: string) => {
  const paymentId = `pay_S${String(++seq).padStart(8, '0')}`;
  return app.inject({
    method: 'POST',
    url: '/api/v1/subscriptions/verify',
    remoteAddress: nextIp(),
    payload: {
      publicReference: ref,
      subscriptionId,
      paymentId,
      signature:
        signature ??
        createHmac('sha256', SECRET).update(`${paymentId}|${subscriptionId}`).digest('hex'),
    },
  });
};
const manage = (token: string, action?: 'cancel', payload: object = { confirm: true }) =>
  app.inject({
    method: action ? 'POST' : 'GET',
    url: `/api/v1/subscriptions/manage/${token}${action ? '/cancel' : ''}`,
    remoteAddress: nextIp(),
    ...(action && { payload }),
  });

async function authorised(amountPaise: number, patch: Record<string, unknown> = {}) {
  const res = await create(amountPaise, patch);
  expect(res.statusCode).toBe(201);
  const created = res.json();
  const id = created.checkout.subscriptionId as string;
  remote.set(id, { ...remote.get(id)!, status: 'authenticated' });
  const v = await verify(created.publicReference, id);
  return { created, verified: v.json(), id };
}

describe('POST /subscriptions — consent, plan reuse, routing', () => {
  it('≤ ₹15,000: UPI AutoPay route, sandbox subscription created, plan reused for the same amount', async () => {
    const plansBefore = subs.createPlan.mock.calls.length;
    const a = (await create(150_000)).json();
    expect(a).toMatchObject({
      amountPaise: 150_000,
      methodRoute: 'upi_autopay',
      allowedMethods: ['upi', 'emandate', 'card'],
      warning: null,
      startDate: null,
      checkout: { provider: 'RAZORPAY', keyId: 'rzp_test_subs000001' },
    });
    expect(a.publicReference).toMatch(/^TOT-M-/);
    const b = (await create(150_000)).json();
    expect(b.checkout.subscriptionId).not.toBe(a.checkout.subscriptionId);
    expect(subs.createPlan.mock.calls.length - plansBefore).toBeLessThanOrEqual(1);
    expect(await db.subscriptionPlan.count({ where: { amountPaise: 150_000 } })).toBe(1);
    // Only a reference goes to Razorpay; no name, email or phone.
    expect(JSON.stringify(subs.createSubscription.mock.calls.at(-1))).not.toMatch(
      /Synthetic|monthly\.donor|9876/,
    );
    const row = await db.donationSubscription.findUniqueOrThrow({
      where: { publicReference: a.publicReference },
    });
    expect(row).toMatchObject({
      methodRoute: 'upi_autopay',
      status: 'CREATED',
      consentVersion: 'monthly-v1',
      donorPhone: '+919876543210',
    });
    expect(row.consentAt).toEqual(clock);
  });

  it('above ₹15,000: eMandate or card only, with the PhonePe/BHIM warning', async () => {
    expect((await create(1_500_001)).json()).toMatchObject({
      methodRoute: 'emandate_card',
      allowedMethods: ['emandate', 'card'],
      warning: 'psp_limit',
    });
  });

  it('on the 29th–31st the first charge moves to the 1st of next month', async () => {
    clock = new Date('2026-11-29T05:00:00Z');
    const res = (await create(50_000)).json();
    expect(res.startDate).toBe('2026-12-01');
    expect(subs.createSubscription.mock.calls.at(-1)?.[0].startAt).toBe(
      Math.floor(Date.parse('2026-12-01T09:00:00+05:30') / 1000),
    );
  });

  it.each([
    ['no mandate consent', { mandateConsent: false }],
    ['no data consent', { consent: false }],
    ['old consent version', { consentVersion: 'monthly-v0' }],
    ['no contact', { donorEmail: null, donorPhone: null }],
    ['bad phone', { donorPhone: '123' }],
    ['unknown programme', { programme: 'not-a-programme' }],
    ['extra field', { status: 'ACTIVE' }],
  ])('refuses %s', async (_label, patch) => {
    expect((await create(50_000, patch)).statusCode).toBe(400);
  });

  it('refuses amounts below ₹1, fractional or above the maximum', async () => {
    for (const amount of [99, 100.5, 50_000_001])
      expect((await create(amount)).statusCode).toBe(400);
  });

  it('the same Idempotency-Key returns the same subscription; a different amount is a conflict', async () => {
    const key = `monthly-key-${randomBytes(8).toString('hex')}`;
    const first = await create(60_000, {}, key);
    const again = await create(60_000, {}, key);
    expect(again.statusCode).toBe(200);
    expect(again.json().checkout.subscriptionId).toBe(first.json().checkout.subscriptionId);
    expect((await create(70_000, {}, key)).statusCode).toBe(409);
    expect((await create(60_000, {}, 'bad key!')).statusCode).toBe(400);
  });

  it('Razorpay down → 503 and nothing stored', async () => {
    const before = await db.donationSubscription.count();
    subs.createSubscription.mockImplementationOnce(async () =>
      Promise.reject(new PaymentProviderError('network')),
    );
    expect((await create(80_000)).statusCode).toBe(503);
    expect(await db.donationSubscription.count()).toBe(before);
  });

  it('closed (503) when switched off, and the estimate says monthly is not offered', async () => {
    const off = buildApp(env({ RAZORPAY_SUBSCRIPTIONS_ENABLED: 'false' }), {
      db,
      paymentProvider: payments,
      subscriptionProvider: subs,
    });
    expect(
      (await off.inject({ method: 'POST', url: '/api/v1/subscriptions', payload: body(50_000) }))
        .statusCode,
    ).toBe(503);
    expect(
      (await off.inject({ method: 'GET', url: '/api/v1/donation-intents/estimate' })).json()
        .monthlyOffered,
    ).toBe(false);
    await off.close();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/donation-intents/estimate',
          remoteAddress: nextIp(),
        })
      ).json().monthlyOffered,
    ).toBe(true);
  });
});

describe('authorisation (UPI and eMandate) and the manage link', () => {
  it.each([
    ['UPI AutoPay', 150_000],
    ['eMandate / card', 2_000_000],
  ])(
    '%s: verified signature + Razorpay status → ACTIVE, manage link, email queued',
    async (_label, amount) => {
      const { created, verified } = await authorised(amount);
      expect(verified).toMatchObject({
        publicReference: created.publicReference,
        status: 'ACTIVE',
      });
      expect(verified.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const row = await db.donationSubscription.findUniqueOrThrow({
        where: { publicReference: created.publicReference },
      });
      expect(row.status).toBe('AUTHENTICATED');
      expect(JSON.stringify(row)).not.toContain(verified.manageToken);
      expect(
        await db.notificationOutbox.count({
          where: {
            entityRef: `donation_subscription:${row.id}`,
            template: 'donor_subscription_started',
          },
        }),
      ).toBe(1);
    },
  );

  it('a forged signature changes nothing; a wrong subscription ID is 404', async () => {
    const created = (await create(50_000)).json();
    const id = created.checkout.subscriptionId;
    remote.set(id, { ...remote.get(id)!, status: 'active' });
    expect((await verify(created.publicReference, id, '0'.repeat(64))).statusCode).toBe(400);
    expect(
      (
        await db.donationSubscription.findUniqueOrThrow({
          where: { publicReference: created.publicReference },
        })
      ).status,
    ).toBe('CREATED');
    expect((await verify(created.publicReference, 'sub_SOTHER00000')).statusCode).toBe(404);
    expect((await verify('TOT-M-000000000000', id)).statusCode).toBe(404);
  });

  it('Razorpay unreachable or not authorised yet → PENDING, no manage token', async () => {
    const created = (await create(50_000)).json();
    failNext.push('fetch');
    const res = (await verify(created.publicReference, created.checkout.subscriptionId)).json();
    expect(res).toEqual({ publicReference: created.publicReference, status: 'PENDING' });
    const again = (await verify(created.publicReference, created.checkout.subscriptionId)).json();
    expect(again.status).toBe('PENDING'); // still "created" at Razorpay
  });

  it('manage view: minimal fields, private headers; unknown or malformed tokens 404', async () => {
    const { created, verified } = await authorised(150_000);
    const res = await manage(verified.manageToken);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.json()).toMatchObject({
      publicReference: created.publicReference,
      amountPaise: 150_000,
      status: 'ACTIVE',
      methodRoute: 'upi_autopay',
      programme: null,
    });
    expect(res.body).not.toMatch(/Synthetic|monthly\.donor|9876|sub_/);
    for (const token of ['x', 'a'.repeat(43)]) expect((await manage(token)).statusCode).toBe(404);
  });

  it('cancel: cancels at Razorpay first, then records it; idempotent; needs confirm', async () => {
    const { verified, id } = await authorised(150_000);
    expect((await manage(verified.manageToken, 'cancel', {})).statusCode).toBe(400);
    const calls = subs.cancelSubscription.mock.calls.length;
    const res = await manage(verified.manageToken, 'cancel');
    expect(res.json().status).toBe('CANCELLED');
    expect(remote.get(id)?.status).toBe('cancelled');
    const row = await db.donationSubscription.findUniqueOrThrow({
      where: { providerSubscriptionId: id },
    });
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelledAt).not.toBeNull();
    expect((await manage(verified.manageToken, 'cancel')).json().status).toBe('CANCELLED');
    expect(subs.cancelSubscription.mock.calls.length - calls).toBe(1);
    // A later "active" from Razorpay cannot revive it.
    remote.set(id, { ...remote.get(id)!, status: 'active' });
    expect((await manage(verified.manageToken)).json().status).toBe('CANCELLED');
  });

  it('cancel when Razorpay fails: 503 and still active (never "cancelled" without the provider)', async () => {
    const { verified } = await authorised(150_000);
    failNext.push('cancel');
    expect((await manage(verified.manageToken, 'cancel')).statusCode).toBe(503);
    expect((await manage(verified.manageToken)).json().status).toBe('ACTIVE');
    subs.cancelSubscription.mockImplementationOnce(async (sid: string) => ({
      ...remote.get(sid)!,
      status: 'active',
    }));
    expect((await manage(verified.manageToken, 'cancel')).statusCode).toBe(503);
  });

  it('the email worker sends the manage link, and it opens the same subscription', async () => {
    const { created, verified } = await authorised(150_000, { locale: 'ta' });
    const sent: EmailMessage[] = [];
    const row = await db.donationSubscription.findUniqueOrThrow({
      where: { publicReference: created.publicReference },
    });
    await processDueNotifications({
      db,
      provider: { name: 'resend', send: async (m) => (sent.push(m), { id: 'x' }) },
      siteUrl: 'https://theonetrust.example',
      manageKey: MANAGE_KEY,
      now: () => new Date(Date.now() + 60_000),
      batchSize: 1000,
    });
    const outbox = await db.notificationOutbox.findFirstOrThrow({
      where: { entityRef: `donation_subscription:${row.id}` },
    });
    const mail = sent.find((m) => m.idempotencyKey === outbox.id)!;
    expect(mail.to).toBe('monthly.donor@example.org');
    expect(mail.text).toContain(`https://theonetrust.example/ta/manage/${verified.manageToken}`);
    expect(outbox.status).toBe('SENT');
  });

  it('the worker does not email a cancelled subscription, a missing one, or without a key', async () => {
    const { created, verified } = await authorised(150_000);
    await manage(verified.manageToken, 'cancel');
    const row = await db.donationSubscription.findUniqueOrThrow({
      where: { publicReference: created.publicReference },
    });
    await processDueNotifications({
      db,
      provider: { name: 'resend', send: async () => ({ id: 'x' }) },
      siteUrl: 'https://x.test',
      manageKey: MANAGE_KEY,
      now: () => new Date(Date.now() + 60_000),
      batchSize: 1000,
    });
    expect(
      (
        await db.notificationOutbox.findFirstOrThrow({
          where: { entityRef: `donation_subscription:${row.id}` },
        })
      ).lastError,
    ).toBe('not_active');
    const ghost = await db.notificationOutbox.create({
      data: {
        eventType: 't',
        entityRef: `donation_subscription:${crypto.randomUUID()}`,
        template: 'donor_subscription_started',
        dedupeKey: `ghost-${seq++}`,
      },
    });
    const noKey = await authorised(150_000, { donorEmail: 'x@example.org' });
    const noKeyRow = await db.donationSubscription.findUniqueOrThrow({
      where: { publicReference: noKey.created.publicReference },
    });
    const noEmail = await authorised(150_000, { donorEmail: null });
    const noEmailRow = await db.donationSubscription.findUniqueOrThrow({
      where: { publicReference: noEmail.created.publicReference },
    });
    await db.notificationOutbox.create({
      data: {
        eventType: 't',
        entityRef: `donation_subscription:${noEmailRow.id}`,
        template: 'donor_subscription_started',
        dedupeKey: `noemail-${seq++}`,
      },
    });
    await processDueNotifications({
      db,
      provider: { name: 'resend', send: async () => ({ id: 'x' }) },
      siteUrl: 'https://x.test',
      now: () => new Date(Date.now() + 60_000),
      batchSize: 1000,
    });
    expect(
      (await db.notificationOutbox.findUniqueOrThrow({ where: { id: ghost.id } })).lastError,
    ).toBe('entity_missing');
    expect(
      (
        await db.notificationOutbox.findFirstOrThrow({
          where: { entityRef: `donation_subscription:${noKeyRow.id}` },
        })
      ).lastError,
    ).toBe('no_link_key');
    expect(
      (
        await db.notificationOutbox.findFirstOrThrow({
          where: { entityRef: `donation_subscription:${noEmailRow.id}` },
        })
      ).lastError,
    ).toBe('no_donor_email');
  });

  it('the database refuses UPI AutoPay above ₹15,000 and a cancelled status without a time', async () => {
    const row = await db.donationSubscription.findFirstOrThrow({
      where: { methodRoute: 'upi_autopay' },
    });
    await expect(
      db.donationSubscription.update({ where: { id: row.id }, data: { amountPaise: 1_500_001 } }),
    ).rejects.toThrow(/upi_cap/);
    await expect(
      db.donationSubscription.update({
        where: { id: row.id },
        data: { status: 'CANCELLED', cancelledAt: null },
      }),
    ).rejects.toThrow(/cancelled_at/);
  });
});
