import type { TAX_CERTIFICATE_STATUSES } from './statuses.ts';

/** Tax profile (#34). Off by default; only the CA-confirmed values switch it on. */
export interface TaxSettings {
  taxBenefitEnabled: boolean;
  /** RNPO registration (Income-tax Act 2025, s.332) reference. */
  rnpoReference: string | null;
  /** Section 354 approval number and its validity (IST date). */
  section354Approval: string | null;
  approvalValidUntil: string | null;
  /** Computed: switched on AND complete AND valid today. */
  offeredNow: boolean;
}

export interface TaxSettingsUpdate {
  taxBenefitEnabled?: boolean;
  rnpoReference?: string | null;
  section354Approval?: string | null;
  approvalValidUntil?: string | null;
  /** Why (kept in the audit log). */
  reason: string;
}

export type TaxCertificateStatusDto = (typeof TAX_CERTIFICATE_STATUSES)[number];

/** One financial year's filing picture (#35). */
export interface TaxYearSummary {
  financialYear: string;
  /** Tax opt-in donations verified PAID in the year (net of refunds). */
  donations: number;
  donors: number;
  totalPaise: number;
  byStatus: Record<TaxCertificateStatusDto, number>;
  /** Form 113 due date (31 May after the year) and days left (IST). */
  deadline: string;
  daysLeft: number;
  /** Within 30 days of the deadline (or past it) with donations still not filed. */
  reminder: boolean;
  /** The CSV layout follows our draft of the e-filing spec until the CA confirms it. */
  formatConfirmed: false;
}

export interface TaxTrackingItem {
  id: string;
  donationId: string;
  reference: string;
  paidAt: string | null;
  netPaise: number;
  donorName: string;
  panMasked: string | null;
  status: TaxCertificateStatusDto;
  form113Reference: string | null;
  form114Reference: string | null;
  form114IssuedOn: string | null;
}

export interface TaxStatusUpdate {
  status: TaxCertificateStatusDto;
  form113Reference?: string;
  form114Reference?: string;
  /** YYYY-MM-DD */
  form114IssuedOn?: string;
  reason: string;
}
