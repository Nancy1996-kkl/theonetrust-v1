import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import {
  cashfreePaymentEvent,
  fakeCashfree,
  sendCashfreeWebhook,
} from '../../test/fake-cashfree.ts';

/**
 * Payment test suite (#28): whole donor journeys across the three paths that can touch a
 * payment — the donor's return to the site (verify), the gateway webhook, and the donor status
 * re-check — against a fake Cashfree driven through the REAL adapter (sandbox mode).
 * Rule under test everywhere: only a server-verified, captured payment of the exact amount,
 * currency and order becomes PAID, exactly once, and nothing ever moves it backwards. The browser
 * and the webhook only say "look again": every decision comes from the re-fetched order.
 */
const db = useTestDb();
const SECRET = 'suite-cashfree-secret-0001';
const cf = fakeCashfree(SECRET);
let app: FastifyInstance;
let ip = 0;

beforeAll(() => {
  app = buildApp(loadEnv({ NODE_ENV: 'test', ...cf.env }), { db, paymentProvider: cf.provider });
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
    donorPhone: '+919876543210',
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

async function donation(giftPaise = 100_000, patch: Record<string, unknown> = {}) {
  const res = await createIntent(giftPaise, undefined, patch);
  expect(res.statusCode).toBe(201);
  const body = res.json() as { publicReference: string };
  return { ref: body.publicReference, amountPaise: giftPaise };
}

/** The donor pays at the gateway (sandbox): the payment exists there. Returns its ID. */
const pays = (ref: string, paise: number, opts: Parameters<typeof cf.pay>[1] = {}) =>
  cf.pay(ref, { paise, ...opts });

/** The donor is back on the site (the browser names the donation, nothing else). */
const back = (ref: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/payments/verify',
    remoteAddress: nextIp(),
    payload: { publicReference: ref },
  });

const succeeded = (ref: string, paymentId: string) =>
  sendCashfreeWebhook(app, SECRET, cashfreePaymentEvent(ref, paymentId));
const failedEvent = (ref: string, paymentId: string) =>
  sendCashfreeWebhook(app, SECRET, cashfreePaymentEvent(ref, paymentId, 'PAYMENT_FAILED_WEBHOOK'));

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
const attemptsFor = async (ref: string) =>
  db.paymentAttempt.findMany({ where: { providerOrderId: ref } });

describe('success', () => {
  it('back on the site → PAID; the delayed webhook later is absorbed (one payment, still PAID)', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise);
    expect((await back(d.ref)).json().status).toBe('PAID');
    expect(await ledger(d.ref)).toBe('PAID');

    const late = await succeeded(d.ref, p);
    expect(late.statusCode).toBe(200);
    expect(await ledger(d.ref)).toBe('PAID');
    const [attempt] = await attemptsFor(d.ref);
    expect(attempt).toMatchObject({ providerPaymentId: p, capturedPaise: 100_000 });
    expect(await donorStatus(d.ref)).toBe('PAID');
  });

  it('webhook first, then back on the site (the browser closed first) → PAID once', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise, { captured: false });
    expect(await donorStatus(d.ref)).toBe('PENDING'); // authorized is not money received
    expect(await ledger(d.ref)).toBe('AUTHORIZED');
    cf.capture(d.ref, p);
    await succeeded(d.ref, p);
    expect(await ledger(d.ref)).toBe('PAID');
    expect((await back(d.ref)).json().status).toBe('PAID');
    expect(await attemptsFor(d.ref)).toHaveLength(1);
  });

  it('nothing reached us yet: the status re-check asks the gateway and finds it PAID', async () => {
    const d = await donation();
    expect(await donorStatus(d.ref)).toBe('PENDING');
    pays(d.ref, d.amountPaise);
    expect(await donorStatus(d.ref)).toBe('PAID');
  });
});

describe('cancel and failure', () => {
  it('a closed payment window leaves no payment: never PAID, the re-check stays PENDING', async () => {
    const d = await donation();
    expect(await donorStatus(d.ref)).toBe('PENDING');
    pays(d.ref, d.amountPaise, { status: 'USER_DROPPED' });
    expect(await donorStatus(d.ref)).toBe('PENDING');
    expect(['CREATED', 'PENDING']).toContain(await ledger(d.ref));
  });

  it('a failed payment → FAILED; a success webhook for it afterwards changes nothing', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise, { status: 'FAILED' });
    await failedEvent(d.ref, p);
    expect(await ledger(d.ref)).toBe('FAILED');
    // A (replayed or forged-in-content) success: the re-fetched order still shows no capture.
    expect((await succeeded(d.ref, p)).statusCode).toBe(500);
    expect(await ledger(d.ref)).toBe('FAILED');
    expect(await donorStatus(d.ref)).toBe('FAILED');
  });

  it('failed attempt then a fresh donation: the retry is a new order, the failed one stays FAILED', async () => {
    const first = await donation();
    await failedEvent(first.ref, pays(first.ref, 100_000, { status: 'FAILED' }));
    const retry = await donation();
    expect(retry.ref).not.toBe(first.ref);
    pays(retry.ref, 100_000);
    expect((await back(retry.ref)).json().status).toBe('PAID');
    expect(await ledger(first.ref)).toBe('FAILED');
  });
});

/**
 * Audit F-1: a donor's first try fails and a retry on the SAME order succeeds (Cashfree allows
 * several attempts per order). The captured money is the truth: the donation ends PAID with
 * exactly one acknowledgement and one set of notifications.
 */
describe('failed try, then success on the same order (audit F-1)', () => {
  const withReceipt = () => donation(100_000, { wantsReceipt: true });
  async function expectPaidOnce(ref: string) {
    const intent = await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } });
    expect(intent.status).toBe('PAID');
    expect(await db.receipt.count({ where: { donationIntentId: intent.id } })).toBe(1);
    expect(
      await db.notificationOutbox.count({
        where: { entityRef: `donation_intent:${intent.id}`, template: 'owner_donation_paid' },
      }),
    ).toBe(1);
    const history = await db.donationStatusEvent.findMany({
      where: { donationIntentId: intent.id, toStatus: 'PAID' },
    });
    expect(history).toHaveLength(1);
    expect(history[0]?.source).toBe('gateway_verified');
    return { intent, history };
  }

  it('(a) back on the site after a failure, then again after the retry succeeded → PAID once', async () => {
    const d = await withReceipt();
    pays(d.ref, 100_000, { status: 'FAILED' });
    expect((await back(d.ref)).json().status).toBe('FAILED');
    const ok = pays(d.ref, 100_000);
    expect((await back(d.ref)).json().status).toBe('PAID');
    const { history } = await expectPaidOnce(d.ref);
    expect(history[0]?.fromStatus).toBe('FAILED'); // the owner sees "paid after a failed try"
    const [attempt] = await attemptsFor(d.ref);
    expect(attempt).toMatchObject({ providerPaymentId: ok, capturedPaise: 100_000 });
    expect(await donorStatus(d.ref)).toBe('PAID');
  });

  it('(b) failed webhook first, then the success webhook → PAID once; the return later is absorbed', async () => {
    const d = await withReceipt();
    await failedEvent(d.ref, pays(d.ref, 100_000, { status: 'FAILED' }));
    expect(await ledger(d.ref)).toBe('FAILED');
    const ok = pays(d.ref, 100_000);
    await succeeded(d.ref, ok);
    expect((await back(d.ref)).json().status).toBe('PAID');
    await expectPaidOnce(d.ref);
  });

  it('(c) the failed webhook arrives AFTER the success → stays PAID, no exception', async () => {
    const d = await withReceipt();
    const failed = pays(d.ref, 100_000, { status: 'FAILED' });
    const ok = pays(d.ref, 100_000);
    expect((await back(d.ref)).json().status).toBe('PAID');
    await failedEvent(d.ref, failed);
    const { intent } = await expectPaidOnce(d.ref);
    expect(await db.paymentException.count({ where: { donationIntentId: intent.id } })).toBe(0);
    const [attempt] = await attemptsFor(d.ref);
    expect(attempt).toMatchObject({ providerPaymentId: ok, providerStatus: 'captured' });
  });

  it('(d) two captured payments on one order → stays PAID once + DUPLICATE_PAYMENT for the owner', async () => {
    const d = await withReceipt();
    const first = pays(d.ref, 100_000);
    const second = pays(d.ref, 100_000);
    await succeeded(d.ref, first);
    await succeeded(d.ref, second);
    const { intent } = await expectPaidOnce(d.ref);
    expect(
      await db.paymentException.count({
        where: { donationIntentId: intent.id, kind: 'DUPLICATE_PAYMENT' },
      }),
    ).toBe(1);
  });

  it('(d2) a captured payment while another is only authorized → MANUAL_REVIEW, never PAID', async () => {
    const d = await withReceipt();
    pays(d.ref, 100_000, { captured: false });
    expect(await donorStatus(d.ref)).toBe('PENDING');
    expect(await ledger(d.ref)).toBe('AUTHORIZED');
    await succeeded(d.ref, pays(d.ref, 100_000));
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW');
    const intent = await db.donationIntent.findUniqueOrThrow({ where: { publicReference: d.ref } });
    expect(
      await db.paymentException.count({
        where: { donationIntentId: intent.id, kind: 'DUPLICATE_PAYMENT' },
      }),
    ).toBe(1);
    expect(await db.receipt.count({ where: { donationIntentId: intent.id } })).toBe(0);
  });

  it('(d3) two captured payments arriving AT THE SAME TIME: PAID once and the duplicate is flagged', async () => {
    for (let run = 0; run < 5; run++) {
      const d = await withReceipt();
      const [a, b] = [pays(d.ref, 100_000), pays(d.ref, 100_000)];
      await Promise.all([succeeded(d.ref, a), succeeded(d.ref, b)]);
      // A webhook that lost a race answers 500 and the gateway retries it: deliver both again.
      await succeeded(d.ref, a);
      await succeeded(d.ref, b);
      const { intent } = await expectPaidOnce(d.ref);
      expect(
        await db.paymentException.count({
          where: { donationIntentId: intent.id, kind: 'DUPLICATE_PAYMENT' },
        }),
      ).toBe(1);
    }
  });

  it('(d4) re-checking an order with two captured payments again and again flags it once', async () => {
    const d = await withReceipt();
    pays(d.ref, 100_000);
    pays(d.ref, 100_000);
    for (let i = 0; i < 3; i++) expect(await donorStatus(d.ref)).toBe('PAID');
    const { intent } = await expectPaidOnce(d.ref);
    expect(
      await db.paymentException.count({
        where: { donationIntentId: intent.id, kind: 'DUPLICATE_PAYMENT' },
      }),
    ).toBe(1);
  });

  it('(e) the donor status re-check heals a FAILED donation whose retry was captured', async () => {
    const d = await withReceipt();
    await failedEvent(d.ref, pays(d.ref, 100_000, { status: 'FAILED' }));
    expect(await donorStatus(d.ref)).toBe('FAILED'); // nothing captured yet: still FAILED
    pays(d.ref, 100_000); // the retry succeeded but nothing reached us
    expect(await donorStatus(d.ref)).toBe('PAID');
    await expectPaidOnce(d.ref);
  });

  it('a later authorization on a FAILED donation is not money: stays FAILED until it is captured', async () => {
    const d = await withReceipt();
    await failedEvent(d.ref, pays(d.ref, 100_000, { status: 'FAILED' }));
    const retry = pays(d.ref, 100_000, { captured: false });
    expect(await donorStatus(d.ref)).toBe('FAILED');
    expect(await ledger(d.ref)).toBe('FAILED');
    const [attempt] = await attemptsFor(d.ref);
    expect(attempt).toMatchObject({ providerPaymentId: retry }); // claimed, not paid
    cf.capture(d.ref, retry);
    await succeeded(d.ref, retry);
    await expectPaidOnce(d.ref);
  });

  it('a refund in progress is never undone by a late failed or a replayed success event', async () => {
    const d = await withReceipt();
    const p = pays(d.ref, 100_000);
    await succeeded(d.ref, p);
    await db.donationIntent.update({
      where: { publicReference: d.ref },
      data: { status: 'REFUND_PENDING' }, // as the refund flow leaves it
    });
    await failedEvent(d.ref, p);
    await succeeded(d.ref, p);
    expect(await ledger(d.ref)).toBe('REFUND_PENDING');
  });

  it('a captured retry with the wrong amount after a failure goes to the owner, never PAID', async () => {
    const d = await withReceipt();
    await failedEvent(d.ref, pays(d.ref, 100_000, { status: 'FAILED' }));
    const wrong = pays(d.ref, 1_000);
    await succeeded(d.ref, wrong);
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW'); // money moved: the owner must look
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: wrong, kind: 'PAYMENT_MISMATCH' },
      }),
    ).toBe(1);
    // A failed payment with a wrong amount is not money: no review.
    const other = await withReceipt();
    await failedEvent(other.ref, pays(other.ref, 100_000, { status: 'FAILED' }));
    await failedEvent(other.ref, pays(other.ref, 1_000, { status: 'FAILED' }));
    expect(await ledger(other.ref)).toBe('FAILED');
  });
});

describe('gateway-neutral states (Phase 1b)', () => {
  it('attempts are stored with neutral states; a legacy "created" claim never blocks a capture', async () => {
    const d = await donation();
    const started = pays(d.ref, d.amountPaise, { status: 'PENDING' });
    expect(await donorStatus(d.ref)).toBe('PENDING');
    let [attempt] = await attemptsFor(d.ref);
    expect(attempt).toMatchObject({ providerStatus: 'pending', providerPaymentId: null });

    // A row written before Phase 1b: the old gateway's word, with the payment ID recorded.
    await db.paymentAttempt.update({
      where: { id: attempt!.id },
      data: { providerStatus: 'created', providerPaymentId: started },
    });
    const ok = pays(d.ref, d.amountPaise);
    await succeeded(d.ref, ok);
    expect(await ledger(d.ref)).toBe('PAID');
    [attempt] = await attemptsFor(d.ref);
    expect(attempt).toMatchObject({ providerStatus: 'captured', providerPaymentId: ok });
    const intent = await db.donationIntent.findUniqueOrThrow({ where: { publicReference: d.ref } });
    expect(await db.paymentException.count({ where: { donationIntentId: intent.id } })).toBe(0);
  });

  it('an unrecognised word for the claimed payment never overwrites "captured"', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise);
    await succeeded(d.ref, p);
    cf.setPayment(d.ref, p, { payment_status: 'FLAGGED' }, 'ACTIVE');
    await failedEvent(d.ref, p); // anything that makes us look again
    expect(await ledger(d.ref)).toBe('PAID');
    const [attempt] = await attemptsFor(d.ref);
    expect(attempt).toMatchObject({ providerStatus: 'captured', capturedPaise: d.amountPaise });
  });

  it('an unrecognised word that claims first, then a different capture → owner review, never PAID', async () => {
    const d = await donation();
    pays(d.ref, d.amountPaise, { status: 'FLAGGED', captured: false });
    expect(await donorStatus(d.ref)).toBe('PENDING');
    const second = pays(d.ref, d.amountPaise);
    await succeeded(d.ref, second);
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW');
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: second, kind: 'DUPLICATE_PAYMENT' },
      }),
    ).toBe(1);
  });
});

describe('duplicate, delayed and out-of-order webhooks', () => {
  it('the same event delivered three times is stored and applied once', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise);
    for (let i = 0; i < 3; i++) expect((await succeeded(d.ref, p)).statusCode).toBe(200);
    expect(
      await db.webhookEvent.count({
        where: { providerEventId: `pay:PAYMENT_SUCCESS_WEBHOOK:${p}:SUCCESS` },
      }),
    ).toBe(1);
    expect(await attemptsFor(d.ref)).toHaveLength(1);
    expect(await ledger(d.ref)).toBe('PAID');
  });

  it('success, then a stale failure event for the same payment: stays PAID', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise);
    await succeeded(d.ref, p);
    await failedEvent(d.ref, p);
    expect(await ledger(d.ref)).toBe('PAID');
  });

  it('a late authorization after the return reported failure cannot revive the donation', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise, { status: 'FAILED' });
    await back(d.ref);
    expect(await ledger(d.ref)).toBe('FAILED');
    cf.setPayment(d.ref, p, { payment_status: 'SUCCESS', is_captured: false });
    expect(await donorStatus(d.ref)).toBe('FAILED');
    expect(await ledger(d.ref)).toBe('FAILED');
  });
});

describe('mismatches never become PAID', () => {
  it('amount: a captured payment of a different amount → MANUAL_REVIEW + exception', async () => {
    const d = await donation(100_000);
    const p = pays(d.ref, 10_000);
    expect((await back(d.ref)).json().status).not.toBe('PAID');
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW');
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: p, kind: 'PAYMENT_MISMATCH' },
      }),
    ).toBeGreaterThan(0);
    await succeeded(d.ref, p);
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW');
  });

  it('currency: a non-INR payment (webhook path) → MANUAL_REVIEW', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise, { currency: 'USD' });
    await succeeded(d.ref, p);
    expect(await ledger(d.ref)).toBe('MANUAL_REVIEW');
  });

  it("order: a payment on another donation's order cannot pay this one", async () => {
    const a = await donation();
    const b = await donation();
    const p = pays(b.ref, 100_000);
    // The webhook names b's payment but a's order: a's own order has no payment.
    expect((await succeeded(a.ref, p)).statusCode).toBe(500);
    expect((await back(a.ref)).json().status).toBe('PENDING');
    expect(await ledger(a.ref)).not.toBe('PAID');
  });

  it('a webhook for an order the trust never created → exception, no donation touched', async () => {
    const paidBefore = await db.donationIntent.count({ where: { status: 'PAID' } });
    const res = await succeeded('TOT-D-NOTOURS00001', '5999888777');
    expect(res.statusCode).toBe(200);
    expect(
      await db.paymentException.count({
        where: { providerPaymentId: '5999888777', kind: 'UNMATCHED_CREDIT' },
      }),
    ).toBe(1);
    expect(await db.donationIntent.count({ where: { status: 'PAID' } })).toBe(paidBefore);
  });
});

describe('bad signatures', () => {
  it('a webhook with a bad signature is refused and changes nothing', async () => {
    const d = await donation();
    const p = pays(d.ref, d.amountPaise);
    const events = await db.webhookEvent.count();
    for (const secret of ['wrong-secret-0000000001', `${SECRET}x`]) {
      const res = await sendCashfreeWebhook(app, secret, cashfreePaymentEvent(d.ref, p));
      expect(res.statusCode).toBe(400);
    }
    expect(await db.webhookEvent.count()).toBe(events);
    expect(await ledger(d.ref)).toBe('CREATED');
    expect((await attemptsFor(d.ref))[0]?.providerPaymentId).toBeNull();
  });
});

describe('refresh and back button', () => {
  it('re-submitting the same attempt (same Idempotency-Key) returns the same order, never a second one', async () => {
    const key = 'suite-refresh-key-0000000001';
    const first = await createIntent(100_000, key);
    const again = await createIntent(100_000, key);
    expect(again.json().checkout).toEqual(first.json().checkout);
    expect(again.json().publicReference).toBe(first.json().publicReference);
    expect(await attemptsFor(first.json().checkout.orderId)).toHaveLength(1);
  });

  it('coming back again after a refresh, and status checks after back, stay PAID once', async () => {
    const d = await donation();
    pays(d.ref, d.amountPaise);
    for (let i = 0; i < 3; i++) {
      expect((await back(d.ref)).json().status).toBe('PAID');
      expect(await donorStatus(d.ref)).toBe('PAID');
    }
    expect(await attemptsFor(d.ref)).toHaveLength(1);
    expect(
      await db.paymentException.count({ where: { donationIntent: { publicReference: d.ref } } }),
    ).toBe(0);
  });
});

describe('amounts: ₹1 and limits', () => {
  it('a ₹1 donation goes all the way to PAID', async () => {
    const d = await donation(100);
    pays(d.ref, 100);
    expect((await back(d.ref)).json()).toMatchObject({ status: 'PAID', amountPaise: 100 });
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

describe('test mode only', () => {
  it('production Cashfree is refused outside the production deployment', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', ...cf.env, CASHFREE_ENV: 'production' })).toThrow();
    expect(cf.env.CASHFREE_ENV).toBe('sandbox');
  });
});
