/**
 * Payment gateways (Phase 1 of docs/decisions/2026-11-20-cashfree-migration-plan.md). Domain code
 * and the browser talk about gateways only through these names and descriptors, so a gateway can
 * be swapped without touching the donation flow. No secrets here: only what the browser may see.
 */
/**
 * The gateway that takes online payments. Records made before the switch may still name
 * RAZORPAY (kept in the database for history); no new payment can be made with it.
 */
export const ONLINE_PAYMENT_PROVIDERS = ['CASHFREE'] as const;
export type OnlinePaymentProvider = (typeof ONLINE_PAYMENT_PROVIDERS)[number];

/**
 * Cashfree's JS SDK opens with a one-time payment session ID (never a secret) and the mode the
 * SDK must load in. Returned by the API when PAYMENT_PROVIDER=cashfree.
 */
export interface CashfreeCheckout {
  provider: 'CASHFREE';
  paymentSessionId: string;
  mode: 'sandbox' | 'production';
  /** Our order reference (the donation's public reference) — the server re-checks by this. */
  orderId: string;
}

/** What the browser needs to open the chosen gateway's payment window. */
export type CheckoutDescriptor = CashfreeCheckout;

/**
 * A donation's public reference (TOT-D- + 12 Crockford base32 characters). Not personal data; used
 * to recognise Cashfree's return link `?cf_order=<reference>` before anything is asked of the API.
 */
export const DONATION_REFERENCE = /^TOT-D-[0-9A-HJKMNP-TV-Z]{12}$/;

/** Narrowing helper for the browser: true only for a well-formed Cashfree descriptor. */
export function isCashfreeCheckout(value: unknown): value is CashfreeCheckout {
  const v = value as Partial<CashfreeCheckout> | null;
  return (
    !!v &&
    v.provider === 'CASHFREE' &&
    typeof v.paymentSessionId === 'string' &&
    v.paymentSessionId.length > 0 &&
    (v.mode === 'sandbox' || v.mode === 'production') &&
    typeof v.orderId === 'string' &&
    v.orderId.length > 0
  );
}
