import { createContext, useContext } from 'react';
import type { AdminSessionResponse, HelpRequestStatus } from '@theonetrust/contracts';
import type { UiLang } from '../components/ui/ui-strings.ts';
import type { AdminApi, AdminApiError } from './api.ts';
import { ADMIN_STRINGS, type AdminStrings } from './strings.ts';

export interface AdminContextValue {
  api: AdminApi;
  lang: UiLang;
  t: AdminStrings;
  /** null while the first session check is running. */
  session: AdminSessionResponse | null;
  setSession: (session: AdminSessionResponse) => void;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside <AdminLayout>');
  return value;
}

/** Maps an API error code to owner-facing text. */
export function errorText(t: AdminStrings, error: AdminApiError): string {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return t.errorInvalidCredentials;
    case 'INVALID_CODE':
      return t.errorInvalidCode;
    case 'RATE_LIMITED':
      return t.errorRateLimited;
    case 'UNAUTHORIZED':
    case 'CONFLICT':
    case 'MFA_REQUIRED':
      return t.errorExpired;
    case 'SERVICE_UNAVAILABLE':
      return t.errorUnavailable;
    case 'NETWORK_ERROR':
      return t.errorNetwork;
    default:
      return t.errorGeneric;
  }
}

export function stringsFor(lang: UiLang): AdminStrings {
  return ADMIN_STRINGS[lang];
}

/** Groups a base32 key in fours so it is easy to read and type. */
export function groupKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, '$1 ');
}

export function statusLabel(t: AdminStrings, status: HelpRequestStatus): string {
  return t[`status${status}`];
}
