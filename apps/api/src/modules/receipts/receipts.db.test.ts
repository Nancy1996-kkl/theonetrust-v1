import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
 * Acknowledgements (#29): created only after a verified capture, exactly one per payment even
 * across retries, private token link with minimal fields, PDF on demand, refunds as new entries.
 */
const db = useTestDb();
const KEY_SECRET = 'receipt-key-secret-001';
const WEBHOOK_SECRET = 'receipt-webhook-secret-001';
const AUTH_SECRET_KEY = randomBytes(32).toString('base64');
let app: FastifyInstance;
let seq = 0;
let ip = 0;

const remote = new Map<string, ProviderPayment>();
const real = razorpayProvider({
  keyId: 'rzp_test_receipt0001',
  keySecret: KEY_SECRET,
  fetch: async () => new Response('{}'),
});
const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_receipt0001',
  verifyCheckoutSignature: real.verifyCheckoutSignature,
  createOrder: async (input) => ({
    orderId: `order_R${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
  fetchPayment: async (id) => {
    const p = remote.get(id);
    if (!p) throw new Error('unknown');
    return p;
  },
  fetchOrderPayments: async (orderId) => [...remote.values()].filter((p) => p.orderId === orderId),
};

const env = (extra: Record<string, string> = {}) =>
  loadEnv({
    NODE_ENV: 'test',
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    AUTH_SECRET_KEY,
    PUBLIC_SITE_URL: 'https://theonetrust.example',
    ...extra,
  });

beforeAll(() => {
  app = buildApp(env(), { db, paymentProvider: provider });
});
afterEach(async () => {
  await db.trustSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {
      receiptMinPaise: 50_000,
      legalName: null,
      registrationText: null,
      taxBenefitEnabled: false,
      section354Approval: null,
      approvalValidUntil: null,
    },
  });
});
afterAll(async () => {
  await app.close();
});

const nextIp = () => `10.29.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;

async function donation(giftPaise = 100_000, patch: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: nextIp(),
    payload: {
      giftPaise,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Donor',
      donorEmail: 'donor.private@example.org',
      donorPhone: '+919876543210',
      hideNamePublicly: true,
      wantsReceipt: true,
      coverFee: false,
      consent: true,
      locale: 'en',
      ...patch,
    },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { publicReference: string; checkout: { orderId: string } };
  const intent = await db.donationIntent.findUniqueOrThrow({
    where: { publicReference: body.publicReference },
  });
  return { ref: body.publicReference, orderId: body.checkout.orderId, id: intent.id, giftPaise };
}

function pays(orderId: string, amountPaise: number, patch: Partial<ProviderPayment> = {}) {
  const p: ProviderPayment = {
    paymentId: `pay_R${String(++seq).padStart(8, '0')}`,
    orderId,
    amountPaise,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    refundedPaise: 0,
    ...patch,
  };
  remote.set(p.paymentId, p);
  return p;
}

const verify = (ref: string, orderId: string, paymentId: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/payments/verify',
    remoteAddress: nextIp(),
    payload: {
      publicReference: ref,
      orderId,
      paymentId,
      signature: createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex'),
    },
  });

function webhook(event: string, p: ProviderPayment) {
  const raw = JSON.stringify({
    event,
    payload: {
      payment: {
        entity: {
          id: p.paymentId,
          entity: 'payment',
          order_id: p.orderId,
          amount: p.amountPaise,
          currency: 'INR',
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
      'x-razorpay-signature': createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex'),
      'x-razorpay-event-id': `evt_R${String(++seq).padStart(10, '0')}`,
    },
    payload: raw,
  });
}

const receipts = (intentId: string) =>
  db.receipt.findMany({ where: { donationIntentId: intentId }, orderBy: { issuedAt: 'asc' } });
const getView = (token: string) =>
  app.inject({ method: 'GET', url: `/api/v1/receipts/${token}`, remoteAddress: nextIp() });

async function paidWithReceipt(giftPaise = 100_000, patch: Record<string, unknown> = {}) {
  const d = await donation(giftPaise, patch);
  const p = pays(d.orderId, giftPaise);
  const res = await verify(d.ref, d.orderId, p.paymentId);
  expect(res.json().status).toBe('PAID');
  return { ...d, payment: p, token: res.json().receiptToken as string };
}

describe('issued only after verified capture, once per payment', () => {
  it('PAID via the callback → one receipt and a link token for the donor', async () => {
    const d = await paidWithReceipt();
    expect(d.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [r] = await receipts(d.id);
    expect(r).toMatchObject({
      amountPaise: 100_000,
      templateVersion: 'ack-v1',
      voidedAt: null,
      replacesId: null,
    });
    expect(r?.receiptNumber).toMatch(/^TOT-R-\d{4}-\d{2}-\d{6,}$/);
    // The token itself is never stored; only its hash.
    expect(JSON.stringify(r)).not.toContain(d.token);
  });

  it('retries — callback replayed, webhook, status re-check — never add a second receipt', async () => {
    const d = await paidWithReceipt();
    await verify(d.ref, d.orderId, d.payment.paymentId);
    await webhook('payment.captured', d.payment);
    await webhook('order.paid', d.payment);
    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/donations/status/${d.ref}`,
      remoteAddress: nextIp(),
    });
    expect(status.json()).toMatchObject({ status: 'PAID', receiptToken: d.token });
    expect(await receipts(d.id)).toHaveLength(1);
  });

  it('two callbacks at the same moment still produce one receipt', async () => {
    const d = await donation();
    const p = pays(d.orderId, 100_000);
    const results = await Promise.all([
      verify(d.ref, d.orderId, p.paymentId),
      verify(d.ref, d.orderId, p.paymentId),
      webhook('payment.captured', p),
    ]);
    expect(results.some((r) => r.statusCode === 200)).toBe(true);
    expect(await receipts(d.id)).toHaveLength(1);
  });

  it('webhook first (browser closed): the receipt exists and the later status shows its link', async () => {
    const d = await donation();
    const p = pays(d.orderId, 100_000);
    await webhook('payment.captured', p);
    expect(await receipts(d.id)).toHaveLength(1);
    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/donations/status/${d.ref}`,
      remoteAddress: nextIp(),
    });
    expect(status.json().receiptToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('pending, authorized, failed and mismatched payments get no receipt', async () => {
    const pending = await donation();
    expect(await receipts(pending.id)).toHaveLength(0);
    const auth = await donation();
    await webhook('payment.authorized', pays(auth.orderId, 100_000, { status: 'authorized' }));
    const failed = await donation();
    await webhook('payment.failed', pays(failed.orderId, 100_000, { status: 'failed' }));
    const wrong = await donation();
    await webhook('payment.captured', pays(wrong.orderId, 1_000));
    for (const d of [pending, auth, failed, wrong]) expect(await receipts(d.id)).toHaveLength(0);
  });

  it('threshold: below → none; exactly at → issued; the threshold comes from settings', async () => {
    const below = await paidWithReceipt(49_900);
    expect(below.token).toBeUndefined();
    expect(await receipts(below.id)).toHaveLength(0);
    const at = await paidWithReceipt(50_000);
    expect(await receipts(at.id)).toHaveLength(1);
    await db.trustSettings.update({ where: { id: 1 }, data: { receiptMinPaise: 100 } });
    const one = await paidWithReceipt(100);
    expect(await receipts(one.id)).toHaveLength(1);
  });

  it('a donor who declined gets no receipt', async () => {
    const d = await paidWithReceipt(100_000, { wantsReceipt: false });
    expect(d.token).toBeUndefined();
    expect(await receipts(d.id)).toHaveLength(0);
  });
});

describe('GET /receipts/:token — minimal fields only', () => {
  it('shows exactly the allowed fields; never email, phone, PAN, address or internal IDs', async () => {
    const d = await paidWithReceipt(150_000);
    const res = await getView(d.token);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        'amountPaise',
        'approval',
        'currency',
        'donationReference',
        'donorName',
        'issuedAt',
        'method',
        'purpose',
        'receiptNumber',
        'replacementToken',
        'state',
        'templateVersion',
        'trust',
      ].sort(),
    );
    expect(body).toMatchObject({
      amountPaise: 150_000,
      currency: 'INR',
      method: 'upi',
      purpose: null,
      donorName: 'Synthetic Donor',
      donationReference: d.ref,
      state: 'VALID',
      trust: { legalName: null, registration: null },
      approval: null,
    });
    const text = res.body;
    for (const secret of ['donor.private@example.org', '9876543210', d.id, d.payment.paymentId]) {
      expect(text).not.toContain(secret);
    }
  });

  it('a chosen programme is the purpose; trust particulars come from settings', async () => {
    const programme = await db.programme.upsert({
      where: { slug: 'receipt-test-food' },
      create: {
        slug: 'receipt-test-food',
        titleEn: 'Food support',
        titleTa: 'உணவு உதவி',
        active: true,
      },
      update: { active: true },
    });
    await db.trustSettings.update({
      where: { id: 1 },
      data: { legalName: 'Synthetic Trust [test]', registrationText: 'Reg. line [test]' },
    });
    const d = await paidWithReceipt(100_000, { programme: programme.slug });
    const body = (await getView(d.token)).json();
    expect(body.purpose).toEqual({ en: 'Food support', ta: 'உணவு உதவி' });
    expect(body.trust).toEqual({
      legalName: 'Synthetic Trust [test]',
      registration: 'Reg. line [test]',
    });
    await db.programme.update({ where: { id: programme.id }, data: { active: false } });
  });

  it('approval details appear only when switched on AND valid on the issue date', async () => {
    const d = await paidWithReceipt();
    await db.trustSettings.update({
      where: { id: 1 },
      data: { section354Approval: 'APPROVAL-TEST', approvalValidUntil: new Date('2099-03-31') },
    });
    expect((await getView(d.token)).json().approval).toBeNull(); // switch is off
    await db.trustSettings.update({ where: { id: 1 }, data: { taxBenefitEnabled: true } });
    expect((await getView(d.token)).json().approval).toEqual({
      reference: 'APPROVAL-TEST',
      validUntil: '2099-03-31',
    });
    await db.trustSettings.update({
      where: { id: 1 },
      data: { approvalValidUntil: new Date('2020-03-31') },
    });
    expect((await getView(d.token)).json().approval).toBeNull(); // expired
  });

  it('malformed, unknown and guessed tokens all get the same 404', async () => {
    for (const token of ['short', 'a'.repeat(43), 'b'.repeat(43), '%2e%2e%2fadmin']) {
      const res = await getView(token);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });

  it('without the database or the key: 503, and no receipt link in donor responses', async () => {
    const closed = buildApp(env({ AUTH_SECRET_KEY: '' }), { paymentProvider: provider });
    expect(
      (await closed.inject({ method: 'GET', url: `/api/v1/receipts/${'a'.repeat(43)}` }))
        .statusCode,
    ).toBe(503);
    await closed.close();
    const noKey = buildApp(env({ AUTH_SECRET_KEY: '' }), { db, paymentProvider: provider });
    const d = await donation();
    const p = pays(d.orderId, 100_000);
    const res = await noKey.inject({
      method: 'POST',
      url: '/api/v1/payments/verify',
      payload: {
        publicReference: d.ref,
        orderId: d.orderId,
        paymentId: p.paymentId,
        signature: createHmac('sha256', KEY_SECRET)
          .update(`${d.orderId}|${p.paymentId}`)
          .digest('hex'),
      },
    });
    expect(res.json()).toEqual({ publicReference: d.ref, status: 'PAID', amountPaise: 100_000 });
    // The receipt is still issued (the link is derived later, when a key is configured).
    expect(await receipts(d.id)).toHaveLength(1);
    await noKey.close();
  });

  it('is rate-limited per IP', async () => {
    const limited = buildApp(env({ RECEIPT_RATE_LIMIT_PER_HOUR: '2' }), {
      db,
      paymentProvider: provider,
    });
    const url = `/api/v1/receipts/${'c'.repeat(43)}`;
    const codes = [];
    for (let i = 0; i < 3; i++) {
      codes.push(
        (await limited.inject({ method: 'GET', url, remoteAddress: '10.29.250.1' })).statusCode,
      );
    }
    expect(codes).toEqual([404, 404, 429]);
    await limited.close();
  });
});

describe('no PDF download (client, Nov 2026)', () => {
  it('the acknowledgement is a web page only: the old PDF address is not found', async () => {
    const d = await paidWithReceipt();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${d.token}/pdf?lang=en`,
      remoteAddress: nextIp(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).not.toBe('application/pdf');
  });
});

describe('refunds and corrections are new entries, never deletions', () => {
  it('partial refund: the original is kept as REPLACED, a new receipt holds the net amount', async () => {
    const d = await paidWithReceipt(100_000);
    const refunded = { ...d.payment, refundedPaise: 30_000 };
    remote.set(refunded.paymentId, refunded);
    await webhook('refund.processed', refunded);

    const [original, corrected] = await receipts(d.id);
    expect(original).toMatchObject({ voidReason: 'CORRECTED', amountPaise: 100_000 });
    expect(corrected).toMatchObject({
      replacesId: original?.id,
      amountPaise: 70_000,
      voidedAt: null,
      paymentAttemptId: null,
    });
    expect(corrected?.receiptNumber).not.toBe(original?.receiptNumber);

    const old = (await getView(d.token)).json();
    expect(old.state).toBe('REPLACED');
    const fresh = (await getView(old.replacementToken)).json();
    expect(fresh).toMatchObject({ state: 'VALID', amountPaise: 70_000, method: 'upi' });

    // The same refund event again changes nothing.
    await webhook('refund.processed', refunded);
    expect(await receipts(d.id)).toHaveLength(2);
    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/donations/status/${d.ref}`,
      remoteAddress: nextIp(),
    });
    expect(status.json().receiptToken).toBe(old.replacementToken);
  });

  it('full refund: the acknowledgement is withdrawn (REFUNDED) but kept; no new receipt', async () => {
    const d = await paidWithReceipt(100_000);
    const refunded = { ...d.payment, refundedPaise: 100_000, status: 'refunded' as const };
    await webhook('refund.created', refunded);
    expect((await getView(d.token)).json().state).toBe('VALID'); // not processed yet
    await webhook('refund.processed', refunded);
    const all = await receipts(d.id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ voidReason: 'REFUNDED' });
    expect((await getView(d.token)).json().state).toBe('REFUNDED');
  });

  it('a receipt can never be deleted', async () => {
    const d = await paidWithReceipt();
    await expect(db.receipt.deleteMany({ where: { donationIntentId: d.id } })).rejects.toThrow(
      /never deleted/,
    );
  });

  it('the database refuses a receipt without a verified source or with a bad number', async () => {
    const d = await donation();
    await expect(
      db.receipt.create({
        data: {
          donationIntentId: d.id,
          receiptNumber: 'TOT-R-2026-27-999999',
          amountPaise: 100,
          templateVersion: 'ack-v1',
          tokenSalt: 'x'.repeat(22),
        },
      }),
    ).rejects.toThrow(/receipts_one_source/);
  });
});
