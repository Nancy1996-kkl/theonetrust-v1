import {
  CSRF_HEADER,
  type AdminDocument,
  type AdminWebhookList,
  type AdminDocumentList,
  type AdminMetric,
  type AdminProgramme,
  type AdminSection,
  type AdminTrustSettings,
  type ContentPreview,
  type DocumentUpload,
  type MetricInput,
  type ProgrammeInput,
  type SectionDraftInput,
  type TrustSettingsInput,
  isApiErrorCode,
  type AdminSessionResponse,
  type AdminSessionUser,
  type ApiErrorCode,
  type AuditListResponse,
  type BankTransfersResponse,
  type RecordBankCreditRequest,
  type RecordBankCreditResponse,
  type HelpCaseDetail,
  type HelpCaseFilters,
  type HelpCaseList,
  type HelpCaseListItem,
  type HelpCaseUpdate,
  type MfaEnableResponse,
  type MfaSetupResponse,
  type AdminOverview,
  type AdminReceiptList,
  type AdminSubscriptionDetail,
  type AdminSubscriptionList,
  type TaxSettings,
  type TaxStatusUpdate,
  type TaxTrackingItem,
  type TaxYearSummary,
  type TaxSettingsUpdate,
  type DonationDetail,
  type ExceptionQueue,
  type LedgerFilters,
  type LedgerList,
  type NotificationListResponse,
  type NotificationStatusDto,
} from '@theonetrust/contracts';
import { apiUrl } from '../lib/api-url.ts';

/**
 * Owner sign-in client. The session cookie is HttpOnly (JavaScript cannot read it); this module
 * only keeps the CSRF token the API hands out and sends it on every state-changing request.
 */
export class AdminApiError extends Error {
  readonly code: ApiErrorCode | 'NETWORK_ERROR';
  constructor(code: ApiErrorCode | 'NETWORK_ERROR') {
    super(code);
    this.name = 'AdminApiError';
    this.code = code;
  }
}

export type Fetch = typeof fetch;

export interface AuditFilters {
  action?: string;
  from?: string;
  to?: string;
}

function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, String(value));
  return params.toString();
}

export function createAdminApi(baseUrl: string, fetchImpl: Fetch = (...args) => fetch(...args)) {
  let csrfToken: string | undefined;

  async function call<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(apiUrl(baseUrl, path), {
        method,
        credentials: 'include',
        headers: {
          accept: 'application/json',
          ...(body !== undefined && { 'content-type': 'application/json' }),
          ...(method !== 'GET' && csrfToken && { [CSRF_HEADER]: csrfToken }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new AdminApiError('NETWORK_ERROR');
    }
    if (res.status === 204) return undefined as T;
    const json: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const code = (json as { error?: { code?: unknown } } | undefined)?.error?.code;
      throw new AdminApiError(isApiErrorCode(code) ? code : 'INTERNAL_ERROR');
    }
    const token = (json as { csrfToken?: unknown }).csrfToken;
    if (typeof token === 'string') csrfToken = token;
    return json as T;
  }

  return {
    session: () => call<AdminSessionResponse>('GET', '/auth/session'),
    login: (email: string, password: string) =>
      call<AdminSessionResponse>('POST', '/auth/login', { email, password }),
    mfaSetup: () => call<MfaSetupResponse>('POST', '/auth/mfa/setup'),
    mfaEnable: (code: string) => call<MfaEnableResponse>('POST', '/auth/mfa/enable', { code }),
    mfaVerify: (code: string) => call<AdminSessionResponse>('POST', '/auth/mfa/verify', { code }),
    updatePreferences: (locale: 'ta' | 'en') =>
      call<AdminSessionUser>('PATCH', '/admin/me', { locale }),
    auditLog: (filters: AuditFilters, cursor?: string) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      return call<AuditListResponse>('GET', `/admin/audit-log?${params.toString()}`);
    },
    helpCases: (filters: HelpCaseFilters, cursor?: string) =>
      call<HelpCaseList>('GET', `/admin/help-requests?${query({ ...filters, cursor })}`),
    helpCase: (id: string) =>
      call<HelpCaseDetail>('GET', `/admin/help-requests/${encodeURIComponent(id)}`),
    updateHelpCase: (id: string, patch: HelpCaseUpdate) =>
      call<HelpCaseListItem>('PATCH', `/admin/help-requests/${encodeURIComponent(id)}`, patch),
    addHelpNote: (id: string, body: string) =>
      call<{ id: string }>('POST', `/admin/help-requests/${encodeURIComponent(id)}/notes`, {
        body,
      }),
    team: () => call<{ users: Array<{ id: string; email: string }> }>('GET', '/admin/team'),
    /** Plain link: the browser downloads it with the session cookie (GET, no CSRF needed). */
    helpExportUrl: (filters: HelpCaseFilters) =>
      apiUrl(baseUrl, `/admin/help-requests/export.csv?${query({ ...filters })}`),
    bankTransfers: () => call<BankTransfersResponse>('GET', '/admin/bank-transfers'),
    recordBankCredit: (body: RecordBankCreditRequest) =>
      call<RecordBankCreditResponse>('POST', '/admin/bank-transfers/credits', body),
    confirmBankCredit: (id: string, reason: string, confirmReference: string) =>
      call<{ status: string }>(
        'POST',
        `/admin/bank-transfers/credits/${encodeURIComponent(id)}/confirm`,
        {
          reason,
          confirmReference,
        },
      ),
    rejectBankCredit: (id: string, reason: string) =>
      call<{ status: string }>(
        'POST',
        `/admin/bank-transfers/credits/${encodeURIComponent(id)}/reject`,
        { reason },
      ),
    resolveException: (id: string, reason: string) =>
      call<{ status: string }>(
        'POST',
        `/admin/payment-exceptions/${encodeURIComponent(id)}/resolve`,
        { reason },
      ),
    overview: () => call<AdminOverview>('GET', '/admin/overview'),
    donations: (filters: LedgerFilters) =>
      call<LedgerList>('GET', `/admin/donations?${query({ ...filters })}`),
    donation: (id: string) =>
      call<DonationDetail>('GET', `/admin/donations/${encodeURIComponent(id)}`),
    recheckDonation: (id: string, reason: string) =>
      call<{ id: string; status: DonationDetail['status']; outcome: string }>(
        'POST',
        `/admin/donations/${encodeURIComponent(id)}/recheck`,
        { reason },
      ),
    /** Plain link: the browser downloads it with the session cookie (GET, no CSRF needed). */
    donationsExportUrl: (filters: LedgerFilters) =>
      apiUrl(baseUrl, `/admin/donations/export.csv?${query({ ...filters, page: undefined })}`),
    exceptionQueue: () => call<ExceptionQueue>('GET', '/admin/exceptions'),
    webhooks: (filter?: { status?: string; attention?: boolean }) =>
      call<AdminWebhookList>(
        'GET',
        `/admin/webhooks?${query({ status: filter?.status, attention: filter?.attention ? '1' : undefined })}`,
      ),
    receipts: (page = 1) => call<AdminReceiptList>('GET', `/admin/receipts?page=${page}`),
    resendReceipt: (id: string, reason: string) =>
      call<{ id: string; queued: boolean }>(
        'POST',
        `/admin/receipts/${encodeURIComponent(id)}/resend`,
        { reason },
      ),
    subscriptions: (status?: string, page = 1) =>
      call<AdminSubscriptionList>('GET', `/admin/subscriptions?${query({ status, page })}`),
    subscription: (id: string) =>
      call<AdminSubscriptionDetail>('GET', `/admin/subscriptions/${encodeURIComponent(id)}`),
    taxSettings: () => call<TaxSettings>('GET', '/admin/tax-settings'),
    updateTaxSettings: (body: TaxSettingsUpdate) =>
      call<TaxSettings>('PATCH', '/admin/tax-settings', body),
    taxSummary: (fy?: string) => call<TaxYearSummary>('GET', `/admin/tax/summary?${query({ fy })}`),
    taxTracking: (fy: string, status?: string) =>
      call<{ items: TaxTrackingItem[] }>('GET', `/admin/tax/tracking?${query({ fy, status })}`),
    /** Plain link: the browser downloads it with the session cookie (GET, audited by the API). */
    form113Url: (fy: string, reason: string) =>
      apiUrl(baseUrl, `/admin/tax/form113.csv?${query({ fy, reason })}`),
    updateTaxStatus: (id: string, body: TaxStatusUpdate) =>
      call<{ id: string; status: string }>(
        'POST',
        `/admin/tax/tracking/${encodeURIComponent(id)}/status`,
        body,
      ),
    markForm113Filed: (fy: string, form113Reference: string, reason: string) =>
      call<{ updated: number }>('POST', '/admin/tax/form113-filed', {
        fy,
        form113Reference,
        reason,
      }),
    notifications: (status?: NotificationStatusDto) =>
      call<NotificationListResponse>(
        'GET',
        `/admin/notifications${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),
    retryNotification: (id: string) =>
      call<{ id: string; status: string }>(
        'POST',
        `/admin/notifications/${encodeURIComponent(id)}/retry`,
        {},
      ),
    // ── Content management (#36) ──
    programmes: () => call<{ items: AdminProgramme[] }>('GET', '/admin/programmes'),
    createProgramme: (body: ProgrammeInput) =>
      call<AdminProgramme>('POST', '/admin/programmes', body),
    updateProgramme: (id: string, body: ProgrammeInput) =>
      call<AdminProgramme>('PATCH', `/admin/programmes/${encodeURIComponent(id)}`, body),
    deleteProgramme: (id: string, reason: string) =>
      call<{ deleted: true }>('DELETE', `/admin/programmes/${encodeURIComponent(id)}`, { reason }),
    contentSections: () => call<{ items: AdminSection[] }>('GET', '/admin/content'),
    contentPreview: (locale: 'ta' | 'en') =>
      call<ContentPreview>('GET', `/admin/content/preview?locale=${locale}`),
    saveSectionDraft: (key: string, body: SectionDraftInput) =>
      call<AdminSection>('PUT', `/admin/content/${encodeURIComponent(key)}`, body),
    publishSection: (key: string, reason: string) =>
      call<AdminSection>('POST', `/admin/content/${encodeURIComponent(key)}/publish`, { reason }),
    unpublishSection: (key: string, reason: string) =>
      call<AdminSection>('POST', `/admin/content/${encodeURIComponent(key)}/unpublish`, {
        reason,
      }),
    metrics: () => call<{ items: AdminMetric[] }>('GET', '/admin/metrics'),
    createMetric: (body: MetricInput) => call<AdminMetric>('POST', '/admin/metrics', body),
    updateMetric: (id: string, body: MetricInput) =>
      call<AdminMetric>('PATCH', `/admin/metrics/${encodeURIComponent(id)}`, body),
    publishMetric: (id: string, reason: string) =>
      call<AdminMetric>('POST', `/admin/metrics/${encodeURIComponent(id)}/publish`, { reason }),
    unpublishMetric: (id: string, reason: string) =>
      call<AdminMetric>('POST', `/admin/metrics/${encodeURIComponent(id)}/unpublish`, { reason }),
    deleteMetric: (id: string, reason: string) =>
      call<{ deleted: true }>('DELETE', `/admin/metrics/${encodeURIComponent(id)}`, { reason }),
    documents: () => call<AdminDocumentList>('GET', '/admin/documents'),
    uploadDocument: (body: DocumentUpload) => call<AdminDocument>('POST', '/admin/documents', body),
    publishDocument: (id: string, reason: string) =>
      call<AdminDocument>('POST', `/admin/documents/${encodeURIComponent(id)}/publish`, {
        reason,
      }),
    unpublishDocument: (id: string, reason: string) =>
      call<AdminDocument>('POST', `/admin/documents/${encodeURIComponent(id)}/unpublish`, {
        reason,
      }),
    deleteDocument: (id: string, reason: string) =>
      call<{ deleted: true }>('DELETE', `/admin/documents/${encodeURIComponent(id)}`, { reason }),
    trustSettings: () => call<AdminTrustSettings>('GET', '/admin/settings'),
    updateTrustSettings: (body: TrustSettingsInput) =>
      call<AdminTrustSettings>('PATCH', '/admin/settings', body),
    logout: async () => {
      await call<undefined>('POST', '/auth/logout');
      csrfToken = undefined;
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
