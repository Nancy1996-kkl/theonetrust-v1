import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { cashfreeProvider, paiseToRupees } from '../modules/donations/cashfree.ts';
import type { PaymentProvider } from '../modules/donations/provider.ts';

/**
 * A fake Cashfree for integration tests. The REAL adapter (cashfree.ts) talks to it over `fetch`,
 * so every test goes through the same parsing, PAID rule and refund rules as production. Tests
 * change what "Cashfree knows" with `pay` and `refund`, then drive the app with the donor's
 * re-check, the return to the site (`/payments/verify`) or a signed webhook.
 */
export interface FakeCashfreePayment {
  cf_payment_id: string;
  payment_status: string;
  is_captured: boolean;
  payment_amount: number;
  payment_currency: string;
  payment_group: string;
}

export interface FakeCashfreeOrder {
  order_id: string;
  order_status: string;
  /** Rupees, as Cashfree sends them. */
  amount: number;
  payments: FakeCashfreePayment[];
  refunds: Array<{
    cf_refund_id: string;
    cf_payment_id: string;
    refund_status: string;
    refund_amount: number;
  }>;
}

export const CASHFREE_TEST_SITE = 'https://theonetrust.example';
const CLIENT_ID = 'TESTCLIENT0123';

/**
 * Payment and refund IDs must be unique across every test file: the database suite shares one
 * database, and the gateway's IDs are unique there (and in webhook event keys). A per-process
 * base keeps them unique and still safe integers, like Cashfree's numeric IDs.
 */
let idSeq = Date.now() * 100 + Math.floor(Math.random() * 100);
const nextId = () => String(++idSeq);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function fakeCashfree(secret: string) {
  const orders = new Map<string, FakeCashfreeOrder>();
  const created: Array<Record<string, unknown>> = [];
  let down = false;

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    if (down) throw new TypeError('fetch failed');
    const path = new URL(String(url)).pathname.replace(/^\/pg/, '');
    if (init?.method === 'POST' && path === '/orders') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown> & {
        order_id: string;
        order_amount: number;
      };
      created.push(body);
      orders.set(body.order_id, {
        order_id: body.order_id,
        order_status: 'ACTIVE',
        amount: body.order_amount,
        payments: [],
        refunds: [],
      });
      return json({
        order_id: body.order_id,
        order_amount: body.order_amount,
        order_currency: 'INR',
        order_status: 'ACTIVE',
        payment_session_id: `session_${body.order_id}`,
      });
    }
    const m = /^\/orders\/([^/]+)(\/payments|\/refunds)?$/.exec(path);
    const order = m ? orders.get(decodeURIComponent(m[1] ?? '')) : undefined;
    if (!order) return json({ message: 'order not found', code: 'order_not_found' }, 404);
    if (m?.[2] === '/payments') return json(order.payments);
    if (m?.[2] === '/refunds') return json(order.refunds);
    return json({
      order_id: order.order_id,
      order_status: order.order_status,
      order_amount: order.amount,
      order_currency: 'INR',
    });
  }) as typeof fetch;

  const provider: PaymentProvider = cashfreeProvider({
    clientId: CLIENT_ID,
    clientSecret: secret,
    mode: 'sandbox',
    siteUrl: CASHFREE_TEST_SITE,
    notifyUrl: `${CASHFREE_TEST_SITE}/api/v1/webhooks/cashfree`,
    orderExpiryMinutes: 30,
    now: () => new Date(),
    fetch: fetchImpl,
  });

  function order(ref: string): FakeCashfreeOrder {
    const found = orders.get(ref);
    if (!found) throw new Error(`fake Cashfree has no order ${ref}`);
    return found;
  }

  return {
    provider,
    orders,
    created,
    /** loadEnv values that switch the app to Cashfree with this fake's secret. */
    env: {
      PAYMENT_PROVIDER: 'cashfree',
      CASHFREE_ENV: 'sandbox',
      CASHFREE_CLIENT_ID: CLIENT_ID,
      CASHFREE_CLIENT_SECRET: secret,
      PUBLIC_SITE_URL: CASHFREE_TEST_SITE,
    },
    /** Cashfree unreachable (network failure) until switched back. */
    setDown(value: boolean) {
      down = value;
    },
    /**
     * The donor pays on an order. SUCCESS is captured (unless `captured: false`, which the
     * adapter holds as authorized) and marks the order PAID.
     */
    pay(
      ref: string,
      opts: {
        status?: 'SUCCESS' | 'FAILED' | 'PENDING' | 'USER_DROPPED' | 'FLAGGED';
        paise?: number;
        captured?: boolean;
        currency?: string;
        group?: string;
      } = {},
    ): string {
      const o = order(ref);
      const status = opts.status ?? 'SUCCESS';
      const captured = opts.captured ?? status === 'SUCCESS';
      const id = nextId();
      o.payments.push({
        cf_payment_id: id,
        payment_status: status,
        is_captured: captured,
        payment_amount: opts.paise !== undefined ? paiseToRupees(opts.paise) : o.amount,
        payment_currency: opts.currency ?? 'INR',
        payment_group: opts.group ?? 'upi',
      });
      // Cashfree marks the order PAID once a payment is captured.
      if (status === 'SUCCESS' && captured) o.order_status = 'PAID';
      return id;
    },
    /** Changes what the gateway says about one payment (and optionally its order). */
    setPayment(
      ref: string,
      paymentId: string,
      patch: Partial<FakeCashfreePayment>,
      orderStatus?: string,
    ) {
      const o = order(ref);
      const p = o.payments.find((x) => x.cf_payment_id === paymentId);
      if (!p) throw new Error(`fake Cashfree has no payment ${paymentId}`);
      Object.assign(p, patch);
      if (orderStatus) o.order_status = orderStatus;
    },
    /** A payment that was waiting is now captured (and the order PAID). */
    capture(ref: string, paymentId: string) {
      const o = order(ref);
      const p = o.payments.find((x) => x.cf_payment_id === paymentId);
      if (!p) throw new Error(`fake Cashfree has no payment ${paymentId}`);
      p.payment_status = 'SUCCESS';
      p.is_captured = true;
      o.order_status = 'PAID';
    },
    /** A refund of one payment (SUCCESS = processed). Returns the refund ID. */
    refund(
      ref: string,
      paymentId: string,
      paise: number,
      status: 'SUCCESS' | 'PENDING' | 'CANCELLED' = 'SUCCESS',
    ): string {
      const id = `refund_${nextId()}`;
      order(ref).refunds.push({
        cf_refund_id: id,
        cf_payment_id: paymentId,
        refund_status: status,
        refund_amount: paiseToRupees(paise),
      });
      return id;
    },
    /** Changes the status of an existing refund (e.g. PENDING → SUCCESS). */
    settleRefund(ref: string, refundId: string, status: 'SUCCESS' | 'CANCELLED') {
      const r = order(ref).refunds.find((x) => x.cf_refund_id === refundId);
      if (!r) throw new Error(`fake Cashfree has no refund ${refundId}`);
      r.refund_status = status;
    },
  };
}

export type FakeCashfree = ReturnType<typeof fakeCashfree>;

/** A payment webhook body. The payload's amount is deliberately wrong: it is never trusted. */
export function cashfreePaymentEvent(
  ref: string,
  paymentId: string,
  type:
    | 'PAYMENT_SUCCESS_WEBHOOK'
    | 'PAYMENT_FAILED_WEBHOOK'
    | 'PAYMENT_USER_DROPPED_WEBHOOK' = 'PAYMENT_SUCCESS_WEBHOOK',
) {
  const status = {
    PAYMENT_SUCCESS_WEBHOOK: 'SUCCESS',
    PAYMENT_FAILED_WEBHOOK: 'FAILED',
    PAYMENT_USER_DROPPED_WEBHOOK: 'USER_DROPPED',
  }[type];
  return {
    type,
    event_time: new Date().toISOString(),
    data: {
      order: { order_id: ref, order_amount: 1, order_currency: 'INR' },
      payment: {
        cf_payment_id: Number(paymentId),
        payment_status: status,
        payment_amount: 1,
        payment_currency: 'INR',
      },
    },
  };
}

/** A merchant refund webhook body. */
export function cashfreeRefundEvent(
  ref: string,
  paymentId: string,
  refundId: string,
  status: 'SUCCESS' | 'PENDING' | 'CANCELLED',
) {
  return {
    type: 'REFUND_STATUS_WEBHOOK',
    event_time: new Date().toISOString(),
    data: {
      refund: {
        cf_refund_id: refundId,
        cf_payment_id: paymentId,
        order_id: ref,
        refund_status: status,
        refund_amount: 1,
      },
    },
  };
}

/** Delivers a webhook signed like Cashfree: base64(HMAC-SHA256(secret, timestamp + raw body)). */
export function sendCashfreeWebhook(app: FastifyInstance, secret: string, body: unknown) {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/cashfree',
    headers: {
      'content-type': 'application/json',
      'x-webhook-signature': createHmac('sha256', secret)
        .update(ts + raw)
        .digest('base64'),
      'x-webhook-timestamp': ts,
      'x-webhook-version': '2026-01-01',
    },
    payload: raw,
  });
}
