import {
  CSRF_HEADER,
  isApiErrorCode,
  type AdminSessionResponse,
  type AdminSessionUser,
  type ApiErrorCode,
  type AuditListResponse,
  type MfaEnableResponse,
  type MfaSetupResponse,
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

export function createAdminApi(baseUrl: string, fetchImpl: Fetch = (...args) => fetch(...args)) {
  let csrfToken: string | undefined;

  async function call<T>(
    method: 'GET' | 'POST' | 'PATCH',
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
    logout: async () => {
      await call<undefined>('POST', '/auth/logout');
      csrfToken = undefined;
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
