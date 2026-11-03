/**
 * Payment provider boundary (spec §8 "Separation rule"). Domain code talks to this interface;
 * Razorpay specifics stay in the adapter, so a provider can be added or replaced without
 * touching the donation flow or the dashboard.
 */
export interface CreateOrderInput {
  /** Integer paise, computed by the server. */
  amountPaise: number;
  currency: 'INR';
  /** Our public reference (≤ 40 chars), shown in the provider dashboard. */
  receipt: string;
  /** Non-personal labels only. */
  notes: Record<string, string>;
}

export interface ProviderOrder {
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  status: string;
}

export interface PaymentProvider {
  readonly name: 'RAZORPAY';
  /** The key ID the browser needs to open Checkout. Never the secret. */
  readonly publicKeyId: string;
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
}

export class PaymentProviderError extends Error {
  constructor(readonly reason: 'network' | 'rejected' | 'unexpected_response') {
    super(`Payment provider error: ${reason}`);
    this.name = 'PaymentProviderError';
  }
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  /** Overridable for tests; production uses the official API host. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Razorpay Orders API over HTTPS with Basic auth (no SDK needed, nothing logged). */
export function razorpayProvider(config: RazorpayConfig): PaymentProvider {
  const base = config.baseUrl ?? 'https://api.razorpay.com';
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
  return {
    name: 'RAZORPAY',
    publicKeyId: config.keyId,
    async createOrder(input) {
      let res: Response;
      try {
        res = await doFetch(`${base}/v1/orders`, {
          method: 'POST',
          headers: { authorization: auth, 'content-type': 'application/json' },
          body: JSON.stringify({
            amount: input.amountPaise,
            currency: input.currency,
            receipt: input.receipt,
            notes: input.notes,
            partial_payment: false,
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
        });
      } catch {
        throw new PaymentProviderError('network');
      }
      if (!res.ok) throw new PaymentProviderError('rejected');
      const body = (await res.json().catch(() => null)) as {
        id?: unknown;
        amount?: unknown;
        currency?: unknown;
        status?: unknown;
      } | null;
      // Trust nothing: the order must be exactly what we asked for.
      if (
        typeof body?.id !== 'string' ||
        !/^order_[A-Za-z0-9]{6,40}$/.test(body.id) ||
        body.amount !== input.amountPaise ||
        body.currency !== 'INR'
      ) {
        throw new PaymentProviderError('unexpected_response');
      }
      return {
        orderId: body.id,
        amountPaise: body.amount,
        currency: 'INR',
        status: typeof body.status === 'string' ? body.status : 'created',
      };
    },
  };
}
