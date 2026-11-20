/**
 * Payment gateways (Phase 1 of docs/decisions/2026-11-20-cashfree-migration-plan.md). Domain code
 * and the browser talk about gateways only through these names and descriptors, so a gateway can
 * be swapped without touching the donation flow. No secrets here: only what the browser may see.
 */
export const ONLINE_PAYMENT_PROVIDERS = ['RAZORPAY', 'CASHFREE'] as const;
export type OnlinePaymentProvider = (typeof ONLINE_PAYMENT_PROVIDERS)[number];

/** Razorpay Checkout opens with the public key ID and our order ID. */
export interface RazorpayCheckout {
  provider: 'RAZORPAY';
  /** Public key ID only. */
  keyId: string;
  orderId: string;
}

/**
 * Cashfree's JS SDK opens with a one-time payment session ID (never a secret) and the mode the
 * SDK must load in. Returned by the API when PAYMENT_PROVIDER=cashfree (Phases 4–5).
 */
export interface CashfreeCheckout {
  provider: 'CASHFREE';
  paymentSessionId: string;
  mode: 'sandbox' | 'production';
  /** Our order reference (the donation's public reference) — the server re-checks by this. */
  orderId: string;
}

/** What the browser needs to open the chosen gateway's payment window. */
export type CheckoutDescriptor = RazorpayCheckout | CashfreeCheckout;

/** Narrowing helper for the browser: true only for a well-formed Razorpay descriptor. */
export function isRazorpayCheckout(value: unknown): value is RazorpayCheckout {
  const v = value as Partial<RazorpayCheckout> | null;
  return (
    !!v &&
    v.provider === 'RAZORPAY' &&
    typeof v.keyId === 'string' &&
    v.keyId.length > 0 &&
    typeof v.orderId === 'string' &&
    v.orderId.length > 0
  );
}

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
