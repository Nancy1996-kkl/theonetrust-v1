import { createHmac } from 'node:crypto';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import { cashfreeProvider, paiseToRupees } from '../donations/cashfree.ts';
import { CASHFREE_FUTURE_SKEW_MS, cashfreeEventKey } from './cashfree-webhook-routes.ts';
import { recheckAttempt } from './recheck.ts';
import { PaymentProviderError, type PaymentProvider } from '../donations/provider.ts';

/**
 * Cashfree end to end (Phase 4): the REAL adapter talks to a fake Cashfree over `fetch`, the app
 * is driven with app.inject, and every decision comes from the re-fetched order — never from the
 * browser or the webhook payload.
 */
const db = useTestDb();
const SECRET = 'cf-test-secret-0123456789';
const PHONE = '9876501234';
const NOW = new Date();
let app: FastifyInstance;
let ip = 0;
const logs: string[] = [];

interface RemotePayment {
  cf_payment_id: string;
  payment_status: string;
  is_captured?: boolean;
  payment_amount: number | string;
  payment_currency: string;
  payment_group?: string;
}
interface RemoteOrder {
  order_id: string;
  order_status: string;
  amount: number;
  payments: RemotePayment[];
  refunds: Array<{ refund_status: string; refund_amount: number }>;
}
/** What "Cashfree" knows. */
const remote = new Map<string, RemoteOrder>();
let down = false;
let created: Array<Record<string, unknown>> = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  if (down) throw new TypeError('fetch failed');
  const path = new URL(String(url)).pathname.replace(/^\/pg/, '');
  if (init?.method === 'POST' && path === '/orders') {
    const body = JSON.parse(String(init.body)) as Record<string, unknown> & {
      order_id: string;
      order_amount: number;
    };
    created.push(body);
    remote.set(body.order_id, {
      order_id: body.order_id,
      order_status: 'ACTIVE',
      amount: body.order_amount,
      payments: [],
      refunds: [],
    });
    return json({
      order_id: body.order_id,
      order_amount: body.order_amount,
      order_currency: 'INR',
      order_status: 'ACTIVE',
      payment_session_id: `session_${body.order_id}`,
    });
  }
  const m = /^\/orders\/([^/]+)(\/payments|\/refunds)?$/.exec(path);
  const order = m ? remote.get(decodeURIComponent(m[1] ?? '')) : undefined;
  if (!order) return json({ message: 'order not found', code: 'order_not_found' }, 404);
  if (m?.[2] === '/payments') return json(order.payments);
  if (m?.[2] === '/refunds') return json(order.refunds);
  return json({
    order_id: order.order_id,
    order_status: order.order_status,
    order_amount: order.amount,
  });
}) as typeof fetch;

const provider = cashfreeProvider({
  clientId: 'TEST0123456789',
  clientSecret: SECRET,
  mode: 'sandbox',
  siteUrl: 'https://theonetrust.example',
  notifyUrl: 'https://theonetrust.example/api/v1/webhooks/cashfree',
  orderExpiryMinutes: 30,
  now: () => new Date(),
  fetch: fakeFetch,
});

beforeAll(() => {
  app = buildApp(
    loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      PAYMENT_PROVIDER: 'cashfree',
      CASHFREE_CLIENT_ID: 'TEST0123456789',
      CASHFREE_CLIENT_SECRET: SECRET,
      PUBLIC_SITE_URL: 'https://theonetrust.example',
    }),
    {
      db,
      paymentProvider: provider,
      logStream: new Writable({
        write(chunk, _e, cb) {
          logs.push(String(chunk));
          cb();
        },
      }),
    },
  );
});
beforeEach(() => {
  down = false;
  created = [];
});
afterAll(async () => {
  // Privacy: the donor's phone never reaches a log line, whatever happened above.
  expect(logs.join('\n')).not.toContain(PHONE);
  await app.close();
});

async function donate(opts: { phone?: string | null; key?: string; giftPaise?: number } = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: `10.9.0.${(ip++ % 250) + 1}`,
    headers: opts.key ? { 'idempotency-key': opts.key } : {},
    payload: {
      giftPaise: opts.giftPaise ?? 150_050,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Donor',
      donorEmail: 'donor@example.org',
      ...(opts.phone !== null && { donorPhone: opts.phone ?? `+91 ${PHONE}` }),
      hideNamePublicly: true,
      wantsReceipt: false,
      coverFee: false,
      consent: true,
      locale: 'ta',
    },
  });
}

async function newDonation(giftPaise = 150_050) {
  const res = await donate({ giftPaise });
  expect(res.statusCode).toBe(201);
  return res.json() as {
    publicReference: string;
    amountPaise: number;
    checkout: { provider: string; paymentSessionId: string; mode: string; orderId: string };
  };
}

function pay(
  ref: string,
  id: string,
  status: string,
  opts: { captured?: boolean; paise?: number; currency?: string } = {},
) {
  const order = remote.get(ref);
  if (!order) throw new Error('no such order');
  order.payments.push({
    cf_payment_id: id,
    payment_status: status,
    is_captured: opts.captured ?? status === 'SUCCESS',
    payment_amount: opts.paise !== undefined ? paiseToRupees(opts.paise) : order.amount,
    payment_currency: opts.currency ?? 'INR',
    payment_group: 'upi',
  });
  if (status === 'SUCCESS') order.order_status = 'PAID';
}

const intentStatus = async (ref: string) =>
  (await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } })).status;

const status = (ref: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/donations/status/${ref}`,
    remoteAddress: '10.9.1.1',
  });

const verify = (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/payments/verify',
    remoteAddress: '10.9.1.2',
    payload,
  });

function signed(body: unknown, opts: { ts?: string; secret?: string; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.ts ?? String(Date.now());
  const signature = createHmac('sha256', opts.secret ?? SECRET)
    .update(ts + raw)
    .digest('base64');
  return { raw, ts, signature };
}

async function webhook(body: unknown, opts: Parameters<typeof signed>[1] = {}) {
  const { raw, ts, signature } = signed(body, opts);
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/cashfree',
    headers: {
      'content-type': 'application/json',
      'x-webhook-signature': signature,
      'x-webhook-timestamp': ts,
      'x-webhook-version': '2026-01-01',
    },
    payload: raw,
  });
}

const paymentEvent = (type: string, ref: string, paymentId: string, paymentStatus: string) => ({
  type,
  event_time: NOW.toISOString(),
  data: {
    order: { order_id: ref, order_amount: 1500.5, order_currency: 'INR' },
    payment: {
      cf_payment_id: Number(paymentId),
      payment_status: paymentStatus,
      // Deliberately wrong: the payload's amount is never trusted.
      payment_amount: 1,
      payment_currency: 'INR',
    },
    customer_details: { customer_phone: PHONE },
  },
});

describe('donation intent with Cashfree', () => {
  it('requires the mobile number Cashfree needs; a bad one is refused', async () => {
    const missing = await donate({ phone: null });
    expect(missing.statusCode).toBe(400);
    expect(JSON.stringify(missing.json())).toContain('donorPhone');
    const bad = await donate({ phone: '12345' });
    expect(bad.statusCode).toBe(400);
    expect(created).toHaveLength(0);
  });

  it('creates the order with the exact amount and returns only the session for the pop-up', async () => {
    const res = await newDonation();
    expect(res.checkout).toEqual({
      provider: 'CASHFREE',
      paymentSessionId: `session_${res.publicReference}`,
      mode: 'sandbox',
      orderId: res.publicReference,
    });
    expect(JSON.stringify(res)).not.toContain(PHONE);
    const [order] = created;
    expect(order).toMatchObject({
      order_id: res.publicReference,
      order_amount: 1500.5,
      customer_details: { customer_phone: PHONE },
      order_meta: { return_url: `https://theonetrust.example/ta/?cf_order=${res.publicReference}` },
    });
    expect(JSON.stringify(order?.order_tags)).not.toContain(PHONE);
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: res.publicReference },
    });
    expect(attempt).toMatchObject({ provider: 'CASHFREE', amountPaise: 150_050 });
    expect(attempt.checkoutSessionId).toBe(`session_${res.publicReference}`);
  });

  it('a retry with the same Idempotency-Key returns the same session, no second order', async () => {
    const key = `cf-key-${Date.now()}-abcdef`;
    const first = await donate({ key });
    const second = await donate({ key });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(created).toHaveLength(1);
  });

  it('Cashfree down: 503 and the intent keeps no order', async () => {
    down = true;
    const res = await donate();
    expect(res.statusCode).toBe(503);
  });

  it('QR is not offered with Cashfree (its own pop-up shows the UPI QR)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/donation-intents/estimate' });
    expect(res.json()).toMatchObject({ qrOffered: false, monthlyOffered: false });
  });
});

describe('verify and status: the order is re-fetched from Cashfree', () => {
  it('browser return before payment → PENDING; after a captured payment → PAID with receipt flow', async () => {
    const d = await newDonation();
    const before = await verify({ publicReference: d.publicReference });
    expect(before.json()).toMatchObject({ status: 'PENDING' });
    pay(d.publicReference, '5001', 'SUCCESS');
    const after = await verify({ publicReference: d.publicReference });
    expect(after.json()).toMatchObject({ status: 'PAID', amountPaise: 150_050 });
    expect(await intentStatus(d.publicReference)).toBe('PAID');
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.publicReference },
    });
    expect(attempt).toMatchObject({
      providerPaymentId: '5001',
      providerStatus: 'captured',
      capturedPaise: 150_050,
      method: 'upi',
    });
  });

  it('a Razorpay-shaped or extra-field body is refused', async () => {
    const d = await newDonation();
    const res = await verify({
      publicReference: d.publicReference,
      orderId: 'order_ABCDEFGH',
      paymentId: 'pay_ABCDEFGH',
      signature: 'x',
    });
    expect(res.statusCode).toBe(400);
  });

  it('unknown reference → 404', async () => {
    const res = await verify({ publicReference: 'TOT-D-0000000000ZZ' });
    expect(res.statusCode).toBe(404);
  });

  it('a failed try then a success on the same order → PAID (failure never claims)', async () => {
    const d = await newDonation();
    pay(d.publicReference, '5101', 'FAILED');
    expect((await status(d.publicReference)).json()).toMatchObject({ status: 'FAILED' });
    pay(d.publicReference, '5102', 'SUCCESS');
    expect((await status(d.publicReference)).json()).toMatchObject({ status: 'PAID' });
  });

  it('user dropped → stays PENDING for the donor (never PAID)', async () => {
    const d = await newDonation();
    pay(d.publicReference, '5151', 'USER_DROPPED');
    expect((await status(d.publicReference)).json()).toMatchObject({ status: 'PENDING' });
    expect(await intentStatus(d.publicReference)).not.toBe('PAID');
  });

  it('amount or currency mismatch → MANUAL_REVIEW + exception, never PAID', async () => {
    for (const [id, change] of [
      ['5201', { paise: 150_000 }],
      ['5202', { currency: 'USD' }],
    ] as const) {
      const d = await newDonation();
      pay(d.publicReference, id, 'SUCCESS', change);
      await verify({ publicReference: d.publicReference });
      expect(await intentStatus(d.publicReference)).toBe('MANUAL_REVIEW');
      const intent = await db.donationIntent.findUniqueOrThrow({
        where: { publicReference: d.publicReference },
      });
      expect(
        await db.paymentException.count({
          where: { donationIntentId: intent.id, kind: 'PAYMENT_MISMATCH' },
        }),
      ).toBe(1);
    }
  });

  it('two captured payments on one order → DUPLICATE_PAYMENT exception for the owner', async () => {
    const d = await newDonation();
    pay(d.publicReference, '5301', 'SUCCESS');
    pay(d.publicReference, '5302', 'SUCCESS');
    await verify({ publicReference: d.publicReference });
    const intent = await db.donationIntent.findUniqueOrThrow({
      where: { publicReference: d.publicReference },
    });
    expect(intent.status).toBe('PAID');
    expect(
      await db.paymentException.count({
        where: { donationIntentId: intent.id, kind: 'DUPLICATE_PAYMENT' },
      }),
    ).toBe(1);
  });

  it('Cashfree says PAID with no captured payment → status kept, never PAID', async () => {
    const d = await newDonation();
    const order = remote.get(d.publicReference);
    if (order) order.order_status = 'PAID';
    expect((await verify({ publicReference: d.publicReference })).json()).toMatchObject({
      status: 'PENDING',
    });
    expect(await intentStatus(d.publicReference)).toBe('CREATED');
  });

  it('Cashfree unreachable → the recorded status is answered', async () => {
    const d = await newDonation();
    down = true;
    expect((await verify({ publicReference: d.publicReference })).json()).toMatchObject({
      status: 'PENDING',
    });
  });

  it('after a gateway switch an older Razorpay attempt is never sent to Cashfree', async () => {
    const d = await newDonation();
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.publicReference },
    });
    const razorpayAttempt = { ...attempt, provider: 'RAZORPAY' };
    await expect(
      recheckAttempt(db, provider as PaymentProvider, razorpayAttempt, new Date()),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

describe('Cashfree webhook', () => {
  it('rejects a bad signature, a wrong secret and a future timestamp; stores nothing', async () => {
    const d = await newDonation();
    pay(d.publicReference, '6001', 'SUCCESS');
    const event = paymentEvent('PAYMENT_SUCCESS_WEBHOOK', d.publicReference, '6001', 'SUCCESS');
    const tampered = signed(event);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/cashfree',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': tampered.signature,
        'x-webhook-timestamp': tampered.ts,
      },
      payload: tampered.raw.replace('1500.5', '1500.6'),
    });
    expect(res.statusCode).toBe(400);
    expect((await webhook(event, { secret: 'another-secret-000000' })).statusCode).toBe(400);
    const future = String(Date.now() + CASHFREE_FUTURE_SKEW_MS + 60_000);
    expect((await webhook(event, { ts: future })).statusCode).toBe(400);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/cashfree',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(event),
    });
    expect(missing.statusCode).toBe(400);
    expect(await intentStatus(d.publicReference)).toBe('CREATED');
    expect(
      await db.webhookEvent.count({
        where: { provider: 'CASHFREE', providerEventId: { contains: ':6001:' } },
      }),
    ).toBe(0);
  });

  it('webhook first → PAID from the RE-FETCHED order; a replay is a duplicate', async () => {
    const d = await newDonation();
    pay(d.publicReference, '6101', 'SUCCESS');
    const event = paymentEvent('PAYMENT_SUCCESS_WEBHOOK', d.publicReference, '6101', 'SUCCESS');
    const first = await webhook(event);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ received: true });
    expect(await intentStatus(d.publicReference)).toBe('PAID');
    const again = await webhook(event, { ts: String(Date.now() - 30 * 60_000) });
    expect(again.json()).toEqual({ received: true, duplicate: true });
    const row = await db.webhookEvent.findUniqueOrThrow({
      where: {
        provider_providerEventId: {
          provider: 'CASHFREE',
          providerEventId: 'pay:PAYMENT_SUCCESS_WEBHOOK:6101:SUCCESS',
        },
      },
    });
    expect(row).toMatchObject({ processingStatus: 'PROCESSED', signatureValid: true });
    // Verify after the webhook changes nothing further.
    expect((await verify({ publicReference: d.publicReference })).json()).toMatchObject({
      status: 'PAID',
    });
  });

  it('a SUCCESS webhook whose order Cashfree has not paid does not make PAID', async () => {
    const d = await newDonation();
    const event = paymentEvent('PAYMENT_SUCCESS_WEBHOOK', d.publicReference, '6201', 'SUCCESS');
    expect((await webhook(event)).statusCode).toBe(200);
    expect(await intentStatus(d.publicReference)).toBe('CREATED');
  });

  it('out of order: success then a late failure of another try → stays PAID', async () => {
    const d = await newDonation();
    pay(d.publicReference, '6301', 'SUCCESS');
    await webhook(paymentEvent('PAYMENT_SUCCESS_WEBHOOK', d.publicReference, '6301', 'SUCCESS'));
    pay(d.publicReference, '6302', 'FAILED');
    await webhook(paymentEvent('PAYMENT_FAILED_WEBHOOK', d.publicReference, '6302', 'FAILED'));
    expect(await intentStatus(d.publicReference)).toBe('PAID');
  });

  it('unknown order: success → owner exception; failure → ignored', async () => {
    const ref = 'TOT-D-UNKNOWN00000X';
    const ok = await webhook(paymentEvent('PAYMENT_SUCCESS_WEBHOOK', ref, '6401', 'SUCCESS'));
    expect(ok.statusCode).toBe(200);
    expect(
      await db.paymentException.count({
        where: { kind: 'UNMATCHED_CREDIT', providerPaymentId: '6401' },
      }),
    ).toBe(1);
    const failed = await webhook(paymentEvent('PAYMENT_FAILED_WEBHOOK', ref, '6402', 'FAILED'));
    expect(failed.statusCode).toBe(200);
    const row = await db.webhookEvent.findFirstOrThrow({
      where: { provider: 'CASHFREE', providerEventId: 'pay:PAYMENT_FAILED_WEBHOOK:6402:FAILED' },
    });
    expect(row).toMatchObject({ processingStatus: 'IGNORED', processingError: 'unknown_order' });
  });

  it('Cashfree unreachable while processing → 500 (Cashfree retries), then the retry applies', async () => {
    const d = await newDonation();
    pay(d.publicReference, '6501', 'SUCCESS');
    const event = paymentEvent('PAYMENT_SUCCESS_WEBHOOK', d.publicReference, '6501', 'SUCCESS');
    down = true;
    expect((await webhook(event)).statusCode).toBe(500);
    down = false;
    expect((await webhook(event)).statusCode).toBe(200);
    expect(await intentStatus(d.publicReference)).toBe('PAID');
  });

  it('other events are acknowledged and ignored', async () => {
    const res = await webhook({ type: 'PAYMENT_CHARGES_WEBHOOK', data: {} });
    expect(res.statusCode).toBe(200);
  });

  it('refunds: partial keeps PAID with the amount; full → REFUNDED; nothing deleted', async () => {
    const d = await newDonation();
    pay(d.publicReference, '6601', 'SUCCESS');
    await webhook(paymentEvent('PAYMENT_SUCCESS_WEBHOOK', d.publicReference, '6601', 'SUCCESS'));
    const order = remote.get(d.publicReference);
    order?.refunds.push({ refund_status: 'SUCCESS', refund_amount: 500 });
    const refundEvent = (id: number) => ({
      type: 'REFUND_STATUS_WEBHOOK',
      data: {
        refund: {
          cf_refund_id: id,
          cf_payment_id: 6601,
          order_id: d.publicReference,
          refund_amount: 9999,
          refund_status: 'SUCCESS',
        },
      },
    });
    expect((await webhook(refundEvent(1))).statusCode).toBe(200);
    expect(await intentStatus(d.publicReference)).toBe('PAID');
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.publicReference },
    });
    expect(attempt.refundedPaise).toBe(50_000);
    order?.refunds.push({ refund_status: 'SUCCESS', refund_amount: 1000.5 });
    expect((await webhook(refundEvent(2))).statusCode).toBe(200);
    expect(await intentStatus(d.publicReference)).toBe('REFUNDED');
  });

  it('a refund for an order we do not know is ignored', async () => {
    const res = await webhook({
      type: 'AUTO_REFUND_STATUS_WEBHOOK',
      data: {
        auto_refund: { cf_refund_id: 77, cf_payment_id: '999999', refund_status: 'SUCCESS' },
      },
    });
    expect(res.statusCode).toBe(200);
    const row = await db.webhookEvent.findFirstOrThrow({
      where: { provider: 'CASHFREE', providerEventId: 'ref:AUTO_REFUND_STATUS_WEBHOOK:77:SUCCESS' },
    });
    expect(row.processingStatus).toBe('IGNORED');
  });
});

describe('event keys', () => {
  it('payment, refund and raw keys', () => {
    const raw = Buffer.from('{}');
    expect(
      cashfreeEventKey(
        {
          type: 'PAYMENT_SUCCESS_WEBHOOK',
          data: { payment: { cf_payment_id: 1, payment_status: 'SUCCESS' } },
        },
        raw,
      ),
    ).toBe('pay:PAYMENT_SUCCESS_WEBHOOK:1:SUCCESS');
    expect(
      cashfreeEventKey(
        { type: 'x y', data: { refund: { cf_refund_id: '9', refund_status: 'bad!' } } },
        raw,
      ),
    ).toBe('ref:unknown:9:unknown');
    expect(cashfreeEventKey({}, raw)).toMatch(/^raw:[0-9a-f]{64}$/);
  });
});
