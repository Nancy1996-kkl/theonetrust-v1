import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { unique, useTestDb } from '../../test/db.ts';
import {
  PaymentProviderError,
  RAZORPAY_TIMEOUT_MS,
  type CreateOrderInput,
  type PaymentProvider,
} from './provider.ts';
import { IDEMPOTENT_REPLAY_WAIT_MS } from './routes.ts';

const db = useTestDb();
const NOW = new Date('2026-11-03T06:00:00Z');
let app: FastifyInstance;
let orders: CreateOrderInput[] = [];
let failNext: PaymentProviderError | null = null;
let ip = 0;

/** Slows the provider down so a concurrent request has to wait for the winner's order. */
let orderDelayMs = 0;
const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_publickey01',
  verifyCheckoutSignature: () => false,
  fetchPayment: async () => Promise.reject(new PaymentProviderError('rejected')),
  fetchOrderPayments: async () => [],
  createOrder: vi.fn(async (input: CreateOrderInput) => {
    if (orderDelayMs) await new Promise((r) => setTimeout(r, orderDelayMs));
    if (failNext) {
      const error = failNext;
      failNext = null;
      throw error;
    }
    orders.push(input);
    return {
      orderId: `order_${unique('T').replace(/[^A-Za-z0-9]/g, '')}`,
      amountPaise: input.amountPaise,
      currency: 'INR' as const,
      status: 'created',
    };
  }),
};

const TABLE = {
  version: 'test',
  defaultMethod: 'card',
  methods: {
    card: { rateBps: 200, gstBps: 1800 },
    upi: { rateBps: 40, abovePaise: 200_000, capPaise: 30_000, effectiveFrom: '2026-10-15' },
  },
};
const slug = unique('edu');

beforeAll(async () => {
  app = buildApp(loadEnv({ NODE_ENV: 'test' }), { db, now: () => NOW, paymentProvider: provider });
  await db.programme.createMany({
    data: [
      { slug, titleTa: 'கல்வி', titleEn: 'Education', active: true },
      { slug: `${slug}-paused`, titleTa: 'நிறுத்தம்', titleEn: 'Paused', active: false },
    ],
  });
});
beforeEach(async () => {
  orders = [];
  await db.trustSettings.upsert({
    where: { id: 1 },
    create: { id: 1, feeTable: TABLE, maxDonationPaise: 50_000_000 },
    update: { feeTable: TABLE, maxDonationPaise: 50_000_000 },
  });
});
afterAll(async () => {
  await db.$executeRaw`UPDATE trust_settings SET fee_table = NULL WHERE id = 1`;
  await app.close();
});

const body = (patch: Record<string, unknown> = {}) => ({
  giftPaise: 100_000,
  currency: 'INR',
  programme: slug,
  donorName: 'Synthetic Donor',
  donorEmail: 'donor@example.org',
  donorPhone: null,
  hideNamePublicly: true,
  wantsReceipt: true,
  coverFee: false,
  consent: true,
  locale: 'ta',
  ...patch,
});

function post(payload: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    payload: payload as object,
    headers,
    remoteAddress: `10.2.0.${(ip++ % 250) + 1}`,
  });
}

describe('POST /donation-intents', () => {
  it('creates the intent and a Razorpay order; returns only key ID, order ID and amount', async () => {
    const res = await post(body());
    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json).toEqual({
      publicReference: expect.stringMatching(/^TOT-D-/),
      giftPaise: 100_000,
      feePaise: 0,
      amountPaise: 100_000,
      currency: 'INR',
      checkout: {
        provider: 'RAZORPAY',
        keyId: 'rzp_test_publickey01',
        orderId: expect.stringMatching(/^order_/),
      },
    });
    expect(res.body).not.toMatch(/secret|donor@example|Synthetic Donor/);
    expect(orders[0]).toEqual({
      amountPaise: 100_000,
      currency: 'INR',
      receipt: json.publicReference,
      notes: { donation_reference: json.publicReference, programme: slug },
    });
    const intent = await db.donationIntent.findUniqueOrThrow({
      where: { publicReference: json.publicReference },
      include: { paymentAttempts: true },
    });
    expect(intent).toMatchObject({
      status: 'CREATED',
      currency: 'INR',
      giftPaise: 100_000,
      feePaise: 0,
      amountPaise: 100_000,
      donorName: 'Synthetic Donor',
      donorEmail: 'donor@example.org',
      hideNamePublicly: true,
      consentAt: NOW,
    });
    expect(intent.paymentAttempts).toEqual([
      expect.objectContaining({
        providerOrderId: json.checkout.orderId,
        amountPaise: 100_000,
        provider: 'RAZORPAY',
      }),
    ]);
  });

  it('general fund: programme null or "general" has no programme ID', async () => {
    for (const programme of [null, 'general']) {
      const res = await post(body({ programme }));
      const intent = await db.donationIntent.findUniqueOrThrow({
        where: { publicReference: res.json().publicReference },
      });
      expect(intent.programmeId).toBeNull();
    }
  });

  it('adds the fee cover computed by the server from the fee table', async () => {
    const res = await post(body({ coverFee: true }));
    expect(res.json()).toMatchObject({ giftPaise: 100_000, feePaise: 2_418, amountPaise: 102_418 });
    expect(orders[0]?.amountPaise).toBe(102_418);
    const upi = await post(body({ coverFee: true, feeMethod: 'upi', giftPaise: 1_000_000 }));
    expect(upi.json()).toMatchObject({ feePaise: 4_017, amountPaise: 1_004_017 });
  });

  it('never takes an amount, fee or status from the browser', async () => {
    for (const extra of [
      { amountPaise: 1 },
      { feePaise: 0 },
      { status: 'PAID' },
      { orderId: 'order_x' },
    ]) {
      const res = await post(body(extra));
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields[0]).toMatchObject({ issue: 'unknown_field' });
    }
    expect(orders).toEqual([]);
  });

  it('normalises an Indian mobile as the contact', async () => {
    const res = await post(body({ donorEmail: null, donorPhone: '98765 43210' }));
    const intent = await db.donationIntent.findUniqueOrThrow({
      where: { publicReference: res.json().publicReference },
    });
    expect(intent.donorPhone).toBe('+919876543210');
  });
});

describe('validation: amount limits, programme, currency, contact, consent', () => {
  it.each([
    ['below ₹1', { giftPaise: 99 }],
    ['a fraction of a paisa', { giftPaise: 100.5 }],
    ['rupees as a string', { giftPaise: '500' }],
    ['another currency', { currency: 'USD' }],
    ['no consent', { consent: false }],
    ['an empty name', { donorName: '  ' }],
    ['a bad email', { donorEmail: 'nope' }],
  ])('rejects %s', async (_why, patch) => {
    const res = await post(body(patch));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['above the maximum from settings', { giftPaise: 50_000_001 }, 'giftPaise', 'too_big'],
    ['an unknown programme', { programme: 'does-not-exist' }, 'programme', 'invalid'],
    ['a paused programme', { programme: `${slug}-paused` }, 'programme', 'invalid'],
    ['no contact at all', { donorEmail: null, donorPhone: null }, 'donorEmail', 'contact_required'],
    [
      'a non-Indian phone',
      { donorEmail: null, donorPhone: '+1 415 555 0100' },
      'donorPhone',
      'invalid',
    ],
    [
      'fee cover for a method without a rule',
      { coverFee: true, feeMethod: 'netbanking' },
      'coverFee',
      'not_offered',
    ],
  ])('rejects %s', async (_why, patch, path, issue) => {
    const res = await post(body(patch));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toContainEqual({ path, issue });
    expect(orders).toEqual([]);
  });

  it('takes the maximum from settings', async () => {
    await db.trustSettings.update({ where: { id: 1 }, data: { maxDonationPaise: 1_000_00 } });
    expect((await post(body({ giftPaise: 100_000 }))).statusCode).toBe(201);
    expect((await post(body({ giftPaise: 100_001 }))).statusCode).toBe(400);
  });

  it('fee cover is not offered without a fee table', async () => {
    await db.$executeRaw`UPDATE trust_settings SET fee_table = NULL WHERE id = 1`;
    const res = await post(body({ coverFee: true }));
    expect(res.json().error.fields).toContainEqual({ path: 'coverFee', issue: 'not_offered' });
    expect((await post(body({ coverFee: false }))).statusCode).toBe(201);
  });
});

describe('payment gateway selection (Phase 1)', () => {
  it('the response names the gateway; the attempt records the adapter that created the order', async () => {
    const res = await post(body());
    expect(res.statusCode).toBe(201);
    const checkout = res.json().checkout;
    expect(checkout).toEqual({
      provider: 'RAZORPAY',
      keyId: 'rzp_test_publickey01',
      orderId: expect.stringMatching(/^order_/),
    });
    const attempt = await db.paymentAttempt.findUniqueOrThrow({
      where: { providerOrderId: checkout.orderId },
    });
    expect(attempt.provider).toBe('RAZORPAY');
  });

  it('the same key reused for another way of paying (QR attempt vs checkout) is a conflict', async () => {
    const key = unique('chan')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .padEnd(20, 'c');
    const first = await post(body(), { 'idempotency-key': key });
    expect(first.statusCode).toBe(201);
    await db.paymentAttempt.update({
      where: { providerOrderId: first.json().checkout.orderId },
      data: {
        // as if it were a QR attempt
        qrExpiresAt: new Date(NOW.getTime() + 600_000),
        qrImageUrl: 'https://example.org/qr.png',
      },
    });
    expect((await post(body(), { 'idempotency-key': key })).statusCode).toBe(409);
  });

  it('PAYMENT_PROVIDER=none also switches monthly giving off (it is an online payment)', async () => {
    const config = {
      NODE_ENV: 'test',
      AUTH_SECRET_KEY: randomBytes(32).toString('base64'),
      RAZORPAY_KEY_ID: 'rzp_test_monthlyoff01',
      RAZORPAY_KEY_SECRET: 'monthly-off-secret-001',
      RAZORPAY_SUBSCRIPTIONS_ENABLED: 'true',
    };
    const offered = async (extra: Record<string, string>) => {
      const a = buildApp(loadEnv({ ...config, ...extra }), { db, now: () => NOW });
      const res = await a.inject({ method: 'GET', url: '/api/v1/donation-intents/estimate' });
      await a.close();
      return res.json().monthlyOffered as boolean;
    };
    expect(await offered({})).toBe(true); // the same setup with Razorpay offers it
    expect(await offered({ PAYMENT_PROVIDER: 'none' })).toBe(false);
  });

  it('PAYMENT_PROVIDER=none switches online donations off: 503 with the generic error body', async () => {
    const off = buildApp(
      loadEnv({
        NODE_ENV: 'test',
        PAYMENT_PROVIDER: 'none',
        RAZORPAY_KEY_ID: 'rzp_test_offswitch01',
        RAZORPAY_KEY_SECRET: 'off-switch-secret-0001',
      }),
      { db, now: () => NOW },
    );
    const before = await db.donationIntent.count();
    const res = await off.inject({
      method: 'POST',
      url: '/api/v1/donation-intents',
      remoteAddress: '10.99.0.1',
      payload: body(),
    });
    await off.close();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(res.body).not.toMatch(/razorpay|rzp_/i);
    expect(await db.donationIntent.count()).toBe(before);
  });
});

describe('retries and provider failures', () => {
  it('the same Idempotency-Key returns the same order (no second charge)', async () => {
    const key = unique('idem')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .padEnd(20, 'x');
    const first = await post(body(), { 'idempotency-key': key });
    const second = await post(body(), { 'idempotency-key': key });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(orders).toHaveLength(1);
    const changed = await post(body({ giftPaise: 200_000 }), { 'idempotency-key': key });
    expect(changed.statusCode).toBe(409);
    expect((await post(body(), { 'idempotency-key': 'short' })).statusCode).toBe(400);
  });

  describe('two first requests with the same key AT THE SAME TIME (audit F-7)', () => {
    const raceKey = (tag: string) =>
      unique(tag)
        .replace(/[^A-Za-z0-9_-]/g, '')
        .padEnd(20, 'z');
    /** Both requests miss the "already exists?" lookup, as in a real race. */
    function bothMissTheLookup() {
      return vi
        .spyOn(db.donationIntent, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
    }

    it('both get the SAME order, one donation and one provider order — never a 500', async () => {
      const key = raceKey('race1');
      const ordersBefore = orders.length;
      const intentsBefore = await db.donationIntent.count();
      orderDelayMs = 150;
      const spy = bothMissTheLookup();
      const [a, b] = await Promise.all([
        post(body(), { 'idempotency-key': key }),
        post(body(), { 'idempotency-key': key }),
      ]);
      spy.mockRestore();
      orderDelayMs = 0;
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
      expect(a.json().publicReference).toBe(b.json().publicReference);
      expect(a.json().checkout.orderId).toBe(b.json().checkout.orderId);
      expect(orders.length - ordersBefore).toBe(1);
      expect(await db.donationIntent.count()).toBe(intentsBefore + 1);
    });

    it('if the winner cannot create the order, the waiting request answers 409 (retry), not 500', async () => {
      // A short wait (injected) so the test does not sit through the production wait.
      const quick = buildApp(loadEnv({ NODE_ENV: 'test' }), {
        db,
        now: () => NOW,
        paymentProvider: provider,
        idempotencyWaitMs: 300,
      });
      const send = (key: string) =>
        quick.inject({
          method: 'POST',
          url: '/api/v1/donation-intents',
          remoteAddress: '10.98.0.1',
          headers: { 'idempotency-key': key },
          payload: body(),
        });
      const key = raceKey('race2');
      const calls = vi.mocked(provider.createOrder).mock.calls.length;
      orderDelayMs = 100;
      failNext = new PaymentProviderError('network');
      const spy = bothMissTheLookup();
      const results = await Promise.all([send(key), send(key)]);
      spy.mockRestore();
      orderDelayMs = 0;
      expect(results.map((r) => r.statusCode).sort()).toEqual([409, 503]);
      expect(vi.mocked(provider.createOrder).mock.calls.length - calls).toBe(1); // never a 2nd order
      expect((await send(key)).statusCode).toBe(409); // the key stays spent: a fresh try is new
      await quick.close();
    });

    it('a racer with a different gift is refused at once (409), never handed the other order', async () => {
      const key = raceKey('race3');
      orderDelayMs = 100;
      const spy = bothMissTheLookup();
      const [a, b] = await Promise.all([
        post(body(), { 'idempotency-key': key }),
        post(body({ giftPaise: 200_000 }), { 'idempotency-key': key }),
      ]);
      spy.mockRestore();
      orderDelayMs = 0;
      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    });

    it('the wait covers the gateway timeout, so a slow winner still answers the waiting donor', () => {
      expect(IDEMPOTENT_REPLAY_WAIT_MS).toBeGreaterThan(RAZORPAY_TIMEOUT_MS);
    });
  });

  it('a provider failure answers 503 and leaves the intent without an order', async () => {
    failNext = new PaymentProviderError('network');
    const before = await db.donationIntent.count();
    const res = await post(body());
    expect(res.statusCode).toBe(503);
    expect(await db.donationIntent.count()).toBe(before + 1);
    const last = await db.donationIntent.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      include: { paymentAttempts: true },
    });
    expect(last.paymentAttempts).toEqual([]);
    expect(last.status).toBe('CREATED');
  });

  it('a retry with the same key after a provider failure is a conflict, not a silent reuse', async () => {
    const key = unique('idem2')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .padEnd(20, 'y');
    failNext = new PaymentProviderError('rejected');
    expect((await post(body(), { 'idempotency-key': key })).statusCode).toBe(503);
    expect((await post(body(), { 'idempotency-key': key })).statusCode).toBe(409);
  });
});

describe('GET /donation-intents/estimate', () => {
  it('returns limits and the fee cover estimate', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/donation-intents/estimate?giftPaise=100000&method=card',
    });
    expect(res.json()).toEqual({
      minPaise: 100,
      maxPaise: 50_000_000,
      receiptMinPaise: 50_000,
      feeCoverOffered: true,
      bankTransferOffered: false,
      monthlyOffered: false,
      qrOffered: false,
      phoneRequired: false,
      taxOptInOffered: false,
      feePaise: 2_418,
      amountPaise: 102_418,
    });
    const bare = await app.inject({ method: 'GET', url: '/api/v1/donation-intents/estimate' });
    expect(bare.json()).toEqual({
      minPaise: 100,
      maxPaise: 50_000_000,
      receiptMinPaise: 50_000,
      feeCoverOffered: true,
      bankTransferOffered: false,
      monthlyOffered: false,
      qrOffered: false,
      phoneRequired: false,
      taxOptInOffered: false,
    });
    const bad = await app.inject({
      method: 'GET',
      url: '/api/v1/donation-intents/estimate?giftPaise=5',
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('without a payment provider or database', () => {
  it('answers 503', async () => {
    const bare = buildApp(loadEnv({ NODE_ENV: 'test' }), { db });
    expect(
      (await bare.inject({ method: 'POST', url: '/api/v1/donation-intents', payload: body() }))
        .statusCode,
    ).toBe(503);
    await bare.close();
  });
});

describe('rate limit', () => {
  it('limits intents per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/donation-intents',
        payload: body(),
        remoteAddress: '10.3.3.3',
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
