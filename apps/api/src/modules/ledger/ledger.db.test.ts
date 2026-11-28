import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';
import {
  cashfreePaymentEvent,
  cashfreeRefundEvent,
  fakeCashfree,
  sendCashfreeWebhook,
} from '../../test/fake-cashfree.ts';
import { istDayStart, istStamp, maskEmail } from './query.ts';

/**
 * Owner ledger (#31), end to end through the real API: a donor pays, the owner finds the
 * donation, reads its full history, works the exceptions queue, handles receipts and exports.
 */
const db = useTestDb();
const SECRET = 'ledger-cashfree-secret-01';
const ORIGIN = 'http://localhost:5173';
let app: FastifyInstance;
let ip = 0;
let send: (
  m: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
) => Promise<LightMyRequestResponse>;

const cf = fakeCashfree(SECRET);

beforeAll(async () => {
  app = buildApp(
    loadEnv({
      NODE_ENV: 'test',
      ...cf.env,
      AUTH_SECRET_KEY: randomBytes(32).toString('base64'),
      CORS_ORIGINS: ORIGIN,
    }),
    { db, paymentProvider: cf.provider },
  );
  const email = `${unique('ledger-owner')}@example.org`;
  await setOwnerPassword(db, email, 'river mango lamp seventeen');
  let cookie = '';
  let csrf = '';
  send = async (method, url, body) => {
    const res = await app.inject({
      method,
      url,
      headers: {
        origin: ORIGIN,
        ...(csrf && { 'x-csrf-token': csrf }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(cookie && { cookies: { tot_admin: cookie } }),
      ...(body !== undefined && { payload: JSON.stringify(body) }),
    });
    const set = res.cookies.find((c) => c.name === 'tot_admin');
    if (set) cookie = set.value;
    if (res.headers['content-type']?.includes('json')) {
      const token = (res.json() as { csrfToken?: string }).csrfToken;
      if (token) csrf = token;
    }
    return res;
  };
  await send('POST', '/api/v1/auth/login', { email, password: 'river mango lamp seventeen' });
  const { secret } = (await send('POST', '/api/v1/auth/mfa/setup')).json() as { secret: string };
  await send('POST', '/api/v1/auth/mfa/enable', {
    code: hotp(base32Decode(secret), timeStep(new Date())),
  });
});
afterAll(async () => {
  await app.close();
});

const nextIp = () => `10.31.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;

async function intent(giftPaise = 100_000, patch: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: nextIp(),
    payload: {
      giftPaise,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Ledger Donor',
      donorEmail: 'ledger.donor@example.org',
      donorPhone: '+919812345678',
      hideNamePublicly: true,
      wantsReceipt: true,
      coverFee: false,
      consent: true,
      locale: 'en',
      ...patch,
    },
  });
  const body = res.json() as { publicReference: string; checkout: { orderId: string } };
  const row = await db.donationIntent.findUniqueOrThrow({
    where: { publicReference: body.publicReference },
  });
  // With Cashfree, the gateway order ID is our public reference.
  return { ref: body.publicReference, orderId: body.checkout.orderId, id: row.id };
}

/** The donor pays at the gateway; returns the gateway's payment ID. */
function pays(
  ref: string,
  amountPaise: number,
  opts: { status?: 'SUCCESS' | 'FAILED' | 'PENDING' } = {},
) {
  return { paymentId: cf.pay(ref, { paise: amountPaise, ...opts }) };
}

/** The donor is back on the site: the server re-fetches the order from the gateway. */
const verify = (ref: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/payments/verify',
    remoteAddress: nextIp(),
    payload: { publicReference: ref },
  });

const paymentWebhook = (
  ref: string,
  paymentId: string,
  type?: Parameters<typeof cashfreePaymentEvent>[2],
) => sendCashfreeWebhook(app, SECRET, cashfreePaymentEvent(ref, paymentId, type));

/** A processed refund of `paise` on a payment, as the gateway reports it. */
function refunded(ref: string, paymentId: string, paise: number) {
  const refundId = cf.refund(ref, paymentId, paise, 'SUCCESS');
  return sendCashfreeWebhook(app, SECRET, cashfreeRefundEvent(ref, paymentId, refundId, 'SUCCESS'));
}

async function paid(giftPaise = 100_000, patch: Record<string, unknown> = {}) {
  const d = await intent(giftPaise, patch);
  const p = pays(d.ref, giftPaise);
  await verify(d.ref);
  return { ...d, payment: p };
}

describe('overview', () => {
  it('verified totals today / month / lifetime, refunds shown separately; attention counts', async () => {
    const before = (await send('GET', '/api/v1/admin/overview')).json();
    const d = await paid(200_000);
    await refunded(d.ref, d.payment.paymentId, 50_000);
    const pending = await intent(30_000);
    pays(pending.ref, 30_000, { status: 'PENDING' });
    await verify(pending.ref);
    const failed = await intent(40_000);
    const failure = pays(failed.ref, 40_000, { status: 'FAILED' });
    await paymentWebhook(failed.ref, failure.paymentId, 'PAYMENT_FAILED_WEBHOOK');
    const after = (await send('GET', '/api/v1/admin/overview')).json();
    for (const window of ['today', 'month', 'lifetime'] as const) {
      expect(after[window].grossPaise - before[window].grossPaise).toBe(200_000);
      expect(after[window].refundedPaise - before[window].refundedPaise).toBe(50_000);
      expect(after[window].netPaise - before[window].netPaise).toBe(150_000);
      expect(after[window].count - before[window].count).toBe(1);
    }
    expect(after.pending.count - before.pending.count).toBeGreaterThanOrEqual(1);
    expect(after.failed.count - before.failed.count).toBe(1);
    expect(after.refunds.amountPaise - before.refunds.amountPaise).toBe(50_000);
  });
});

describe('donations ledger', () => {
  it('finds a donation by reference, receipt number, gateway IDs; filters and paginates', async () => {
    const d = await paid(150_000);
    const receipt = await db.receipt.findFirstOrThrow({ where: { donationIntentId: d.id } });
    for (const q of [
      d.ref,
      d.ref.toLowerCase(),
      receipt.receiptNumber,
      d.orderId,
      d.payment.paymentId,
    ]) {
      const res = await send('GET', `/api/v1/admin/donations?q=${encodeURIComponent(q)}`);
      expect(res.json().items.map((i: { id: string }) => i.id)).toEqual([d.id]);
    }
    const item = (await send('GET', `/api/v1/admin/donations?q=${d.ref}`)).json().items[0];
    expect(item).toMatchObject({
      reference: d.ref,
      status: 'PAID',
      method: 'upi',
      channel: 'CHECKOUT',
      amountPaise: 150_000,
      receipt: { number: receipt.receiptNumber, state: 'VALID' },
    });
    expect(item.paidAt).not.toBeNull();

    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const filtered = (
      await send(
        'GET',
        `/api/v1/admin/donations?status=PAID&method=upi&receipt=valid&programme=general&from=${today}&to=${today}&sort=amount_desc`,
      )
    ).json();
    expect(filtered.items.some((i: { id: string }) => i.id === d.id)).toBe(true);
    expect(filtered.items.every((i: { status: string }) => i.status === 'PAID')).toBe(true);
    const amounts = filtered.items.map((i: { amountPaise: number }) => i.amountPaise);
    expect(amounts).toEqual([...amounts].sort((a: number, b: number) => b - a));
    expect(
      (await send('GET', `/api/v1/admin/donations?q=${d.ref}&method=bank_transfer`)).json().items,
    ).toEqual([]);
    expect(
      (await send('GET', `/api/v1/admin/donations?q=${d.ref}&receipt=none`)).json().items,
    ).toEqual([]);
    expect(
      (await send('GET', `/api/v1/admin/donations?q=${d.ref}&to=2020-01-01`)).json().total,
    ).toBe(0);

    const page1 = (await send('GET', '/api/v1/admin/donations?page=1')).json();
    expect(page1.pageSize).toBe(25);
    expect(page1.items.length).toBeLessThanOrEqual(25);
    expect(page1.total).toBeGreaterThan(0);
  });

  it('only allow-listed sorts and valid filters are accepted', async () => {
    for (const bad of [
      'sort=donorEmail',
      'sort=amount',
      'status=PAYED',
      'from=04-11-2026',
      'q=a%27%20OR%201%3D1',
      'page=0',
    ]) {
      expect((await send('GET', `/api/v1/admin/donations?${bad}`)).statusCode).toBe(400);
    }
  });

  it('detail: status history, webhook history, receipts, emails — contact details masked', async () => {
    const d = await paid(120_000);
    await paymentWebhook(d.ref, d.payment.paymentId); // a late duplicate, linked to the donation
    const res = await send('GET', `/api/v1/admin/donations/${d.id}`);
    expect(res.statusCode).toBe(200);
    const detail = res.json();
    expect(
      detail.statusHistory.map((h: { from: string; to: string; source: string }) => [
        h.from,
        h.to,
        h.source,
      ]),
    ).toEqual([['CREATED', 'PAID', 'gateway_verified']]);
    expect(detail.webhooks).toEqual([
      expect.objectContaining({
        eventType: 'PAYMENT_SUCCESS_WEBHOOK',
        processingStatus: 'PROCESSED',
      }),
    ]);
    expect(detail.attempts[0]).toMatchObject({
      providerOrderId: d.orderId,
      providerPaymentId: d.payment.paymentId,
      capturedPaise: 120_000,
      // Cashfree has no browser signature: the server always re-fetches the order instead.
      signatureVerified: false,
    });
    expect(detail.receipts[0]).toMatchObject({ state: 'VALID', canResend: true });
    expect(detail.receipts[0].token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(detail.notifications.map((n: { template: string }) => n.template).sort()).toEqual([
      'donor_donation_paid',
      'owner_donation_paid',
      'sheet_donation_paid',
    ]);
    expect(detail.donorEmailMasked).toBe('l•••@example.org');
    expect(detail.donorPhoneMasked).toBe('••••••5678');
    expect(res.body).not.toMatch(/ledger\.donor@|9812345678/);
    expect((await send('GET', `/api/v1/admin/donations/${crypto.randomUUID()}`)).statusCode).toBe(
      404,
    );
  });

  it('amounts and statuses cannot be edited: there is no write route for a donation', async () => {
    const d = await paid();
    for (const method of ['PATCH', 'PUT', 'DELETE'] as const) {
      const res = await send(method, `/api/v1/admin/donations/${d.id}`, {
        status: 'REFUNDED',
        amountPaise: 1,
      });
      expect(res.statusCode).toBe(404);
    }
    const row = await db.donationIntent.findUniqueOrThrow({ where: { id: d.id } });
    expect(row).toMatchObject({ status: 'PAID', amountPaise: 100_000 });
    // The history itself is append-only.
    await expect(
      db.donationStatusEvent.deleteMany({ where: { donationIntentId: d.id } }),
    ).rejects.toThrow(/append-only/);
  });
});

describe('exceptions queue', () => {
  it('lists stale pending, manual review and open exceptions; re-check uses the normal rules', async () => {
    const stale = await intent(60_000);
    const created = pays(stale.ref, 60_000, { status: 'PENDING' });
    await verify(stale.ref);
    await db.donationIntent.update({
      where: { id: stale.id },
      data: { createdAt: new Date(Date.now() - 2 * 3_600_000) },
    });
    const mismatch = await intent(70_000);
    await paymentWebhook(mismatch.ref, pays(mismatch.ref, 1_000).paymentId);

    const queue = (await send('GET', '/api/v1/admin/exceptions')).json();
    expect(queue.staleAfterMinutes).toBe(30);
    const staleItem = queue.items.find(
      (i: { key: string }) => i.key === `STALE_PENDING:${stale.id}`,
    );
    expect(staleItem).toMatchObject({ reference: stale.ref, actions: ['recheck'] });
    expect(
      queue.items.find((i: { key: string }) => i.key === `MANUAL_REVIEW:${mismatch.id}`),
    ).toBeDefined();
    const exception = queue.items.find(
      (i: { kind: string; donationId: string }) =>
        i.kind === 'PAYMENT_MISMATCH' && i.donationId === mismatch.id,
    );
    expect(exception.actions).toEqual(['resolve']);

    // Re-check needs a reason; then the gateway says captured → PAID through reconcile.
    expect((await send('POST', `/api/v1/admin/donations/${stale.id}/recheck`, {})).statusCode).toBe(
      400,
    );
    cf.capture(stale.ref, created.paymentId);
    const res = await send('POST', `/api/v1/admin/donations/${stale.id}/recheck`, {
      reason: 'Donor says money left the account',
    });
    expect(res.json()).toMatchObject({ status: 'PAID', outcome: 'provider_SUCCESS' });
    expect(
      await db.auditLog.findFirst({ where: { action: 'donation.rechecked', entityId: stale.id } }),
    ).toMatchObject({ changedFields: ['status'] });

    // The mismatch stays in review: a re-check cannot override the amount rule.
    const again = await send('POST', `/api/v1/admin/donations/${mismatch.id}/recheck`, {
      reason: 'Checking the amount again',
    });
    expect(again.json().status).toBe('MANUAL_REVIEW');

    // Resolving the exception needs a reason and is audited (route from #25).
    const resolved = await send(
      'POST',
      `/api/v1/admin/payment-exceptions/${exception.exceptionId}/resolve`,
      {
        reason: 'Refunded the extra payment at the gateway',
      },
    );
    expect(resolved.json().status).toBe('RESOLVED');
    expect(
      (await send('GET', '/api/v1/admin/exceptions'))
        .json()
        .items.some((i: { exceptionId: string }) => i.exceptionId === exception.exceptionId),
    ).toBe(false);
  });

  it('re-check heals a FAILED donation whose retry on the same order was captured (audit F-1)', async () => {
    const d = await intent(100_000);
    const failure = pays(d.ref, 100_000, { status: 'FAILED' });
    await paymentWebhook(d.ref, failure.paymentId, 'PAYMENT_FAILED_WEBHOOK');
    expect((await db.donationIntent.findUniqueOrThrow({ where: { id: d.id } })).status).toBe(
      'FAILED',
    );
    pays(d.ref, 100_000); // the retry succeeded; no callback or webhook reached us
    const res = await send('POST', `/api/v1/admin/donations/${d.id}/recheck`, {
      reason: 'Donor says the second try worked',
    });
    expect(res.json()).toMatchObject({ status: 'PAID', outcome: 'provider_SUCCESS' });

    // The donor also paid a second time on the same order: repeated re-checks flag it ONCE.
    pays(d.ref, 100_000);
    for (let i = 0; i < 3; i++) {
      const again = await send('POST', `/api/v1/admin/donations/${d.id}/recheck`, {
        reason: 'Checking the second payment',
      });
      expect(again.json()).toMatchObject({ status: 'PAID' });
    }
    expect(
      await db.paymentException.count({
        where: { donationIntentId: d.id, kind: 'DUPLICATE_PAYMENT' },
      }),
    ).toBe(1);
    expect(await db.receipt.count({ where: { donationIntentId: d.id } })).toBeLessThanOrEqual(1);
  });

  it('the re-check audit keeps the gateway’s own word; a started-only payment stays unsettled', async () => {
    const d = await intent(30_000);
    pays(d.ref, 30_000, { status: 'PENDING' });
    const res = await send('POST', `/api/v1/admin/donations/${d.id}/recheck`, {
      reason: 'Donor says the app is still waiting',
    });
    expect(res.json()).toMatchObject({ status: 'PENDING', outcome: 'provider_PENDING' });
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: 'donation.rechecked', entityId: d.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.reason).toContain('[provider_PENDING]');
  });

  it('re-check: unknown or bank-transfer donation → 404; gateway down → recorded, nothing changes', async () => {
    expect(
      (
        await send('POST', `/api/v1/admin/donations/${crypto.randomUUID()}/recheck`, {
          reason: 'Checking again',
        })
      ).statusCode,
    ).toBe(404);
    const d = await intent(80_000);
    // Nothing at the gateway yet: the status stays as it is.
    let res = await send('POST', `/api/v1/admin/donations/${d.id}/recheck`, {
      reason: 'Checking again',
    });
    expect(res.json()).toMatchObject({ status: 'CREATED', outcome: 'no_payment_found' });
    // The gateway unreachable: recorded in the audit reason, nothing changes.
    cf.setDown(true);
    res = await send('POST', `/api/v1/admin/donations/${d.id}/recheck`, {
      reason: 'Checking again',
    });
    cf.setDown(false);
    expect(res.json()).toMatchObject({ status: 'CREATED', outcome: 'provider_network' });
    const bank = await intent(90_000);
    await db.donationIntent.update({ where: { id: bank.id }, data: { channel: 'BANK_TRANSFER' } });
    expect(
      (
        await send('POST', `/api/v1/admin/donations/${bank.id}/recheck`, {
          reason: 'Checking again',
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('receipts', () => {
  it('lists receipts with link token and email status; resend queues the email (audited)', async () => {
    const d = await paid(110_000);
    const list = (await send('GET', '/api/v1/admin/receipts')).json();
    const item = list.items.find((r: { donationId: string }) => r.donationId === d.id);
    expect(item).toMatchObject({ reference: d.ref, state: 'VALID', canResend: true });
    expect(item.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(item.lastEmail).toMatchObject({ status: 'PENDING' });

    expect((await send('POST', `/api/v1/admin/receipts/${item.id}/resend`, {})).statusCode).toBe(
      400,
    );
    const res = await send('POST', `/api/v1/admin/receipts/${item.id}/resend`, {
      reason: 'Donor did not get the email',
    });
    expect(res.json()).toEqual({ id: item.id, queued: true });
    expect(
      await db.notificationOutbox.count({
        where: { entityRef: `donation_intent:${d.id}`, template: 'donor_donation_paid' },
      }),
    ).toBe(2);
    expect(
      await db.auditLog.count({ where: { action: 'receipt.resent', entityId: item.id } }),
    ).toBe(1);
  });

  it('resend is refused without consent, for a withdrawn receipt, or an unknown one', async () => {
    const noEmail = await paid(100_000, { donorEmail: null });
    const r1 = await db.receipt.findFirstOrThrow({ where: { donationIntentId: noEmail.id } });
    expect(
      (await send('POST', `/api/v1/admin/receipts/${r1.id}/resend`, { reason: 'Please resend' }))
        .statusCode,
    ).toBe(409);
    const refundedDonation = await paid(100_000);
    await refunded(refundedDonation.ref, refundedDonation.payment.paymentId, 100_000);
    const r2 = await db.receipt.findFirstOrThrow({
      where: { donationIntentId: refundedDonation.id },
    });
    expect(
      (await send('POST', `/api/v1/admin/receipts/${r2.id}/resend`, { reason: 'Please resend' }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await send('POST', `/api/v1/admin/receipts/${crypto.randomUUID()}/resend`, {
          reason: 'Please resend',
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('CSV export', () => {
  it('IST times, active filters, masked personal data, audited', async () => {
    const d = await paid(130_000);
    const res = await send('GET', `/api/v1/admin/donations/export.csv?q=${d.ref}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('donations.csv');
    const lines = res.body
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toContain('"created_ist"');
    expect(lines).toHaveLength(2);
    const row = await db.donationIntent.findUniqueOrThrow({ where: { id: d.id } });
    expect(lines[1]).toContain(`"${istStamp(row.createdAt)}"`);
    expect(lines[1]).toContain('"1300.00"');
    expect(lines[1]).toContain('"S•••"');
    expect(lines[1]).toContain('"l•••@example.org"');
    expect(lines[1]).toContain('"••••••5678"');
    expect(res.body).not.toMatch(/Synthetic Ledger|ledger\.donor@|9812345678/);
    expect(
      await db.auditLog.findFirst({
        where: { action: 'donations.exported' },
        orderBy: { createdAt: 'desc' },
      }),
    ).toMatchObject({ changedFields: ['q'], reason: '1 rows' });
  });
});

describe('helpers and access', () => {
  it('IST day boundaries, stamps and email masking', () => {
    expect(istDayStart('2026-11-04').toISOString()).toBe('2026-11-03T18:30:00.000Z');
    expect(istStamp(new Date('2026-11-04T10:00:00Z'))).toBe('2026-11-04 15:30');
    expect(istStamp(null)).toBe('');
    expect(maskEmail('donor@example.org')).toBe('d•••@example.org');
    expect(maskEmail(null)).toBeNull();
  });

  it('every ledger route is owner-only', async () => {
    for (const url of [
      '/overview',
      '/donations',
      '/donations/export.csv',
      '/exceptions',
      '/receipts',
    ]) {
      expect((await app.inject({ method: 'GET', url: `/api/v1/admin${url}` })).statusCode).toBe(
        401,
      );
    }
  });
});
