import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import type { PaymentProvider } from '../donations/provider.ts';
import * as reconcile from './reconcile.ts';

const db = useTestDb();
const SECRET = 'webhook-secret-0123456789';
let app: FastifyInstance;
let seq = 0;
let ip = 0;

const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_abcdefgh12',
  verifyCheckoutSignature: () => false,
  fetchPayment: async () => Promise.reject(new Error('not used')),
  fetchOrderPayments: async () => [],
  createOrder: async (input) => ({
    orderId: `order_W${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
};

beforeAll(() => {
  app = buildApp(loadEnv({ NODE_ENV: 'test', RAZORPAY_WEBHOOK_SECRET: SECRET }), {
    db,
    paymentProvider: provider,
  });
});
afterAll(async () => {
  await app.close();
});

async function donation() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: `10.11.0.${(ip++ % 250) + 1}`,
    payload: {
      giftPaise: 100_000,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Donor',
      donorEmail: 'd@example.org',
      hideNamePublicly: true,
      wantsReceipt: false,
      coverFee: false,
      consent: true,
      locale: 'en',
    },
  });
  const body = res.json() as { publicReference: string; checkout: { orderId: string } };
  return { ref: body.publicReference, orderId: body.checkout.orderId };
}

const paymentEntity = (orderId: string | null, patch: Record<string, unknown> = {}) => ({
  id: `pay_W${String(++seq).padStart(8, '0')}`,
  entity: 'payment',
  order_id: orderId,
  amount: 100_000,
  currency: 'INR',
  status: 'captured',
  method: 'upi',
  amount_refunded: 0,
  ...patch,
});

function deliver(
  event: string,
  payload: Record<string, unknown>,
  opts: { id?: string; signature?: string; raw?: string } = {},
) {
  const raw =
    opts.raw ?? JSON.stringify({ entity: 'event', event, payload, created_at: 1_800_000_000 });
  const signature = opts.signature ?? createHmac('sha256', SECRET).update(raw).digest('hex');
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': opts.id ?? `evt_${String(++seq).padStart(10, '0')}`,
    },
    payload: raw,
  });
}

const statusOf = async (ref: string) =>
  (await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } })).status;

describe('signature', () => {
  it('an invalid signature is rejected and changes nothing (no event stored, no status change)', async () => {
    const d = await donation();
    const before = await db.webhookEvent.count();
    const p = paymentEntity(d.orderId);
    for (const signature of [
      '0'.repeat(64),
      'nope',
      createHmac('sha256', 'wrong-secret-0000000').update('x').digest('hex'),
    ]) {
      const res = await deliver('payment.captured', { payment: { entity: p } }, { signature });
      expect(res.statusCode).toBe(400);
    }
    // Signed body, then tampered amount: the signature no longer matches.
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: p } } });
    const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
    const tampered = raw.replace('"amount":100000', '"amount":1');
    expect(
      (await deliver('payment.captured', {}, { raw: tampered, signature: sig })).statusCode,
    ).toBe(400);
    expect(await db.webhookEvent.count()).toBe(before);
    expect(await statusOf(d.ref)).toBe('CREATED');
  });

  it('a missing event ID is refused', async () => {
    const raw = JSON.stringify({ event: 'payment.captured', payload: {} });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': createHmac('sha256', SECRET).update(raw).digest('hex'),
      },
      payload: raw,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('payment events', () => {
  it('payment.captured → PAID, event stored as PROCESSED', async () => {
    const d = await donation();
    const p = paymentEntity(d.orderId);
    const res = await deliver(
      'payment.captured',
      { payment: { entity: p } },
      { id: 'evt_captured_0001' },
    );
    expect(res.json()).toEqual({ received: true });
    expect(await statusOf(d.ref)).toBe('PAID');
    const event = await db.webhookEvent.findFirstOrThrow({
      where: { providerEventId: 'evt_captured_0001' },
    });
    expect(event).toMatchObject({
      eventType: 'payment.captured',
      signatureValid: true,
      processingStatus: 'PROCESSED',
      attempts: 1,
    });
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.orderId },
    });
    expect(attempt).toMatchObject({
      providerPaymentId: p.id,
      providerStatus: 'captured',
      capturedPaise: 100_000,
    });
  });

  it('duplicate events create no duplicate records and are acknowledged', async () => {
    const d = await donation();
    const p = paymentEntity(d.orderId);
    const first = await deliver(
      'payment.captured',
      { payment: { entity: p } },
      { id: 'evt_dup_000001' },
    );
    const again = await deliver(
      'payment.captured',
      { payment: { entity: p } },
      { id: 'evt_dup_000001' },
    );
    expect(first.json()).toEqual({ received: true });
    expect(again.json()).toEqual({ received: true, duplicate: true });
    expect(await db.webhookEvent.count({ where: { providerEventId: 'evt_dup_000001' } })).toBe(1);
    expect(await db.paymentAttempt.count({ where: { providerPaymentId: p.id } })).toBe(1);
  });

  it('out of order: captured then a late authorized/failed never moves PAID backwards', async () => {
    const d = await donation();
    const p = paymentEntity(d.orderId);
    await deliver('payment.captured', { payment: { entity: p } });
    await deliver('payment.authorized', { payment: { entity: { ...p, status: 'authorized' } } });
    await deliver('payment.failed', { payment: { entity: { ...p, status: 'failed' } } });
    expect(await statusOf(d.ref)).toBe('PAID');
  });

  it('authorized then captured; order.paid works too; failed → FAILED', async () => {
    const a = await donation();
    const pa = paymentEntity(a.orderId, { status: 'authorized' });
    await deliver('payment.authorized', { payment: { entity: pa } });
    expect(await statusOf(a.ref)).toBe('AUTHORIZED');
    await deliver('order.paid', {
      payment: { entity: { ...pa, status: 'captured' } },
      order: { entity: { id: a.orderId } },
    });
    expect(await statusOf(a.ref)).toBe('PAID');
    const f = await donation();
    await deliver('payment.failed', {
      payment: { entity: paymentEntity(f.orderId, { status: 'failed' }) },
    });
    expect(await statusOf(f.ref)).toBe('FAILED');
  });

  it('a mismatched amount goes to MANUAL_REVIEW, not PAID', async () => {
    const d = await donation();
    await deliver('payment.captured', {
      payment: { entity: paymentEntity(d.orderId, { amount: 50 }) },
    });
    expect(await statusOf(d.ref)).toBe('MANUAL_REVIEW');
  });

  it('a payment for an order we never created becomes an exception', async () => {
    const p = paymentEntity('order_NotOurs0001');
    await deliver('payment.captured', { payment: { entity: p } });
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: p.id, kind: 'PAYMENT_MISMATCH' },
      }),
    ).toBe(1);
    const noOrder = paymentEntity(null);
    await deliver('payment.captured', { payment: { entity: noOrder } });
    expect(await db.paymentException.count({ where: { providerPaymentId: noOrder.id } })).toBe(1);
  });

  it('a virtual-account credit (Smart Collect not enabled) becomes an exception for the owner', async () => {
    const p = paymentEntity(null, { method: 'bank_transfer' });
    await deliver('virtual_account.credited', {
      payment: { entity: p },
      virtual_account: { entity: {} },
    });
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: p.id, kind: 'UNMATCHED_CREDIT' },
      }),
    ).toBe(1);
    await deliver('virtual_account.credited', {});
  });

  it('unhandled events and events without a payment are stored as IGNORED', async () => {
    await deliver('subscription.charged', { subscription: {} }, { id: 'evt_ignored_001' });
    await deliver('payment.captured', {}, { id: 'evt_ignored_002' });
    const rows = await db.webhookEvent.findMany({
      where: { providerEventId: { in: ['evt_ignored_001', 'evt_ignored_002'] } },
    });
    expect(rows.map((r) => r.processingStatus)).toEqual(['IGNORED', 'IGNORED']);
  });

  it('a malformed payment entity is recorded as FAILED (500, so Razorpay retries); the retry processes it', async () => {
    const d = await donation();
    const bad = await deliver(
      'payment.captured',
      { payment: { entity: { id: 'x' } } },
      { id: 'evt_retry_00001' },
    );
    expect(bad.statusCode).toBe(500);
    expect(
      (await db.webhookEvent.findFirstOrThrow({ where: { providerEventId: 'evt_retry_00001' } }))
        .processingStatus,
    ).toBe('FAILED');
    const ok = await deliver(
      'payment.captured',
      { payment: { entity: paymentEntity(d.orderId) } },
      { id: 'evt_retry_00001' },
    );
    expect(ok.statusCode).toBe(200);
    const row = await db.webhookEvent.findFirstOrThrow({
      where: { providerEventId: 'evt_retry_00001' },
    });
    expect(row).toMatchObject({ processingStatus: 'PROCESSED', attempts: 2 });
    expect(await statusOf(d.ref)).toBe('PAID');
  });

  it('a concurrent duplicate insert is acknowledged as a duplicate', async () => {
    const spy = vi.spyOn(db.webhookEvent, 'findUnique').mockResolvedValueOnce(null);
    await deliver('subscription.charged', {}, { id: 'evt_race_000001' });
    spy.mockResolvedValueOnce(null);
    const res = await deliver('subscription.charged', {}, { id: 'evt_race_000001' });
    expect(res.json()).toEqual({ received: true, duplicate: true });
    spy.mockRestore();
  });
});

describe('refund events', () => {
  async function paid() {
    const d = await donation();
    const p = paymentEntity(d.orderId);
    await deliver('payment.captured', { payment: { entity: p } });
    return { ...d, p };
  }

  it('full refund: created → REFUND_PENDING, processed → REFUNDED; nothing deleted', async () => {
    const d = await paid();
    await deliver('refund.created', {
      refund: { entity: { status: 'pending' } },
      payment: { entity: { ...d.p, status: 'refunded', amount_refunded: 100_000 } },
    });
    expect(await statusOf(d.ref)).toBe('REFUND_PENDING');
    await deliver('refund.processed', {
      refund: { entity: { status: 'processed' } },
      payment: { entity: { ...d.p, status: 'refunded', amount_refunded: 100_000 } },
    });
    expect(await statusOf(d.ref)).toBe('REFUNDED');
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.orderId },
    });
    expect(attempt).toMatchObject({ refundedPaise: 100_000, capturedPaise: 100_000 });
  });

  it('processed without a prior created event still ends REFUNDED; partial refund stays PAID', async () => {
    const d = await paid();
    await deliver('refund.processed', {
      payment: { entity: { ...d.p, amount_refunded: 100_000 } },
    });
    expect(await statusOf(d.ref)).toBe('REFUNDED');
    const partial = await paid();
    await deliver('refund.processed', {
      payment: { entity: { ...partial.p, amount_refunded: 40_000 } },
    });
    expect(await statusOf(partial.ref)).toBe('PAID');
    expect(
      (await db.paymentAttempt.findUniqueOrThrow({ where: { providerOrderId: partial.orderId } }))
        .refundedPaise,
    ).toBe(40_000);
  });

  it('a failed refund returns the donation to PAID; a refund for an unknown payment is an exception', async () => {
    const d = await paid();
    await deliver('refund.created', { payment: { entity: { ...d.p, amount_refunded: 100_000 } } });
    await deliver('refund.failed', { payment: { entity: { ...d.p, amount_refunded: 0 } } });
    expect(await statusOf(d.ref)).toBe('PAID');
    await deliver('refund.failed', { payment: { entity: { ...d.p } } });
    expect(await statusOf(d.ref)).toBe('PAID');
    const stranger = paymentEntity('order_Nope00001');
    await deliver('refund.processed', { payment: { entity: stranger } });
    expect(await db.paymentException.count({ where: { providerPaymentId: stranger.id } })).toBe(1);
  });

  it('applyRefund is exported for reuse', () => {
    expect(typeof reconcile.applyRefund).toBe('function');
  });
});
