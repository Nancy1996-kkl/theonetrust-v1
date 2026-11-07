import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { deriveAuthKeys } from '../../security/crypto.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';
import type { PaymentProvider } from '../donations/provider.ts';
import type { EmailMessage } from '../notifications/provider.ts';
import { processDueNotifications } from '../notifications/worker.ts';
import {
  razorpaySubscriptions,
  type ProviderSubscription,
  type SubscriptionProvider,
} from './provider.ts';

/**
 * Monthly giving lifecycle (#33): every Razorpay subscription event through the real webhook —
 * including pause/cancel done in the donor's UPI app — with each charge its own payment and
 * receipt, and repeated "charged" events never adding a second one.
 */
const db = useTestDb();
const KEY_SECRET = 'life-key-secret-000001';
const WEBHOOK_SECRET = 'life-webhook-secret-0001';
const AUTH_SECRET_KEY = randomBytes(32).toString('base64');
const ORIGIN = 'http://localhost:5173';
let app: FastifyInstance;
let seq = 0;
let ip = 0;
let send: (m: 'GET' | 'POST', url: string, body?: unknown) => Promise<LightMyRequestResponse>;

const remote = new Map<string, ProviderSubscription>();
const real = razorpaySubscriptions({ keyId: 'rzp_test_life000001', keySecret: KEY_SECRET });
let cancelCalls = 0;
const subs: SubscriptionProvider = {
  createPlan: async ({ amountPaise }) => ({
    planId: `plan_Y${String(amountPaise).padStart(9, '0')}`,
  }),
  createSubscription: async (input) => {
    const s = {
      subscriptionId: `sub_Y${String(++seq).padStart(10, '0')}`,
      planId: input.planId,
      status: 'created',
      startAt: null,
      chargeAt: null,
    };
    remote.set(s.subscriptionId, s);
    return s;
  },
  fetchSubscription: async (id) => remote.get(id)!,
  cancelSubscription: async (id) => {
    cancelCalls++;
    const s = { ...remote.get(id)!, status: 'cancelled' };
    remote.set(id, s);
    return s;
  },
  verifySubscriptionSignature: real.verifySubscriptionSignature,
};
const payments = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_life000001',
} as unknown as PaymentProvider;

beforeAll(async () => {
  app = buildApp(
    loadEnv({
      NODE_ENV: 'test',
      AUTH_SECRET_KEY,
      CORS_ORIGINS: ORIGIN,
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RAZORPAY_SUBSCRIPTIONS_ENABLED: 'true',
    }),
    { db, paymentProvider: payments, subscriptionProvider: subs },
  );
  const email = `${unique('life-owner')}@example.org`;
  await setOwnerPassword(db, email, 'river mango lamp seventeen');
  let cookie = '';
  let csrf = '';
  send = async (method, url, body) => {
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
    code: hotp(base32Decode(secret), timeStep(new Date())),
  });
});
afterAll(async () => {
  await app.close();
});

const nextIp = () => `10.33.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;

/** A monthly gift, created and authorised through #32's routes. */
async function monthly(amountPaise = 100_000, patch: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/subscriptions',
    remoteAddress: nextIp(),
    payload: {
      amountPaise,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Monthly Donor',
      donorEmail: 'life.donor@example.org',
      consent: true,
      mandateConsent: true,
      consentVersion: 'monthly-v1',
      locale: 'en',
      ...patch,
    },
  });
  const created = res.json();
  const subId = created.checkout.subscriptionId as string;
  remote.set(subId, { ...remote.get(subId)!, status: 'authenticated' });
  const paymentId = `pay_Y${String(++seq).padStart(8, '0')}`;
  const v = await app.inject({
    method: 'POST',
    url: '/api/v1/subscriptions/verify',
    remoteAddress: nextIp(),
    payload: {
      publicReference: created.publicReference,
      subscriptionId: subId,
      paymentId,
      signature: createHmac('sha256', KEY_SECRET).update(`${paymentId}|${subId}`).digest('hex'),
    },
  });
  const row = await db.donationSubscription.findUniqueOrThrow({
    where: { providerSubscriptionId: subId },
  });
  return { subId, row, manageToken: v.json().manageToken as string, created };
}

function event(
  type: string,
  subId: string,
  status: string,
  payment?: { id: string; amount: number; status?: string; order?: string | null },
  eventId?: string,
) {
  const raw = JSON.stringify({
    entity: 'event',
    event: type,
    payload: {
      subscription: {
        entity: { id: subId, entity: 'subscription', plan_id: 'plan_Y000100000', status },
      },
      ...(payment && {
        payment: {
          entity: {
            id: payment.id,
            entity: 'payment',
            order_id: payment.order === undefined ? `order_Y${payment.id.slice(5)}` : payment.order,
            invoice_id: 'inv_Y0000000001',
            amount: payment.amount,
            currency: 'INR',
            status: payment.status ?? 'captured',
            method: 'upi',
            amount_refunded: 0,
          },
        },
      }),
    },
  });
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex'),
      'x-razorpay-event-id': eventId ?? `evt_Y${String(++seq).padStart(10, '0')}`,
    },
    payload: raw,
  });
}

const payId = () => `pay_Y${String(++seq).padStart(8, '0')}`;
const statusOf = async (subId: string) =>
  (await db.donationSubscription.findUniqueOrThrow({ where: { providerSubscriptionId: subId } }))
    .status;
const chargesOf = (id: string) =>
  db.donationIntent.findMany({
    where: { subscriptionId: id },
    include: { receipts: true, paymentAttempts: true },
    orderBy: { createdAt: 'asc' },
  });

describe('status follows Razorpay', () => {
  it('authenticated → activated → paused (UPI app) → resumed → cancelled (UPI app); history recorded', async () => {
    const { subId, row } = await monthly();
    expect(row.status).toBe('AUTHENTICATED');
    await event('subscription.activated', subId, 'active');
    expect(await statusOf(subId)).toBe('ACTIVE');
    await event('subscription.paused', subId, 'paused');
    expect(await statusOf(subId)).toBe('PAUSED');
    await event('subscription.resumed', subId, 'active');
    expect(await statusOf(subId)).toBe('ACTIVE');
    await event('subscription.cancelled', subId, 'cancelled');
    const cancelled = await db.donationSubscription.findUniqueOrThrow({
      where: { providerSubscriptionId: subId },
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).not.toBeNull();
    // A late "active" never revives a cancelled gift.
    await event('subscription.activated', subId, 'active');
    expect(await statusOf(subId)).toBe('CANCELLED');
    const history = await db.subscriptionStatusEvent.findMany({
      where: { subscriptionId: row.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => [h.fromStatus, h.toStatus, h.source])).toEqual([
      ['CREATED', 'AUTHENTICATED', 'checkout_verify'],
      ['AUTHENTICATED', 'ACTIVE', 'webhook:subscription.activated'],
      ['ACTIVE', 'PAUSED', 'webhook:subscription.paused'],
      ['PAUSED', 'ACTIVE', 'webhook:subscription.resumed'],
      ['ACTIVE', 'CANCELLED', 'webhook:subscription.cancelled'],
    ]);
    await expect(
      db.subscriptionStatusEvent.deleteMany({ where: { subscriptionId: row.id } }),
    ).rejects.toThrow(/append-only/);
  });

  it('cancelled in the UPI app: the manage link shows it and does not call Razorpay again', async () => {
    const { subId, manageToken } = await monthly();
    await event('subscription.cancelled', subId, 'cancelled');
    const before = cancelCalls;
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/manage/${manageToken}/cancel`,
      remoteAddress: nextIp(),
      payload: { confirm: true },
    });
    expect(res.json().status).toBe('CANCELLED');
    expect(cancelCalls).toBe(before);
  });

  it('completed ends the gift; an unknown subscription becomes an owner exception', async () => {
    const { subId } = await monthly();
    await event('subscription.completed', subId, 'completed');
    expect(await statusOf(subId)).toBe('COMPLETED');
    const before = await db.paymentException.count({ where: { kind: 'PAYMENT_MISMATCH' } });
    expect((await event('subscription.activated', 'sub_YUNKNOWN0001', 'active')).statusCode).toBe(
      200,
    );
    expect(await db.paymentException.count({ where: { kind: 'PAYMENT_MISMATCH' } })).toBe(
      before + 1,
    );
    // An event without the subscription entity is stored as ignored.
    expect((await event('subscription.updated', subId, 'completed')).statusCode).toBe(200);
  });
});

describe('each charge is its own payment, with a receipt per charge', () => {
  it('charged → a PAID donation linked to the gift, with its own acknowledgement and emails', async () => {
    const { subId, row } = await monthly(100_000);
    const p = payId();
    expect(
      (await event('subscription.charged', subId, 'active', { id: p, amount: 100_000 })).statusCode,
    ).toBe(200);
    const [charge] = await chargesOf(row.id);
    expect(charge).toMatchObject({
      status: 'PAID',
      amountPaise: 100_000,
      channel: 'CHECKOUT',
      wantsReceipt: true,
    });
    expect(charge?.paymentAttempts[0]).toMatchObject({
      providerPaymentId: p,
      capturedPaise: 100_000,
    });
    expect(charge?.receipts).toHaveLength(1);
    expect(
      await db.notificationOutbox.count({ where: { entityRef: `donation_intent:${charge!.id}` } }),
    ).toBe(2);
    expect(await statusOf(subId)).toBe('ACTIVE');
  });

  it('a repeated "charged" event (new event ID, same payment) never adds a donation or a receipt', async () => {
    const { subId, row } = await monthly(100_000);
    const p = payId();
    await event('subscription.charged', subId, 'active', { id: p, amount: 100_000 });
    await event('subscription.charged', subId, 'active', { id: p, amount: 100_000 });
    await Promise.all([
      event('subscription.charged', subId, 'active', { id: p, amount: 100_000 }),
      event('subscription.charged', subId, 'active', { id: p, amount: 100_000 }),
    ]);
    const charges = await chargesOf(row.id);
    expect(charges).toHaveLength(1);
    expect(charges[0]?.receipts).toHaveLength(1);
    expect(await db.receipt.count({ where: { donationIntent: { subscriptionId: row.id } } })).toBe(
      1,
    );
  });

  it('two months → two donations and two receipts; the threshold applies per charge', async () => {
    const { subId, row } = await monthly(100_000);
    await event('subscription.charged', subId, 'active', { id: payId(), amount: 100_000 });
    await event('subscription.charged', subId, 'active', { id: payId(), amount: 100_000 });
    const charges = await chargesOf(row.id);
    expect(charges.map((c) => c.receipts.length)).toEqual([1, 1]);
    const small = await monthly(10_000); // ₹100 a month: below the ₹500 acknowledgement minimum
    await event('subscription.charged', small.subId, 'active', { id: payId(), amount: 10_000 });
    const [smallCharge] = await chargesOf(small.row.id);
    expect(smallCharge).toMatchObject({ status: 'PAID' });
    expect(smallCharge?.receipts).toHaveLength(0);
  });

  it('a charge of a different amount goes to review; a charge without an order ID still records once', async () => {
    const { subId, row } = await monthly(100_000);
    await event('subscription.charged', subId, 'active', { id: payId(), amount: 1_000 });
    expect((await chargesOf(row.id))[0]?.status).toBe('MANUAL_REVIEW');
    const p = payId();
    await event('subscription.charged', subId, 'active', { id: p, amount: 100_000, order: null });
    await event('subscription.charged', subId, 'active', { id: p, amount: 100_000, order: null });
    const noOrder = (await chargesOf(row.id)).filter(
      (c) => c.paymentAttempts[0]?.providerPaymentId === p,
    );
    expect(noOrder).toHaveLength(1);
    expect(noOrder[0]?.paymentAttempts[0]?.providerOrderId).toBe(`subpay_${p}`);
  });

  it('money after the gift ended is recorded and flagged for the owner', async () => {
    const { subId, row } = await monthly(100_000);
    await event('subscription.cancelled', subId, 'cancelled');
    await event('subscription.charged', subId, 'cancelled', { id: payId(), amount: 100_000 });
    expect(await chargesOf(row.id)).toHaveLength(1);
    expect(
      await db.paymentException.count({
        where: { subscriptionId: row.id, kind: 'PAYMENT_MISMATCH' },
      }),
    ).toBe(1);
  });

  it('the plain payment.captured for a monthly charge is not mistaken for an unknown payment', async () => {
    const before = await db.paymentException.count();
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: payId(),
            entity: 'payment',
            order_id: 'order_YSUBINV00001',
            invoice_id: 'inv_Y1',
            amount: 100_000,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            amount_refunded: 0,
          },
        },
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex'),
        'x-razorpay-event-id': `evt_YCAP${seq++}00`,
      },
      payload: raw,
    });
    expect(await db.paymentException.count()).toBe(before);
  });
});

describe('failed and halted charges', () => {
  it('pending: owner exception + donor email, gift stays active; halted: HALTED + exception + email', async () => {
    const { subId, row } = await monthly(100_000);
    await event('subscription.activated', subId, 'active');
    await event('subscription.pending', subId, 'pending', {
      id: payId(),
      amount: 100_000,
      status: 'failed',
    });
    expect(await statusOf(subId)).toBe('ACTIVE');
    await event('subscription.halted', subId, 'halted');
    expect(await statusOf(subId)).toBe('HALTED');
    const kinds = (await db.paymentException.findMany({ where: { subscriptionId: row.id } }))
      .map((x) => x.kind)
      .sort();
    expect(kinds).toEqual(['SUBSCRIPTION_CHARGE_FAILED', 'SUBSCRIPTION_HALTED']);
    expect(
      await db.notificationOutbox.count({
        where: {
          entityRef: `donation_subscription:${row.id}`,
          template: 'donor_subscription_problem',
        },
      }),
    ).toBe(2);
    // The owner's queue shows them with the monthly reference.
    const queue = (await send('GET', '/api/v1/admin/exceptions')).json();
    expect(
      queue.items
        .filter((i: { reference: string }) => i.reference === row.publicReference)
        .map((i: { kind: string }) => i.kind)
        .sort(),
    ).toEqual(['SUBSCRIPTION_CHARGE_FAILED', 'SUBSCRIPTION_HALTED']);
    // A halted mandate can come back when Razorpay says so.
    await event('subscription.activated', subId, 'active');
    expect(await statusOf(subId)).toBe('ACTIVE');
  });

  it('the problem email says "retrying" or "on hold", has the manage link, and is skipped once ended', async () => {
    const { subId, row, manageToken } = await monthly(100_000, { locale: 'ta' });
    await event('subscription.halted', subId, 'halted');
    const sent: EmailMessage[] = [];
    const deps = {
      db,
      provider: {
        name: 'resend' as const,
        send: async (m: EmailMessage) => (sent.push(m), { id: 'x' }),
      },
      siteUrl: 'https://theonetrust.example',
      manageKey: deriveAuthKeys(AUTH_SECRET_KEY).manage,
      now: () => new Date(Date.now() + 60_000),
      batchSize: 1000,
    };
    await processDueNotifications(deps);
    const outbox = await db.notificationOutbox.findFirstOrThrow({
      where: {
        entityRef: `donation_subscription:${row.id}`,
        template: 'donor_subscription_problem',
      },
    });
    const mail = sent.find((m) => m.idempotencyKey === outbox.id)!;
    expect(mail.text).toContain('நின்றுவிட்டது');
    expect(mail.text).toContain(`https://theonetrust.example/ta/manage/${manageToken}`);
    // Cancelled before the next problem email goes out: no alarming email.
    await event('subscription.pending', subId, 'pending', {
      id: payId(),
      amount: 100_000,
      status: 'failed',
    });
    await event('subscription.cancelled', subId, 'cancelled');
    await processDueNotifications(deps);
    const rows = await db.notificationOutbox.findMany({
      where: {
        entityRef: `donation_subscription:${row.id}`,
        template: 'donor_subscription_problem',
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.status)).toEqual(['SENT', 'CANCELLED']);
    // Retry wording when still active, and no email for a donor without an address.
    const active = await monthly(100_000);
    await event('subscription.pending', active.subId, 'pending', {
      id: payId(),
      amount: 100_000,
      status: 'failed',
    });
    await processDueNotifications({ ...deps, manageKey: undefined });
    const r = await db.notificationOutbox.findFirstOrThrow({
      where: {
        entityRef: `donation_subscription:${active.row.id}`,
        template: 'donor_subscription_problem',
      },
    });
    expect(sent.find((m) => m.idempotencyKey === r.id)?.text).toContain('try again');
    const noEmail = await monthly(100_000, { donorEmail: null, donorPhone: '98765 43210' });
    await event('subscription.pending', noEmail.subId, 'pending');
    expect(
      await db.notificationOutbox.count({
        where: {
          entityRef: `donation_subscription:${noEmail.row.id}`,
          template: 'donor_subscription_problem',
        },
      }),
    ).toBe(0);
    expect(await db.paymentException.count({ where: { subscriptionId: noEmail.row.id } })).toBe(1);
  });
});

describe('amounts above ₹15,000 (PhonePe/BHIM)', () => {
  it('are routed to eMandate or card with the warning, never UPI AutoPay', async () => {
    const { created, row } = await monthly(2_000_000);
    expect(created).toMatchObject({
      methodRoute: 'emandate_card',
      allowedMethods: ['emandate', 'card'],
      warning: 'psp_limit',
    });
    expect(row.methodRoute).toBe('emandate_card');
  });
});

describe('owner: monthly-giving list', () => {
  it('lists gifts with status, charges and open exceptions; detail has history and charges', async () => {
    const { subId, row } = await monthly(100_000);
    await event('subscription.activated', subId, 'active');
    await event('subscription.charged', subId, 'active', { id: payId(), amount: 100_000 });
    await event('subscription.pending', subId, 'pending');
    const list = (await send('GET', '/api/v1/admin/subscriptions?status=ACTIVE')).json();
    const item = list.items.find((i: { id: string }) => i.id === row.id);
    expect(item).toMatchObject({
      reference: row.publicReference,
      status: 'ACTIVE',
      charges: 1,
      paidCharges: 1,
      openExceptions: 1,
      methodRoute: 'upi_autopay',
    });
    expect(item.lastChargeAt).not.toBeNull();
    expect(list.items.every((i: { status: string }) => i.status === 'ACTIVE')).toBe(true);
    const detail = (await send('GET', `/api/v1/admin/subscriptions/${row.id}`)).json();
    expect(detail.history.map((h: { to: string }) => h.to)).toEqual(['AUTHENTICATED', 'ACTIVE']);
    expect(detail.chargeList[0]).toMatchObject({ status: 'PAID', amountPaise: 100_000 });
    expect(detail.exceptions[0]).toMatchObject({
      kind: 'SUBSCRIPTION_CHARGE_FAILED',
      status: 'OPEN',
    });
    expect(JSON.stringify(detail)).not.toMatch(/life\.donor@/);
    expect(
      (await send('GET', `/api/v1/admin/subscriptions/${crypto.randomUUID()}`)).statusCode,
    ).toBe(404);
    expect((await send('GET', '/api/v1/admin/subscriptions?status=NOPE')).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/subscriptions' })).statusCode,
    ).toBe(401);
  });
});
