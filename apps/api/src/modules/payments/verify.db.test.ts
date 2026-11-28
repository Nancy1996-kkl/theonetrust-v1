import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import { fakeCashfree } from '../../test/fake-cashfree.ts';
import { donorStatus } from './reconcile.ts';

/**
 * The donor's return to the site (`POST /payments/verify`) and the status re-check: the browser
 * only names the donation; every decision comes from the order re-fetched from the gateway.
 */
const db = useTestDb();
const cf = fakeCashfree('verify-cashfree-secret-01');
let app: FastifyInstance;
let ip = 0;

beforeAll(() => {
  app = buildApp(loadEnv({ NODE_ENV: 'test', ...cf.env }), { db, paymentProvider: cf.provider });
});
beforeEach(() => {
  cf.setDown(false);
});
afterAll(async () => {
  await app.close();
});

async function newDonation(giftPaise = 100_000) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: `10.8.0.${(ip++ % 250) + 1}`,
    payload: {
      giftPaise,
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
  expect(res.statusCode).toBe(201);
  const body = res.json() as { publicReference: string; amountPaise: number };
  return { ref: body.publicReference, amountPaise: body.amountPaise };
}

const verify = (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/payments/verify',
    payload,
    remoteAddress: `10.9.0.${(ip++ % 250) + 1}`,
  });
const status = (ref: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/donations/status/${ref}`,
    remoteAddress: `10.9.1.${(ip++ % 250) + 1}`,
  });
const intentStatus = async (ref: string) =>
  (await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } })).status;

describe('POST /payments/verify', () => {
  it('a captured payment re-fetched from the gateway → PAID; repeating it changes nothing', async () => {
    const d = await newDonation();
    const paymentId = cf.pay(d.ref);
    const res = await verify({ publicReference: d.ref });
    expect(res.json()).toEqual({ publicReference: d.ref, status: 'PAID', amountPaise: 100_000 });
    expect(await intentStatus(d.ref)).toBe('PAID');
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.ref },
    });
    expect(attempt).toMatchObject({
      providerPaymentId: paymentId,
      providerStatus: 'captured',
      capturedPaise: 100_000,
      method: 'upi',
    });
    const again = await verify({ publicReference: d.ref });
    expect(again.json().status).toBe('PAID');
  });

  it('the browser cannot claim a payment: extra fields are refused and nothing changes', async () => {
    const d = await newDonation();
    for (const extra of [
      { orderId: d.ref, paymentId: '5000000001', signature: 'x'.repeat(64) },
      { status: 'PAID' },
    ]) {
      const res = await verify({ publicReference: d.ref, ...extra });
      expect(res.statusCode).toBe(400);
    }
    expect(await intentStatus(d.ref)).toBe('CREATED');
  });

  it.each([
    ['a different amount', { paise: 1_000 }],
    ['another currency', { currency: 'USD' }],
  ])(
    'a mismatch (%s) moves it to MANUAL_REVIEW with an exception, never PAID',
    async (_why, patch) => {
      const d = await newDonation();
      const paymentId = cf.pay(d.ref, patch);
      const res = await verify({ publicReference: d.ref });
      expect(res.json().status).toBe('PENDING');
      expect(await intentStatus(d.ref)).toBe('MANUAL_REVIEW');
      const intent = await db.donationIntent.findUniqueOrThrow({
        where: { publicReference: d.ref },
      });
      const exception = await db.paymentException.findFirstOrThrow({
        where: { donationIntentId: intent.id },
      });
      expect(exception).toMatchObject({
        kind: 'PAYMENT_MISMATCH',
        providerPaymentId: paymentId,
        status: 'OPEN',
      });
    },
  );

  it('two captured payments on one order: PAID once, the second is a DUPLICATE_PAYMENT exception', async () => {
    const paid = await newDonation();
    cf.pay(paid.ref);
    await verify({ publicReference: paid.ref });
    cf.pay(paid.ref);
    await verify({ publicReference: paid.ref });
    expect(await intentStatus(paid.ref)).toBe('PAID');
    const intent = await db.donationIntent.findUniqueOrThrow({
      where: { publicReference: paid.ref },
    });
    expect(
      await db.paymentException.count({
        where: { donationIntentId: intent.id, kind: 'DUPLICATE_PAYMENT' },
      }),
    ).toBe(1);
  });

  it('failed → FAILED', async () => {
    const d = await newDonation();
    cf.pay(d.ref, { status: 'FAILED' });
    expect((await verify({ publicReference: d.ref })).json().status).toBe('FAILED');
    expect(await intentStatus(d.ref)).toBe('FAILED');
  });

  it('gateway unreachable: stays as recorded (never a guess)', async () => {
    const d = await newDonation();
    cf.pay(d.ref);
    cf.setDown(true);
    const res = await verify({ publicReference: d.ref });
    expect(res.json().status).toBe('PENDING');
    expect(await intentStatus(d.ref)).toBe('CREATED');
  });

  it('unknown reference or bank transfer → 404; bad input → 400; no gateway → 503', async () => {
    expect((await verify({ publicReference: 'TOT-D-000000000000' })).statusCode).toBe(404);
    expect((await verify({ publicReference: 'nope' })).statusCode).toBe(400);
    expect((await verify({})).statusCode).toBe(400);
    const off = buildApp(loadEnv({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'none' }), { db });
    const d = await newDonation();
    const res = await off.inject({
      method: 'POST',
      url: '/api/v1/payments/verify',
      payload: { publicReference: d.ref },
    });
    expect(res.statusCode).toBe(503);
    await off.close();
  });
});

describe('GET /donations/status/:reference', () => {
  it('re-checks by order when the donor never came back, returning donor-safe fields only', async () => {
    const d = await newDonation();
    cf.pay(d.ref, { status: 'FAILED' });
    cf.pay(d.ref);
    const res = await status(d.ref);
    expect(res.json()).toEqual({ publicReference: d.ref, status: 'PAID', amountPaise: 100_000 });
    expect(res.body).not.toMatch(/donor|email|Synthetic|\d{12}|session_/i);
    expect(await intentStatus(d.ref)).toBe('PAID');
  });

  it('stays PENDING when nothing is captured yet or the gateway is down', async () => {
    const d = await newDonation();
    cf.pay(d.ref, { captured: false });
    expect((await status(d.ref)).json().status).toBe('PENDING');
    cf.setDown(true);
    expect((await status(d.ref)).json().status).toBe('PENDING');
    cf.setDown(false);
    const none = await newDonation();
    expect((await status(none.ref)).json().status).toBe('PENDING');
  });

  it('a young FAILED donation is re-checked (a retry may have succeeded); gateway down → stays FAILED', async () => {
    const d = await newDonation();
    cf.pay(d.ref, { status: 'FAILED' });
    await verify({ publicReference: d.ref });
    expect(await intentStatus(d.ref)).toBe('FAILED');
    cf.pay(d.ref); // the retry on the same order was captured
    cf.setDown(true);
    expect((await status(d.ref)).json().status).toBe('FAILED'); // never a guess
    cf.setDown(false);
    expect((await status(d.ref)).json().status).toBe('PAID');
  });

  it('an old FAILED donation is answered from the ledger, without asking the gateway', async () => {
    const d = await newDonation();
    cf.pay(d.ref, { status: 'FAILED' });
    await verify({ publicReference: d.ref });
    const window = loadEnv({ NODE_ENV: 'test' }).FAILED_RECHECK_WINDOW_MS;
    expect(window).toBe(86_400_000);
    await db.donationIntent.update({
      where: { publicReference: d.ref },
      data: { createdAt: new Date(Date.now() - window - 60_000) },
    });
    cf.pay(d.ref); // captured, but only the owner re-check may find it now
    expect((await status(d.ref)).json().status).toBe('FAILED');
    expect(await intentStatus(d.ref)).toBe('FAILED');
  });

  it('settled donations are answered from the ledger; unknown → 404; bad reference → 400', async () => {
    const d = await newDonation();
    cf.pay(d.ref, { status: 'FAILED' });
    await verify({ publicReference: d.ref });
    expect((await status(d.ref)).json().status).toBe('FAILED');
    expect((await status('TOT-D-000000000000')).statusCode).toBe(404);
    expect((await status('nope')).statusCode).toBe(400);
  });

  it('is rate-limited per IP', async () => {
    const d = await newDonation();
    let last = 0;
    for (let i = 0; i < 121; i += 1) {
      last = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/donations/status/${d.ref}`,
          remoteAddress: '10.10.10.10',
        })
      ).statusCode;
    }
    expect(last).toBe(429);
  });

  it('with no gateway (PAYMENT_PROVIDER=none) the ledger still answers; without a database, 503', async () => {
    const d = await newDonation();
    cf.pay(d.ref);
    await verify({ publicReference: d.ref });
    const pending = await newDonation();
    cf.pay(pending.ref); // captured at the gateway, but no gateway to ask now
    const bare = buildApp(loadEnv({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'none' }), { db });
    const get = (ref: string) =>
      bare.inject({ method: 'GET', url: `/api/v1/donations/status/${ref}` });
    expect((await get(d.ref)).json()).toMatchObject({ status: 'PAID' });
    expect((await get(pending.ref)).json()).toMatchObject({ status: 'PENDING' });
    expect(await intentStatus(pending.ref)).toBe('CREATED'); // nothing changed, no guess
    expect((await get('TOT-D-000000000000')).statusCode).toBe(404);
    await bare.close();
    const noDb = buildApp(loadEnv({ NODE_ENV: 'test' }));
    expect(
      (await noDb.inject({ method: 'GET', url: `/api/v1/donations/status/${d.ref}` })).statusCode,
    ).toBe(503);
    await noDb.close();
  });
});

describe('donorStatus', () => {
  it('shows PAID only for PAID and hides internal states', () => {
    expect(donorStatus('PAID')).toBe('PAID');
    expect(donorStatus('FAILED')).toBe('FAILED');
    for (const s of [
      'CREATED',
      'PENDING',
      'AUTHORIZED',
      'MANUAL_REVIEW',
      'REFUND_PENDING',
      'REFUNDED',
    ] as const) {
      expect(donorStatus(s)).toBe('PENDING');
    }
  });
});
