import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import {
  razorpayProvider,
  type PaymentProvider,
  type ProviderPayment,
} from '../donations/provider.ts';

/**
 * Payment test suite (#28): whole donor journeys across the three paths that can touch a
 * payment — the Checkout callback (verify), the Razorpay webhook, and the donor status re-check —
 * in Razorpay test mode with a stubbed Razorpay API. Signatures use the production code.
 * Rule under test everywhere: only a server-verified, captured payment of the exact amount,
 * currency and order becomes PAID, exactly once, and nothing ever moves it backwards.
 */
const db = useTestDb();
const KEY_SECRET = 'suite-key-secret-0001';
const WEBHOOK_SECRET = 'suite-webhook-secret-0001';
let app: FastifyInstance;
let seq = 0;
let ip = 0;

/** What the stubbed Razorpay API answers (payments the "donor" made in test mode). */
const remote = new Map<string, ProviderPayment>();
const real = razorpayProvider({
  keyId: 'rzp_test_suite000001',
  keySecret: KEY_SECRET,
  fetch: async () => new Response('{}'),
});
const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_suite000001',
  verifyCheckoutSignature: real.verifyCheckoutSignature,
  createOrder: async (input) => ({
    orderId: `order_S${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
  fetchPayment: async (id) => {
    const p = remote.get(id);
    if (!p) throw new Error('unknown payment');
    return p;
  },
  fetchOrderPayments: async (orderId) => [...remote.values()].filter((p) => p.orderId === orderId),
};

beforeAll(() => {
  app = buildApp(loadEnv({ NODE_ENV: 'test', RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET }), {
    db,
    paymentProvider: provider,
  });
});
afterAll(async () => {
  await app.close();
});

const nextIp = () => `10.28.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;

function intentPayload(giftPaise: number, patch: Record<string, unknown> = {}) {
  return {
    giftPaise,
    currency: 'INR',
    programme: null,
    donorName: 'Synthetic Donor',
    donorEmail: 'donor@example.org',
    hideNamePublicly: true,
    wantsReceipt: false,
    coverFee: false,
    consent: true,
    locale: 'en',
    ...patch,
  };
}

const createIntent = (giftPaise: number, key?: string, patch: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: nextIp(),
    headers: key ? { 'idempotency-key': key } : {},
    payload: intentPayload(giftPaise, patch),
  });

async function donation(giftPaise = 100_000) {
  const res = await createIntent(giftPaise);
  expect(res.statusCode).toBe(201);
  const body = res.json() as { publicReference: string; checkout: { orderId: string } };
  return { ref: body.publicReference, orderId: body.checkout.orderId, amountPaise: giftPaise };
}

/** The donor pays in Razorpay test mode: the payment exists at Razorpay. */
function pays(orderId: string, amountPaise: number, patch: Partial<ProviderPayment> = {}) {
  const payment: ProviderPayment = {
    paymentId: `pay_S${String(++seq).padStart(8, '0')}`,
    orderId,
    amountPaise,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    refundedPaise: 0,
    ...patch,
  };
  remote.set(payment.paymentId, payment);
  return payment;
}

/** The Checkout success callback, signed like Razorpay unless a signature is given. */
const callback = (ref: string, orderId: string, paymentId: string, signature?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/payments/verify',
    remoteAddress: nextIp(),
    payload: {
      publicReference: ref,
      orderId,
      paymentId,
      signature:
        signature ??
        createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex'),
    },
  });

/** A webhook delivery, signed over the raw body unless a signature is given. */
function webhook(
  event: string,
  p: ProviderPayment,
  opts: { id?: string; signature?: string } = {},
) {
  const raw = JSON.stringify({
    entity: 'event',
    event,
    payload: {
      payment: {
        entity: {
          id: p.paymentId,
          entity: 'payment',
          order_id: p.orderId,
          amount: p.amountPaise,
          currency: p.currency,
          status: p.status,
          method: p.method,
          amount_refunded: p.refundedPaise,
        },
      },
    },
  });
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature':
        opts.signature ?? createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex'),
      'x-razorpay-event-id': opts.id ?? `evt_S${String(++seq).padStart(10, '0')}`,
    },
    payload: raw,
  });
}

const donorStatus = async (ref: string) =>
  (
    await app.inject({
      method: 'GET',
      url: `/api/v1/donations/status/${ref}`,
      remoteAddress: nextIp(),
    })
  ).json().status as string;
const ledger = async (ref: string) =>
  (await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } })).status;
const attemptsFor = async (orderId: string) =>
  db.paymentAttempt.findMany({ where: { providerOrderId: orderId } });

describe('success', () => {
  it('callback verifies → PAID; the delayed webhook later is absorbed (one payment, still PAID)', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise);
    expect((await callback(d.ref, d.orderId, p.paymentId)).json().status).toBe('PAID');
    expect(await ledger(d.ref)).toBe('PAID');

    const late = await webhook('payment.captured', p);
    expect(late.statusCode).toBe(200);
    expect(await ledger(d.ref)).toBe('PAID');
    const [attempt] = await attemptsFor(d.orderId);
    expect(attempt).toMatchObject({ providerPaymentId: p.paymentId, capturedPaise: 100_000 });
    expect(await donorStatus(d.ref)).toBe('PAID');
  });

  it('webhook first, callback later (the browser closed before returning) → PAID once', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise);
    await webhook('payment.authorized', { ...p, status: 'authorized' });
    expect(await ledger(d.ref)).not.toBe('PAID'); // authorized is not money received
    await webhook('payment.captured', p);
    expect(await ledger(d.ref)).toBe('PAID');
    expect((await callback(d.ref, d.orderId, p.paymentId)).json().status).toBe('PAID');
    expect(await attemptsFor(d.orderId)).toHaveLength(1);
  });

  it('no callback and no webhook yet: the status re-check asks Razorpay and finds it PAID', async () => {
    const d = await donation();
    expect(await donorStatus(d.ref)).toBe('PENDING');
    pays(d.orderId, d.amountPaise);
    expect(await donorStatus(d.ref)).toBe('PAID');
  });
});

describe('cancel and failure', () => {
  it('a cancelled Checkout leaves no payment: never PAID, the re-check stays PENDING', async () => {
    const d = await donation();
    expect(await donorStatus(d.ref)).toBe('PENDING');
    expect(await donorStatus(d.ref)).toBe('PENDING');
    expect(['CREATED', 'PENDING']).toContain(await ledger(d.ref));
  });

  it('a failed payment → FAILED; a forged success afterwards changes nothing', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise, { status: 'failed' });
    await webhook('payment.failed', p);
    expect(await ledger(d.ref)).toBe('FAILED');
    expect((await callback(d.ref, d.orderId, p.paymentId, 'f'.repeat(64))).statusCode).toBe(400);
    expect(await ledger(d.ref)).toBe('FAILED');
    expect(await donorStatus(d.ref)).toBe('FAILED');
  });

  it('failed attempt then a fresh donation: the retry is a new order, the failed one stays FAILED', async () => {
    const first = await donation();
    await webhook('payment.failed', pays(first.orderId, 100_000, { status: 'failed' }));
    const retry = await donation();
    expect(retry.orderId).not.toBe(first.orderId);
    const p = pays(retry.orderId, 100_000);
    expect((await callback(retry.ref, retry.orderId, p.paymentId)).json().status).toBe('PAID');
    expect(await ledger(first.ref)).toBe('FAILED');
  });
});

describe('duplicate, delayed and out-of-order webhooks', () => {
  it('the same event delivered three times is stored and applied once', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise);
    for (let i = 0; i < 3; i++) {
      expect((await webhook('payment.captured', p, { id: 'evt_suite_dup_0001' })).statusCode).toBe(
        200,
      );
    }
    expect(await db.webhookEvent.count({ where: { providerEventId: 'evt_suite_dup_0001' } })).toBe(
      1,
    );
    expect(await attemptsFor(d.orderId)).toHaveLength(1);
    expect(await ledger(d.ref)).toBe('PAID');
  });

  it('captured, then a stale authorized and a stale failed event: stays PAID', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise);
    await webhook('payment.captured', p);
    await webhook('payment.authorized', { ...p, status: 'authorized' });
    await webhook('payment.failed', { ...p, status: 'failed' });
    expect(await ledger(d.ref)).toBe('PAID');
  });

  it('a webhook delayed past a callback that reported failure cannot revive the donation', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise, { status: 'failed' });
    await callback(d.ref, d.orderId, p.paymentId);
    expect(await ledger(d.ref)).toBe('FAILED');
    await webhook('payment.authorized', { ...p, status: 'authorized' });
    expect(await ledger(d.ref)).toBe('FAILED');
  });
});

describe('mismatches never become PAID', () => {
  it('amount: a captured payment of a different amount → MANUAL_REVIEW + exception', async () => {
    const d = await donation(100_000);
    const p = pays(d.orderId, 10_000);
    expect((await callback(d.ref, d.orderId, p.paymentId)).json().status).not.toBe('PAID');
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW');
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: p.paymentId, kind: 'PAYMENT_MISMATCH' },
      }),
    ).toBeGreaterThan(0);
    await webhook('payment.captured', p);
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW');
  });

  it('currency: a non-INR payment (webhook path) → MANUAL_REVIEW', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise, { currency: 'USD' as 'INR' });
    await webhook('payment.captured', p);
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW');
  });

  it("order: a payment for another donation's order cannot pay this one", async () => {
    const a = await donation();
    const b = await donation();
    const p = pays(b.orderId, 100_000);
    // Signed for b's order but presented for a.
    const res = await callback(a.ref, b.orderId, p.paymentId);
    expect(res.statusCode).toBe(404);
    const swapped = await callback(
      a.ref,
      a.orderId,
      p.paymentId,
      createHmac('sha256', KEY_SECRET).update(`${b.orderId}|${p.paymentId}`).digest('hex'),
    );
    expect(swapped.statusCode).toBe(400);
    expect(await ledger(a.ref)).not.toBe('PAID');
  });

  it('a webhook for an order the trust never created → exception, no donation touched', async () => {
    const p = pays('order_SNOTOURS0001', 100_000);
    await webhook('payment.captured', p);
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: p.paymentId, kind: 'PAYMENT_MISMATCH' },
      }),
    ).toBe(1);
  });
});

describe('bad signatures', () => {
  it('callback and webhook with bad signatures are refused and change nothing', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise);
    const events = await db.webhookEvent.count();
    for (const signature of ['', 'x', '0'.repeat(64)]) {
      expect((await callback(d.ref, d.orderId, p.paymentId, signature)).statusCode).toBe(400);
      expect((await webhook('payment.captured', p, { signature })).statusCode).toBe(400);
    }
    expect(await db.webhookEvent.count()).toBe(events);
    expect(await ledger(d.ref)).toBe('CREATED');
    expect((await attemptsFor(d.orderId))[0]?.providerPaymentId).toBeNull();
  });
});

describe('refresh and back button', () => {
  it('re-submitting the same attempt (same Idempotency-Key) returns the same order, never a second one', async () => {
    const key = 'suite-refresh-key-0000000001';
    const first = await createIntent(100_000, key);
    const again = await createIntent(100_000, key);
    expect(again.json().checkout.orderId).toBe(first.json().checkout.orderId);
    expect(again.json().publicReference).toBe(first.json().publicReference);
    expect(await attemptsFor(first.json().checkout.orderId)).toHaveLength(1);
  });

  it('the callback replayed after a refresh, and status checks after back, stay PAID once', async () => {
    const d = await donation();
    const p = pays(d.orderId, d.amountPaise);
    for (let i = 0; i < 3; i++) {
      expect((await callback(d.ref, d.orderId, p.paymentId)).json().status).toBe('PAID');
      expect(await donorStatus(d.ref)).toBe('PAID');
    }
    expect(await attemptsFor(d.orderId)).toHaveLength(1);
    expect(
      await db.paymentException.count({ where: { donationIntent: { publicReference: d.ref } } }),
    ).toBe(0);
  });
});

describe('amounts: ₹1 and limits', () => {
  it('a ₹1 donation goes all the way to PAID', async () => {
    const d = await donation(100);
    const p = pays(d.orderId, 100);
    expect((await callback(d.ref, d.orderId, p.paymentId)).json()).toMatchObject({
      status: 'PAID',
      amountPaise: 100,
    });
  });

  it.each([
    ['below ₹1', 99],
    ['zero', 0],
    ['fractional paise', 100.5],
    ['above the online maximum', 50_000_001],
  ])('%s is refused before any order is created', async (_label, giftPaise) => {
    const orders = await db.paymentAttempt.count();
    const res = await createIntent(giftPaise);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await db.paymentAttempt.count()).toBe(orders);
  });

  it('a non-INR intent is refused', async () => {
    expect((await createIntent(100_000, undefined, { currency: 'USD' })).statusCode).toBe(400);
  });
});

describe('unmatched bank-transfer credits', () => {
  it('a credit Razorpay reports with no order (Smart Collect) is an exception; nothing is paid', async () => {
    const paidBefore = await db.donationIntent.count({ where: { status: 'PAID' } });
    const p = pays('', 250_000, { method: 'bank_transfer' });
    const raw = JSON.stringify({
      event: 'virtual_account.credited',
      payload: {
        payment: {
          entity: {
            id: p.paymentId,
            entity: 'payment',
            order_id: null,
            amount: 250_000,
            currency: 'INR',
            status: 'captured',
            method: 'bank_transfer',
            amount_refunded: 0,
          },
        },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex'),
        'x-razorpay-event-id': 'evt_suite_va_00001',
      },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: p.paymentId, kind: 'UNMATCHED_CREDIT' },
      }),
    ).toBe(1);
    expect(await db.donationIntent.count({ where: { status: 'PAID' } })).toBe(paidBefore);
  });
});

describe('test mode only', () => {
  it('a live key is refused outside production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'test',
        RAZORPAY_KEY_ID: ['rzp', 'live', 'suite000001'].join('_'),
        RAZORPAY_KEY_SECRET: KEY_SECRET,
      }),
    ).toThrow();
    expect(provider.publicKeyId.startsWith('rzp_test_')).toBe(true);
  });
});
