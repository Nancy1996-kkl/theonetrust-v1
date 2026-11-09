import { createSign } from 'node:crypto';

/**
 * Google Sheet of paid donations (client, Nov 2026). The outbox worker appends one row per paid
 * donation with a Google service account (the sheet is shared with its email as Editor). Values
 * are written RAW, so a name like "=HYPERLINK(...)" stays text and is never run as a formula.
 * The private key never leaves this module and is never logged.
 */
export type SheetCell = string | number;

export interface SheetProvider {
  appendRow(row: SheetCell[]): Promise<void>;
}

/** `permanent`: retrying will not help (bad key, sheet not shared, tab missing). */
export class SheetSendError extends Error {
  constructor(
    readonly code: string,
    readonly permanent: boolean,
  ) {
    super(`Sheet append failed: ${code}`);
    this.name = 'SheetSendError';
  }
}

export interface GoogleSheetConfig {
  serviceAccountEmail: string;
  privateKey: string;
  spreadsheetId: string;
  tab: string;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** A signed service-account assertion (RFC 7523), valid for one hour. */
export function serviceAccountAssertion(email: string, privateKey: string, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(privateKey))}`;
}

function failure(status: number): SheetSendError {
  if (status === 429 || status >= 500) return new SheetSendError(`http_${status}`, false);
  return new SheetSendError(`http_${status}`, true);
}

export function googleSheetProvider(config: GoogleSheetConfig): SheetProvider {
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = config.now ?? (() => new Date());
  const timeout = () => AbortSignal.timeout(config.timeoutMs ?? 10_000);
  let cached: { token: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    const at = now();
    if (cached && cached.until > at.getTime() + 60_000) return cached.token;
    let assertion: string;
    try {
      assertion = serviceAccountAssertion(config.serviceAccountEmail, config.privateKey, at);
    } catch {
      throw new SheetSendError('bad_key', true);
    }
    let res: Response;
    try {
      res = await doFetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        signal: timeout(),
      });
    } catch {
      throw new SheetSendError('network', false);
    }
    if (!res.ok) throw failure(res.status);
    const body = (await res.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (typeof body?.access_token !== 'string') {
      throw new SheetSendError('unexpected_response', false);
    }
    const seconds = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    cached = { token: body.access_token, until: at.getTime() + seconds * 1000 };
    return body.access_token;
  }

  return {
    async appendRow(row) {
      const token = await accessToken();
      const range = encodeURIComponent(`'${config.tab}'!A1`);
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}` +
        `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ values: [row] }),
          signal: timeout(),
        });
      } catch {
        throw new SheetSendError('network', false);
      }
      if (res.status === 401) cached = null; // token expired early: next try gets a new one
      if (!res.ok)
        throw res.status === 401 ? new SheetSendError('http_401', false) : failure(res.status);
    },
  };
}

/** From env: all three values set → a provider; otherwise none (rows wait in the queue). */
export function selectSheetProvider(env: {
  GOOGLE_SHEETS_SPREADSHEET_ID?: string | undefined;
  GOOGLE_SHEETS_TAB: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string | undefined;
  GOOGLE_SERVICE_ACCOUNT_KEY?: string | undefined;
}): SheetProvider | undefined {
  if (
    !env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    !env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !env.GOOGLE_SERVICE_ACCOUNT_KEY
  ) {
    return undefined;
  }
  return googleSheetProvider({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    tab: env.GOOGLE_SHEETS_TAB,
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_SERVICE_ACCOUNT_KEY,
  });
}

/** Column headings for row 1 of the tab (the owner adds them once; see the setup guide). */
export const SHEET_HEADINGS = [
  'Paid on (IST)',
  'Donation reference',
  'Donor name',
  'Email',
  'Mobile',
  'Amount (₹)',
  'Type',
  'Purpose',
  'Payment method',
  'Payment reference',
  'Acknowledgement no.',
] as const;
