import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { deriveAuthKeys } from '../../security/crypto.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';
import type { PaymentProvider } from '../donations/provider.ts';
import { openAddress, openPan } from './identity.ts';

/**
 * Tax profile and opt-in (#34): off by default; PAN only exists when the CA-confirmed approval is
 * recorded, valid and switched on; PAN and address are encrypted and never leave the API.
 */
const db = useTestDb();
const ORIGIN = 'http://localhost:5173';
const AUTH_SECRET_KEY = randomBytes(32).toString('base64');
const KEYS = deriveAuthKeys(AUTH_SECRET_KEY);
const PAN = 'ABCDE1234F';
let app: FastifyInstance;
let ip = 0;
let seq = 0;
const logs: string[] = [];
let send: (
  m: 'GET' | 'POST' | 'PATCH',
  url: string,
  body?: unknown,
) => Promise<LightMyRequestResponse>;

const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_tax0000001',
  verifyCheckoutSignature: () => false,
  fetchPayment: async () => Promise.reject(new Error('unused')),
  fetchOrderPayments: async () => [],
  createOrder: async (input) => ({
    orderId: `order_TX${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
};

beforeAll(async () => {
  app = buildApp(
    loadEnv({ NODE_ENV: 'test', AUTH_SECRET_KEY, CORS_ORIGINS: ORIGIN, LOG_LEVEL: 'info' }),
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
  const email = `${unique('tax-owner')}@example.org`;
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
beforeEach(async () => {
  await db.trustSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {
      taxBenefitEnabled: false,
      rnpoReference: null,
      section354Approval: null,
      approvalValidUntil: null,
    },
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

const nextIp = () => `10.34.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;
const intent = (taxOptIn?: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: nextIp(),
    payload: {
      giftPaise: 100_000,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Tax Donor',
      donorEmail: 'tax.donor@example.org',
      hideNamePublicly: true,
      wantsReceipt: true,
      coverFee: false,
      consent: true,
      locale: 'en',
      ...(taxOptIn && { taxOptIn }),
    },
  });
const estimate = async () =>
  (
    await app.inject({
      method: 'GET',
      url: '/api/v1/donation-intents/estimate',
      remoteAddress: nextIp(),
    })
  ).json();
const OPT_IN = {
  pan: 'abcde 1234 f',
  address: '12 Synthetic Street, Chennai 600001',
  oldRegimeAck: true,
};
const enable = () =>
  send('PATCH', '/api/v1/admin/tax-settings', {
    rnpoReference: 'RNPO-TEST-001',
    section354Approval: 'APPROVAL-TEST-001',
    approvalValidUntil: '2099-03-31',
    taxBenefitEnabled: true,
    reason: 'CA confirmed the approval in writing',
  });

describe('off by default: no PAN anywhere', () => {
  it('the estimate does not offer it and an intent with PAN is refused; nothing is stored', async () => {
    expect((await estimate()).taxOptInOffered).toBe(false);
    const before = await db.donorIdentityRecord.count();
    const res = await intent(OPT_IN);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual([{ path: 'taxOptIn', issue: 'not_offered' }]);
    expect(await db.donorIdentityRecord.count()).toBe(before);
    expect(res.body).not.toContain('ABCDE');
    expect((await send('GET', '/api/v1/admin/tax-settings')).json()).toEqual({
      taxBenefitEnabled: false,
      rnpoReference: null,
      section354Approval: null,
      approvalValidUntil: null,
      offeredNow: false,
    });
  });

  it('cannot be switched on with a missing or expired approval', async () => {
    for (const body of [
      { taxBenefitEnabled: true, reason: 'trying to enable' },
      {
        taxBenefitEnabled: true,
        rnpoReference: 'RNPO-1',
        section354Approval: 'APP-1',
        reason: 'no date given',
      },
      {
        taxBenefitEnabled: true,
        rnpoReference: 'RNPO-1',
        section354Approval: 'APP-1',
        approvalValidUntil: '2020-03-31',
        reason: 'expired date',
      },
    ]) {
      const res = await send('PATCH', '/api/v1/admin/tax-settings', body);
      expect(res.statusCode).toBe(400);
    }
    expect((await estimate()).taxOptInOffered).toBe(false);
    expect(
      (await send('PATCH', '/api/v1/admin/tax-settings', { taxBenefitEnabled: true })).statusCode,
    ).toBe(400); // no reason
    expect((await send('PATCH', '/api/v1/admin/tax-settings', { reason: 'xx' })).statusCode).toBe(
      400,
    );
  });
});

describe('switched on with a valid approval', () => {
  it('is audited, offered, and the opt-in stores PAN + address encrypted, never echoed or logged', async () => {
    const res = await enable();
    expect(res.json()).toMatchObject({
      taxBenefitEnabled: true,
      offeredNow: true,
      approvalValidUntil: '2099-03-31',
    });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'tax_settings.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.changedFields).toEqual([
      'approvalValidUntil',
      'rnpoReference',
      'section354Approval',
      'taxBenefitEnabled',
    ]);
    expect((await estimate()).taxOptInOffered).toBe(true);

    logs.length = 0;
    const created = await intent(OPT_IN);
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toMatch(/ABCDE|1234F|Synthetic Street/);
    const row = await db.donationIntent.findUniqueOrThrow({
      where: { publicReference: created.json().publicReference },
      include: { donorIdentity: true },
    });
    expect(row.wantsTaxCertificate).toBe(true);
    const identity = row.donorIdentity!;
    expect(identity).toMatchObject({
      fullName: 'Synthetic Tax Donor',
      panLast4: '234F',
      panKeyVersion: KEYS.version,
    });
    expect(Buffer.from(identity.panCiphertext!).toString('latin1')).not.toContain('ABCDE');
    expect(identity.addressLine).not.toContain('Chennai');
    expect(openPan(identity.panCiphertext!, KEYS.encryption)).toBe(PAN);
    expect(openAddress(identity.addressLine!, KEYS.encryption)).toBe(OPT_IN.address);
    expect(logs.join('')).not.toMatch(/ABCDE|1234F|Synthetic Street/);

    // The owner sees a masked PAN only; the address never reaches the dashboard; CSV has no PAN.
    const detail = await send('GET', `/api/v1/admin/donations/${row.id}`);
    expect(detail.json().taxOptIn).toEqual({ panMasked: '••••••234F', hasAddress: true });
    expect(detail.body).not.toMatch(/ABCDE|Synthetic Street/);
    const csv = await send('GET', `/api/v1/admin/donations/export.csv?q=${row.publicReference}`);
    expect(csv.body).not.toMatch(/ABCDE|1234F|Synthetic Street/);
    // Nothing tax-related goes to the outbox or the receipt view.
    expect(
      JSON.stringify(
        await db.notificationOutbox.findMany({ where: { entityRef: `donation_intent:${row.id}` } }),
      ),
    ).not.toContain('234F');
  });

  it('a bad PAN, a missing acknowledgement or a short address is refused', async () => {
    await enable();
    for (const bad of [
      { ...OPT_IN, pan: 'ABCD1234F' },
      { ...OPT_IN, oldRegimeAck: false },
      { ...OPT_IN, address: 'short' },
      { ...OPT_IN, extra: 1 },
    ]) {
      const res = await intent(bad);
      expect(res.statusCode).toBe(400);
      expect(res.body).not.toContain('ABCD1234F');
    }
  });

  it('a donation without opt-in has no identity record; turning it off closes it again', async () => {
    await enable();
    const plain = await intent();
    const row = await db.donationIntent.findUniqueOrThrow({
      where: { publicReference: plain.json().publicReference },
      include: { donorIdentity: true },
    });
    expect(row.donorIdentity).toBeNull();
    expect((await send('GET', `/api/v1/admin/donations/${row.id}`)).json().taxOptIn).toBeNull();
    await send('PATCH', '/api/v1/admin/tax-settings', {
      taxBenefitEnabled: false,
      reason: 'Approval under review',
    });
    expect((await estimate()).taxOptInOffered).toBe(false);
    expect((await intent(OPT_IN)).statusCode).toBe(400);
  });

  it('without the encryption key the opt-in is never offered', async () => {
    await enable();
    const noKey = buildApp(loadEnv({ NODE_ENV: 'test' }), { db, paymentProvider: provider });
    expect(
      (await noKey.inject({ method: 'GET', url: '/api/v1/donation-intents/estimate' })).json()
        .taxOptInOffered,
    ).toBe(false);
    await noKey.close();
  });

  it('settings are owner-only', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/tax-settings' })).statusCode,
    ).toBe(401);
  });
});
