import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../config/env.ts';
import type { SheetSendError } from './sheet.ts';
import { googleSheetProvider, selectSheetProvider, serviceAccountAssertion } from './sheet.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const SA = 'donations@theonetrust-test.iam.gserviceaccount.com';
const SHEET_ID = 'A'.repeat(44);
const NOW = new Date('2026-11-09T06:00:00Z');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeGoogle(appendStatus = 200) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
    String(url).startsWith('https://oauth2.googleapis.com/token')
      ? json(200, { access_token: 'ya29.test', expires_in: 3600 })
      : json(appendStatus, {}),
  );
}

const provider = (fetchImpl: typeof fetch, tab = 'Donations') =>
  googleSheetProvider({
    serviceAccountEmail: SA,
    privateKey: PEM,
    spreadsheetId: SHEET_ID,
    tab,
    fetch: fetchImpl,
    now: () => NOW,
  });

describe('Google Sheet provider', () => {
  it('signs a one-hour RS256 assertion for the spreadsheets scope only', () => {
    const jwt = serviceAccountAssertion(SA, PEM, NOW);
    const [h = '', c = '', sig = ''] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toEqual({
      iss: SA,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: NOW.getTime() / 1000,
      exp: NOW.getTime() / 1000 + 3600,
    });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${h}.${c}`);
    expect(verifier.verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('appends one RAW row (never run as a formula) and reuses the token', async () => {
    const fetchImpl = fakeGoogle();
    const sheet = provider(fetchImpl as never, "Don's sheet");
    await sheet.appendRow(['2026-11-09 11:30', 'TOT-D-ABC', '=HYPERLINK("x")', 1000]);
    await sheet.appendRow(['b']);
    const calls = fetchImpl.mock.calls.map(([u]) => String(u));
    expect(calls.filter((u) => u.includes('oauth2'))).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(String(url)).toBe(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'Don's sheet'!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    );
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer ya29.test');
    expect(JSON.parse(String(init?.body))).toEqual({
      values: [['2026-11-09 11:30', 'TOT-D-ABC', '=HYPERLINK("x")', 1000]],
    });
    const tokenBody = new URLSearchParams(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(tokenBody.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
  });

  it('classifies failures: 403/404 permanent, 429/5xx and network retryable, 401 gets a new token', async () => {
    const err = async (fetchImpl: unknown) =>
      provider(fetchImpl as typeof fetch)
        .appendRow(['x'])
        .catch((e: unknown) => e as SheetSendError);
    expect(await err(fakeGoogle(403))).toMatchObject({ code: 'http_403', permanent: true });
    expect(await err(fakeGoogle(404))).toMatchObject({ code: 'http_404', permanent: true });
    expect(await err(fakeGoogle(429))).toMatchObject({ code: 'http_429', permanent: false });
    expect(await err(fakeGoogle(503))).toMatchObject({ code: 'http_503', permanent: false });
    expect(await err(vi.fn(async () => Promise.reject(new Error('down'))))).toMatchObject({
      code: 'network',
      permanent: false,
    });
    expect(await err(vi.fn(async () => json(400, { error: 'invalid_grant' })))).toMatchObject({
      code: 'http_400',
      permanent: true,
    });
    expect(await err(vi.fn(async () => json(200, { nope: 1 })))).toMatchObject({
      code: 'unexpected_response',
    });

    // 401 on append: retryable, and the next try fetches a fresh token.
    let appendCalls = 0;
    const flaky = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('oauth2')) return json(200, { access_token: 't', expires_in: 3600 });
      appendCalls++;
      return json(appendCalls === 1 ? 401 : 200, {});
    });
    const sheet = provider(flaky as never);
    await expect(sheet.appendRow(['x'])).rejects.toMatchObject({
      code: 'http_401',
      permanent: false,
    });
    await sheet.appendRow(['x']);
    expect(flaky.mock.calls.filter(([u]) => String(u).includes('oauth2'))).toHaveLength(2);
  });

  it('a broken key fails permanently without calling Google', async () => {
    const fetchImpl = fakeGoogle();
    const sheet = googleSheetProvider({
      serviceAccountEmail: SA,
      privateKey: '-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----',
      spreadsheetId: SHEET_ID,
      tab: 'Donations',
      fetch: fetchImpl as never,
    });
    await expect(sheet.appendRow(['x'])).rejects.toMatchObject({
      code: 'bad_key',
      permanent: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('Google Sheet settings', () => {
  const base = {
    GOOGLE_SHEETS_SPREADSHEET_ID: SHEET_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: SA,
    GOOGLE_SERVICE_ACCOUNT_KEY: PEM.replace(/\n/g, '\\n'),
  };

  it('all three or none; the key accepts "\\n" escapes; default tab "Donations"', () => {
    expect(selectSheetProvider(loadEnv({}))).toBeUndefined();
    const env = loadEnv(base);
    expect(env.GOOGLE_SERVICE_ACCOUNT_KEY).toBe(PEM);
    expect(env.GOOGLE_SHEETS_TAB).toBe('Donations');
    expect(selectSheetProvider(env)).toBeDefined();
    expect(() => loadEnv({ GOOGLE_SHEETS_SPREADSHEET_ID: SHEET_ID })).toThrow(
      /GOOGLE_SERVICE_ACCOUNT_EMAIL/,
    );
    expect(() => loadEnv({ ...base, GOOGLE_SERVICE_ACCOUNT_KEY: 'not a key' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('not a key') }),
    );
    expect(() => loadEnv({ ...base, GOOGLE_SERVICE_ACCOUNT_EMAIL: 'me@gmail.com' })).toThrow();
    expect(() => loadEnv({ ...base, GOOGLE_SHEETS_TAB: "x'!y" })).toThrow();
  });

  it('reply-to for donor emails is an optional plain address', () => {
    expect(loadEnv({}).EMAIL_REPLY_TO).toBeUndefined();
    expect(loadEnv({ EMAIL_REPLY_TO: 'info.trust@example.org' }).EMAIL_REPLY_TO).toBe(
      'info.trust@example.org',
    );
    expect(() => loadEnv({ EMAIL_REPLY_TO: 'Name <a@b.co>' })).toThrow();
  });
});
