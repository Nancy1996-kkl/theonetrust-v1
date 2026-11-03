import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { adminRoutes } from '../admin/routes.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';
import { InvalidAuditEntryError, auditLog } from './audit.ts';

const db = useTestDb();
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'river mango lamp seventeen';
let clock = new Date('2027-01-10T08:00:00Z');
let app: FastifyInstance;
let email: string;

beforeEach(async () => {
  await app?.close();
  clock = new Date(clock.getTime() + 3_600_000);
  app = buildApp(
    loadEnv({
      NODE_ENV: 'test',
      AUTH_SECRET_KEY: Buffer.alloc(32, 4).toString('base64'),
      CORS_ORIGINS: ORIGIN,
    }),
    { db, now: () => clock },
  );
  email = `${unique('audit-owner')}@example.org`;
  await setOwnerPassword(db, email, PASSWORD);
});

afterAll(async () => {
  await app.close();
});

/** Signs in fully (password + enrol TOTP); returns a request helper carrying cookie + CSRF. */
async function signedIn() {
  let cookie = '';
  let csrf = '';
  const send = async (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> => {
    const res = await app.inject({
      method,
      url,
      headers: {
        origin: ORIGIN,
        ...(csrf && { 'x-csrf-token': csrf }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(cookie && { cookies: { tot_admin: cookie } }),
      ...(body !== undefined && { payload: JSON.stringify(body) }),
    });
    const set = res.cookies.find((c) => c.name === 'tot_admin');
    if (set) cookie = set.value;
    if (res.headers['content-type']?.includes('json')) {
      const token = (res.json() as { csrfToken?: string }).csrfToken;
      if (token) csrf = token;
    }
    return res;
  };
  await send('POST', '/api/v1/auth/login', { email, password: PASSWORD });
  const { secret } = (await send('POST', '/api/v1/auth/mfa/setup')).json() as { secret: string };
  await send('POST', '/api/v1/auth/mfa/enable', {
    code: hotp(base32Decode(secret), timeStep(clock)),
  });
  const user = await db.adminUser.findUniqueOrThrow({ where: { email } });
  return { send, user };
}

describe('admin mutations write audit entries', () => {
  it('PATCH /admin/me writes the change and an entry with actor, field names and correlation ID', async () => {
    const { send, user } = await signedIn();
    const res = await send(
      'PATCH',
      '/api/v1/admin/me',
      { locale: 'ta' },
      { 'x-correlation-id': 'trace-audit-0001' },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ locale: 'ta' });
    const entry = await db.auditLog.findFirstOrThrow({
      where: { actorId: user.id, action: 'admin.preferences.update' },
    });
    expect(entry).toMatchObject({
      entityType: 'admin_user',
      entityId: user.id,
      changedFields: ['locale'],
      correlationId: 'trace-audit-0001',
    });
    expect(JSON.stringify(entry)).not.toContain('"ta"');
  });

  it('writes nothing when the input is invalid', async () => {
    const { send, user } = await signedIn();
    const res = await send('PATCH', '/api/v1/admin/me', { locale: 'fr' });
    expect(res.statusCode).toBe(400);
    expect(
      await db.auditLog.count({ where: { actorId: user.id, action: 'admin.preferences.update' } }),
    ).toBe(0);
  });

  it('rolls the change back if the audit entry cannot be written', async () => {
    const programmeSlug = unique('audit-rollback');
    await expect(
      auditLog(db).mutate(
        { actorId: null, action: 'INVALID', entityType: 'programme', correlationId: null },
        (tx) => tx.programme.create({ data: { slug: programmeSlug, titleTa: 'அ', titleEn: 'A' } }),
      ),
    ).rejects.toBeInstanceOf(InvalidAuditEntryError);
    expect(await db.programme.findUnique({ where: { slug: programmeSlug } })).toBeNull();
  });

  it('turns an unaudited admin mutation into a 500 (a forgotten audit cannot ship)', async () => {
    const userId = (await signedIn()).user.id;
    const bare = Fastify();
    await bare.register(
      async (scope) => {
        await adminRoutes(scope, {
          db,
          guard: async (request) => {
            request.admin = { userId, role: 'OWNER', sessionId: 'test' };
          },
        });
        scope.post('/__unaudited', async () => ({ ok: true }));
        scope.post('/__audited', async (request) =>
          request.audit!.mutate({ action: 'test.audited.write', entityType: 'test' }, async () => ({
            ok: true,
          })),
        );
      },
      { prefix: '/api/v1/admin' },
    );
    expect(
      (await bare.inject({ method: 'POST', url: '/api/v1/admin/__unaudited' })).statusCode,
    ).toBe(500);
    expect((await bare.inject({ method: 'POST', url: '/api/v1/admin/__audited' })).statusCode).toBe(
      200,
    );
    await bare.close();
  });
});

describe('audit entries cannot be edited through the API', () => {
  it.each(['PUT', 'PATCH', 'DELETE'] as const)(
    '%s on the audit log is not a route (404), entry unchanged',
    async (method) => {
      const { send, user } = await signedIn();
      const entry = await db.auditLog.findFirstOrThrow({ where: { actorId: user.id } });
      for (const url of ['/api/v1/admin/audit-log', `/api/v1/admin/audit-log/${entry.id}`]) {
        const res = await send(method, url, { action: 'auth.tampered' });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
      expect(await db.auditLog.findUniqueOrThrow({ where: { id: entry.id } })).toEqual(entry);
    },
  );
});

describe('GET /admin/audit-log', () => {
  it('lists newest first with actor email and field names only', async () => {
    const { send } = await signedIn();
    const res = await send('GET', `/api/v1/admin/audit-log?action=auth&limit=10`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ action: string; actorEmail: string; createdAt: string }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i) => i.action.startsWith('auth.'))).toBe(true);
    const times = body.items.map((i) => i.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(body.items.some((i) => i.actorEmail === email)).toBe(true);
    expect(res.body).not.toMatch(/password_hash"\s*:|river mango/);
  });

  it('filters by entity, actor and date range', async () => {
    const { send, user } = await signedIn();
    const mine = (
      await send(
        'GET',
        `/api/v1/admin/audit-log?actorId=${user.id}&entityType=admin_user&entityId=${user.id}`,
      )
    ).json() as {
      items: Array<{ actorEmail: string }>;
    };
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((i) => i.actorEmail === email)).toBe(true);
    const future = (
      await send('GET', `/api/v1/admin/audit-log?from=2100-01-01T00:00:00Z`)
    ).json() as { items: unknown[] };
    expect(future.items).toEqual([]);
    const past = (await send('GET', `/api/v1/admin/audit-log?to=2000-01-01T00:00:00Z`)).json() as {
      items: unknown[];
    };
    expect(past.items).toEqual([]);
  });

  it('pages with a cursor without repeating or skipping entries', async () => {
    const { send, user } = await signedIn();
    for (let i = 0; i < 5; i += 1) {
      await auditLog(db).record({
        actorId: user.id,
        action: 'test.paging.event',
        entityType: 'test',
        correlationId: null,
      });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `?action=test.paging&actorId=${user.id}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = (await send('GET', `/api/v1/admin/audit-log${query}`)).json() as {
        items: Array<{ id: string }>;
        nextCursor: string | null;
      };
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it.each(['?unknown=1', '?limit=1000', '?cursor=nope', '?from=yesterday', '?actorId=x'])(
    'rejects invalid query %s',
    async (query) => {
      const { send } = await signedIn();
      expect((await send('GET', `/api/v1/admin/audit-log${query}`)).statusCode).toBe(400);
    },
  );
});
