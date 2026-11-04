import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  MONTHLY_CONSENT_VERSION,
  UPI_AUTOPAY_MAX_PAISE,
  methodRouteFor,
  methodsFor,
} from '@theonetrust/contracts';
import { loadEnv } from '../../config/env.ts';
import { renderDonorSubscriptionStarted } from '../notifications/templates.ts';
import { parseSubscription, razorpaySubscriptions } from './provider.ts';
import {
  donorStatus,
  firstCharge,
  manageToken,
  manageTokenHash,
  newManageSalt,
  newSubscriptionReference,
  nextStatus,
} from './rules.ts';

const SECRET = 'sub-key-secret-000001';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const SUB = {
  id: 'sub_TEST00000001',
  plan_id: 'plan_TEST000001',
  status: 'created',
  start_at: null,
  charge_at: 1_800_000_000,
};

describe('method routing by amount (UPI AutoPay cap ₹15,000)', () => {
  it('≤ ₹15,000 → UPI AutoPay (also eMandate/card); above → eMandate or card only', () => {
    expect(UPI_AUTOPAY_MAX_PAISE).toBe(1_500_000);
    expect(methodRouteFor(1_500_000)).toBe('upi_autopay');
    expect(methodRouteFor(1_500_001)).toBe('emandate_card');
    expect(methodsFor('upi_autopay')).toEqual(['upi', 'emandate', 'card']);
    expect(methodsFor('emandate_card')).toEqual(['emandate', 'card']);
  });
});

describe('first charge never on the 29th–31st (IST)', () => {
  it.each([
    ['2026-11-28T18:29:59Z', null], // 28 Nov 23:59 IST
    ['2026-11-28T18:30:00Z', '2026-12-01'], // 29 Nov 00:00 IST
    ['2026-12-31T05:00:00Z', '2027-01-01'],
    ['2027-02-15T05:00:00Z', null],
    ['2027-01-30T05:00:00Z', '2027-02-01'],
  ])('%s → %s', (iso, date) => {
    const { startAt, startDate } = firstCharge(new Date(iso));
    expect(startDate).toBe(date);
    if (date) expect(startAt?.toISOString()).toBe(new Date(`${date}T09:00:00+05:30`).toISOString());
    else expect(startAt).toBeNull();
  });
});

describe('status rules', () => {
  it('maps Razorpay statuses forward only; cancelled/completed never come back', () => {
    expect(nextStatus('CREATED', 'authenticated')).toBe('AUTHENTICATED');
    expect(nextStatus('AUTHENTICATED', 'active')).toBe('ACTIVE');
    expect(nextStatus('ACTIVE', 'pending')).toBe('ACTIVE');
    expect(nextStatus('ACTIVE', 'halted')).toBe('HALTED');
    expect(nextStatus('ACTIVE', 'created')).toBe('ACTIVE');
    expect(nextStatus('CANCELLED', 'active')).toBe('CANCELLED');
    expect(nextStatus('COMPLETED', 'active')).toBe('COMPLETED');
    expect(nextStatus('ACTIVE', 'expired')).toBe('COMPLETED');
    expect(nextStatus('ACTIVE', 'weird')).toBe('ACTIVE');
    expect(
      ['CREATED', 'AUTHENTICATED', 'ACTIVE', 'PAUSED', 'HALTED', 'CANCELLED', 'COMPLETED'].map(
        (s) => donorStatus(s as never),
      ),
    ).toEqual(['PENDING', 'ACTIVE', 'ACTIVE', 'PAUSED', 'PENDING', 'CANCELLED', 'ENDED']);
  });

  it('references and manage tokens: unguessable, only the hash is stored', () => {
    expect(newSubscriptionReference()).toMatch(/^TOT-M-[0-9A-HJKMNP-TV-Z]{12}$/);
    const key = Buffer.alloc(32, 3);
    const salt = newManageSalt();
    const token = manageToken(key, salt);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(manageToken(key, salt)).toBe(token);
    expect(manageToken(Buffer.alloc(32, 4), salt)).not.toBe(token);
    expect(manageTokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Razorpay Subscriptions client', () => {
  it('creates a monthly plan and a subscription; cancels immediately; fetches', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/v1/plans'))
        return json({ id: 'plan_TEST000001', item: { amount: 50_000, currency: 'INR' } });
      if (u.endsWith('/cancel')) return json({ ...SUB, status: 'cancelled' });
      if (init?.method === 'POST') return json(SUB);
      return json({ ...SUB, status: 'active' });
    });
    const client = razorpaySubscriptions({
      keyId: 'rzp_test_abcdefgh12',
      keySecret: SECRET,
      fetch: fetchImpl as typeof fetch,
    });
    expect(await client.createPlan({ amountPaise: 50_000, name: 'Monthly' })).toEqual({
      planId: 'plan_TEST000001',
    });
    expect(
      await client.createSubscription({
        planId: 'plan_TEST000001',
        totalCount: 120,
        startAt: 1_800_000_000,
        notes: { reference: 'TOT-M-X' },
      }),
    ).toMatchObject({
      subscriptionId: 'sub_TEST00000001',
      status: 'created',
      chargeAt: 1_800_000_000,
    });
    expect((await client.fetchSubscription('sub_TEST00000001')).status).toBe('active');
    expect((await client.cancelSubscription('sub_TEST00000001')).status).toBe('cancelled');
    const bodies = fetchImpl.mock.calls.map((c) => [
      String(c[0]).replace('https://api.razorpay.com', ''),
      c[1]?.body ? JSON.parse(String(c[1].body)) : null,
    ]);
    expect(bodies).toEqual([
      [
        '/v1/plans',
        {
          period: 'monthly',
          interval: 1,
          item: { name: 'Monthly', amount: 50_000, currency: 'INR' },
        },
      ],
      [
        '/v1/subscriptions',
        {
          plan_id: 'plan_TEST000001',
          total_count: 120,
          quantity: 1,
          customer_notify: 1,
          start_at: 1_800_000_000,
          notes: { reference: 'TOT-M-X' },
        },
      ],
      ['/v1/subscriptions/sub_TEST00000001', null],
      ['/v1/subscriptions/sub_TEST00000001/cancel', { cancel_at_cycle_end: 0 }],
    ]);
    expect(
      String((fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>).authorization),
    ).toMatch(/^Basic /);
  });

  it('trusts nothing: wrong plan amount, wrong plan on the subscription, bad IDs, errors', async () => {
    const make = (res: () => Promise<Response>) =>
      razorpaySubscriptions({
        keyId: 'rzp_test_abcdefgh12',
        keySecret: SECRET,
        fetch: res as typeof fetch,
      });
    await expect(
      make(async () =>
        json({ id: 'plan_TEST000001', item: { amount: 1, currency: 'INR' } }),
      ).createPlan({ amountPaise: 50_000, name: 'x' }),
    ).rejects.toMatchObject({ reason: 'unexpected_response' });
    await expect(
      make(async () => json(SUB)).createSubscription({
        planId: 'plan_OTHER00001',
        totalCount: 1,
        notes: {},
      }),
    ).rejects.toMatchObject({ reason: 'unexpected_response' });
    await expect(
      make(async () => json({}, 400)).fetchSubscription('sub_TEST00000001'),
    ).rejects.toMatchObject({ reason: 'rejected' });
    await expect(
      make(async () => Promise.reject(new TypeError('x'))).fetchSubscription('sub_TEST00000001'),
    ).rejects.toMatchObject({ reason: 'network' });
    await expect(
      make(async () => new Response('nope')).fetchSubscription('sub_TEST00000001'),
    ).rejects.toMatchObject({ reason: 'unexpected_response' });
    await expect(make(async () => json(SUB)).fetchSubscription('bad')).rejects.toMatchObject({
      reason: 'rejected',
    });
    await expect(make(async () => json(SUB)).cancelSubscription('bad')).rejects.toMatchObject({
      reason: 'rejected',
    });
    expect(() =>
      parseSubscription({ id: 'sub_X', plan_id: 'plan_TEST000001', status: 'x' }),
    ).toThrow();
    expect(parseSubscription({ ...SUB, start_at: 1.5 }).startAt).toBeNull();
  });

  it('subscription signature: HMAC(payment_id|subscription_id), constant time, strict formats', () => {
    const client = razorpaySubscriptions({ keyId: 'rzp_test_abcdefgh12', keySecret: SECRET });
    const good = createHmac('sha256', SECRET)
      .update('pay_TEST000001|sub_TEST00000001')
      .digest('hex');
    expect(client.verifySubscriptionSignature('pay_TEST000001', 'sub_TEST00000001', good)).toBe(
      true,
    );
    expect(client.verifySubscriptionSignature('pay_TEST000002', 'sub_TEST00000001', good)).toBe(
      false,
    );
    expect(
      client.verifySubscriptionSignature('pay_TEST000001', 'sub_TEST00000001', '0'.repeat(64)),
    ).toBe(false);
    expect(client.verifySubscriptionSignature('x', 'sub_TEST00000001', good)).toBe(false);
  });
});

describe('monthly email and env', () => {
  it('donor email has amount, start date, manage link, how to stop in the UPI app — both languages', () => {
    for (const lang of ['en', 'ta'] as const) {
      const email = renderDonorSubscriptionStarted(
        {
          donorName: 'A <b>',
          amountPaise: 50_000,
          startDate: '2026-12-01',
          manageUrl: 'https://x.test/manage/tok',
          trustName: 'Theonetrust.in',
        },
        lang,
      );
      expect(email.text).toContain('https://x.test/manage/tok');
      expect(email.text).toContain('₹500');
      expect(email.text).toContain(lang === 'en' ? '1 December 2026' : '2026');
      expect(email.html).toContain('<a href="https://x.test/manage/tok">');
      expect(email.html).toContain('A &lt;b&gt;');
    }
    expect(
      renderDonorSubscriptionStarted(
        { donorName: 'A', amountPaise: 100, startDate: null, manageUrl: 'u', trustName: 'T' },
        'en',
      ).text,
    ).toContain('taken now');
  });

  it('monthly giving is off unless RAZORPAY_SUBSCRIPTIONS_ENABLED=true', () => {
    expect(loadEnv({}).RAZORPAY_SUBSCRIPTIONS_ENABLED).toBe(false);
    expect(loadEnv({ RAZORPAY_SUBSCRIPTIONS_ENABLED: '' }).RAZORPAY_SUBSCRIPTIONS_ENABLED).toBe(
      false,
    );
    expect(loadEnv({ RAZORPAY_SUBSCRIPTIONS_ENABLED: 'true' }).RAZORPAY_SUBSCRIPTIONS_ENABLED).toBe(
      true,
    );
    expect(() => loadEnv({ RAZORPAY_SUBSCRIPTIONS_ENABLED: 'yes' })).toThrow();
    expect(MONTHLY_CONSENT_VERSION).toBe('monthly-v1');
  });
});
