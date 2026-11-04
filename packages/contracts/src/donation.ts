/**
 * Donation intent contract (#23). The browser sends the GIFT it chose; the server computes the
 * optional fee cover and the amount to charge, creates the provider order, and returns only what
 * Checkout needs. Payment success is never decided from anything the browser sends back.
 */
export const DONATION_MIN_PAISE = 100;
export const FEE_COVER_METHODS = ['upi', 'card', 'netbanking'] as const;
export type FeeCoverMethod = (typeof FEE_COVER_METHODS)[number];

export interface DonationIntentRequest {
  giftPaise: number;
  currency: 'INR';
  /** Programme slug, or null / "general" for the general fund. */
  programme: string | null;
  donorName: string;
  /** At least one of email or phone (private; never shown publicly). */
  donorEmail?: string | null;
  donorPhone?: string | null;
  /** Public anonymity — separate from the private identity record. */
  hideNamePublicly: boolean;
  wantsReceipt: boolean;
  coverFee: boolean;
  /** How the donor expects to pay, for the fee estimate only. */
  feeMethod?: FeeCoverMethod;
  consent: true;
  locale: 'ta' | 'en';
  /** `bank_transfer`: no Razorpay order; the owner confirms the credit (#25). Default checkout. */
  channel?: 'checkout' | 'bank_transfer';
}

/** The trust's account for NEFT/RTGS/IMPS, shown only when confirmed in settings. */
export interface TrustBankAccount {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
}

export interface BankTransferIntentResponse {
  publicReference: string;
  giftPaise: number;
  feePaise: 0;
  amountPaise: number;
  currency: 'INR';
  bankTransfer: TrustBankAccount;
}

/** Optional bank reference the donor saw. Never confirms the payment by itself. */
export interface BankTransferClaimRequest {
  utr: string | null;
}

export interface DonationIntentResponse {
  publicReference: string;
  giftPaise: number;
  feePaise: number;
  /** What Checkout will charge: giftPaise + feePaise. */
  amountPaise: number;
  currency: 'INR';
  checkout: {
    provider: 'RAZORPAY';
    /** Public key ID only. */
    keyId: string;
    orderId: string;
  };
}

export interface DonationEstimateResponse {
  minPaise: number;
  maxPaise: number;
  /** Gifts from this amount may ask for an acknowledgement (settings, default ₹500). */
  receiptMinPaise: number;
  feeCoverOffered: boolean;
  /** True when the trust's bank details are confirmed and bank transfer is offered. */
  bankTransferOffered: boolean;
  /** Monthly giving (#32) is switched on: Razorpay Subscriptions enabled [CONFIRM]. */
  monthlyOffered?: boolean;
  /** Present when a gift was given and fee cover is offered for the method. */
  feePaise?: number;
  amountPaise?: number;
}

/** What Razorpay Checkout hands the browser on completion. Only a hint — the server verifies. */
export interface PaymentVerifyRequest {
  publicReference: string;
  orderId: string;
  paymentId: string;
  signature: string;
}

/** Donor-safe status (#26): no personal data. PAID only after server-side verification. */
export interface DonationStatusResponse {
  publicReference: string;
  status: 'PAID' | 'PENDING' | 'FAILED';
  amountPaise: number;
  /** Share token of the donation acknowledgement, once one exists (#29). PAID only. */
  receiptToken?: string;
}
