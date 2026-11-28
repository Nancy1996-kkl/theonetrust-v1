import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  CASHFREE_API_VERSION,
  cashfreeId,
  cashfreeMethod,
  cashfreePaymentState,
  cashfreeProvider,
  idempotencyUuid,
  paiseToRupees,
  parseCashfreePayment,
  rupeesToPaiseExact,
  summariseRefunds,
  verifyCashfreeSignature,
  type CashfreeConfig,
} from './cashfree.ts';
import { checkoutDescriptor, PaymentProviderError } from './provider.ts';

const SECRET = 'cf-secret-0123456789';
const NOW = new Date('2026-11-21T10:00:00Z');

describe('money: paise ↔ Cashfree rupees', () => {
  it.each([
    [100, 1],
    [1, 0.01],
    [101, 1.01],
    [1050, 10.5],
    [199_999_999, 1_999_999.99],
  ])('%i paise → ₹%s and back exactly', (paise, rupees) => {
    expect(paiseToRupees(paise)).toBe(rupees);
    expect(rupeesToPaiseExact(rupees)).toBe(paise);
  });

  it.each([0, -1, 1.5, Number.NaN, 1_000_000_001])('refuses %s paise', (paise) => {
    expect(() => paiseToRupees(paise)).toThrow(RangeError);
  });

  it('reads Cashfree text and numbers exactly ("10.5", "170.00", 170)', () => {
    expect(rupeesToPaiseExact('10.5')).toBe(1050);
    expect(rupeesToPaiseExact('170.00')).toBe(17_000);
    expect(rupeesToPaiseExact(170)).toBe(17_000);
  });

  it.each([10.005, '10.005', 1e21, 0.1 + 0.2, -1, '-1', '1e3', 'abc', null, Infinity, '01'])(
    'refuses %s',
    (value) => {
      expect(() => rupeesToPaiseExact(value)).toThrow(RangeError);
    },
  );
});

describe('payment state mapping (PAID rule)', () => {
  it.each([
    ['SUCCESS', true, true, 'captured'],
    ['SUCCESS', true, false, 'authorized'],
    ['SUCCESS', false, true, 'authorized'],
    ['PENDING', false, false, 'pending'],
    ['NOT_ATTEMPTED', false, false, 'pending'],
    ['FAILED', false, false, 'failed'],
    ['USER_DROPPED', false, false, 'cancelled'],
    ['CANCELLED', false, false, 'cancelled'],
    ['VOID', false, false, 'cancelled'],
    ['FLAGGED', true, true, 'unknown'],
    ['SOMETHING_NEW', true, true, 'unknown'],
  ] as const)('%s captured=%s orderPaid=%s → %s', (status, captured, paid, expected) => {
    expect(cashfreePaymentState(status, captured, paid)).toBe(expected);
  });

  it.each([
    ['upi', 'upi'],
    ['upi_credit_card', 'upi'],
    ['credit_card', 'card'],
    ['debit_card', 'card'],
    ['prepaid_card', 'card'],
    ['net_banking', 'netbanking'],
    ['wallet', 'wallet'],
    ['pay_later', 'other'],
    [undefined, null],
  ])('payment_group %s → %s', (group, method) => {
    expect(cashfreeMethod(group)).toBe(method);
  });

  it('parses a payment; an unreadable amount becomes -1 so it can never match', () => {
    const ok = parseCashfreePayment(
      {
        cf_payment_id: '5114910',
        order_id: 'TOT-D-ABC',
        payment_status: 'SUCCESS',
        is_captured: true,
        payment_amount: 10.5,
        payment_currency: 'INR',
        payment_group: 'upi',
      },
      'TOT-D-ABC',
      true,
    );
    expect(ok).toMatchObject({ paymentId: '5114910', state: 'captured', amountPaise: 1050 });
    const odd = parseCashfreePayment(
      { cf_payment_id: 5, payment_status: 'SUCCESS', payment_amount: 10.005 },
      'TOT-D-ABC',
      true,
    );
    expect(odd).toMatchObject({ paymentId: '5', orderId: 'TOT-D-ABC', amountPaise: -1 });
    expect(() => parseCashfreePayment({ payment_status: 'SUCCESS' }, 'X', true)).toThrow(
      PaymentProviderError,
    );
    expect(() => parseCashfreePayment(null, 'X', true)).toThrow(PaymentProviderError);
  });

  it('ids: strings and safe positive integers only', () => {
    expect(cashfreeId('123')).toBe('123');
    expect(cashfreeId(789727431)).toBe('789727431');
    expect(cashfreeId(1.5)).toBeNull();
    expect(cashfreeId(-1)).toBeNull();
    expect(cashfreeId('a b')).toBeNull();
    expect(cashfreeId(undefined)).toBeNull();
  });
});

describe('refund summary (per payment)', () => {
  const r = (status: string, amount: unknown, payment: unknown = '77') => ({
    refund_status: status,
    refund_amount: amount,
    cf_payment_id: payment,
  });

  it('sums SUCCESS refunds of THIS payment and reports the overall state', () => {
    expect(summariseRefunds([], '77')).toEqual({
      refundedPaise: 0,
      status: null,
      otherPaymentRefunds: false,
    });
    expect(
      summariseRefunds([r('SUCCESS', 2), r('SUCCESS', '3.50', 77), r('CANCELLED', 9)], '77'),
    ).toEqual({ refundedPaise: 550, status: 'processed', otherPaymentRefunds: false });
    expect(summariseRefunds([r('PENDING', 2)], '77')).toMatchObject({ status: 'created' });
    expect(summariseRefunds([r('ONHOLD', 2)], '77')).toMatchObject({ status: 'created' });
    expect(summariseRefunds([r('REJECTED', 2)], '77')).toMatchObject({
      refundedPaise: 0,
      status: 'failed',
    });
  });

  it('a refund of ANOTHER payment of the order (e.g. a duplicate) is never counted', () => {
    expect(summariseRefunds([r('SUCCESS', 1500.5, '88')], '77')).toEqual({
      refundedPaise: 0,
      status: null,
      otherPaymentRefunds: true,
    });
    expect(summariseRefunds([r('SUCCESS', 1, '88'), r('SUCCESS', 2, '77')], '77')).toEqual({
      refundedPaise: 200,
      status: 'processed',
      otherPaymentRefunds: true,
    });
    // A refund without a payment ID belongs to no payment of ours.
    expect(summariseRefunds([{ refund_status: 'SUCCESS', refund_amount: 5 }], '77')).toMatchObject({
      refundedPaise: 0,
      status: null,
    });
  });

  it('refuses a non-array or an inexact refunded amount', () => {
    expect(() => summariseRefunds({}, '77')).toThrow(PaymentProviderError);
    expect(() => summariseRefunds([r('SUCCESS', 1.001)], '77')).toThrow(PaymentProviderError);
  });
});

describe('webhook signature', () => {
  const body = Buffer.from('{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"amount":170.00}}');
  const ts = '1785401067911';
  const sig = createHmac('sha256', SECRET)
    .update(ts + body.toString())
    .digest('base64');

  it('accepts base64(HMAC-SHA256(secret, timestamp + raw body))', () => {
    expect(verifyCashfreeSignature(body, sig, ts, SECRET)).toBe(true);
  });

  it.each([
    ['tampered body', Buffer.from(`${body.toString()} `), sig, ts, SECRET],
    ['tampered timestamp', body, sig, '1785401067912', SECRET],
    ['wrong secret', body, sig, ts, 'another-secret-0000'],
    ['short signature', body, sig.slice(0, 20), ts, SECRET],
    ['not base64', body, `${'!'.repeat(43)}=`, ts, SECRET],
    ['missing signature', body, undefined, ts, SECRET],
    ['missing timestamp', body, sig, undefined, SECRET],
    ['non-digit timestamp', body, sig, '17854O1067911', SECRET],
  ])('rejects %s', (_name, raw, signature, timestamp, secret) => {
    expect(verifyCashfreeSignature(raw as Buffer, signature, timestamp, secret as string)).toBe(
      false,
    );
  });
});

describe('idempotency UUID', () => {
  it('is a stable, well-formed UUID per order', () => {
    const a = idempotencyUuid('TOT-D-AAAA');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idempotencyUuid('TOT-D-AAAA')).toBe(a);
    expect(idempotencyUuid('TOT-D-AAAB')).not.toBe(a);
  });
});

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeCashfree(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return answer(call);
  }) as typeof fetch;
  return { calls, fetchFn };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function adapter(fetchFn: typeof fetch, extra: Partial<CashfreeConfig> = {}) {
  return cashfreeProvider({
    clientId: 'TEST1234567890',
    clientSecret: SECRET,
    mode: 'sandbox',
    siteUrl: 'https://theonetrust.example/',
    notifyUrl: 'https://theonetrust.example/api/v1/webhooks/cashfree',
    orderExpiryMinutes: 30,
    now: () => NOW,
    fetch: fetchFn,
    ...extra,
  });
}

const ORDER = 'TOT-D-0123456789AB';
const orderInput = {
  amountPaise: 150_050,
  currency: 'INR' as const,
  receipt: ORDER,
  notes: { donation_reference: ORDER, programme: 'general' },
  customerPhone: '+919876543210',
  locale: 'ta' as const,
};

describe('cashfreeProvider.createOrder', () => {
  it('sends exactly the minimum, pinned version, idempotency key; returns the session', async () => {
    const { calls, fetchFn } = fakeCashfree((call) =>
      json({
        order_id: ORDER,
        order_amount: (call.body as { order_amount: number }).order_amount,
        order_currency: 'INR',
        order_status: 'ACTIVE',
        payment_session_id: 'session_abc-123.XYZ=',
        cf_order_id: '2149460581',
      }),
    );
    const provider = adapter(fetchFn);
    const order = await provider.createOrder(orderInput);
    expect(order).toEqual({
      orderId: ORDER,
      amountPaise: 150_050,
      currency: 'INR',
      status: 'ACTIVE',
      sessionId: 'session_abc-123.XYZ=',
    });
    const [call] = calls;
    expect(call?.url).toBe('https://sandbox.cashfree.com/pg/orders');
    expect(call?.method).toBe('POST');
    expect(call?.headers).toMatchObject({
      'x-client-id': 'TEST1234567890',
      'x-client-secret': SECRET,
      'x-api-version': CASHFREE_API_VERSION,
      'x-idempotency-key': idempotencyUuid(ORDER),
    });
    expect(call?.body).toEqual({
      order_id: ORDER,
      order_amount: 1500.5,
      order_currency: 'INR',
      customer_details: { customer_id: 'TOTD0123456789AB', customer_phone: '9876543210' },
      order_meta: {
        return_url: `https://theonetrust.example/ta/?cf_order=${ORDER}`,
        notify_url: 'https://theonetrust.example/api/v1/webhooks/cashfree',
      },
      order_expiry_time: '2026-11-21T10:30:00.000Z',
      order_tags: { donation_reference: ORDER, programme: 'general' },
    });
    // The phone travels only in customer_details: never in tags or URLs.
    const text = JSON.stringify({ ...(call?.body as object), customer_details: null });
    expect(text).not.toContain('9876543210');
    expect(checkoutDescriptor(provider, order.orderId, order.sessionId)).toEqual({
      provider: 'CASHFREE',
      paymentSessionId: 'session_abc-123.XYZ=',
      mode: 'sandbox',
      orderId: ORDER,
    });
  });

  it('English return URL, production host, no notify URL when not configured', async () => {
    const { calls, fetchFn } = fakeCashfree(() =>
      json({
        order_id: ORDER,
        order_amount: 1500.5,
        order_currency: 'INR',
        order_status: 'ACTIVE',
        payment_session_id: 's1',
      }),
    );
    const provider = cashfreeProvider({
      clientId: 'TEST1234567890',
      clientSecret: SECRET,
      mode: 'production',
      siteUrl: 'https://theonetrust.example',
      orderExpiryMinutes: 30,
      now: () => NOW,
      fetch: fetchFn,
    });
    await provider.createOrder({ ...orderInput, locale: 'en' });
    expect(calls[0]?.url).toBe('https://api.cashfree.com/pg/orders');
    expect(calls[0]?.body).toMatchObject({
      order_meta: { return_url: `https://theonetrust.example/?cf_order=${ORDER}` },
    });
    expect((calls[0]?.body as { order_meta: object }).order_meta).not.toHaveProperty('notify_url');
  });

  it.each([
    ['another order ID', { order_id: 'TOT-D-OTHER' }],
    ['another amount', { order_amount: 1500.51 }],
    ['an inexact amount', { order_amount: 1500.505 }],
    ['another currency', { order_currency: 'USD' }],
    ['an order not open', { order_status: 'EXPIRED' }],
    ['no session', { payment_session_id: undefined }],
    ['a strange session', { payment_session_id: 'bad session' }],
  ])('refuses an answer with %s', async (_name, change) => {
    const { fetchFn } = fakeCashfree(() =>
      json({
        order_id: ORDER,
        order_amount: 1500.5,
        order_currency: 'INR',
        order_status: 'ACTIVE',
        payment_session_id: 's1',
        ...change,
      }),
    );
    await expect(adapter(fetchFn).createOrder(orderInput)).rejects.toMatchObject({
      reason: 'unexpected_response',
    });
  });

  it('refuses before calling Cashfree without a valid +91 phone or order ID', async () => {
    const { calls, fetchFn } = fakeCashfree(() => json({}));
    const provider = adapter(fetchFn);
    for (const input of [
      { ...orderInput, customerPhone: null },
      { ...orderInput, customerPhone: '+14155550100' },
      { ...orderInput, receipt: 'x' },
    ]) {
      await expect(provider.createOrder(input)).rejects.toMatchObject({ reason: 'rejected' });
    }
    expect(calls).toHaveLength(0);
  });

  it('maps HTTP errors and network failures, never reading the body into errors', async () => {
    for (const [answer, reason] of [
      [() => json({ message: 'phone 9876543210 bad' }, 400), 'rejected'],
      [() => json({ message: 'down' }, 503), 'network'],
      [() => new Response('not json'), 'unexpected_response'],
      [
        () => {
          throw new TypeError('fetch failed');
        },
        'network',
      ],
    ] as const) {
      const { fetchFn } = fakeCashfree(answer);
      const error = await adapter(fetchFn)
        .createOrder(orderInput)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PaymentProviderError);
      expect((error as PaymentProviderError).reason).toBe(reason);
      expect((error as Error).message).not.toContain('9876543210');
    }
  });
});

describe('cashfreeProvider order state and refunds', () => {
  function remote(order: unknown, payments: unknown, refunds: unknown = []) {
    return fakeCashfree((call) => {
      if (call.url.endsWith('/payments')) return json(payments);
      if (call.url.endsWith('/refunds')) return json(refunds);
      return json(order);
    });
  }

  it('reads every payment of a PAID order', async () => {
    const { calls, fetchFn } = remote({ order_id: ORDER, order_status: 'PAID' }, [
      {
        cf_payment_id: '1',
        payment_status: 'FAILED',
        payment_amount: 1500.5,
        payment_currency: 'INR',
      },
      {
        cf_payment_id: '2',
        payment_status: 'SUCCESS',
        is_captured: true,
        payment_amount: 1500.5,
        payment_currency: 'INR',
        payment_group: 'upi',
      },
    ]);
    const provider = adapter(fetchFn);
    const state = await provider.fetchOrderState(ORDER);
    expect(state?.payments.map((p) => [p.paymentId, p.state])).toEqual([
      ['1', 'failed'],
      ['2', 'captured'],
    ]);
    expect(calls.map((c) => c.url)).toEqual([
      `https://sandbox.cashfree.com/pg/orders/${ORDER}`,
      `https://sandbox.cashfree.com/pg/orders/${ORDER}/payments`,
    ]);
    expect(state?.payments[1]).toMatchObject({ paymentId: '2', amountPaise: 150_050 });
  });

  it('a SUCCESS payment on an order not PAID is held as authorized, never captured', async () => {
    const { fetchFn } = remote({ order_id: ORDER, order_status: 'ACTIVE' }, [
      { cf_payment_id: '2', payment_status: 'SUCCESS', is_captured: true, payment_amount: 1500.5 },
    ]);
    const state = await adapter(fetchFn).fetchOrderState(ORDER);
    expect(state?.payments[0]?.state).toBe('authorized');
  });

  it.each([
    ['PAID with no captured payment', { order_id: ORDER, order_status: 'PAID' }, []],
    ['another order', { order_id: 'TOT-D-OTHER', order_status: 'PAID' }, []],
    ['no status', { order_id: ORDER }, []],
    ['payments not a list', { order_id: ORDER, order_status: 'ACTIVE' }, { items: [] }],
  ])('refuses %s', async (_name, order, payments) => {
    const { fetchFn } = remote(order, payments);
    await expect(adapter(fetchFn).fetchOrderState(ORDER)).rejects.toMatchObject({
      reason: 'unexpected_response',
    });
  });

  it.each(['EXPIRED', 'TERMINATED'])(
    'a %s order with no successful payment has failed (order-level, decides first)',
    async (orderStatus) => {
      const { fetchFn } = remote(
        { order_id: ORDER, order_status: orderStatus, order_amount: 1500.5, order_currency: 'INR' },
        [{ cf_payment_id: '1', payment_status: 'USER_DROPPED', payment_amount: 1500.5 }],
      );
      const state = await adapter(fetchFn).fetchOrderState(ORDER);
      expect(state?.payments[0]).toEqual({
        paymentId: `order:${ORDER}`,
        orderId: ORDER,
        state: 'failed',
        providerRawStatus: `ORDER_${orderStatus}`,
        amountPaise: 150_050,
        currency: 'INR',
        method: null,
        refundedPaise: 0,
      });
      expect(state?.payments).toHaveLength(2);
    },
  );

  it('an expired order with an unreadable amount stays reviewable (-1), and ACTIVE adds nothing', async () => {
    const odd = remote({ order_id: ORDER, order_status: 'EXPIRED', order_amount: 'x' }, []);
    expect((await adapter(odd.fetchFn).fetchOrderState(ORDER))?.payments[0]).toMatchObject({
      amountPaise: -1,
      currency: '',
    });
    const active = remote({ order_id: ORDER, order_status: 'ACTIVE' }, []);
    expect((await adapter(active.fetchFn).fetchOrderState(ORDER))?.payments).toEqual([]);
  });

  it('never asks Cashfree about a malformed order ID', async () => {
    const { calls, fetchFn } = remote({}, []);
    const provider = adapter(fetchFn);
    await expect(provider.fetchOrderState('../etc')).rejects.toMatchObject({
      reason: 'rejected',
    });
    expect(calls).toHaveLength(0);
  });

  it('reads refunds', async () => {
    const { fetchFn } = remote(
      {},
      [],
      [{ refund_status: 'SUCCESS', refund_amount: 100, cf_payment_id: '2' }],
    );
    expect(await adapter(fetchFn).fetchRefunds(ORDER, '2')).toEqual({
      refundedPaise: 10_000,
      status: 'processed',
      otherPaymentRefunds: false,
    });
    const none = remote({}, [], []);
    expect(await adapter(none.fetchFn).fetchRefunds(ORDER, '2')).toEqual({
      refundedPaise: 0,
      status: null,
      otherPaymentRefunds: false,
    });
  });

  it('descriptor needs a session for Cashfree', () => {
    const { fetchFn } = remote({}, []);
    expect(() => checkoutDescriptor(adapter(fetchFn), ORDER, null)).toThrow(PaymentProviderError);
  });
});

describe('default transport', () => {
  it('uses the global fetch when none is injected', async () => {
    const spy = vi.fn(async () => json([]));
    vi.stubGlobal('fetch', spy);
    try {
      const provider = cashfreeProvider({
        clientId: 'TEST1234567890',
        clientSecret: SECRET,
        mode: 'sandbox',
        siteUrl: 'https://theonetrust.example',
        orderExpiryMinutes: 30,
        now: () => NOW,
      });
      expect(await provider.fetchRefunds(ORDER, '2')).toMatchObject({ status: null });
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
