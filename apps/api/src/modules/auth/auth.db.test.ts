import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { sha256Hex } from '../../security/crypto.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from './totp.ts';

const db = useTestDb();
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'river mango lamp seventeen';

let clock = new Date('2026-11-03T10:00:00Z');
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

let app: FastifyInstance;
let email: string;

function build(extra: Record<string, string> = {}) {
  return buildApp(
    loadEnv({
      NODE_ENV: 'test',
      AUTH_SECRET_KEY: Buffer.alloc(32, 9).toString('base64'),
      CORS_ORIGINS: ORIGIN,
      ...extra,
    }),
    { db, now: () => clock },
  );
}

beforeEach(async () => {
  await app?.close();
  clock = new Date(clock.getTime() + 3_600_000); // fresh TOTP steps per test
  app = build();
  email = `${unique('owner')}@example.org`;
  await setOwnerPassword(db, email, PASSWORD);
});

afterAll(async () => {
  await app.close();
});

/** Minimal cookie-jar browser over app.inject. */
function browser() {
  let cookie: string | undefined;
  let csrf: string | undefined;
  async function send(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const res: LightMyRequestResponse = await app.inject({
      method,
      url,
      headers: {
        origin: ORIGIN,
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(csrf && { 'x-csrf-token': csrf }),
        ...headers,
      },
      ...(cookie && { cookies: { tot_admin: cookie } }),
      ...(body !== undefined && { payload: JSON.stringify(body) }),
    });
    const set = res.cookies.find((c) => c.name === 'tot_admin');
    if (set) cookie = set.value || undefined;
    if (res.headers['content-type']?.includes('json')) {
      const json = res.json() as { csrfToken?: string };
      if (json.csrfToken) csrf = json.csrfToken;
    }
    return res;
  }
  return {
    send,
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      cookie = value;
    },
    get csrf() {
      return csrf;
    },
    set csrf(value) {
      csrf = value;
    },
  };
}

const codeFor = (secret: string, offsetSteps = 0) =>
  hotp(base32Decode(secret), timeStep(clock) + offsetSteps);

/** Signs in and enrols an authenticator; returns the browser, the secret and recovery codes. */
async function enrolledOwner() {
  const b = browser();
  await b.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
  const setup = (await b.send('POST', '/api/v1/auth/mfa/setup')).json() as { secret: string };
  const enabled = await b.send('POST', '/api/v1/auth/mfa/enable', { code: codeFor(setup.secret) });
  const { recoveryCodes } = enabled.json() as { recoveryCodes: string[] };
  return { b, secret: setup.secret, recoveryCodes };
}

describe('first sign-in: password, then the owner MUST enrol an authenticator', () => {
  it('password alone gives a short MFA_SETUP session that cannot use admin routes', async () => {
    const b = browser();
    const login = await b.send('POST', '/api/v1/auth/login', {
      email: email.toUpperCase(),
      password: PASSWORD,
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ stage: 'MFA_SETUP', user: { email, role: 'OWNER' } });
    const cookie = login.cookies.find((c) => c.name === 'tot_admin')!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/', maxAge: 600 });
    const me = await b.send('GET', '/api/v1/admin/me');
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('MFA_REQUIRED');
  });

  it('enrols TOTP, returns 10 recovery codes once, rotates the session and opens admin', async () => {
    const b = browser();
    await b.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    const pendingCookie = b.cookie;
    const setup = await b.send('POST', '/api/v1/auth/mfa/setup');
    expect(setup.statusCode).toBe(200);
    const { secret, otpauthUri } = setup.json() as { secret: string; otpauthUri: string };
    expect(otpauthUri).toContain(`secret=${secret}`);

    const stored = await db.adminUser.findUniqueOrThrow({ where: { email } });
    expect(stored.totpEnabledAt).toBeNull();
    expect(Buffer.from(stored.totpSecretCiphertext!).toString('utf8')).not.toContain(secret);

    const wrong = await b.send('POST', '/api/v1/auth/mfa/enable', { code: '000000' });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_CODE');

    const enabled = await b.send('POST', '/api/v1/auth/mfa/enable', { code: codeFor(secret) });
    expect(enabled.statusCode).toBe(200);
    const body = enabled.json() as { stage: string; recoveryCodes: string[] };
    expect(body.stage).toBe('ACTIVE');
    expect(body.recoveryCodes).toHaveLength(10);
    expect(b.cookie).not.toBe(pendingCookie);

    expect((await b.send('GET', '/api/v1/admin/me')).json()).toEqual({
      email,
      role: 'OWNER',
      locale: 'en',
    });
    const codes = await db.adminRecoveryCode.findMany({ where: { adminUserId: stored.id } });
    expect(codes.map((c) => c.codeHash)).not.toContain(body.recoveryCodes[0]);
    // The old half-signed-in cookie is dead.
    b.cookie = pendingCookie;
    expect((await b.send('GET', '/api/v1/admin/me')).statusCode).toBe(401);
  });

  it('refuses setup again once enrolled', async () => {
    const { b } = await enrolledOwner();
    expect((await b.send('POST', '/api/v1/auth/mfa/setup')).json().error.code).toBe('CONFLICT');
  });
});

describe('later sign-ins: password + authenticator code', () => {
  async function signInToVerify() {
    const { secret, recoveryCodes } = await enrolledOwner();
    advance(60_000);
    const b = browser();
    const login = await b.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    expect(login.json().stage).toBe('MFA_VERIFY');
    return { b, secret, recoveryCodes };
  }

  it('accepts a valid code and refuses replaying it', async () => {
    const { b, secret } = await signInToVerify();
    const code = codeFor(secret);
    const ok = await b.send('POST', '/api/v1/auth/mfa/verify', { code });
    expect(ok.json().stage).toBe('ACTIVE');
    const again = browser();
    await again.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    expect((await again.send('POST', '/api/v1/auth/mfa/verify', { code })).json().error.code).toBe(
      'INVALID_CODE',
    );
  });

  it('accepts each recovery code exactly once (any case, with or without dash)', async () => {
    const { b, recoveryCodes } = await signInToVerify();
    const code = recoveryCodes[0]!;
    const ok = await b.send('POST', '/api/v1/auth/mfa/verify', {
      code: code.toLowerCase().replace('-', ' '),
    });
    expect(ok.json().stage).toBe('ACTIVE');
    const again = browser();
    await again.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    expect((await again.send('POST', '/api/v1/auth/mfa/verify', { code })).statusCode).toBe(401);
  });

  it('cannot skip MFA by calling verify on a session that is not at that step', async () => {
    const { b } = await enrolledOwner();
    expect(
      (await b.send('POST', '/api/v1/auth/mfa/verify', { code: '123456' })).json().error.code,
    ).toBe('CONFLICT');
  });
});

describe('wrong passwords, lockout and enumeration', () => {
  it('gives the same answer for an unknown email and a wrong password', async () => {
    const b = browser();
    const unknown = await b.send('POST', '/api/v1/auth/login', {
      email: 'nobody@example.org',
      password: PASSWORD,
    });
    const wrong = await b.send('POST', '/api/v1/auth/login', {
      email,
      password: 'wrong password here',
    });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().error.message).toBe(wrong.json().error.message);
    expect(unknown.cookies).toHaveLength(0);
  });

  it('locks the account after 5 failures, even for the right password, then unlocks', async () => {
    const b = browser();
    for (let i = 0; i < 5; i += 1) {
      await b.send('POST', '/api/v1/auth/login', { email, password: `wrong-${i}-password` });
    }
    const user = await db.adminUser.findUniqueOrThrow({ where: { email } });
    expect(user.lockedUntil).not.toBeNull();
    const locked = await b.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    expect(locked.json().error.code).toBe('INVALID_CREDENTIALS');
    advance(15 * 60_000 + 1);
    const after = await b.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    expect(after.statusCode).toBe(200);
    const audit = await db.auditLog.findMany({
      where: { actorId: user.id },
      select: { action: true },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'auth.login.wrong_password',
        'auth.account.locked',
        'auth.login.locked',
      ]),
    );
  });

  it('counts wrong authenticator codes towards the lockout and ends the session', async () => {
    const { secret } = await enrolledOwner();
    advance(60_000);
    const b = browser();
    await b.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    for (let i = 0; i < 5; i += 1)
      await b.send('POST', '/api/v1/auth/mfa/verify', { code: '000000' });
    const res = await b.send('POST', '/api/v1/auth/mfa/verify', { code: codeFor(secret) });
    expect(res.statusCode).toBe(401);
  });

  it('rate-limits sign-in attempts per IP', async () => {
    const b = browser();
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      codes.push(
        (await b.send('POST', '/api/v1/auth/login', { email: 'x@example.org', password: 'nope' }))
          .statusCode,
      );
    }
    expect(codes.at(-1)).toBe(429);
  });
});

describe('session expiry and logout', () => {
  it('ends after the idle limit', async () => {
    const { b } = await enrolledOwner();
    advance(29 * 60_000);
    expect((await b.send('GET', '/api/v1/admin/me')).statusCode).toBe(200);
    advance(31 * 60_000);
    expect((await b.send('GET', '/api/v1/admin/me')).statusCode).toBe(401);
    expect((await b.send('GET', '/api/v1/auth/session')).json()).toEqual({ stage: 'SIGNED_OUT' });
  });

  it('ends after the absolute limit even when active', async () => {
    const { b } = await enrolledOwner();
    for (let i = 0; i < 25; i += 1) {
      advance(29 * 60_000);
      if ((await b.send('GET', '/api/v1/admin/me')).statusCode !== 200) break;
    }
    expect((await b.send('GET', '/api/v1/admin/me')).statusCode).toBe(401);
  });

  it('ends the half-signed-in session after 10 minutes', async () => {
    const b = browser();
    await b.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    advance(10 * 60_000 + 1);
    expect((await b.send('POST', '/api/v1/auth/mfa/setup')).statusCode).toBe(401);
  });

  it('logs out: revokes the session server-side and clears the cookie', async () => {
    const { b } = await enrolledOwner();
    const token = b.cookie!;
    const res = await b.send('POST', '/api/v1/auth/logout');
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === 'tot_admin')?.value).toBe('');
    const session = await db.adminSession.findUnique({ where: { tokenHash: sha256Hex(token) } });
    expect(session?.revokedAt).not.toBeNull();
    b.cookie = token;
    expect((await b.send('GET', '/api/v1/admin/me')).statusCode).toBe(401);
  });

  it('logout without a session is a harmless 204', async () => {
    expect((await browser().send('POST', '/api/v1/auth/logout')).statusCode).toBe(204);
  });

  it('a password reset signs out every session and requires a new authenticator', async () => {
    const { b } = await enrolledOwner();
    await setOwnerPassword(db, email, 'new river mango lamp');
    expect((await b.send('GET', '/api/v1/admin/me')).statusCode).toBe(401);
    const again = browser();
    const login = await again.send('POST', '/api/v1/auth/login', {
      email,
      password: 'new river mango lamp',
    });
    expect(login.json().stage).toBe('MFA_SETUP');
  });

  it('a deactivated account loses access immediately', async () => {
    const { b } = await enrolledOwner();
    await db.adminUser.update({ where: { email }, data: { active: false } });
    expect((await b.send('GET', '/api/v1/admin/me')).statusCode).toBe(401);
  });
});

describe('CSRF and origin checks', () => {
  it('refuses a state-changing request without the CSRF token', async () => {
    const { b } = await enrolledOwner();
    b.csrf = undefined;
    const res = await b.send('POST', '/api/v1/auth/logout');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });

  it("refuses another session's CSRF token", async () => {
    const one = await enrolledOwner();
    advance(60_000);
    const other = browser();
    await other.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    one.b.csrf = other.csrf;
    expect((await one.b.send('POST', '/api/v1/auth/logout')).statusCode).toBe(403);
  });

  it('refuses sign-in from a foreign origin', async () => {
    const res = await browser().send(
      'POST',
      '/api/v1/auth/login',
      { email, password: PASSWORD },
      {
        origin: 'https://evil.example',
      },
    );
    expect(res.statusCode).toBe(403);
  });

  it('checks admin POSTs too (unknown path → 404 only after the guard passes)', async () => {
    const { b } = await enrolledOwner();
    expect((await b.send('GET', '/api/v1/admin/nope')).statusCode).toBe(404);
    b.csrf = 'forged';
    expect((await b.send('POST', '/api/v1/admin/nope', {})).statusCode).toBe(403);
  });

  it('GET /auth/session returns the stage and a fresh CSRF token, never secrets', async () => {
    const { b } = await enrolledOwner();
    const res = await b.send('GET', '/api/v1/auth/session');
    expect(res.json()).toEqual({
      stage: 'ACTIVE',
      user: { email, role: 'OWNER', locale: 'en' },
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(res.body).not.toMatch(/password|totp|secret/i);
  });

  it('a bad cookie gets SIGNED_OUT and the cookie cleared', async () => {
    const b = browser();
    b.cookie = 'a'.repeat(43);
    const res = await b.send('GET', '/api/v1/auth/session');
    expect(res.json()).toEqual({ stage: 'SIGNED_OUT' });
    expect(res.cookies.find((c) => c.name === 'tot_admin')?.value).toBe('');
  });
});

describe('a new sign-in replaces the previous session in that browser', () => {
  it('revokes the old session', async () => {
    const { b } = await enrolledOwner();
    const old = b.cookie!;
    advance(60_000);
    await b.send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
    const session = await db.adminSession.findUnique({ where: { tokenHash: sha256Hex(old) } });
    expect(session?.revokedAt).not.toBeNull();
  });
});
