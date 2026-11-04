import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentProviderError, type RazorpayConfig } from '../donations/provider.ts';

/**
 * Razorpay Subscriptions (#32): plans, subscriptions, cancel, fetch, and the subscription
 * Checkout signature. Kept apart from one-time payments so neither can affect the other.
 * Everything the API returns is validated; nothing from the browser is trusted.
 */
export interface ProviderSubscription {
  subscriptionId: string;
  planId: string;
  status: string;
  /** Unix seconds, when Razorpay reports them. */
  startAt: number | null;
  chargeAt: number | null;
}

export interface CreateSubscriptionInput {
  planId: string;
  /** Number of monthly charges before it ends (the consent says "until you cancel"). */
  totalCount: number;
  /** First charge (unix seconds); omitted = on authorisation. */
  startAt?: number;
  notes: Record<string, string>;
}

export interface SubscriptionProvider {
  createPlan(input: { amountPaise: number; name: string }): Promise<{ planId: string }>;
  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>;
  fetchSubscription(subscriptionId: string): Promise<ProviderSubscription>;
  /** Cancels now (not at the end of the cycle). */
  cancelSubscription(subscriptionId: string): Promise<ProviderSubscription>;
  /** HMAC-SHA256(payment_id|subscription_id, key secret), compared in constant time. */
  verifySubscriptionSignature(
    paymentId: string,
    subscriptionId: string,
    signature: string,
  ): boolean;
}

const SUB_ID = /^sub_[A-Za-z0-9]{6,40}$/;
const PLAN_ID = /^plan_[A-Za-z0-9]{6,40}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;

export function parseSubscription(raw: unknown): ProviderSubscription {
  const s = raw as {
    id?: unknown;
    plan_id?: unknown;
    status?: unknown;
    start_at?: unknown;
    charge_at?: unknown;
  } | null;
  if (
    typeof s?.id !== 'string' ||
    !SUB_ID.test(s.id) ||
    typeof s.plan_id !== 'string' ||
    !PLAN_ID.test(s.plan_id) ||
    typeof s.status !== 'string'
  ) {
    throw new PaymentProviderError('unexpected_response');
  }
  const seconds = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);
  return {
    subscriptionId: s.id,
    planId: s.plan_id,
    status: s.status,
    startAt: seconds(s.start_at),
    chargeAt: seconds(s.charge_at),
  };
}

export function razorpaySubscriptions(config: RazorpayConfig): SubscriptionProvider {
  const base = config.baseUrl ?? 'https://api.razorpay.com';
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          authorization: auth,
          ...(body !== undefined && { 'content-type': 'application/json' }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
      });
    } catch {
      throw new PaymentProviderError('network');
    }
    if (!res.ok) throw new PaymentProviderError('rejected');
    const json: unknown = await res.json().catch(() => null);
    if (json === null) throw new PaymentProviderError('unexpected_response');
    return json;
  }

  return {
    async createPlan({ amountPaise, name }) {
      const body = (await call('POST', '/v1/plans', {
        period: 'monthly',
        interval: 1,
        item: { name, amount: amountPaise, currency: 'INR' },
      })) as { id?: unknown; item?: { amount?: unknown; currency?: unknown } };
      if (
        typeof body.id !== 'string' ||
        !PLAN_ID.test(body.id) ||
        body.item?.amount !== amountPaise ||
        body.item.currency !== 'INR'
      ) {
        throw new PaymentProviderError('unexpected_response');
      }
      return { planId: body.id };
    },
    async createSubscription(input) {
      const sub = parseSubscription(
        await call('POST', '/v1/subscriptions', {
          plan_id: input.planId,
          total_count: input.totalCount,
          quantity: 1,
          customer_notify: 1,
          ...(input.startAt !== undefined && { start_at: input.startAt }),
          notes: input.notes,
        }),
      );
      if (sub.planId !== input.planId) throw new PaymentProviderError('unexpected_response');
      return sub;
    },
    async fetchSubscription(subscriptionId) {
      if (!SUB_ID.test(subscriptionId)) throw new PaymentProviderError('rejected');
      return parseSubscription(await call('GET', `/v1/subscriptions/${subscriptionId}`));
    },
    async cancelSubscription(subscriptionId) {
      if (!SUB_ID.test(subscriptionId)) throw new PaymentProviderError('rejected');
      return parseSubscription(
        await call('POST', `/v1/subscriptions/${subscriptionId}/cancel`, {
          cancel_at_cycle_end: 0,
        }),
      );
    },
    verifySubscriptionSignature(paymentId, subscriptionId, signature) {
      if (
        !PAYMENT_ID.test(paymentId) ||
        !SUB_ID.test(subscriptionId) ||
        !/^[0-9a-f]{64}$/.test(signature)
      ) {
        return false;
      }
      const expected = createHmac('sha256', config.keySecret)
        .update(`${paymentId}|${subscriptionId}`)
        .digest('hex');
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    },
  };
}
