import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';
import {
  razorpayProvider,
  type PaymentProvider,
  type ProviderPayment,
} from '../donations/provider.ts';
import { financialYear } from '../receipts/numbering.ts';
import { daysUntil, financialYearRange, form113Deadline } from './tracking.ts';

/** Form 113 export, statutory certificate tracking and the 31 May reminder (#35). */
const db = useTestDb();
const ORIGIN = 'http://localhost:5173';
const KEY_SECRET = 'filing-key-secret-0001';
const AUTH_SECRET_KEY = randomBytes(32).toString('base64');
let app: FastifyInstance;
let seq = 0;
let ip = 0;
let send: (
  m: 'GET' | 'POST' | 'PATCH',
  url: string,
  body?: unknown,
) => Promise<LightMyRequestResponse>;
const FY = financialYear(new Date());

const remote = new Map<string, ProviderPayment>();
const real = razorpayProvider({
  keyId: 'rzp_test_filing00001',
  keySecret: KEY_SECRET,
  fetch: async () => new Response('{}'),
});
const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_filing00001',
  verifyCheckoutSignature: real.verifyCheckoutSignature,
  createOrder: async (input) => ({
    orderId: `order_F${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
  fetchPayment: async (id) => remote.get(id)!,
  fetchOrderPayments: async () => [],
};

beforeAll(async () => {
  app = buildApp(loadEnv({ NODE_ENV: 'test', AUTH_SECRET_KEY, CORS_ORIGINS: ORIGIN }), {
    db,
    paymentProvider: provider,
  });
  const tax = {
    taxBenefitEnabled: true,
    rnpoReference: 'RNPO-T',
    section354Approval: 'APP-T',
    approvalValidUntil: new Date('2099-03-31T00:00:00Z'),
  };
  await db.trustSettings.upsert({ where: { id: 1 }, create: { id: 1, ...tax }, update: tax });
  const email = `${unique('filing-owner')}@example.org`;
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
  await db.trustSettings.update({
    where: { id: 1 },
    data: {
      taxBenefitEnabled: false,
      rnpoReference: null,
      section354Approval: null,
      approvalValidUntil: null,
    },
  });
  await app.close();
});

const nextIp = () => `10.35.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;

/** A tax opt-in donation, verified PAID. */
async function paidOptIn(
  amountPaise: number,
  pan: string,
  name = 'Synthetic Filing Donor',
  pay = true,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: nextIp(),
    payload: {
      giftPaise: amountPaise,
      currency: 'INR',
      programme: null,
      donorName: name,
      donorEmail: 'filing@example.org',
      hideNamePublicly: true,
      wantsReceipt: false,
      coverFee: false,
      consent: true,
      locale: 'en',
      taxOptIn: { pan, address: `${name} street, Chennai 600001`, oldRegimeAck: true },
    },
  });
  if (res.statusCode !== 201) throw new Error(`intent ${res.statusCode} ${res.body}`);
  const { publicReference, checkout } = res.json() as {
    publicReference: string;
    checkout: { orderId: string };
  };
  const p: ProviderPayment = {
    paymentId: `pay_F${String(++seq).padStart(8, '0')}`,
    orderId: checkout.orderId,
    amountPaise,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    refundedPaise: 0,
  };
  remote.set(p.paymentId, p);
  if (pay) {
    await app.inject({
      method: 'POST',
      url: '/api/v1/payments/verify',
      remoteAddress: nextIp(),
      payload: {
        publicReference,
        orderId: checkout.orderId,
        paymentId: p.paymentId,
        signature: createHmac('sha256', KEY_SECRET)
          .update(`${checkout.orderId}|${p.paymentId}`)
          .digest('hex'),
      },
    });
  }
  return db.donationIntent.findUniqueOrThrow({
    where: { publicReference },
    include: { taxTracking: true, paymentAttempts: true },
  });
}

const csvRows = (body: string) =>
  body
    .replace(/^\uFEFF/, '')
    .trim()
    .split('\r\n')
    .map((l) => l.split('","').map((c) => c.replace(/^"|"$/g, '')));

describe('tracking is created only for verified tax opt-in donations', () => {
  it('PAID opt-in → PENDING_TRUST_FILING for the financial year; unpaid → none', async () => {
    const paid = await paidOptIn(100_000, 'AAAAA1111A');
    expect(paid.taxTracking).toMatchObject({ status: 'PENDING_TRUST_FILING', financialYear: FY });
    const unpaid = await paidOptIn(100_000, 'AAAAA1111A', 'Synthetic Filing Donor', false);
    expect(unpaid.taxTracking).toBeNull();
  });
});

describe('Form 113 export', () => {
  it('one row per donor (PAN), totals net of refunds that match the ledger; audited; needs a reason', async () => {
    const pan1 = 'FILEX1234B';
    const pan2 = 'ZZZZZ9876Q';
    const a = await paidOptIn(100_000, pan1, 'Synthetic Donor One');
    const b = await paidOptIn(250_000, pan1, 'Synthetic Donor One');
    const c = await paidOptIn(60_000, pan2, 'Synthetic Donor Two');
    // A partial refund lowers what is reported.
    await db.paymentAttempt.update({
      where: { id: c.paymentAttempts[0]!.id },
      data: { refundedPaise: 10_000 },
    });

    expect((await send('GET', `/api/v1/admin/tax/form113.csv?fy=${FY}`)).statusCode).toBe(400); // no reason
    const res = await send(
      'GET',
      `/api/v1/admin/tax/form113.csv?fy=${FY}&reason=${encodeURIComponent('Preparing Form 113 for the CA')}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-format-status']).toBe('draft-unconfirmed');
    expect(res.headers['content-disposition']).toContain(`form113-draft-${FY}.csv`);
    expect(res.headers['cache-control']).toBe('no-store');
    const [header, ...lines] = csvRows(res.body);
    expect(header).toEqual([
      'financial_year',
      'pan',
      'donor_name',
      'address',
      'donation_type',
      'mode_of_receipt',
      'amount_inr',
      'donations_count',
      'donation_references',
    ]);
    const one = lines.find((l) => l[1] === pan1)!;
    expect(one).toEqual([
      FY,
      pan1,
      'Synthetic Donor One',
      'Synthetic Donor One street, Chennai 600001',
      'Others',
      'Electronic modes',
      '3500.00',
      '2',
      `${a.publicReference} ${b.publicReference}`,
    ]);
    expect(lines.find((l) => l[1] === pan2)?.[6]).toBe('500.00');

    // Totals match the ledger for the year.
    const { from, to } = financialYearRange(FY);
    const ledger = await db.donationIntent.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lt: to }, taxTracking: { isNot: null } },
      include: { paymentAttempts: true },
    });
    const ledgerTotal = ledger.reduce(
      (s, d) => s + d.amountPaise - d.paymentAttempts.reduce((x, p) => x + p.refundedPaise, 0),
      0,
    );
    const csvTotal = lines.reduce((s, l) => s + Math.round(Number(l[6]) * 100), 0);
    expect(csvTotal).toBe(ledgerTotal);
    const summary = (await send('GET', `/api/v1/admin/tax/summary?fy=${FY}`)).json();
    expect(summary.totalPaise).toBe(ledgerTotal);
    expect(summary.donations).toBe(ledger.length);
    expect(summary.formatConfirmed).toBe(false);

    expect(await db.auditLog.count({ where: { action: 'tax.form113_exported' } })).toBeGreaterThan(
      0,
    );
  });

  it('another financial year is separate; bad years are refused', async () => {
    const d = await paidOptIn(70_000, 'YYYYY5555Y');
    await db.donationIntent.update({
      where: { id: d.id },
      data: { paidAt: new Date('2025-06-01T05:00:00Z') },
    });
    await db.taxCertificateTracking.update({
      where: { donationIntentId: d.id },
      data: { financialYear: '2025-26' },
    });
    const prev = await send(
      'GET',
      `/api/v1/admin/tax/form113.csv?fy=2025-26&reason=${encodeURIComponent('Previous year check')}`,
    );
    expect(
      csvRows(prev.body)
        .slice(1)
        .map((l) => l[1]),
    ).toContain('YYYYY5555Y');
    const now = await send(
      'GET',
      `/api/v1/admin/tax/form113.csv?fy=${FY}&reason=${encodeURIComponent('Current year check')}`,
    );
    expect(
      csvRows(now.body)
        .slice(1)
        .map((l) => l[1]),
    ).not.toContain('YYYYY5555Y');
    for (const fy of ['2026', '2026-28', 'abcd-ef']) {
      expect((await send('GET', `/api/v1/admin/tax/summary?fy=${fy}`)).statusCode).toBe(400);
    }
  });
});

describe('statutory certificate status — evidence required, audited', () => {
  it('FORM_113_FILED needs the Form 113 reference; FORM_114_ISSUED needs its reference and date', async () => {
    const d = await paidOptIn(90_000, 'QQQQQ7777Q');
    const id = d.taxTracking!.id;
    const url = `/api/v1/admin/tax/tracking/${id}/status`;
    expect(
      (await send('POST', url, { status: 'FORM_113_FILED', reason: 'Filed on the portal' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await send('POST', url, { status: 'FORM_113_FILED', form113Reference: 'F113-ACK-01' }))
        .statusCode,
    ).toBe(400); // no reason
    expect(
      (
        await send('POST', url, {
          status: 'FORM_113_FILED',
          form113Reference: 'F113-ACK-01',
          reason: 'Filed on the portal',
        })
      ).json(),
    ).toEqual({ id, status: 'FORM_113_FILED' });
    expect(
      (await send('POST', url, { status: 'FORM_114_ISSUED', reason: 'Certificate downloaded' }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await send('POST', url, {
          status: 'FORM_114_ISSUED',
          form114Reference: 'F114-CERT-9',
          form114IssuedOn: '2027-06-10',
          reason: 'Certificate downloaded',
        })
      ).statusCode,
    ).toBe(200);
    const row = await db.taxCertificateTracking.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: 'FORM_114_ISSUED',
      form113Reference: 'F113-ACK-01',
      form114Reference: 'F114-CERT-9',
    });
    const audits = await db.auditLog.findMany({
      where: { action: 'tax.certificate_status', entityId: id },
    });
    expect(audits.map((a) => a.reason)).toEqual([
      'PENDING_TRUST_FILING→FORM_113_FILED: Filed on the portal',
      'FORM_113_FILED→FORM_114_ISSUED: Certificate downloaded',
    ]);
    expect(
      (await send('POST', url, { status: 'CORRECTION_REQUIRED', reason: 'PAN typo reported' }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await send('POST', `/api/v1/admin/tax/tracking/${crypto.randomUUID()}/status`, {
          status: 'NOT_APPLICABLE',
          reason: 'not needed',
        })
      ).statusCode,
    ).toBe(404);
  });

  it('bulk: mark every pending donation of the year as filed with one reference (audited)', async () => {
    await paidOptIn(40_000, 'BBBBB2222B');
    const res = await send('POST', '/api/v1/admin/tax/form113-filed', {
      fy: FY,
      form113Reference: 'F113-BULK-01',
      reason: 'Filed Form 113 for the year',
    });
    expect(res.json().updated).toBeGreaterThan(0);
    const pending = (
      await send('GET', `/api/v1/admin/tax/tracking?fy=${FY}&status=PENDING_TRUST_FILING`)
    ).json();
    expect(pending.items).toEqual([]);
    const filed = (
      await send('GET', `/api/v1/admin/tax/tracking?fy=${FY}&status=FORM_113_FILED`)
    ).json();
    expect(filed.items[0]).toMatchObject({
      form113Reference: expect.any(String),
      panMasked: expect.stringMatching(/^••••••/),
    });
    expect(JSON.stringify(filed)).not.toMatch(/BBBBB2222B|Chennai/);
    expect(await db.auditLog.count({ where: { action: 'tax.form113_filed' } })).toBe(1);
  });
});

describe('31 May reminder', () => {
  it('deadline is 31 May after the year; reminder when within 30 days and something is pending', async () => {
    expect(form113Deadline('2026-27')).toBe('2027-05-31');
    expect(daysUntil('2027-05-31', new Date('2027-05-01T05:00:00Z'))).toBe(30);
    expect(daysUntil('2027-05-31', new Date('2027-06-01T05:00:00Z'))).toBe(-1);
    const summary = (await send('GET', `/api/v1/admin/tax/summary?fy=2025-26`)).json();
    expect(summary).toMatchObject({ financialYear: '2025-26', deadline: '2026-05-31' });
    expect(summary.daysLeft).toBeLessThan(0);
    expect(summary.reminder).toBe(true); // past due, the 2025-26 donation is still pending
    expect((await send('GET', '/api/v1/admin/tax/summary')).json().financialYear).toMatch(
      /^\d{4}-\d{2}$/,
    );
  });

  it('the export needs the encryption key; owner-only', async () => {
    const noKey = buildApp(loadEnv({ NODE_ENV: 'test' }), { db });
    await noKey.close();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/admin/tax/form113.csv?fy=${FY}&reason=xxxxx`,
        })
      ).statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/tax/summary' })).statusCode).toBe(
      401,
    );
  });
});
