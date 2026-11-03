/** Versioned API prefix shared by the web client and the API server. */
export const API_V1_PREFIX = '/api/v1';

/** Supported public languages. Tamil and English must stay equivalent. */
export const LOCALES = ['ta', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Stable machine-readable error codes. Clients branch on these, never on the message text.
 * Messages are generic and safe to show; details live only in private logs.
 */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'MFA_REQUIRED',
  'INVALID_CODE',
  'FORBIDDEN',
  'CSRF_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

/** One invalid field: where it is and what kind of problem. The submitted value is never echoed. */
export interface ApiFieldIssue {
  path: string;
  issue: string;
}

/** Stable machine-readable error envelope returned by every API error. */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    correlationId: string;
    /** Only for VALIDATION_ERROR. */
    fields?: ApiFieldIssue[];
  };
}

export interface HealthResponse {
  status: 'ok';
  service: 'theonetrust-api';
  version: string;
  time: string;
}
