import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  NormalisedPayment,
  PaymentState,
  ProviderOrderState,
} from '../payments/order-state.ts';
import { PaymentProviderError, type PaymentProvider, type ProviderPayment } from './provider.ts';

/**
 * Cashfree Payments adapter (Phase 4 of docs/decisions/2026-11-20-cashfree-migration-plan.md).
 * Plain `fetch` with strict parsing, no SDK. Facts from Cashfree's official API reference
 * (version 2026-01-01), see docs/research/2026-11-20-cashfree-research.md:
 *
 * - `POST /orders`, `GET /orders/{id}`, `GET /orders/{id}/payments` (an array),
 *   `GET /orders/{id}/refunds` (an array); headers `x-client-id`, `x-client-secret`,
 *   `x-api-version`; amounts are rupees (a number with up to 2 decimals) — converted to and from
 *   integer paise ONLY through the exact helpers below;
 * - webhook signature = base64(HMAC-SHA256(client secret, x-webhook-timestamp + raw body)).
 *
 * Response bodies are never logged: Cashfree errors may echo customer data.
 */

export const CASHFREE_API_VERSION = '2026-01-01';
export const CASHFREE_TIMEOUT_MS = 10_000;
export const CASHFREE_BASE_URL = {
  sandbox: 'https://sandbox.cashfree.com/pg',
  production: 'https://api.cashfree.com/pg',
} as const;
export type CashfreeMode = keyof typeof CASHFREE_BASE_URL;

/** Our order IDs are the donation's public reference (Cashfree allows 3–45 of [A-Za-z0-9_-]). */
export const CASHFREE_ORDER_ID = /^[A-Za-z0-9_-]{3,45}$/;
/** Largest amount the helpers accept (₹1 crore), far above any donation limit. */
const MAX_PAISE = 1_000_000_000;

/** Integer paise → Cashfree's rupee amount. Refuses anything that is not whole positive paise. */
export function paiseToRupees(paise: number): number {
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > MAX_PAISE) {
    throw new RangeError('amount must be whole paise between 1 and the maximum');
  }
  const rupees = `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
  const value = Number(rupees);
  // The number must come back to exactly the same paise, or it is never sent.
  if (rupeesToPaiseExact(value) !== paise) throw new RangeError('amount not exact');
  return value;
}

const RUPEES = /^(?<whole>0|[1-9]\d{0,8})(?:\.(?<fraction>\d{1,2}))?$/;

/**
 * A rupee amount from Cashfree → integer paise, through the decimal text (never `x * 100`).
 * Throws for more than 2 decimals, exponents, negatives, NaN or anything that is not a plain
 * number, so a float can never reach the ledger.
 */
export function rupeesToPaiseExact(value: unknown): number {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('not a finite amount');
    text = String(value);
  } else if (typeof value === 'string') {
    text = value;
  } else {
    throw new RangeError('not an amount');
  }
  const match = RUPEES.exec(text);
  if (!match?.groups) throw new RangeError('not an exact rupee amount');
  const paise =
    Number(match.groups.whole) * 100 + Number((match.groups.fraction ?? '0').padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || paise > MAX_PAISE) throw new RangeError('amount too large');
  return paise;
}

/** Cashfree IDs arrive as strings in the API and sometimes as numbers in webhooks. */
export function cashfreeId(value: unknown): string | null {
  if (typeof value === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

/**
 * Cashfree's payment words → the gateway-neutral states. A SUCCESS payment counts as captured
 * only when Cashfree says it is captured AND the order is PAID (the plan's PAID rule); a SUCCESS
 * on an order not (yet) PAID is held as authorized — never PAID. FLAGGED and unknown words are
 * `unknown`, which never settles anything.
 */
export function cashfreePaymentState(
  paymentStatus: string,
  isCaptured: boolean,
  orderPaid: boolean,
): PaymentState {
  switch (paymentStatus) {
    case 'SUCCESS':
      return isCaptured && orderPaid ? 'captured' : 'authorized';
    case 'PENDING':
    case 'NOT_ATTEMPTED':
      return 'pending';
    case 'FAILED':
      return 'failed';
    case 'USER_DROPPED':
    case 'CANCELLED':
    case 'VOID':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/** Cashfree `payment_group` → the acknowledgement's payment method (no card or UPI details). */
export function cashfreeMethod(group: unknown): string | null {
  if (typeof group !== 'string') return null;
  if (group === 'upi' || group.startsWith('upi_')) return 'upi';
  if (['credit_card', 'debit_card', 'prepaid_card'].includes(group)) return 'card';
  if (group === 'net_banking') return 'netbanking';
  if (group === 'wallet') return 'wallet';
  return 'other';
}

interface RawPayment {
  cf_payment_id?: unknown;
  order_id?: unknown;
  payment_status?: unknown;
  is_captured?: unknown;
  payment_amount?: unknown;
  payment_currency?: unknown;
  payment_group?: unknown;
}

/** One entry of `GET /orders/{id}/payments`, validated and translated. */
export function parseCashfreePayment(
  raw: unknown,
  orderRef: string,
  orderPaid: boolean,
): NormalisedPayment {
  const p = raw as RawPayment | null;
  const paymentId = cashfreeId(p?.cf_payment_id);
  if (!p || !paymentId || typeof p.payment_status !== 'string') {
    throw new PaymentProviderError('unexpected_response');
  }
  let amountPaise: number;
  try {
    amountPaise = rupeesToPaiseExact(p.payment_amount);
  } catch {
    // An amount we cannot read exactly can never match ours: the owner reviews it.
    amountPaise = -1;
  }
  return {
    paymentId,
    orderId: typeof p.order_id === 'string' ? p.order_id : orderRef,
    state: cashfreePaymentState(p.payment_status, p.is_captured === true, orderPaid),
    providerRawStatus: p.payment_status.slice(0, 40),
    amountPaise,
    currency: typeof p.payment_currency === 'string' ? p.payment_currency : '',
    method: cashfreeMethod(p.payment_group),
    refundedPaise: 0,
  };
}

/**
 * Refunds of ONE payment (the one that settled our attempt): what has been refunded and the
 * overall state of its refunds. Refunds of any other payment on the same order (e.g. the owner
 * refunding a duplicate payment) are never counted against the donation — they are only flagged.
 */
export interface CashfreeRefunds {
  refundedPaise: number;
  /** processed: some refund succeeded; created: one is in progress; failed: all ended unpaid. */
  status: 'created' | 'processed' | 'failed' | null;
  /** A refund exists on another payment of the same order (the owner should look). */
  otherPaymentRefunds: boolean;
}

const REFUND_IN_PROGRESS = new Set(['PENDING', 'PENDING_APPROVAL', 'ONHOLD']);

export function summariseRefunds(raw: unknown, paymentId: string): CashfreeRefunds {
  if (!Array.isArray(raw)) throw new PaymentProviderError('unexpected_response');
  let refundedPaise = 0;
  let succeeded = false;
  let inProgress = false;
  let mine = 0;
  let otherPaymentRefunds = false;
  for (const entry of raw as Array<{
    refund_status?: unknown;
    refund_amount?: unknown;
    cf_payment_id?: unknown;
  }>) {
    if (cashfreeId(entry?.cf_payment_id) !== paymentId) {
      otherPaymentRefunds = true;
      continue;
    }
    mine += 1;
    if (entry.refund_status === 'SUCCESS') {
      try {
        refundedPaise += rupeesToPaiseExact(entry.refund_amount);
      } catch {
        throw new PaymentProviderError('unexpected_response');
      }
      succeeded = true;
    } else if (
      typeof entry.refund_status === 'string' &&
      REFUND_IN_PROGRESS.has(entry.refund_status)
    ) {
      inProgress = true;
    }
  }
  const status = mine === 0 ? null : succeeded ? 'processed' : inProgress ? 'created' : 'failed';
  return { refundedPaise, status, otherPaymentRefunds };
}

/**
 * Webhook signature check: base64(HMAC-SHA256(client secret, timestamp + raw body)), compared in
 * constant time after a length check. Missing or malformed headers are simply invalid.
 */
export function verifyCashfreeSignature(
  raw: Buffer,
  signature: unknown,
  timestamp: unknown,
  secret: string,
): boolean {
  if (typeof signature !== 'string' || typeof timestamp !== 'string') return false;
  if (!/^\d{10,16}$/.test(timestamp) || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'utf8'), raw]))
    .digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A stable UUID for Cashfree's x-idempotency-key, derived from our order ID. */
export function idempotencyUuid(orderId: string): string {
  const h = createHash('sha256').update(`cashfree-order:${orderId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface CashfreeConfig {
  clientId: string;
  clientSecret: string;
  mode: CashfreeMode;
  apiVersion?: string;
  /** Public site origin: the donor comes back to `<site>[/ta]/?cf_order=<reference>`. */
  siteUrl: string;
  /** Server-to-server notification URL (HTTPS only; omitted otherwise). */
  notifyUrl?: string;
  /** How long an order accepts payment. */
  orderExpiryMinutes: number;
  now: () => Date;
  /** Overridable for tests. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function cashfreeProvider(config: CashfreeConfig): PaymentProvider {
  const base = config.baseUrl ?? CASHFREE_BASE_URL[config.mode];
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const headers = {
    'x-client-id': config.clientId,
    'x-client-secret': config.clientSecret,
    'x-api-version': config.apiVersion ?? CASHFREE_API_VERSION,
    accept: 'application/json',
  };

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(config.timeoutMs ?? CASHFREE_TIMEOUT_MS),
      });
    } catch {
      throw new PaymentProviderError('network');
    }
    if (!res.ok) {
      // The body is read and dropped: it may echo customer data.
      await res.arrayBuffer().catch(() => undefined);
      throw new PaymentProviderError(res.status >= 500 ? 'network' : 'rejected');
    }
    const body: unknown = await res.json().catch(() => null);
    if (body === null) throw new PaymentProviderError('unexpected_response');
    return body;
  }

  function orderPath(orderRef: string): string {
    if (!CASHFREE_ORDER_ID.test(orderRef)) throw new PaymentProviderError('rejected');
    return `/orders/${encodeURIComponent(orderRef)}`;
  }

  async function fetchOrderState(orderRef: string): Promise<ProviderOrderState> {
    const path = orderPath(orderRef);
    const order = (await call(path)) as {
      order_id?: unknown;
      order_status?: unknown;
      order_amount?: unknown;
      order_currency?: unknown;
    } | null;
    if (order?.order_id !== orderRef || typeof order.order_status !== 'string') {
      throw new PaymentProviderError('unexpected_response');
    }
    const orderPaid = order.order_status === 'PAID';
    const raw = await call(`${path}/payments`);
    if (!Array.isArray(raw)) throw new PaymentProviderError('unexpected_response');
    const payments = raw.map((p) => parseCashfreePayment(p, orderRef, orderPaid));
    // Cashfree says PAID but shows no captured payment: never a guess — the caller keeps the
    // current status, and the owner's re-check shows `provider_unexpected_response`.
    if (orderPaid && !payments.some((p) => p.state === 'captured')) {
      throw new PaymentProviderError('unexpected_response');
    }
    // An order that can no longer be paid (expired or terminated) with no successful payment has
    // failed. Recorded as an order-level failure (raw word ORDER_EXPIRED / ORDER_TERMINATED), put
    // first so it decides; a failure never claims the attempt, so nothing else is overwritten.
    const terminal = ['EXPIRED', 'TERMINATED'].includes(order.order_status);
    if (terminal && !payments.some((p) => p.providerRawStatus === 'SUCCESS')) {
      let amountPaise = -1;
      try {
        amountPaise = rupeesToPaiseExact(order.order_amount);
      } catch {
        // stays -1: an unreadable amount goes to the owner, never to a status change
      }
      payments.unshift({
        paymentId: `order:${orderRef}`,
        orderId: orderRef,
        state: 'failed',
        providerRawStatus: `ORDER_${order.order_status}`,
        amountPaise,
        currency: typeof order.order_currency === 'string' ? order.order_currency : '',
        method: null,
        refundedPaise: 0,
      });
    }
    return { orderRef, payments };
  }

  // Razorpay-only call (payment ID from a browser callback): Cashfree has none, so it is refused.
  async function refusesRazorpayCall(): Promise<never> {
    throw new PaymentProviderError('rejected');
  }

  return {
    name: 'CASHFREE',
    publicKeyId: '',
    checkoutMode: config.mode,
    requiresCustomerPhone: true,
    // Cashfree has no browser-side signature: the server always re-fetches the order instead.
    verifyCheckoutSignature: () => false,
    fetchPayment: refusesRazorpayCall,
    fetchOrderPayments: async (orderRef) =>
      (await fetchOrderState(orderRef)).payments.map((p): ProviderPayment => ({
        paymentId: p.paymentId,
        orderId: p.orderId,
        amountPaise: p.amountPaise,
        currency: p.currency,
        status: p.state,
        method: p.method,
        refundedPaise: 0,
      })),
    fetchOrderState,
    async fetchRefunds(orderRef, paymentId) {
      return summariseRefunds(await call(`${orderPath(orderRef)}/refunds`), paymentId);
    },
    async createOrder(input) {
      const orderId = input.receipt;
      if (!CASHFREE_ORDER_ID.test(orderId)) throw new PaymentProviderError('rejected');
      const national = /^\+91([6-9]\d{9})$/.exec(input.customerPhone ?? '')?.[1];
      if (!national) throw new PaymentProviderError('rejected');
      const amount = paiseToRupees(input.amountPaise);
      const site = config.siteUrl.replace(/\/+$/, '');
      const returnUrl = `${site}${input.locale === 'ta' ? '/ta' : ''}/?cf_order=${orderId}`;
      const expiry = new Date(config.now().getTime() + config.orderExpiryMinutes * 60_000);
      const body = await call('/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': idempotencyUuid(orderId),
        },
        body: JSON.stringify({
          order_id: orderId,
          order_amount: amount,
          order_currency: input.currency,
          // Data minimisation: an opaque customer ID and the phone Cashfree requires — no name,
          // no email. Tags carry non-personal labels only.
          customer_details: {
            customer_id: orderId.replace(/[^A-Za-z0-9]/g, ''),
            customer_phone: national,
          },
          order_meta: {
            return_url: returnUrl,
            ...(config.notifyUrl && { notify_url: config.notifyUrl }),
          },
          order_expiry_time: expiry.toISOString(),
          order_tags: input.notes,
        }),
      });
      const order = body as {
        order_id?: unknown;
        order_amount?: unknown;
        order_currency?: unknown;
        order_status?: unknown;
        payment_session_id?: unknown;
      };
      let amountPaise: number | null = null;
      try {
        amountPaise = rupeesToPaiseExact(order.order_amount);
      } catch {
        amountPaise = null;
      }
      // Trust nothing: exactly the order we asked for, open for payment, with a session.
      if (
        order.order_id !== orderId ||
        amountPaise !== input.amountPaise ||
        order.order_currency !== 'INR' ||
        order.order_status !== 'ACTIVE' ||
        typeof order.payment_session_id !== 'string' ||
        !/^[A-Za-z0-9_.=-]{1,512}$/.test(order.payment_session_id)
      ) {
        throw new PaymentProviderError('unexpected_response');
      }
      return {
        orderId,
        amountPaise,
        currency: 'INR',
        status: 'ACTIVE',
        sessionId: order.payment_session_id,
      };
    },
  };
}

/** Return and notify URLs must fit Cashfree's 250-character limit (checked at boot). */
export const CASHFREE_URL_MAX = 250;
