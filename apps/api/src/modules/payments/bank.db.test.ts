import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';

const db = useTestDb();
const ORIGIN = 'http://localhost:5173';
const clock = new Date('2027-05-01T05:00:00Z');
let app: FastifyInstance;
let ip = 0;
let send: (m: 'GET' | 'POST', url: string, body?: unknown) => Promise<LightMyRequestResponse>;
let ownerId: string;

const BANK = {
  bankAccountName: 'Synthetic Trust',
  bankAccountNumber: '000000000000',
  bankIfsc: 'SBIN0000000',
  bankName: 'Synthetic Bank',
};

beforeAll(async () => {
  app = buildApp(
    loadEnv({
      NODE_ENV: 'test',
      AUTH_SECRET_KEY: Buffer.alloc(32, 8).toString('base64'),
      CORS_ORIGINS: ORIGIN,
    }),
    { db, now: () => clock },
  );
  await db.trustSettings.upsert({ where: { id: 1 }, create: { id: 1, ...BANK }, update: BANK });
  const email = `${unique('bank-owner')}@example.org`;
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
    code: hotp(base32Decode(secret), timeStep(clock)),
  });
  ownerId = (await db.adminUser.findUniqueOrThrow({ where: { email } })).id;
});

afterAll(async () => {
  await db.$executeRaw`UPDATE trust_settings SET bank_account_name = NULL, bank_account_number = NULL, bank_ifsc = NULL, bank_name = NULL WHERE id = 1`;
  await app.close();
});

async function bankIntent(giftPaise = 5_000_000) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/donation-intents',
    remoteAddress: `10.5.0.${(ip++ % 250) + 1}`,
    payload: {
      giftPaise,
      currency: 'INR',
      programme: null,
      donorName: 'Synthetic Donor',
      donorEmail: 'donor@example.org',
      hideNamePublicly: true,
      wantsReceipt: true,
      coverFee: false,
      consent: true,
      locale: 'en',
      channel: 'bank_transfer',
    },
  });
  return res;
}

const utr = () => `UTR${Math.floor(Math.random() * 1e12)}`;

describe('bank transfer intent (no Razorpay order)', () => {
  it('returns the trust bank details and a reference; no provider needed', async () => {
    const res = await bankIntent();
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      publicReference: expect.stringMatching(/^TOT-D-/),
      giftPaise: 5_000_000,
      feePaise: 0,
      amountPaise: 5_000_000,
      currency: 'INR',
      bankTransfer: {
        accountName: 'Synthetic Trust',
        accountNumber: '000000000000',
        ifsc: 'SBIN0000000',
        bankName: 'Synthetic Bank',
      },
    });
    const intent = await db.donationIntent.findUniqueOrThrow({
      where: { publicReference: res.json().publicReference },
      include: { paymentAttempts: true },
    });
    expect(intent).toMatchObject({ channel: 'BANK_TRANSFER', status: 'CREATED' });
    expect(intent.paymentAttempts).toEqual([]);
  });

  it('is not offered without confirmed bank details; no fee cover for bank transfer', async () => {
    const est = (
      await app.inject({ method: 'GET', url: '/api/v1/donation-intents/estimate' })
    ).json();
    expect(est.bankTransferOffered).toBe(true);
    const withFee = await app.inject({
      method: 'POST',
      url: '/api/v1/donation-intents',
      remoteAddress: '10.6.0.1',
      payload: {
        giftPaise: 1000,
        currency: 'INR',
        programme: null,
        donorName: 'A',
        donorEmail: 'a@b.co',
        hideNamePublicly: true,
        wantsReceipt: false,
        coverFee: true,
        consent: true,
        locale: 'en',
        channel: 'bank_transfer',
      },
    });
    expect(withFee.json().error.fields).toContainEqual({ path: 'coverFee', issue: 'not_offered' });
  });
});

describe('a UTR alone can never change a donation to paid', () => {
  it('the donor claim moves CREATED → PENDING only, and repeated claims never reach PAID', async () => {
    const { publicReference } = (await bankIntent()).json();
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/donation-intents/${publicReference}/bank-transfer-claim`,
        payload: { utr: ' utr 123 456 789 ' },
        remoteAddress: '10.7.0.1',
      });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ publicReference, status: 'PENDING' });
    }
    const intent = await db.donationIntent.findUniqueOrThrow({
      where: { publicReference },
      include: { bankClaims: true },
    });
    expect(intent.status).toBe('PENDING');
    expect(intent.bankClaims[0]?.utr).toBe('UTR123456789');
  });

  it('rejects claims for checkout donations, unknown references and bad UTRs', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/donation-intents/TOT-D-000000000000/bank-transfer-claim',
      payload: { utr: null },
    });
    expect(bad.statusCode).toBe(404);
    const { publicReference } = (await bankIntent()).json();
    const badUtr = await app.inject({
      method: 'POST',
      url: `/api/v1/donation-intents/${publicReference}/bank-transfer-claim`,
      payload: { utr: '12' },
    });
    expect(badUtr.statusCode).toBe(400);
  });
});

describe('owner records a bank credit', () => {
  it('matches by the donor UTR, then needs a second confirmation with a reason → PAID, audited', async () => {
    const { publicReference, amountPaise } = (await bankIntent(7_500_000)).json();
    const bankReference = utr();
    await app.inject({
      method: 'POST',
      url: `/api/v1/donation-intents/${publicReference}/bank-transfer-claim`,
      payload: { utr: bankReference },
    });
    const recorded = await send('POST', '/api/v1/admin/bank-transfers/credits', {
      bankReference,
      amountPaise,
      receivedOn: '2027-05-01',
      evidence: 'Synthetic statement 01-05-2027, line 3',
    });
    expect(recorded.statusCode).toBe(201);
    expect(recorded.json()).toMatchObject({
      matched: true,
      awaitingConfirmation: true,
      exception: null,
    });
    expect((await db.donationIntent.findUniqueOrThrow({ where: { publicReference } })).status).toBe(
      'PENDING',
    );

    const id = recorded.json().id;
    const wrong = await send('POST', `/api/v1/admin/bank-transfers/credits/${id}/confirm`, {
      reason: 'Seen on statement',
      confirmReference: 'TOT-D-000000000000',
    });
    expect(wrong.statusCode).toBe(400);
    const noReason = await send('POST', `/api/v1/admin/bank-transfers/credits/${id}/confirm`, {
      reason: 'ok',
      confirmReference: publicReference,
    });
    expect(noReason.statusCode).toBe(400);

    const ok = await send('POST', `/api/v1/admin/bank-transfers/credits/${id}/confirm`, {
      reason: 'Seen on SBI statement',
      confirmReference: publicReference,
    });
    expect(ok.json()).toEqual({
      id,
      status: 'MATCHED',
      donationReference: publicReference,
      donationStatus: 'PAID',
    });
    const intent = await db.donationIntent.findUniqueOrThrow({ where: { publicReference } });
    expect(intent.status).toBe('PAID');
    // #29: the owner-confirmed credit gets exactly one acknowledgement, for the credited amount.
    const receipts = await db.receipt.findMany({ where: { donationIntentId: intent.id } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ bankTransferRecordId: id, amountPaise: 7_500_000 });
    const entries = await db.auditLog.findMany({
      where: { actorId: ownerId, action: { startsWith: 'bank_transfer.' } },
    });
    const confirm = entries.find(
      (e) => e.action === 'bank_transfer.confirmed_paid' && e.entityId === intent.id,
    );
    expect(confirm).toMatchObject({
      reason: 'Seen on SBI statement',
      changedFields: ['bank_transfer_record', 'status'],
    });
    expect(entries.some((e) => e.action === 'bank_transfer.credit_recorded')).toBe(true);
    const again = await send('POST', `/api/v1/admin/bank-transfers/credits/${id}/confirm`, {
      reason: 'twice please',
      confirmReference: publicReference,
    });
    expect(again.statusCode).toBe(409);
    expect(await db.receipt.count({ where: { donationIntentId: intent.id } })).toBe(1);
  });

  it('an unmatched credit raises an exception and pays nothing', async () => {
    const res = await send('POST', '/api/v1/admin/bank-transfers/credits', {
      bankReference: utr(),
      amountPaise: 123_400,
      receivedOn: '2027-05-01',
      evidence: 'Synthetic statement line 9',
    });
    expect(res.json()).toMatchObject({ matched: false, exception: { kind: 'UNMATCHED_CREDIT' } });
    const exception = await db.paymentException.findUniqueOrThrow({
      where: { id: res.json().exception.id },
    });
    expect(exception).toMatchObject({ status: 'OPEN', donationIntentId: null });
    const confirm = await send(
      'POST',
      `/api/v1/admin/bank-transfers/credits/${res.json().id}/confirm`,
      {
        reason: 'Trying anyway',
        confirmReference: 'TOT-D-000000000000',
      },
    );
    expect(confirm.statusCode).toBe(409);
    const listed = (await send('GET', '/api/v1/admin/bank-transfers')).json();
    expect(listed.exceptions.some((e: { id: string }) => e.id === exception.id)).toBe(true);
    const resolved = await send(
      'POST',
      `/api/v1/admin/payment-exceptions/${exception.id}/resolve`,
      { reason: 'Returned to sender' },
    );
    expect(resolved.json()).toEqual({ id: exception.id, status: 'RESOLVED' });
    expect(
      (
        await send('POST', `/api/v1/admin/payment-exceptions/${exception.id}/resolve`, {
          reason: 'Again again',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('an amount mismatch raises an exception and moves the donation to manual review', async () => {
    const { publicReference } = (await bankIntent(2_000_000)).json();
    const res = await send('POST', '/api/v1/admin/bank-transfers/credits', {
      bankReference: utr(),
      amountPaise: 1_999_900,
      receivedOn: '2027-05-01',
      evidence: 'Synthetic statement line 4',
      donationReference: publicReference,
    });
    expect(res.json().exception.kind).toBe('AMOUNT_MISMATCH');
    expect((await db.donationIntent.findUniqueOrThrow({ where: { publicReference } })).status).toBe(
      'MANUAL_REVIEW',
    );
  });

  it('a credit for an already-paid donation is an exception, and a duplicate bank reference is refused', async () => {
    const { publicReference, amountPaise } = (await bankIntent(3_000_000)).json();
    const ref = utr();
    const first = await send('POST', '/api/v1/admin/bank-transfers/credits', {
      bankReference: ref,
      amountPaise,
      receivedOn: '2027-05-01',
      evidence: 'Synthetic statement line 5',
      donationReference: publicReference,
    });
    await send('POST', `/api/v1/admin/bank-transfers/credits/${first.json().id}/confirm`, {
      reason: 'On statement',
      confirmReference: publicReference,
    });
    const dup = await send('POST', '/api/v1/admin/bank-transfers/credits', {
      bankReference: ref,
      amountPaise,
      receivedOn: '2027-05-01',
      evidence: 'Same line again',
      donationReference: publicReference,
    });
    expect(dup.statusCode).toBe(409);
    const second = await send('POST', '/api/v1/admin/bank-transfers/credits', {
      bankReference: utr(),
      amountPaise,
      receivedOn: '2027-05-02',
      evidence: 'Synthetic statement line 6',
      donationReference: publicReference,
    });
    expect(second.json().exception.kind).toBe('ALREADY_PAID');
  });

  it('can reject a recorded credit with a reason (audited), not twice', async () => {
    const { publicReference, amountPaise } = (await bankIntent()).json();
    const rec = await send('POST', '/api/v1/admin/bank-transfers/credits', {
      bankReference: utr(),
      amountPaise,
      receivedOn: '2027-05-01',
      evidence: 'Synthetic statement line 7',
      donationReference: publicReference,
    });
    const id = rec.json().id;
    expect(
      (
        await send('POST', `/api/v1/admin/bank-transfers/credits/${id}/reject`, {
          reason: 'Reversed by bank',
        })
      ).json(),
    ).toEqual({ id, status: 'REJECTED' });
    expect(
      (
        await send('POST', `/api/v1/admin/bank-transfers/credits/${id}/reject`, {
          reason: 'Reversed by bank',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await send('POST', `/api/v1/admin/bank-transfers/credits/${id}/confirm`, {
          reason: 'Changed mind',
          confirmReference: publicReference,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('lists credits, awaiting donations with the donor UTR, and open exceptions', async () => {
    const listed = (await send('GET', '/api/v1/admin/bank-transfers')).json();
    expect(listed.credits.length).toBeGreaterThan(0);
    expect(
      listed.awaiting.some((a: { donorUtr: string | null }) => a.donorUtr === 'UTR123456789'),
    ).toBe(true);
  });

  it('is admin-only', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/bank-transfers' })).statusCode,
    ).toBe(401);
    expect(
      (
        await send(
          'POST',
          '/api/v1/admin/bank-transfers/credits/00000000-0000-4000-8000-000000000000/confirm',
          { reason: 'nothing', confirmReference: 'TOT-D-000000000000' },
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await send(
          'POST',
          '/api/v1/admin/bank-transfers/credits/00000000-0000-4000-8000-000000000000/reject',
          { reason: 'nothing here' },
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await send(
          'POST',
          '/api/v1/admin/payment-exceptions/00000000-0000-4000-8000-000000000000/resolve',
          { reason: 'nothing here' },
        )
      ).statusCode,
    ).toBe(404);
  });
});
