/**
 * Donation acknowledgement (#29). A private share link `/receipt/:token` shows these fields and
 * nothing else: no PAN, phone, email or address ever. "Acknowledgement" only — never a tax form.
 */
export const RECEIPT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const RECEIPT_METHODS = [
  'upi',
  'card',
  'netbanking',
  'wallet',
  'bank_transfer',
  'other',
] as const;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];

/** VALID, or kept as evidence after a full refund / after a corrected receipt replaced it. */
export type ReceiptState = 'VALID' | 'REFUNDED' | 'REPLACED';

export interface ReceiptView {
  receiptNumber: string;
  donationReference: string;
  /** ISO time the acknowledgement was issued. */
  issuedAt: string;
  amountPaise: number;
  currency: 'INR';
  method: ReceiptMethod;
  /** Earmarked programme title, or null for the general fund. */
  purpose: { en: string; ta: string } | null;
  donorName: string;
  /** Trust particulars as confirmed in settings; null until confirmed ([CONFIRM] #1). */
  trust: { legalName: string | null; registration: string | null };
  /** Only when the trust's approval is switched on in settings and valid on the issue date. */
  approval: { reference: string; validUntil: string } | null;
  state: ReceiptState;
  /** When REPLACED: the token of the corrected acknowledgement. */
  replacementToken: string | null;
  templateVersion: string;
}

export function isReceiptToken(value: string): boolean {
  return RECEIPT_TOKEN_PATTERN.test(value);
}
