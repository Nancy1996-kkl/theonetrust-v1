import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { useTestDb } from '../../test/db.ts';
import {
  cashfreePaymentEvent,
  fakeCashfree,
  sendCashfreeWebhook,
} from '../../test/fake-cashfree.ts';
import * as reconcile from './reconcile.ts';

/**
 * The durable, idempotent webhook delivery (#27, audit F-3), exercised through the Cashfree
 * webhook: one stored row per event key, duplicates acknowledged without being applied twice,
 * failures answered 500 so the gateway retries, and stale RECEIVED rows re-processed exactly once.
 * Gateway-specific behaviour (signature, re-fetch, refunds) is in cashfree.db.test.ts.
 */
const db = useTestDb();
const SECRET = 'webhook-secret-0123456789';
const cf = fakeCashfree(SECRET);
let app: FastifyInstance;
let ip = 0;

beforeAll(() => {
  app = buildApp(loadEnv({ NODE_ENV: 'test', ...cf.env }), { db, paymentProvider: cf.provider });
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
      donorPhone: '+919876543210',
      hideNamePublicly: true,
      wantsReceipt: false,
      coverFee: false,
      consent: true,
      locale: 'en',
    },
  });
  expect(res.statusCode).toBe(201);
  return { ref: (res.json() as { publicReference: string }).publicReference };
}

/** The event key the Cashfree webhook derives for a payment success. */
const keyFor = (paymentId: string) => `pay:PAYMENT_SUCCESS_WEBHOOK:${paymentId}:SUCCESS`;
const success = (ref: string, paymentId: string) =>
  sendCashfreeWebhook(app, SECRET, cashfreePaymentEvent(ref, paymentId));

const statusOf = async (ref: string) =>
  (await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } })).status;

describe('webhook delivery', () => {
  it('a processed event is stored once with its outcome', async () => {
    const d = await donation();
    const paymentId = cf.pay(d.ref);
    const res = await success(d.ref, paymentId);
    expect(res.json()).toEqual({ received: true });
    expect(await statusOf(d.ref)).toBe('PAID');
    const event = await db.webhookEvent.findFirstOrThrow({
      where: { providerEventId: keyFor(paymentId) },
    });
    expect(event).toMatchObject({
      provider: 'CASHFREE',
      eventType: 'PAYMENT_SUCCESS_WEBHOOK',
      signatureValid: true,
      processingStatus: 'PROCESSED',
      attempts: 1,
    });
  });

  it('a duplicate delivery creates no duplicate records and is acknowledged', async () => {
    const d = await donation();
    const paymentId = cf.pay(d.ref);
    const first = await success(d.ref, paymentId);
    const again = await success(d.ref, paymentId);
    expect(first.json()).toEqual({ received: true });
    expect(again.json()).toEqual({ received: true, duplicate: true });
    expect(await db.webhookEvent.count({ where: { providerEventId: keyFor(paymentId) } })).toBe(1);
    expect(await db.paymentAttempt.count({ where: { providerPaymentId: paymentId } })).toBe(1);
  });

  it('a processing failure is recorded as FAILED (500, so the gateway retries); the retry processes it', async () => {
    const d = await donation();
    // The webhook says SUCCESS but the gateway has no settled payment yet.
    const paymentId = '5999000001';
    const bad = await success(d.ref, paymentId);
    expect(bad.statusCode).toBe(500);
    expect(
      (await db.webhookEvent.findFirstOrThrow({ where: { providerEventId: keyFor(paymentId) } }))
        .processingStatus,
    ).toBe('FAILED');
    const order = cf.orders.get(d.ref);
    order?.payments.push({
      cf_payment_id: paymentId,
      payment_status: 'SUCCESS',
      is_captured: true,
      payment_amount: order.amount,
      payment_currency: 'INR',
      payment_group: 'upi',
    });
    if (order) order.order_status = 'PAID';
    const ok = await success(d.ref, paymentId);
    expect(ok.statusCode).toBe(200);
    const row = await db.webhookEvent.findFirstOrThrow({
      where: { providerEventId: keyFor(paymentId) },
    });
    expect(row).toMatchObject({ processingStatus: 'PROCESSED', attempts: 2 });
    expect(await statusOf(d.ref)).toBe('PAID');
  });

  it('a concurrent duplicate insert is acknowledged as a duplicate', async () => {
    const body = { type: 'SETTLEMENT_WEBHOOK', data: { note: 'race-0001' } };
    const spy = vi.spyOn(db.webhookEvent, 'findUnique').mockResolvedValueOnce(null);
    await sendCashfreeWebhook(app, SECRET, body);
    spy.mockResolvedValueOnce(null);
    const res = await sendCashfreeWebhook(app, SECRET, body);
    expect(res.json()).toEqual({ received: true, duplicate: true });
    spy.mockRestore();
  });

  describe('a row left RECEIVED (process died mid-way, audit F-3)', () => {
    const LEASE_MS = loadEnv({ NODE_ENV: 'test' }).WEBHOOK_REPROCESS_AFTER_MS;
    /** The event was stored, then the process died before recording any outcome. */
    async function stuck(id: string, ageMs: number) {
      await db.webhookEvent.create({
        data: {
          provider: 'CASHFREE',
          providerEventId: id,
          eventType: 'PAYMENT_SUCCESS_WEBHOOK',
          signatureValid: true,
          receivedAt: new Date(Date.now() - ageMs),
        },
      });
    }

    it('defaults to a two-minute lease', () => {
      expect(LEASE_MS).toBe(120_000);
    });

    it('a stale RECEIVED row is re-processed by the retry, exactly once', async () => {
      const d = await donation();
      const paymentId = cf.pay(d.ref);
      await stuck(keyFor(paymentId), LEASE_MS + 60_000);
      const res = await success(d.ref, paymentId);
      expect(res.json()).toEqual({ received: true });
      expect(await statusOf(d.ref)).toBe('PAID');
      const row = await db.webhookEvent.findFirstOrThrow({
        where: { providerEventId: keyFor(paymentId) },
      });
      // One claim + one completion; the arrival time is kept for the owner's view.
      expect(row).toMatchObject({ processingStatus: 'PROCESSED', attempts: 2 });
      expect(row.receivedAt.getTime()).toBeLessThan(Date.now() - LEASE_MS);
      // Now settled: a further retry is a plain duplicate and applies nothing again.
      const again = await success(d.ref, paymentId);
      expect(again.json()).toEqual({ received: true, duplicate: true });
      expect(await db.webhookEvent.count({ where: { providerEventId: keyFor(paymentId) } })).toBe(
        1,
      );
    });

    it('a fresh RECEIVED row is a delivery still in flight → acknowledged as duplicate, untouched', async () => {
      const d = await donation();
      const paymentId = cf.pay(d.ref);
      await stuck(keyFor(paymentId), 5_000);
      const res = await success(d.ref, paymentId);
      expect(res.json()).toEqual({ received: true, duplicate: true });
      expect(await statusOf(d.ref)).not.toBe('PAID');
      expect(
        (await db.webhookEvent.findFirstOrThrow({ where: { providerEventId: keyFor(paymentId) } }))
          .processingStatus,
      ).toBe('RECEIVED');
    });

    it('two concurrent retries of a stale row: exactly one processes it', async () => {
      const d = await donation();
      const paymentId = cf.pay(d.ref);
      await stuck(keyFor(paymentId), LEASE_MS + 60_000);
      const results = await Promise.all([success(d.ref, paymentId), success(d.ref, paymentId)]);
      const bodies = results.map((r) => r.json() as { duplicate?: boolean });
      expect(bodies.filter((b) => b.duplicate)).toHaveLength(1);
      const row = await db.webhookEvent.findFirstOrThrow({
        where: { providerEventId: keyFor(paymentId) },
      });
      expect(row).toMatchObject({ processingStatus: 'PROCESSED', attempts: 2 }); // one claim won
      expect(await statusOf(d.ref)).toBe('PAID');
      const intent = await db.donationIntent.findUniqueOrThrow({
        where: { publicReference: d.ref },
      });
      expect(
        await db.donationStatusEvent.count({
          where: { donationIntentId: intent.id, toStatus: 'PAID' },
        }),
      ).toBe(1);
    });

    it('a claim holds its lease: a second retry right after a claim is a duplicate', async () => {
      const d = await donation();
      const paymentId = cf.pay(d.ref);
      await stuck(keyFor(paymentId), LEASE_MS + 60_000);
      await db.webhookEvent.updateMany({
        where: { providerEventId: keyFor(paymentId) },
        data: { processedAt: new Date() }, // another run claimed it moments ago
      });
      const res = await success(d.ref, paymentId);
      expect(res.json()).toEqual({ received: true, duplicate: true });
      const row = await db.webhookEvent.findFirstOrThrow({
        where: { providerEventId: keyFor(paymentId) },
      });
      expect(row).toMatchObject({ processingStatus: 'RECEIVED', attempts: 0 });
    });

    it('a stale row whose re-processing fails ends FAILED (500), so the gateway retries again', async () => {
      const d = await donation();
      const paymentId = '5999000002'; // not settled at the gateway → processing throws
      await stuck(keyFor(paymentId), LEASE_MS + 60_000);
      const res = await success(d.ref, paymentId);
      expect(res.statusCode).toBe(500);
      expect(
        (await db.webhookEvent.findFirstOrThrow({ where: { providerEventId: keyFor(paymentId) } }))
          .processingStatus,
      ).toBe('FAILED');
    });

    it('the lease setting is bounded (1 minute to 1 hour)', () => {
      expect(() => loadEnv({ NODE_ENV: 'test', WEBHOOK_REPROCESS_AFTER_MS: '10000' })).toThrow();
      expect(() => loadEnv({ NODE_ENV: 'test', WEBHOOK_REPROCESS_AFTER_MS: '7200000' })).toThrow();
      expect(
        loadEnv({ NODE_ENV: 'test', WEBHOOK_REPROCESS_AFTER_MS: '300000' })
          .WEBHOOK_REPROCESS_AFTER_MS,
      ).toBe(300_000);
    });

    it('old PROCESSED and IGNORED rows stay duplicates however old they are', async () => {
      const d = await donation();
      for (const processingStatus of ['PROCESSED', 'IGNORED'] as const) {
        const paymentId = cf.pay(d.ref);
        await db.webhookEvent.create({
          data: {
            provider: 'CASHFREE',
            providerEventId: keyFor(paymentId),
            eventType: 'PAYMENT_SUCCESS_WEBHOOK',
            signatureValid: true,
            processingStatus,
            receivedAt: new Date(Date.now() - 10 * LEASE_MS),
          },
        });
        const res = await success(d.ref, paymentId);
        expect(res.json()).toEqual({ received: true, duplicate: true });
        expect(
          (
            await db.webhookEvent.findFirstOrThrow({
              where: { providerEventId: keyFor(paymentId) },
            })
          ).processingStatus,
        ).toBe(processingStatus);
      }
    });
  });

  it('PAYMENT_PROVIDER=none stops NEW donations only: in-flight payments are still recorded', async () => {
    const d = await donation(); // made while online giving was on
    const paymentId = cf.pay(d.ref);
    const off = buildApp(loadEnv({ NODE_ENV: 'test', ...cf.env, PAYMENT_PROVIDER: 'none' }), {
      db,
      paymentProvider: cf.provider,
    });
    try {
      const fresh = await off.inject({
        method: 'POST',
        url: '/api/v1/donation-intents',
        remoteAddress: '10.11.9.1',
        payload: {
          giftPaise: 100_000,
          currency: 'INR',
          programme: null,
          donorName: 'Synthetic Donor',
          donorPhone: '+919876543210',
          hideNamePublicly: true,
          wantsReceipt: false,
          coverFee: false,
          consent: true,
          locale: 'en',
        },
      });
      expect(fresh.statusCode).toBe(503);
      const res = await sendCashfreeWebhook(off, SECRET, cashfreePaymentEvent(d.ref, paymentId));
      expect(res.json()).toEqual({ received: true });
      expect(await statusOf(d.ref)).toBe('PAID');
    } finally {
      await off.close();
    }
  });

  it('applyRefund is exported for reuse', () => {
    expect(typeof reconcile.applyRefund).toBe('function');
  });
});
