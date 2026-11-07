import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import type {
  CreateQrInput,
  PaymentProvider,
  ProviderPayment,
  ProviderQr,
} from '../donations/provider.ts';

/**
 * One-time UPI QR inside the donate pop-up (client, Nov 2026). IDs use the qr_Q / pay_Q / evt_Q
 * prefixes so they never collide with other database test files.
 */
const db = useTestDb();
const SECRET = 'qr-webhook-secret-0123456789';
const NOW = new Date('2026-11-07T06:00:00.000Z');
let clock = NOW;
let app: FastifyInstance;
let off: FastifyInstance;
let seq = 0;
let ip = 0;

const made: CreateQrInput[] = [];
const qrPayments = new Map<string, ProviderPayment[]>();
let failCreate = false;
let failImage = false;

const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_qrtest0001',
  verifyCheckoutSignature: () => false,
  fetchPayment: async () => Promise.reject(new Error('not used')),
  fetchOrderPayments: async () => [],
  createOrder: async (input) => ({
    orderId: `order_Q${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
  createQrCode: async (input): Promise<ProviderQr> => {
    if (failCreate) throw new Error('down');
    made.push(input);
    return {
      qrId: `qr_Q${String(++seq).padStart(8, '0')}`,
      imageUrl: `https://rzp.io/i/Q${seq}`,
      amountPaise: input.amountPaise,
      closeBy: input.closeBy,
    };
  },
  fetchQrPayments: async (qrId) => qrPayments.get(qrId) ?? [],
  fetchQrImage: async (url) => {
    if (failImage) throw new Error('down');
    return { contentType: 'image/png', data: Buffer.from(`PNG:${url}`) };
  },
};

beforeAll(async () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    RAZORPAY_WEBHOOK_SECRET: SECRET,
    RAZORPAY_QR_ENABLED: 'true',
  });
  app = buildApp(env, { db, paymentProvider: provider, now: () => clock });
  off = buildApp(loadEnv({ NODE_ENV: 'test' }), { db, paymentProvider: provider });
  await db.trustSettings.upsert({
    where: { id: 1 },
    create: { id: 1, maxDonationPaise: 50_000_000 },
    update: { maxDonationPaise: 50_000_000 },
  });
});
afterAll(async () => {
  await app.close();
  await off.close();
});

const body = (giftPaise: number, patch: Record<string, unknown> = {}) => ({
  giftPaise,
  currency: 'INR',
  programme: null,
  donorName: 'Synthetic Donor',
  donorEmail: 'd@example.org',
  hideNamePublicly: true,
  wantsReceipt: false,
  coverFee: false,
  consent: true,
  locale: 'en',
  channel: 'qr',
  ...patch,
});

function start(
  giftPaise: number,
  opts: { key?: string; target?: FastifyInstance; patch?: Record<string, unknown> } = {},
) {
  return (opts.target ?? app).inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: `10.66.0.${(ip++ % 250) + 1}`,
    headers: opts.key ? { 'idempotency-key': opts.key } : {},
    payload: body(giftPaise, opts.patch),
  });
}

function deliver(event: string, payload: Record<string, unknown>, id?: string) {
  const raw = JSON.stringify({ entity: 'event', event, payload, created_at: 1_800_000_000 });
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', SECRET).update(raw).digest('hex'),
      'x-razorpay-event-id': id ?? `evt_Q${String(++seq).padStart(10, '0')}`,
    },
    payload: raw,
  });
}

const payment = (amount: number, patch: Record<string, unknown> = {}) => ({
  id: `pay_Q${String(++seq).padStart(8, '0')}`,
  entity: 'payment',
  order_id: null,
  amount,
  currency: 'INR',
  status: 'captured',
  method: 'upi',
  amount_refunded: 0,
  ...patch,
});

async function qrDonation(giftPaise = 50_000) {
  const res = await start(giftPaise);
  expect(res.statusCode).toBe(201);
  const json = res.json() as {
    publicReference: string;
    amountPaise: number;
    qr: { imagePath: string; expiresAt: string };
  };
  const attempt = await db.paymentAttempt.findFirstOrThrow({
    where: { donationIntent: { publicReference: json.publicReference } },
  });
  return { ...json, qrId: attempt.providerOrderId };
}

const statusOf = async (ref: string) =>
  (await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } })).status;

describe('QR offer and creation', () => {
  it('the estimate says QR is offered, up to ₹2,000', async () => {
    const res = await app.inject({ url: '/api/v1/donation-intents/estimate?giftPaise=20000' });
    expect(res.json()).toMatchObject({ qrOffered: true, qrMaxPaise: 200_000 });
    const offRes = await off.inject({ url: '/api/v1/donation-intents/estimate' });
    expect(offRes.json()).toMatchObject({ qrOffered: false });
    expect(offRes.json()).not.toHaveProperty('qrMaxPaise');
  });

  it('makes a one-time QR for exactly the amount, with an expiry and no personal data', async () => {
    clock = NOW;
    const d = await qrDonation(50_000);
    expect(d.amountPaise).toBe(50_000);
    expect(d.qr.imagePath).toBe(`/donation-intents/${d.publicReference}/qr.png`);
    expect(d.qr.expiresAt).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString());
    const input = made.at(-1);
    expect(input).toMatchObject({ amountPaise: 50_000, reference: d.publicReference });
    expect(JSON.stringify(input)).not.toMatch(/Synthetic|example\.org/);
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.qrId },
    });
    expect(attempt).toMatchObject({ amountPaise: 50_000, qrImageUrl: expect.any(String) });
  });

  it('refuses QR above the cap, when switched off, and reports a provider failure', async () => {
    const big = await start(200_100);
    expect(big.statusCode).toBe(400);
    expect(big.json()).toMatchObject({ error: { fields: [{ issue: 'too_big_for_qr' }] } });
    const disabled = await start(20_000, { target: off });
    expect(disabled.json()).toMatchObject({ error: { fields: [{ issue: 'not_offered' }] } });
    failCreate = true;
    expect((await start(20_000)).statusCode).toBe(503);
    failCreate = false;
  });

  it('a retry with the same key returns the same QR (never a second one)', async () => {
    const key = 'qr-idem-key-000000000001';
    const first = await start(20_000, { key });
    const again = await start(20_000, { key });
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());
    expect((await start(50_000, { key })).statusCode).toBe(409);
  });
});

describe('QR image', () => {
  it('is served from the server while the QR can be paid, never cached', async () => {
    clock = NOW;
    const d = await qrDonation(20_000);
    const res = await app.inject({ url: `/api/v1${d.qr.imagePath}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toContain('PNG:https://rzp.io/i/');
    failImage = true;
    expect((await app.inject({ url: `/api/v1${d.qr.imagePath}` })).statusCode).toBe(503);
    failImage = false;
    clock = new Date(NOW.getTime() + 16 * 60_000);
    expect((await app.inject({ url: `/api/v1${d.qr.imagePath}` })).statusCode).toBe(404);
    clock = NOW;
    expect(
      (await app.inject({ url: '/api/v1/donation-intents/TOT-D-AAAAAAAAAAAA/qr.png' })).statusCode,
    ).toBe(404);
  });
});

describe('QR payment', () => {
  it('qr_code.credited (signed) makes the donation PAID; repeats change nothing', async () => {
    clock = NOW;
    const d = await qrDonation(50_000);
    const p = payment(50_000);
    const event = { payment: { entity: p }, qr_code: { entity: { id: d.qrId } } };
    expect((await deliver('qr_code.credited', event, 'evt_Qcredit0001')).statusCode).toBe(200);
    expect(await statusOf(d.publicReference)).toBe('PAID');
    await deliver('qr_code.credited', event, 'evt_Qcredit0001');
    await deliver('qr_code.credited', event);
    expect(await statusOf(d.publicReference)).toBe('PAID');
    // The same payment arriving as payment.captured is already linked: no exception.
    await deliver('payment.captured', { payment: { entity: p } });
    expect(await db.paymentException.count({ where: { providerPaymentId: p.id } })).toBe(0);
    // The image is gone once paid.
    expect((await app.inject({ url: `/api/v1${d.qr.imagePath}` })).statusCode).toBe(404);
  });

  it('a different amount on the QR goes to manual review', async () => {
    const d = await qrDonation(20_000);
    const p = payment(10_000);
    await deliver('qr_code.credited', {
      payment: { entity: p },
      qr_code: { entity: { id: d.qrId } },
    });
    expect(await statusOf(d.publicReference)).toBe('MANUAL_REVIEW');
  });

  it('payment.* before the credit: our QR notes are recognised, unknown ones are flagged', async () => {
    const d = await qrDonation(20_000);
    const early = payment(20_000, {
      order_id: 'order_RzpOwn0001',
      notes: { donation_reference: d.publicReference },
    });
    await deliver('payment.captured', { payment: { entity: early } });
    expect(await db.paymentException.count({ where: { providerPaymentId: early.id } })).toBe(0);
    // No notes, no order: flagged, then linked to the donation when the credit arrives.
    const d2 = await qrDonation(20_000);
    const bare = payment(20_000);
    await deliver('payment.captured', { payment: { entity: bare } });
    await deliver('qr_code.credited', {
      payment: { entity: bare },
      qr_code: { entity: { id: d2.qrId } },
    });
    const ex = await db.paymentException.findFirstOrThrow({
      where: { providerPaymentId: bare.id },
    });
    expect(ex.donationIntentId).not.toBeNull();
    expect(await statusOf(d2.publicReference)).toBe('PAID');
  });

  it('a credit on a QR we never made becomes an exception; malformed events are ignored', async () => {
    const p = payment(20_000);
    await deliver('qr_code.credited', {
      payment: { entity: p },
      qr_code: { entity: { id: 'qr_QNotOurs0001' } },
    });
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: p.id, kind: 'PAYMENT_MISMATCH' },
      }),
    ).toBe(1);
    await deliver('qr_code.credited', { qr_code: { entity: { id: 'bad' } } }, 'evt_Qbad000001');
    await deliver(
      'qr_code.closed',
      { qr_code: { entity: { id: 'qr_QNotOurs0001' } } },
      'evt_Qclose00001',
    );
    const rows = await db.webhookEvent.findMany({
      where: { providerEventId: { in: ['evt_Qbad000001', 'evt_Qclose00001'] } },
      orderBy: { providerEventId: 'asc' },
    });
    expect(rows.map((r) => [r.processingStatus, r.processingError])).toEqual([
      ['IGNORED', 'no_qr_entity'],
      ['IGNORED', 'qr_lifecycle'],
    ]);
  });

  it('the status re-check asks Razorpay for payments on the QR when the webhook is late', async () => {
    const d = await qrDonation(20_000);
    const status = () =>
      app.inject({ url: `/api/v1/donations/status/${d.publicReference}` }).then((r) => r.json());
    expect(await status()).toMatchObject({ status: 'PENDING' });
    qrPayments.set(d.qrId, [
      {
        paymentId: `pay_Q${String(++seq).padStart(8, '0')}`,
        orderId: null,
        amountPaise: 20_000,
        currency: 'INR',
        status: 'captured',
        method: 'upi',
        refundedPaise: 0,
      },
    ]);
    expect(await status()).toMatchObject({ status: 'PAID' });
  });
});
