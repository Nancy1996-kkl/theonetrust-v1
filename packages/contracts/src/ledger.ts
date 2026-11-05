import type { ReceiptMethod, ReceiptState } from './receipt.ts';
import type { DonationStatus } from './statuses.ts';

/**
 * Owner dashboard: overview, donations ledger, exceptions queue and receipts (#31). Read-only
 * views — amounts and statuses are never edited here. Contact details are always masked.
 */
export const LEDGER_SORTS = ['created_desc', 'created_asc', 'amount_desc', 'amount_asc'] as const;
export type LedgerSort = (typeof LEDGER_SORTS)[number];
export const LEDGER_RECEIPT_FILTERS = ['none', 'valid', 'refunded', 'replaced'] as const;
export type LedgerReceiptFilter = (typeof LEDGER_RECEIPT_FILTERS)[number];
export const LEDGER_PAGE_SIZE = 25;

export interface LedgerFilters {
  /** Exact receipt number, donation reference, Razorpay order/payment ID or bank reference. */
  q?: string;
  /** IST calendar dates, YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  programme?: string;
  status?: DonationStatus;
  method?: ReceiptMethod;
  receipt?: LedgerReceiptFilter;
  sort?: LedgerSort;
  page?: number;
}

export interface LedgerItem {
  id: string;
  reference: string;
  createdAt: string;
  paidAt: string | null;
  amountPaise: number;
  refundedPaise: number;
  status: DonationStatus;
  channel: 'CHECKOUT' | 'BANK_TRANSFER';
  method: ReceiptMethod | null;
  programme: { en: string; ta: string } | null;
  donorName: string;
  receipt: { number: string; state: ReceiptState } | null;
}

export interface LedgerList {
  items: LedgerItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface OverviewTotals {
  grossPaise: number;
  refundedPaise: number;
  netPaise: number;
  count: number;
}

export interface AdminOverview {
  today: OverviewTotals;
  month: OverviewTotals;
  lifetime: OverviewTotals;
  pending: { count: number; amountPaise: number };
  failed: { count: number };
  refunds: { count: number; amountPaise: number };
  openExceptions: number;
  stalePending: number;
  manualReview: number;
}

export interface DonationDetail extends LedgerItem {
  giftPaise: number;
  feePaise: number;
  locale: 'ta' | 'en';
  donorEmailMasked: string | null;
  donorPhoneMasked: string | null;
  wantsReceipt: boolean;
  hideNamePublicly: boolean;
  /** Tax opt-in (#34): masked PAN only; the address is never sent to the dashboard. */
  taxOptIn: { panMasked: string | null; hasAddress: boolean } | null;
  attempts: Array<{
    providerOrderId: string;
    providerPaymentId: string | null;
    providerStatus: string | null;
    amountPaise: number;
    capturedPaise: number;
    refundedPaise: number;
    method: string | null;
    signatureVerified: boolean;
    createdAt: string;
  }>;
  statusHistory: Array<{ from: DonationStatus; to: DonationStatus; source: string; at: string }>;
  webhooks: Array<{
    eventType: string;
    processingStatus: string;
    processingError: string | null;
    attempts: number;
    receivedAt: string;
  }>;
  bankTransfers: Array<{
    bankReference: string;
    amountPaise: number;
    receivedOn: string;
    status: string;
  }>;
  receipts: AdminReceiptItem[];
  notifications: Array<{
    id: string;
    template: string;
    status: string;
    lastError: string | null;
    attempts: number;
    sentAt: string | null;
  }>;
  exceptions: Array<{
    id: string;
    kind: string;
    status: 'OPEN' | 'RESOLVED';
    createdAt: string;
    resolution: string | null;
  }>;
}

export const EXCEPTION_QUEUE_KINDS = [
  'STALE_PENDING',
  'MANUAL_REVIEW',
  'REFUND_PENDING',
  'PAYMENT_MISMATCH',
  'DUPLICATE_PAYMENT',
  'UNMATCHED_CREDIT',
  'AMOUNT_MISMATCH',
  'ALREADY_PAID',
  'SUBSCRIPTION_CHARGE_FAILED',
  'SUBSCRIPTION_HALTED',
] as const;
export type ExceptionQueueKind = (typeof EXCEPTION_QUEUE_KINDS)[number];

export interface ExceptionQueueItem {
  /** Stable key for the row. */
  key: string;
  kind: ExceptionQueueKind;
  /** The payment_exceptions row, when there is one (resolve needs it). */
  exceptionId: string | null;
  donationId: string | null;
  reference: string | null;
  amountPaise: number | null;
  providerPaymentId: string | null;
  createdAt: string;
  /** What the owner can do here; every action needs a reason and is audited. */
  actions: Array<'recheck' | 'resolve'>;
}

export interface ExceptionQueue {
  items: ExceptionQueueItem[];
  staleAfterMinutes: number;
}

export interface AdminReceiptItem {
  id: string;
  receiptNumber: string;
  donationId: string;
  reference: string;
  amountPaise: number;
  issuedAt: string;
  state: ReceiptState;
  /** Share token, so the owner can copy the link or download the PDF. Null without the key. */
  token: string | null;
  /** The donor gave an email and asked for an acknowledgement: "resend" is possible. */
  canResend: boolean;
  lastEmail: { status: string; sentAt: string | null } | null;
}

export interface AdminReceiptList {
  items: AdminReceiptItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** Body for every owner action on this page: a reason (kept in the audit log). */
export interface ReasonRequest {
  reason: string;
}

/** Owner's monthly-giving list (#33). */
export interface AdminSubscriptionItem {
  id: string;
  reference: string;
  amountPaise: number;
  status: 'CREATED' | 'AUTHENTICATED' | 'ACTIVE' | 'PAUSED' | 'HALTED' | 'CANCELLED' | 'COMPLETED';
  methodRoute: 'upi_autopay' | 'emandate_card';
  donorName: string;
  createdAt: string;
  charges: number;
  paidCharges: number;
  lastChargeAt: string | null;
  openExceptions: number;
}

export interface AdminSubscriptionList {
  items: AdminSubscriptionItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminSubscriptionDetail extends AdminSubscriptionItem {
  history: Array<{ from: string; to: string; source: string; at: string }>;
  chargeList: LedgerItem[];
  exceptions: Array<{ id: string; kind: string; status: 'OPEN' | 'RESOLVED'; createdAt: string }>;
}

/** Webhook delivery view (#39): what Razorpay sent and how it was handled. No payloads. */
export type WebhookStatusDto = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';

export interface AdminWebhookItem {
  id: string;
  eventType: string;
  status: WebhookStatusDto;
  /** Short code only, e.g. "processing_failed" or "unknown_payment_to_review". */
  note: string | null;
  attempts: number;
  receivedAt: string;
  processedAt: string | null;
  /** Still RECEIVED or FAILED after the stale window: Razorpay retries, the owner should look. */
  needsAttention: boolean;
  donation: { id: string; reference: string } | null;
}

export interface AdminWebhookList {
  items: AdminWebhookItem[];
  counts: Record<WebhookStatusDto, number>;
  staleAfterMinutes: number;
}
