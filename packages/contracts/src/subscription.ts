/**
 * Monthly giving (#32): Razorpay Subscriptions with UPI AutoPay, eMandate or card. The donor
 * sees amount, frequency, start date and how to cancel before agreeing; a private manage link
 * lets them cancel without logging in.
 */
/** UPI AutoPay debits above this need extra authentication; Razorpay's default mandate cap. */
export const UPI_AUTOPAY_MAX_PAISE = 1_500_000;
export const MONTHLY_CONSENT_VERSION = 'monthly-v1';
export const SUBSCRIPTION_REFERENCE_PATTERN = /^TOT-M-[0-9A-HJKMNP-TV-Z]{12}$/;
export const MANAGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type MethodRoute = 'upi_autopay' | 'emandate_card';
export type MonthlyMethod = 'upi' | 'emandate' | 'card';

export function methodRouteFor(amountPaise: number): MethodRoute {
  return amountPaise <= UPI_AUTOPAY_MAX_PAISE ? 'upi_autopay' : 'emandate_card';
}

export function methodsFor(route: MethodRoute): MonthlyMethod[] {
  return route === 'upi_autopay' ? ['upi', 'emandate', 'card'] : ['emandate', 'card'];
}

export interface SubscriptionRequest {
  amountPaise: number;
  currency: 'INR';
  programme: string | null;
  donorName: string;
  donorEmail?: string | null;
  donorPhone?: string | null;
  /** Keep my details to record my giving (same as one-time). */
  consent: true;
  /** I agree to a monthly debit of this amount until I cancel. */
  mandateConsent: true;
  consentVersion: typeof MONTHLY_CONSENT_VERSION;
  locale: 'ta' | 'en';
}

export interface SubscriptionResponse {
  publicReference: string;
  amountPaise: number;
  currency: 'INR';
  methodRoute: MethodRoute;
  allowedMethods: MonthlyMethod[];
  /** Above ₹15,000: some UPI apps (PhonePe, BHIM) do not support the mandate. */
  warning: 'psp_limit' | null;
  /** First charge date (IST, YYYY-MM-DD), or null = on authorisation (today). */
  startDate: string | null;
  checkout: { provider: 'RAZORPAY'; keyId: string; subscriptionId: string };
}

export interface SubscriptionVerifyRequest {
  publicReference: string;
  subscriptionId: string;
  paymentId: string;
  signature: string;
}

/** Donor-safe states. */
export type DonorSubscriptionStatus = 'ACTIVE' | 'PENDING' | 'PAUSED' | 'CANCELLED' | 'ENDED';

export interface SubscriptionVerifyResponse {
  publicReference: string;
  status: DonorSubscriptionStatus;
  /** Private manage link token, once the mandate is authorised. */
  manageToken?: string;
}

export interface ManageView {
  publicReference: string;
  amountPaise: number;
  status: DonorSubscriptionStatus;
  methodRoute: MethodRoute;
  startDate: string | null;
  programme: { en: string; ta: string } | null;
  createdAt: string;
}

/** Last safe charge day: the 29th–31st do not exist in every month. */
export const MONTHLY_LAST_SAFE_DAY = 28;

/**
 * First charge date shown on the consent screen and used by the API. Days 1–28 (IST): charged
 * on authorisation, then the same day each month (returns null = today). From the 29th: the 1st
 * of next month (IST date string).
 */
export function monthlyStartDate(now: Date): string | null {
  const ist = new Date(now.getTime() + 330 * 60_000);
  if (ist.getUTCDate() <= MONTHLY_LAST_SAFE_DAY) return null;
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
