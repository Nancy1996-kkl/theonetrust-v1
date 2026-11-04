import type { ApiError, ApiErrorCode, ApiFieldIssue } from '@theonetrust/contracts';

/** Generic, safe public messages. Never put request data, IDs or internals in these. */
export const PUBLIC_MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: 'The request was invalid.',
  VALIDATION_ERROR: 'Some fields are missing or invalid.',
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have access to this.',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'This request conflicts with the current state.',
  PAYLOAD_TOO_LARGE: 'The request is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'This content type is not supported.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
};

const STATUS_FOR: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** Throw from a route to return a stable error code. The message is always the public one. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly fields?: ApiFieldIssue[];

  constructor(code: ApiErrorCode, fields?: ApiFieldIssue[]) {
    super(PUBLIC_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_FOR[code];
    if (fields) this.fields = fields;
  }
}

export function errorBody(
  code: ApiErrorCode,
  correlationId: string,
  fields?: ApiFieldIssue[],
): ApiError {
  return {
    error: { code, message: PUBLIC_MESSAGES[code], correlationId, ...(fields && { fields }) },
  };
}

/** Maps any thrown value to a public code. Unknown 5xx and non-HTTP errors become INTERNAL_ERROR. */
export function codeFor(error: unknown): { status: number; code: ApiErrorCode } {
  if (error instanceof AppError) return { status: error.statusCode, code: error.code };
  const status = (error as { statusCode?: unknown }).statusCode;
  if (typeof status !== 'number' || status < 400 || status >= 500) {
    return { status: 500, code: 'INTERNAL_ERROR' };
  }
  if ((error as { validation?: unknown }).validation) return { status, code: 'VALIDATION_ERROR' };
  const byStatus: Partial<Record<number, ApiErrorCode>> = {
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    429: 'RATE_LIMITED',
  };
  return { status, code: byStatus[status] ?? 'BAD_REQUEST' };
}
