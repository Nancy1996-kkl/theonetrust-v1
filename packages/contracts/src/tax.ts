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
