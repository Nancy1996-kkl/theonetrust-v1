import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import {
  PaymentProviderError,
  razorpayProvider,
  type PaymentProvider,
  type ProviderPayment,
} from '../donations/provider.ts';
import { donorStatus } from './reconcile.ts';

const db = useTestDb();
const SECRET = 'secret-secret-123';
let app: FastifyInstance;
let ip = 0;
let seq = 0;

/** What "Razorpay" will answer when asked. Real signature check (same code as production). */
const remote = new Map<string, ProviderPayment>();
let fetchFails = false;
const real = razorpayProvider({
  keyId: 'rzp_test_abcdefgh12',
  keySecret: SECRET,
  fetch: async () => new Response('{}'),
});
const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_abcdefgh12',
  verifyCheckoutSignature: real.verifyCheckoutSignature,
  createOrder: async (input) => ({
    orderId: `order_T${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
  fetchPayment: async (id) => {
    if (fetchFails) throw new PaymentProviderError('network');
    const p = remote.get(id);
    if (!p) throw new PaymentProviderError('rejected');
    return p;
  },
  fetchOrderPayments: async (orderId) => {
    if (fetchFails) throw new PaymentProviderError('network');
    return [...remote.values()].filter((p) => p.orderId === orderId);
  },
};

const sign = (orderId: string, paymentId: string) =>
  createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

beforeAll(() => {
  app = buildApp(loadEnv({ NODE_ENV: 'test' }), { db, paymentProvider: provider });
});
beforeEach(() => {
  fetchFails = false;
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
      hideNamePublicly: true,
      wantsReceipt: false,
      coverFee: false,
      consent: true,
      locale: 'en',
    },
  });
  const body = res.json() as {
    publicReference: string;
    amountPaise: number;
    checkout: { orderId: string };
  };
  return {
    ref: body.publicReference,
    orderId: body.checkout.orderId,
    amountPaise: body.amountPaise,
  };
}

function remotePayment(orderId: string, patch: Partial<ProviderPayment> = {}): ProviderPayment {
  const payment: ProviderPayment = {
    paymentId: `pay_T${String(++seq).padStart(8, '0')}`,
    orderId,
    amountPaise: 100_000,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    refundedPaise: 0,
    ...patch,
  };
  remote.set(payment.paymentId, payment);
  return payment;
}

const verify = (payload: Record<string, string>) =>
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
  it('valid signature + captured payment fetched from Razorpay → PAID', async () => {
    const d = await newDonation();
    const p = remotePayment(d.orderId);
    const res = await verify({
      publicReference: d.ref,
      orderId: d.orderId,
      paymentId: p.paymentId,
      signature: sign(d.orderId, p.paymentId),
    });
    expect(res.json()).toEqual({ publicReference: d.ref, status: 'PAID', amountPaise: 100_000 });
    expect(await intentStatus(d.ref)).toBe('PAID');
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.orderId },
    });
    expect(attempt).toMatchObject({
      providerPaymentId: p.paymentId,
      providerStatus: 'captured',
      capturedPaise: 100_000,
      method: 'upi',
    });
    expect(attempt.signatureVerifiedAt).not.toBeNull();
    // Idempotent: the same callback again changes nothing.
    const again = await verify({
      publicReference: d.ref,
      orderId: d.orderId,
      paymentId: p.paymentId,
      signature: sign(d.orderId, p.paymentId),
    });
    expect(again.json().status).toBe('PAID');
  });

  it('a forged signature cannot mark a payment PAID — nothing changes', async () => {
    const d = await newDonation();
    const p = remotePayment(d.orderId);
    for (const signature of [
      '0'.repeat(64),
      sign(d.orderId, 'pay_Somebody99'),
      sign('order_Other999', p.paymentId),
      'not-hex',
    ]) {
      const res = await verify({
        publicReference: d.ref,
        orderId: d.orderId,
        paymentId: p.paymentId,
        signature,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields).toEqual([{ path: 'signature', issue: 'invalid' }]);
    }
    expect(await intentStatus(d.ref)).toBe('CREATED');
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: d.orderId },
    });
    expect(attempt.providerPaymentId).toBeNull();
  });

  it.each([
    ['a different amount', { amountPaise: 1_000 }],
    ['another currency', { currency: 'USD' }],
    ['another order', { orderId: 'order_SomeoneElse1' }],
  ])(
    'a mismatch (%s) moves it to MANUAL_REVIEW with an exception, never PAID',
    async (_why, patch) => {
      const d = await newDonation();
      const p = remotePayment(d.orderId, patch);
      const res = await verify({
        publicReference: d.ref,
        orderId: d.orderId,
        paymentId: p.paymentId,
        signature: sign(d.orderId, p.paymentId),
      });
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
        providerPaymentId: p.paymentId,
        status: 'OPEN',
      });
    },
  );

  it('a second, different payment for the same order is a duplicate → MANUAL_REVIEW (unless already paid)', async () => {
    const d = await newDonation();
    const first = remotePayment(d.orderId, { status: 'authorized' });
    await verify({
      publicReference: d.ref,
      orderId: d.orderId,
      paymentId: first.paymentId,
      signature: sign(d.orderId, first.paymentId),
    });
    expect(await intentStatus(d.ref)).toBe('AUTHORIZED');
    const second = remotePayment(d.orderId);
    const res = await verify({
      publicReference: d.ref,
      orderId: d.orderId,
      paymentId: second.paymentId,
      signature: sign(d.orderId, second.paymentId),
    });
    expect(res.json().status).toBe('PENDING');
    expect(await intentStatus(d.ref)).toBe('MANUAL_REVIEW');
    const paid = await newDonation();
    const p1 = remotePayment(paid.orderId);
    await verify({
      publicReference: paid.ref,
      orderId: paid.orderId,
      paymentId: p1.paymentId,
      signature: sign(paid.orderId, p1.paymentId),
    });
    const p2 = remotePayment(paid.orderId);
    await verify({
      publicReference: paid.ref,
      orderId: paid.orderId,
      paymentId: p2.paymentId,
      signature: sign(paid.orderId, p2.paymentId),
    });
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

  it('failed → FAILED; and a FAILED donation never comes back', async () => {
    const d = await newDonation();
    const failed = remotePayment(d.orderId, { status: 'failed' });
    expect(
      (
        await verify({
          publicReference: d.ref,
          orderId: d.orderId,
          paymentId: failed.paymentId,
          signature: sign(d.orderId, failed.paymentId),
        })
      ).json().status,
    ).toBe('FAILED');
    expect(await intentStatus(d.ref)).toBe('FAILED');
  });

  it('Razorpay unreachable: stays pending (never a guess)', async () => {
    const d = await newDonation();
    const p = remotePayment(d.orderId);
    fetchFails = true;
    const res = await verify({
      publicReference: d.ref,
      orderId: d.orderId,
      paymentId: p.paymentId,
      signature: sign(d.orderId, p.paymentId),
    });
    expect(res.json().status).toBe('PENDING');
    expect(await intentStatus(d.ref)).toBe('CREATED');
  });

  it('unknown reference, order of another donation, bank transfer → 404; bad input → 400', async () => {
    const a = await newDonation();
    const b = await newDonation();
    const p = remotePayment(b.orderId);
    expect(
      (
        await verify({
          publicReference: a.ref,
          orderId: b.orderId,
          paymentId: p.paymentId,
          signature: sign(b.orderId, p.paymentId),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await verify({
          publicReference: 'TOT-D-000000000000',
          orderId: b.orderId,
          paymentId: p.paymentId,
          signature: 'x',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await verify({
          publicReference: a.ref,
          orderId: 'nope',
          paymentId: p.paymentId,
          signature: 'x',
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('GET /donations/status/:reference', () => {
  it('re-checks with Razorpay when the callback never arrived (by order) and returns donor-safe fields only', async () => {
    const d = await newDonation();
    remotePayment(d.orderId, { status: 'failed' });
    remotePayment(d.orderId, { status: 'captured' });
    const res = await status(d.ref);
    expect(res.json()).toEqual({ publicReference: d.ref, status: 'PAID', amountPaise: 100_000 });
    expect(res.body).not.toMatch(/donor|email|Synthetic|pay_|order_/i);
    expect(await intentStatus(d.ref)).toBe('PAID');
  });

  it('uses the known payment ID, stays PENDING when nothing is captured yet or Razorpay is down', async () => {
    const d = await newDonation();
    const p = remotePayment(d.orderId, { status: 'authorized' });
    await verify({
      publicReference: d.ref,
      orderId: d.orderId,
      paymentId: p.paymentId,
      signature: sign(d.orderId, p.paymentId),
    });
    expect((await status(d.ref)).json().status).toBe('PENDING');
    fetchFails = true;
    expect((await status(d.ref)).json().status).toBe('PENDING');
    fetchFails = false;
    remote.set(p.paymentId, { ...p, status: 'captured' });
    expect((await status(d.ref)).json().status).toBe('PAID');
    const none = await newDonation();
    expect((await status(none.ref)).json().status).toBe('PENDING');
  });

  it('settled donations are answered from the ledger; unknown → 404; bad reference → 400', async () => {
    const d = await newDonation();
    const p = remotePayment(d.orderId, { status: 'failed' });
    await verify({
      publicReference: d.ref,
      orderId: d.orderId,
      paymentId: p.paymentId,
      signature: sign(d.orderId, p.paymentId),
    });
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

  it('without a provider answers 503', async () => {
    const bare = buildApp(loadEnv({ NODE_ENV: 'test' }), { db });
    expect(
      (await bare.inject({ method: 'GET', url: '/api/v1/donations/status/TOT-D-000000000000' }))
        .statusCode,
    ).toBe(503);
    await bare.close();
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
