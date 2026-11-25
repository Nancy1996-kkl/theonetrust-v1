import type { CheckoutDescriptor } from '@theonetrust/contracts';
import type { ProviderOrderState } from '../payments/order-state.ts';
/**
 * Payment provider boundary (spec §8 "Separation rule"). Domain code talks to this interface;
 * gateway specifics stay in the adapter (cashfree.ts), so a provider can be added or replaced without
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
  /** +91 mobile, only for gateways that require one (Cashfree). Never logged or tagged. */
  customerPhone?: string | null;
  /** The donor comes back to this language's page (Cashfree return URL). */
  locale?: 'ta' | 'en';
}

export interface ProviderOrder {
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  status: string;
  /** Cashfree's one-time payment_session_id for the browser pop-up. */
  sessionId: string;
}

/**
 * What the browser needs to open this provider's payment window (Phase 1). Provider words stay
 * in the adapter layer: routes ask for a descriptor and never build one themselves.
 */
export function checkoutDescriptor(
  provider: PaymentProvider,
  orderId: string,
  sessionId?: string | null,
): CheckoutDescriptor {
  if (!sessionId) throw new PaymentProviderError('unexpected_response');
  return {
    provider: 'CASHFREE',
    paymentSessionId: sessionId,
    mode: provider.checkoutMode,
    orderId,
  };
}

/** Longest a single call to the gateway may take before it counts as a network failure. */
export const PROVIDER_TIMEOUT_MS = 10_000;

export interface PaymentProvider {
  readonly name: 'CASHFREE';
  /** Which SDK mode the browser loads (sandbox | production). */
  readonly checkoutMode: 'sandbox' | 'production';
  /** The gateway refuses orders without the donor's mobile number. */
  readonly requiresCustomerPhone: boolean;
  /** Every payment tried on one of our orders, read with our secret (never from the browser). */
  fetchOrderState(orderRef: string): Promise<ProviderOrderState>;
  /**
   * Refunds of one payment on one order: total refunded, the overall refund state, and whether
   * another payment of the order was refunded (never counted against the donation).
   */
  fetchRefunds(
    orderRef: string,
    paymentId: string,
  ): Promise<{
    refundedPaise: number;
    status: 'created' | 'processed' | 'failed' | null;
    otherPaymentRefunds: boolean;
  }>;
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
}

export class PaymentProviderError extends Error {
  constructor(readonly reason: 'network' | 'rejected' | 'unexpected_response') {
    super(`Payment provider error: ${reason}`);
    this.name = 'PaymentProviderError';
  }
}
