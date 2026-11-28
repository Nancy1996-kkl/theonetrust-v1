/**
 * Gateway-neutral payment data (Phase 1b of docs/decisions/2026-11-20-cashfree-migration-plan.md).
 * Each gateway adapter translates its own words into these; reconcile only ever sees these, so
 * every gateway's payments follow exactly the same PAID rules.
 *
 * The words are lowercase and match the retired Razorpay adapter's (except `created` →
 * `pending`), so attempts stored before the switch stay readable without a data migration.
 */
export const PAYMENT_STATES = [
  'pending',
  'failed',
  'cancelled',
  'authorized',
  'captured',
  'refunded',
  'unknown',
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/** One payment on one of our orders, as the gateway reported it (fetched with our secret). */
export interface NormalisedPayment {
  paymentId: string;
  /** The order (or QR / monthly-charge reference) the gateway says it belongs to. */
  orderId: string | null;
  state: PaymentState;
  /** The gateway's own word for the state, kept for the owner's audit trail (never decides). */
  providerRawStatus: string;
  /** Integer paise. */
  amountPaise: number;
  currency: string;
  /** upi | card | netbanking | wallet | … (no card or UPI details). */
  method: string | null;
  refundedPaise: number;
}

/** Everything the gateway knows about one of our orders: every payment tried on it. */
export interface ProviderOrderState {
  orderRef: string;
  payments: NormalisedPayment[];
}

/** States that never settle an order, so a payment in them never claims the attempt (F-1). */
export const NON_CLAIMING_STATES: ReadonlySet<string> = new Set([
  'pending',
  'failed',
  'cancelled',
  // Razorpay's word for "pending", as stored on attempts before Phase 1b.
  'created',
]);

/** Forward order of a payment's life; a lower state for the same payment is a stale event. */
const RANK: Record<string, number> = {
  pending: 0,
  created: 0,
  failed: 1,
  cancelled: 1,
  authorized: 2,
  captured: 3,
  refunded: 4,
};

export const isRanked = (state: string): boolean => state in RANK;
export const rank = (state: string | null): number => RANK[state ?? ''] ?? -1;

/**
 * The payments of an order that decide it: every captured one (so a second capture surfaces as
 * a duplicate for the owner), else the authorized one, else the first reported (e.g. a failure).
 */
export function decisivePayments(state: ProviderOrderState): NormalisedPayment[] {
  const captured = state.payments.filter((p) => p.state === 'captured');
  if (captured.length > 0) return captured;
  const fallback = state.payments.find((p) => p.state === 'authorized') ?? state.payments[0];
  return fallback ? [fallback] : [];
}
