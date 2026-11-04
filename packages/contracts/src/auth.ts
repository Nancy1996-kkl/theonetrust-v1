/**
 * Owner sign-in contract (#19). The session lives in an HttpOnly cookie the browser cannot read;
 * these DTOs only describe its state. Every state-changing request sends `x-csrf-token`.
 */
export const ADMIN_SESSION_STAGES = ['SIGNED_OUT', 'MFA_SETUP', 'MFA_VERIFY', 'ACTIVE'] as const;
export type AdminSessionStage = (typeof ADMIN_SESSION_STAGES)[number];

export const CSRF_HEADER = 'x-csrf-token';

export interface AdminSessionUser {
  email: string;
  role: 'OWNER' | 'STAFF';
  locale: 'ta' | 'en';
}

export interface AdminSessionResponse {
  stage: AdminSessionStage;
  user?: AdminSessionUser;
  /** Present whenever a session exists; send it back in the `x-csrf-token` header. */
  csrfToken?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface MfaCodeRequest {
  /** 6-digit authenticator code, or a recovery code like "ABCDE-12345". */
  code: string;
}

export interface MfaSetupResponse {
  /** Base32 secret for manual entry in the authenticator app. Shown once, during setup only. */
  secret: string;
  otpauthUri: string;
}

export interface MfaEnableResponse extends AdminSessionResponse {
  /** Shown exactly once. Each works one time if the authenticator is lost. */
  recoveryCodes: string[];
}
