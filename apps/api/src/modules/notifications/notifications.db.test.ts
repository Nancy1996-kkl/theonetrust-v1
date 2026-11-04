import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { deriveAuthKeys } from '../../security/crypto.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';
import {
  razorpayProvider,
  type PaymentProvider,
  type ProviderPayment,
} from '../donations/provider.ts';
import { receiptViewByToken } from '../receipts/view.ts';
import { EmailSendError, type EmailMessage, type EmailProvider } from './provider.ts';
import { BACKOFF_MS, MAX_ATTEMPTS, processDueNotifications, type WorkerDeps } from './worker.ts';

/**
 * Notification outbox (#30): queued in the PAID transaction, sent later by the worker, retried
 * with backoff, and an email failure never changes a payment.
 */
const db = useTestDb();
const KEY_SECRET = 'notify-key-secret-0001';
const AUTH_SECRET_KEY = randomBytes(32).toString('base64');
const RECEIPT_KEY = deriveAuthKeys(AUTH_SECRET_KEY).receipt;
const ORIGIN = 'http://localhost:5173';
const OWNER = 'owner.notify@example.org';
let app: FastifyInstance;
let seq = 0;
let ip = 0;
/** The API's clock stays fixed (owner session); the worker's clock moves to test backoff. */
const APP_CLOCK = new Date('2027-06-01T05:00:00Z');
let clock = new Date(APP_CLOCK);

const remote = new Map<string, ProviderPayment>();
const real = razorpayProvider({
  keyId: 'rzp_test_notify00001',
  keySecret: KEY_SECRET,
  fetch: async () => new Response('{}'),
});
const payments: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_notify00001',
  verifyCheckoutSignature: real.verifyCheckoutSignature,
  createOrder: async (input) => ({
    orderId: `order_N${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
  fetchPayment: async (id) => {
    const p = remote.get(id);
    if (!p) throw new Error('unknown');
    return p;
  },
  fetchOrderPayments: async () => [],
};

/** A provider that records messages and fails on demand. */
const sent: EmailMessage[] = [];
let failNext: EmailSendError[] = [];
const email: EmailProvider = {
  name: 'resend',
  send: async (message) => {
    const failure = failNext.shift();
    if (failure) throw failure;
    sent.push(message);
    return { id: `msg_${sent.length}` };
  },
};

const deps = (patch: Partial<WorkerDeps> = {}): WorkerDeps => ({
  db,
  provider: email,
  ownerEmail: OWNER,
  siteUrl: 'https://theonetrust.example',
  receiptKey: RECEIPT_KEY,
  now: () => clock,
  batchSize: 1000,
  ...patch,
});

let send: (m: 'GET' | 'POST', url: string, body?: unknown) => Promise<LightMyRequestResponse>;

beforeAll(async () => {
  app = buildApp(
    loadEnv({
      NODE_ENV: 'test',
      AUTH_SECRET_KEY,
      CORS_ORIGINS: ORIGIN,
      OWNER_NOTIFICATION_EMAIL: OWNER,
      EMAIL_PROVIDER: 'resend',
      EMAIL_API_KEY: 're_test_0123456789abcdef',
      EMAIL_FROM: 'Theonetrust.in <no-reply@example.org>',
    }),
    { db, paymentProvider: payments, now: () => APP_CLOCK },
  );
  // Owner session for the delivery-status routes.
  const ownerLogin = `${unique('notify-owner')}@example.org`;
  await setOwnerPassword(db, ownerLogin, 'river mango lamp seventeen');
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
  await send('POST', '/api/v1/auth/login', {
    email: ownerLogin,
    password: 'river mango lamp seventeen',
  });
  const { secret } = (await send('POST', '/api/v1/auth/mfa/setup')).json() as { secret: string };
  await send('POST', '/api/v1/auth/mfa/enable', {
    code: hotp(base32Decode(secret), timeStep(APP_CLOCK)),
  });
});
beforeEach(() => {
  sent.length = 0;
  failNext = [];
});
afterAll(async () => {
  await app.close();
});

const nextIp = () => `10.30.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;

async function paid(patch: Record<string, unknown> = {}, giftPaise = 100_000) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: nextIp(),
    payload: {
      giftPaise,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Donor',
      donorEmail: 'donor.notify@example.org',
      donorPhone: '+919876543210',
      hideNamePublicly: true,
      wantsReceipt: true,
      coverFee: false,
      consent: true,
      locale: 'ta',
      ...patch,
    },
  });
  const { publicReference: ref, checkout } = res.json() as {
    publicReference: string;
    checkout: { orderId: string };
  };
  const p: ProviderPayment = {
    paymentId: `pay_N${String(++seq).padStart(8, '0')}`,
    orderId: checkout.orderId,
    amountPaise: giftPaise,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    refundedPaise: 0,
  };
  remote.set(p.paymentId, p);
  const verify = () =>
    app.inject({
      method: 'POST',
      url: '/api/v1/payments/verify',
      remoteAddress: nextIp(),
      payload: {
        publicReference: ref,
        orderId: checkout.orderId,
        paymentId: p.paymentId,
        signature: createHmac('sha256', KEY_SECRET)
          .update(`${checkout.orderId}|${p.paymentId}`)
          .digest('hex'),
      },
    });
  const v = await verify();
  const intent = await db.donationIntent.findUniqueOrThrow({ where: { publicReference: ref } });
  return {
    ref,
    intent,
    payment: p,
    verify,
    receiptToken: v.json().receiptToken as string | undefined,
  };
}

const rowsFor = (intentId: string) =>
  db.notificationOutbox.findMany({
    where: { entityRef: `donation_intent:${intentId}` },
    orderBy: { template: 'asc' },
  });
const mailsFor = async (intentId: string) => {
  const ids = new Set((await rowsFor(intentId)).map((r) => r.id));
  return sent.filter((m) => ids.has(m.idempotencyKey));
};

describe('queued with the payment', () => {
  it('PAID → one owner email and, with an email + acknowledgement, one donor email', async () => {
    const d = await paid();
    const rows = await rowsFor(d.intent.id);
    expect(rows.map((r) => [r.template, r.status, r.locale])).toEqual([
      ['donor_donation_paid', 'PENDING', 'ta'],
      ['owner_donation_paid', 'PENDING', 'en'],
    ]);
    // References only: no name, email or phone in the queue.
    expect(JSON.stringify(rows)).not.toMatch(/Synthetic|donor\.notify|9876/);
  });

  it('retries of the payment never queue a second email', async () => {
    const d = await paid();
    await d.verify();
    await d.verify();
    expect(await rowsFor(d.intent.id)).toHaveLength(2);
  });

  it('no donor email without an address, without consent, or without an acknowledgement', async () => {
    for (const patch of [{ donorEmail: null }, { wantsReceipt: false }]) {
      const d = await paid(patch);
      expect((await rowsFor(d.intent.id)).map((r) => r.template)).toEqual(['owner_donation_paid']);
    }
    const small = await paid({}, 10_000); // below the ₹500 acknowledgement minimum
    expect((await rowsFor(small.intent.id)).map((r) => r.template)).toEqual([
      'owner_donation_paid',
    ]);
  });
});

describe('worker: send, retry, give up — the payment stays PAID', () => {
  it('sends both emails with the right content and marks them SENT', async () => {
    const d = await paid({ locale: 'en' });
    await processDueNotifications(deps());
    const rows = await rowsFor(d.intent.id);
    expect(rows.map((r) => r.status)).toEqual(['SENT', 'SENT']);
    const mails = await mailsFor(d.intent.id);
    const owner = mails.find((m) => m.to === OWNER)!;
    const donor = mails.find((m) => m.to === 'donor.notify@example.org')!;
    expect(owner.subject).toContain(d.ref);
    expect(owner.text).toContain(d.payment.paymentId);
    // The owner email never repeats the donor's contact details; no card data anywhere.
    for (const mail of [owner, donor]) {
      expect(`${mail.text}${mail.html}`).not.toMatch(/donor\.notify|9876543210|\b\d{12,19}\b/);
    }
    // The donor's acknowledgement link works.
    const token = /receipt\/([A-Za-z0-9_-]{43})/.exec(donor.text)?.[1];
    expect(token).toBe(d.receiptToken);
    expect((await receiptViewByToken(db, token!, RECEIPT_KEY))?.donationReference).toBe(d.ref);
  });

  it('a failed send keeps the donation PAID and is retried later with backoff (AC)', async () => {
    const d = await paid({ donorEmail: null });
    failNext = [new EmailSendError('http_503', false)];
    await processDueNotifications(deps());
    let [row] = await rowsFor(d.intent.id);
    expect(row).toMatchObject({ status: 'PENDING', retryCount: 1, lastError: 'http_503' });
    expect(row?.nextAttemptAt.getTime()).toBe(clock.getTime() + BACKOFF_MS[0]!);
    expect((await db.donationIntent.findUniqueOrThrow({ where: { id: d.intent.id } })).status).toBe(
      'PAID',
    );

    // Not due yet: nothing is sent.
    await processDueNotifications(deps());
    expect(await mailsFor(d.intent.id)).toHaveLength(0);

    // A minute later it goes out.
    clock = new Date(clock.getTime() + BACKOFF_MS[0]!);
    await processDueNotifications(deps());
    [row] = await rowsFor(d.intent.id);
    expect(row).toMatchObject({ status: 'SENT', retryCount: 2, lastError: null });
    expect(await mailsFor(d.intent.id)).toHaveLength(1);
    expect((await db.donationIntent.findUniqueOrThrow({ where: { id: d.intent.id } })).status).toBe(
      'PAID',
    );
  });

  it('gives up after the last attempt, or at once on a permanent error — shown as FAILED', async () => {
    const d = await paid({ donorEmail: null });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      failNext = [new EmailSendError('network', false)];
      await processDueNotifications(deps());
      clock = new Date(clock.getTime() + 13 * 3_600_000);
    }
    let [row] = await rowsFor(d.intent.id);
    expect(row).toMatchObject({ status: 'FAILED', retryCount: MAX_ATTEMPTS, lastError: 'network' });

    const e = await paid({ donorEmail: null });
    failNext = [new EmailSendError('http_422', true)];
    await processDueNotifications(deps());
    [row] = await rowsFor(e.intent.id);
    expect(row).toMatchObject({ status: 'FAILED', retryCount: 1, lastError: 'http_422' });
    expect((await db.donationIntent.findUniqueOrThrow({ where: { id: e.intent.id } })).status).toBe(
      'PAID',
    );
  });

  it('an unexpected error while sending is retried, not lost', async () => {
    const d = await paid({ donorEmail: null });
    const broken: EmailProvider = {
      name: 'resend',
      send: async () => Promise.reject(new Error('boom')),
    };
    await processDueNotifications(deps({ provider: broken }));
    expect((await rowsFor(d.intent.id))[0]).toMatchObject({
      status: 'PENDING',
      lastError: 'internal',
    });
  });

  it('without a provider nothing is sent and everything stays queued', async () => {
    const d = await paid();
    expect(await processDueNotifications(deps({ provider: undefined }))).toEqual({
      sent: 0,
      retrying: 0,
      failed: 0,
      cancelled: 0,
    });
    expect((await rowsFor(d.intent.id)).every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('cancels with a reason: no owner address configured; donation refunded before sending', async () => {
    const d = await paid();
    await db.donationIntent.update({ where: { id: d.intent.id }, data: { status: 'REFUNDED' } });
    await processDueNotifications(deps({ ownerEmail: undefined }));
    const rows = await rowsFor(d.intent.id);
    expect(rows.map((r) => [r.template, r.status, r.lastError])).toEqual([
      ['donor_donation_paid', 'CANCELLED', 'not_paid'],
      ['owner_donation_paid', 'CANCELLED', 'no_owner_email'],
    ]);
  });

  it('cancels rows whose donation or template is unknown, and donors without a usable address', async () => {
    const rows = await Promise.all(
      [
        ['owner_donation_paid', `donation_intent:${crypto.randomUUID()}`],
        ['owner_help_request_new', `help_request:${crypto.randomUUID()}`],
        ['something_else', 'x:y'],
      ].map(([template, entityRef]) =>
        db.notificationOutbox.create({
          data: {
            eventType: 'test',
            entityRef: entityRef!,
            template: template!,
            dedupeKey: unique('dk'),
          },
        }),
      ),
    );
    const d = await paid();
    await db.donationIntent.update({
      where: { id: d.intent.id },
      data: { donorEmail: 'not-an-address' },
    });
    await processDueNotifications(deps());
    const after = await db.notificationOutbox.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    expect(after.map((r) => r.lastError).sort()).toEqual([
      'entity_missing',
      'entity_missing',
      'unknown_template',
    ]);
    const donor = (await rowsFor(d.intent.id)).find((r) => r.template === 'donor_donation_paid');
    expect(donor).toMatchObject({ status: 'CANCELLED', lastError: 'no_donor_email' });
  });

  it('two workers at once still send each email exactly once', async () => {
    const d = await paid();
    await Promise.all([processDueNotifications(deps()), processDueNotifications(deps())]);
    expect(await mailsFor(d.intent.id)).toHaveLength(2);
    expect(new Set((await mailsFor(d.intent.id)).map((m) => m.idempotencyKey)).size).toBe(2);
  });

  it('new help request → owner email with the reference and a dashboard link only', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/help-requests/callback',
      remoteAddress: nextIp(),
      payload: {
        mode: 'callback',
        phone: `97${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
        consentContact: true,
        pageLanguage: 'ta',
        website: '',
      },
    });
    expect(res.statusCode).toBe(201);
    const { reference } = res.json() as { reference: string };
    const help = await db.helpRequest.findUniqueOrThrow({ where: { reference } });
    await processDueNotifications(deps());
    const mail = sent.find((m) => m.subject.includes(reference))!;
    expect(mail.to).toBe(OWNER);
    expect(mail.text).toContain(`https://theonetrust.example/admin/help-requests/${help.id}`);
    expect(`${mail.text}${mail.html}`).not.toContain(help.contactPhone.slice(-10));
  });
});

describe('delivery status for the owner', () => {
  it('lists emails with counts and references, never addresses or bodies; filters by status', async () => {
    const d = await paid();
    failNext = [new EmailSendError('http_500', false), new EmailSendError('http_401', true)];
    await processDueNotifications(deps());
    const res = await send('GET', '/api/v1/admin/notifications');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sendingEnabled).toBe(true);
    expect(body.counts).toEqual(
      expect.objectContaining({ PENDING: expect.any(Number), FAILED: expect.any(Number) }),
    );
    const mine = body.items.filter((i: { reference: string }) => i.reference === d.ref);
    expect(mine).toHaveLength(2);
    expect(mine.map((i: { audience: string }) => i.audience).sort()).toEqual(['donor', 'owner']);
    expect(res.body).not.toMatch(/donor\.notify|owner\.notify|9876/);
    const failed = await send('GET', '/api/v1/admin/notifications?status=FAILED');
    expect(failed.json().items.every((i: { status: string }) => i.status === 'FAILED')).toBe(true);
    expect((await send('GET', '/api/v1/admin/notifications?status=NOPE')).statusCode).toBe(400);
  });

  it('a FAILED email can be queued again (audited); a SENT one cannot', async () => {
    const d = await paid({ donorEmail: null });
    failNext = [new EmailSendError('http_401', true)];
    await processDueNotifications(deps());
    const [row] = await rowsFor(d.intent.id);
    expect(row?.status).toBe('FAILED');
    const retry = await send('POST', `/api/v1/admin/notifications/${row!.id}/retry`, {});
    expect(retry.json()).toEqual({ id: row!.id, status: 'PENDING' });
    expect(
      await db.auditLog.count({ where: { action: 'notification.retry', entityId: row!.id } }),
    ).toBe(1);
    await processDueNotifications(deps());
    expect((await rowsFor(d.intent.id))[0]?.status).toBe('SENT');
    expect(
      (await send('POST', `/api/v1/admin/notifications/${row!.id}/retry`, {})).statusCode,
    ).toBe(409);
    expect(
      (await send('POST', `/api/v1/admin/notifications/${crypto.randomUUID()}/retry`, {}))
        .statusCode,
    ).toBe(404);
  });

  it('is owner-only', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/notifications' })).statusCode,
    ).toBe(401);
  });
});
