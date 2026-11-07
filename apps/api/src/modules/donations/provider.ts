import { createHmac, timingSafeEqual } from 'node:crypto';
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

/** Trusted payment state, read from the provider's API with our secret (never from the browser). */
export interface ProviderPayment {
  paymentId: string;
  orderId: string | null;
  amountPaise: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method: string | null;
  /** Paise refunded so far. */
  refundedPaise: number;
}

export interface PaymentProvider {
  readonly name: 'RAZORPAY';
  /** The key ID the browser needs to open Checkout. Never the secret. */
  readonly publicKeyId: string;
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
  /** HMAC-SHA256(order_id|payment_id, key secret), compared in constant time. */
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  /** All payments made against an order (used when the browser callback never arrived). */
  fetchOrderPayments(orderId: string): Promise<ProviderPayment[]>;
  /** One-time UPI QR for exactly one amount (Razorpay QR Codes, client Nov 2026). */
  createQrCode?(input: CreateQrInput): Promise<ProviderQr>;
  /** Payments made on a QR (the re-check when the webhook is late). */
  fetchQrPayments?(qrId: string): Promise<ProviderPayment[]>;
  /** The QR picture, fetched server-side so the browser never talks to Razorpay for it. */
  fetchQrImage?(imageUrl: string): Promise<{ contentType: string; data: Buffer }>;
}

export interface CreateQrInput {
  amountPaise: number;
  /** Our public reference, shown in the provider dashboard. */
  reference: string;
  /** When the QR stops accepting payment. */
  closeBy: Date;
  /** Non-personal labels only. */
  notes: Record<string, string>;
}

export interface ProviderQr {
  qrId: string;
  imageUrl: string;
  amountPaise: number;
  closeBy: Date;
}

export const QR_ID = /^qr_[A-Za-z0-9]{6,40}$/;
/** QR images are only ever fetched from Razorpay's own hosts. */
export function isRazorpayImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)(rzp\.io|razorpay\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}
const MAX_QR_IMAGE_BYTES = 1_048_576;

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

const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;
const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;

/** Validates a Razorpay Payment entity (API response or signed webhook payload). */
export function parseProviderPayment(raw: unknown): ProviderPayment {
  const p = raw as {
    id?: unknown;
    order_id?: unknown;
    amount?: unknown;
    currency?: unknown;
    status?: unknown;
    method?: unknown;
    amount_refunded?: unknown;
  } | null;
  if (
    typeof p?.id !== 'string' ||
    !PAYMENT_ID.test(p.id) ||
    !Number.isInteger(p.amount) ||
    typeof p.currency !== 'string' ||
    typeof p.status !== 'string'
  ) {
    throw new PaymentProviderError('unexpected_response');
  }
  return {
    paymentId: p.id,
    orderId: typeof p.order_id === 'string' ? p.order_id : null,
    amountPaise: p.amount as number,
    currency: p.currency,
    status: p.status,
    method: typeof p.method === 'string' ? p.method : null,
    refundedPaise: Number.isInteger(p.amount_refunded) ? (p.amount_refunded as number) : 0,
  };
}

/** Razorpay Orders API over HTTPS with Basic auth (no SDK needed, nothing logged). */
export function razorpayProvider(config: RazorpayConfig): PaymentProvider {
  const base = config.baseUrl ?? 'https://api.razorpay.com';
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
  async function getJson(path: string): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        headers: { authorization: auth },
        signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
      });
    } catch {
      throw new PaymentProviderError('network');
    }
    if (!res.ok) throw new PaymentProviderError('rejected');
    const body: unknown = await res.json().catch(() => null);
    if (body === null) throw new PaymentProviderError('unexpected_response');
    return body;
  }

  return {
    name: 'RAZORPAY',
    publicKeyId: config.keyId,
    verifyCheckoutSignature(orderId, paymentId, signature) {
      if (
        !ORDER_ID.test(orderId) ||
        !PAYMENT_ID.test(paymentId) ||
        !/^[0-9a-f]{64}$/.test(signature)
      ) {
        return false;
      }
      const expected = createHmac('sha256', config.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    },
    async fetchPayment(paymentId) {
      if (!PAYMENT_ID.test(paymentId)) throw new PaymentProviderError('rejected');
      return parseProviderPayment(await getJson(`/v1/payments/${paymentId}`));
    },
    async fetchOrderPayments(orderId) {
      if (!ORDER_ID.test(orderId)) throw new PaymentProviderError('rejected');
      const body = (await getJson(`/v1/orders/${orderId}/payments`)) as { items?: unknown };
      if (!Array.isArray(body.items)) throw new PaymentProviderError('unexpected_response');
      return body.items.map(parseProviderPayment);
    },
    async createQrCode(input) {
      let res: Response;
      try {
        res = await doFetch(`${base}/v1/payments/qr_codes`, {
          method: 'POST',
          headers: { authorization: auth, 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'upi_qr',
            name: 'Theonetrust.in',
            usage: 'single_use',
            fixed_amount: true,
            payment_amount: input.amountPaise,
            description: input.reference,
            close_by: Math.floor(input.closeBy.getTime() / 1000),
            notes: input.notes,
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
        });
      } catch {
        throw new PaymentProviderError('network');
      }
      if (!res.ok) throw new PaymentProviderError('rejected');
      const body = (await res.json().catch(() => null)) as {
        id?: unknown;
        image_url?: unknown;
        payment_amount?: unknown;
        close_by?: unknown;
        status?: unknown;
      } | null;
      // Trust nothing: exactly the amount we asked for, an active QR, a Razorpay image link.
      if (
        typeof body?.id !== 'string' ||
        !QR_ID.test(body.id) ||
        typeof body.image_url !== 'string' ||
        !isRazorpayImageUrl(body.image_url) ||
        body.payment_amount !== input.amountPaise ||
        body.status !== 'active'
      ) {
        throw new PaymentProviderError('unexpected_response');
      }
      const closeBy = Number(body.close_by);
      return {
        qrId: body.id,
        imageUrl: body.image_url,
        amountPaise: body.payment_amount,
        closeBy: Number.isFinite(closeBy) && closeBy > 0 ? new Date(closeBy * 1000) : input.closeBy,
      };
    },
    async fetchQrPayments(qrId) {
      if (!QR_ID.test(qrId)) throw new PaymentProviderError('rejected');
      const body = (await getJson(`/v1/payments/qr_codes/${qrId}/payments`)) as {
        items?: unknown;
      };
      if (!Array.isArray(body.items)) throw new PaymentProviderError('unexpected_response');
      return body.items.map(parseProviderPayment);
    },
    async fetchQrImage(imageUrl) {
      if (!isRazorpayImageUrl(imageUrl)) throw new PaymentProviderError('rejected');
      let res: Response;
      try {
        res = await doFetch(imageUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
        });
      } catch {
        throw new PaymentProviderError('network');
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !/^image\/(png|jpeg)\b/.test(contentType)) {
        throw new PaymentProviderError('unexpected_response');
      }
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length === 0 || data.length > MAX_QR_IMAGE_BYTES) {
        throw new PaymentProviderError('unexpected_response');
      }
      return { contentType: contentType.split(';')[0] ?? 'image/png', data };
    },
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
