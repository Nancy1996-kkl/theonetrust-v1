import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { HELP_REFERENCE_PATTERN } from '@theonetrust/contracts';
import { buildApp } from '../../app.ts';
import { setOwnerPassword } from '../../cli/owner-account.ts';
import { loadEnv } from '../../config/env.ts';
import { unique, useTestDb } from '../../test/db.ts';
import { base32Decode, hotp, timeStep } from '../auth/totp.ts';

const db = useTestDb();
const ORIGIN = 'http://localhost:5173';
let clock = new Date('2027-03-01T05:00:00Z');
let app: FastifyInstance;
let ip = 0;

function build(extra: Record<string, string> = {}) {
  return buildApp(
    loadEnv({
      NODE_ENV: 'test',
      AUTH_SECRET_KEY: Buffer.alloc(32, 6).toString('base64'),
      CORS_ORIGINS: ORIGIN,
      OWNER_NOTIFICATION_EMAIL: 'owner@example.org',
      ...extra,
    }),
    { db, now: () => clock },
  );
}

beforeEach(async () => {
  await app?.close();
  clock = new Date(clock.getTime() + 3_600_000);
  app = build();
});
afterAll(async () => {
  await app.close();
});

let phoneSeq = 0;
const freshPhone = () =>
  `98${String(10_000_000 + (Date.now() % 1_000_000) * 10 + (phoneSeq++ % 10)).slice(-8)}`;

const wizard = (patch: Record<string, unknown> = {}) => ({
  mode: 'wizard',
  helpFor: 'someone',
  kinds: ['education', 'food'],
  description: 'Needs school books',
  phone: freshPhone(),
  personNameOrVillage: 'Lakshmi, Thiruvallur',
  callLanguage: 'ta',
  bestTime: 'evening',
  consentContact: true,
  consentThirdParty: true,
  pageLanguage: 'en',
  website: '',
  ...patch,
});

function post(url: string, payload: unknown, remoteAddress = `10.1.0.${(ip++ % 250) + 1}`) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    remoteAddress,
  });
}

describe('POST /help-requests', () => {
  it('stores a valid request, returns a reference, audits it and queues the owner notification', async () => {
    const body = wizard({ phone: '+91 98765-0' + String(phoneSeq++).padStart(4, '0') });
    const res = await post('/help-requests', body);
    expect(res.statusCode).toBe(201);
    const { reference } = res.json();
    expect(reference).toMatch(HELP_REFERENCE_PATTERN);
    const row = await db.helpRequest.findUniqueOrThrow({ where: { reference } });
    expect(row).toMatchObject({
      kind: 'FULL',
      status: 'NEW',
      forWhom: 'someone',
      helpTypes: ['education', 'food'],
      locale: 'ta',
      pageLocale: 'en',
      personNameOrVillage: 'Lakshmi, Thiruvallur',
    });
    expect(row.contactPhone).toMatch(/^\+919876/);
    expect(row.thirdPartyConsentAt).not.toBeNull();
    expect(
      await db.auditLog.count({ where: { entityId: row.id, action: 'help_request.created' } }),
    ).toBe(1);
    const outbox = await db.notificationOutbox.findUniqueOrThrow({
      where: { dedupeKey: `help_request.created:${row.id}` },
    });
    expect(JSON.stringify(outbox)).not.toMatch(/9876|Lakshmi|school/);
  });

  it('stores a call-back request with only the phone', async () => {
    const res = await post('/help-requests/callback', {
      mode: 'callback',
      phone: freshPhone(),
      consentContact: true,
      pageLanguage: 'ta',
      website: '',
    });
    expect(res.statusCode).toBe(201);
    const row = await db.helpRequest.findUniqueOrThrow({
      where: { reference: res.json().reference },
    });
    expect(row).toMatchObject({
      kind: 'CALLBACK',
      helpTypes: [],
      description: null,
      forWhom: null,
    });
  });

  it('does not keep a name or village when asking for oneself', async () => {
    const res = await post(
      '/help-requests',
      wizard({ helpFor: 'self', personNameOrVillage: '', consentThirdParty: false }),
    );
    const row = await db.helpRequest.findUniqueOrThrow({
      where: { reference: res.json().reference },
    });
    expect(row.personNameOrVillage).toBeNull();
    expect(row.thirdPartyConsentAt).toBeNull();
  });

  it('a repeat from the same phone within the window returns the same reference', async () => {
    const phone = freshPhone();
    const first = await post('/help-requests', wizard({ phone }));
    const second = await post('/help-requests', wizard({ phone }));
    expect(second.json().reference).toBe(first.json().reference);
    clock = new Date(clock.getTime() + 11 * 60_000);
    const later = await post('/help-requests', wizard({ phone }));
    expect(later.json().reference).not.toBe(first.json().reference);
  });

  it('does not queue a notification while no owner email is configured', async () => {
    await app.close();
    app = build({ OWNER_NOTIFICATION_EMAIL: '' });
    const res = await post('/help-requests', wizard());
    const row = await db.helpRequest.findUniqueOrThrow({
      where: { reference: res.json().reference },
    });
    expect(
      await db.notificationOutbox.count({ where: { entityRef: `help_request:${row.id}` } }),
    ).toBe(0);
  });
});

describe('spam and validation', () => {
  it('honeypot: answers like a success, stores nothing', async () => {
    const before = await db.helpRequest.count();
    const res = await post('/help-requests', wizard({ website: 'https://cheap-pills.example' }));
    expect(res.statusCode).toBe(201);
    expect(res.json().reference).toMatch(HELP_REFERENCE_PATTERN);
    expect(await db.helpRequest.count()).toBe(before);
  });

  it('rate-limits per IP (5 per hour by default)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await post('/help-requests', wizard(), '10.9.9.9')).statusCode);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });

  it.each([
    ['an invalid phone', { phone: '12345' }, 'phone'],
    ['a landline', { phone: '044 2345 6789' }, 'phone'],
    ['no third-party consent', { consentThirdParty: false }, 'consentThirdParty'],
    ['a name for oneself', { helpFor: 'self', consentThirdParty: false }, 'personNameOrVillage'],
    ['duplicate kinds', { kinds: ['food', 'food'] }, 'kinds'],
  ])('rejects %s', async (_why, patch, field) => {
    const res = await post('/help-requests', wizard(patch));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toContainEqual({ path: field, issue: 'invalid' });
  });

  it.each([
    ['unknown fields (e.g. documents)', { aadhaar: '1234 5678 9012' }],
    ['no kinds', { kinds: [] }],
    ['an unknown kind', { kinds: ['loan'] }],
    ['a long description', { description: 'x'.repeat(501) }],
    ['missing consent', { consentContact: false }],
  ])('rejects %s at the schema', async (_why, patch) => {
    const res = await post('/help-requests', wizard(patch));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.body).not.toContain('1234 5678');
  });
});

/** Signed-in owner helper (password + TOTP enrolment). */
async function owner() {
  const email = `${unique('help-owner')}@example.org`;
  await setOwnerPassword(db, email, 'river mango lamp seventeen');
  let cookie = '';
  let csrf = '';
  const send = async (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    body?: unknown,
  ): Promise<LightMyRequestResponse> => {
    const res = await app.inject({
      method,
      url,
      headers: {
        origin: ORIGIN,
        ...(csrf && { 'x-csrf-token': csrf }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
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
  await send('POST', '/api/v1/auth/login', { email, password: 'river mango lamp seventeen' });
  const { secret } = (await send('POST', '/api/v1/auth/mfa/setup')).json() as { secret: string };
  await send('POST', '/api/v1/auth/mfa/enable', {
    code: hotp(base32Decode(secret), timeStep(clock)),
  });
  const user = await db.adminUser.findUniqueOrThrow({ where: { email } });
  return { send, user, email };
}

async function newCase(patch: Record<string, unknown> = {}) {
  const res = await post('/help-requests', wizard(patch));
  return db.helpRequest.findUniqueOrThrow({ where: { reference: res.json().reference } });
}

describe('admin case inbox', () => {
  it('lists with masked phones and filters by status, type, language and kind', async () => {
    const { send } = await owner();
    const health = await newCase({ kinds: ['health'], callLanguage: 'en' });
    const list = (
      await send(
        'GET',
        '/api/v1/admin/help-requests?helpType=health&language=en&status=NEW&kind=FULL',
      )
    ).json() as {
      items: Array<{ id: string; phoneMasked: string }>;
    };
    const item = list.items.find((i) => i.id === health.id);
    expect(item?.phoneMasked).toBe(`••••••${health.contactPhone.slice(-4)}`);
    expect(JSON.stringify(list)).not.toContain(health.contactPhone);
    const other = (await send('GET', '/api/v1/admin/help-requests?helpType=livelihood')).json() as {
      items: Array<{ id: string }>;
    };
    expect(other.items.some((i) => i.id === health.id)).toBe(false);
  });

  it('pages with a cursor', async () => {
    const { send } = await owner();
    await newCase();
    await newCase();
    const first = (await send('GET', '/api/v1/admin/help-requests?limit=1')).json() as {
      items: unknown[];
      nextCursor: string;
    };
    expect(first.items).toHaveLength(1);
    const second = (
      await send(
        'GET',
        `/api/v1/admin/help-requests?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`,
      )
    ).json() as {
      items: Array<{ id: string }>;
    };
    expect(second.items[0]?.id).not.toBe((first.items[0] as { id: string }).id);
  });

  it('every status change is audited, with the reason; notes, assignee and reminder too', async () => {
    const { send, user } = await owner();
    const c = await newCase();
    const contacted = await send('PATCH', `/api/v1/admin/help-requests/${c.id}`, {
      status: 'CONTACTED',
      reason: 'Called, will visit',
    });
    expect(contacted.statusCode).toBe(200);
    expect(contacted.json().status).toBe('CONTACTED');
    await send('PATCH', `/api/v1/admin/help-requests/${c.id}`, {
      assigneeId: user.id,
      remindOn: '2027-03-10',
    });
    const note = await send('POST', `/api/v1/admin/help-requests/${c.id}/notes`, {
      body: 'Family of four; school fees due.',
    });
    expect(note.statusCode).toBe(201);
    const entries = await db.auditLog.findMany({
      where: { entityId: c.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => e.action)).toEqual([
      'help_request.created',
      'help_request.status_changed',
      'help_request.updated',
      'help_request.note_added',
    ]);
    expect(entries[1]).toMatchObject({
      actorId: user.id,
      changedFields: ['status'],
      reason: 'Called, will visit',
    });
    expect(entries[2]?.changedFields).toEqual(['assigneeId', 'remindOn']);
    expect(JSON.stringify(entries)).not.toContain('school fees');

    const detail = (await send('GET', `/api/v1/admin/help-requests/${c.id}`)).json();
    expect(detail).toMatchObject({
      status: 'CONTACTED',
      phone: c.contactPhone,
      assigneeEmail: expect.stringContaining('help-owner'),
      remindOn: '2027-03-10',
      notes: [expect.objectContaining({ body: 'Family of four; school fees due.' })],
    });
    expect(detail.history).toHaveLength(4);

    const cleared = await send('PATCH', `/api/v1/admin/help-requests/${c.id}`, {
      assigneeId: null,
      remindOn: null,
    });
    expect(cleared.json()).toMatchObject({ assigneeEmail: null, remindOn: null });
  });

  it('validates inbox input', async () => {
    const { send } = await owner();
    const c = await newCase();
    for (const body of [
      {},
      { status: 'DONE' },
      { remindOn: '10/03/2027' },
      { assigneeId: '00000000-0000-4000-8000-000000000000' },
    ]) {
      expect((await send('PATCH', `/api/v1/admin/help-requests/${c.id}`, body)).statusCode).toBe(
        400,
      );
    }
    expect(
      (await send('POST', `/api/v1/admin/help-requests/${c.id}/notes`, { body: '   ' })).statusCode,
    ).toBe(400);
    expect((await send('GET', '/api/v1/admin/help-requests/not-a-uuid')).statusCode).toBe(400);
    expect(
      (await send('GET', '/api/v1/admin/help-requests/00000000-0000-4000-8000-000000000000'))
        .statusCode,
    ).toBe(404);
    expect((await send('GET', '/api/v1/admin/help-requests?status=nope')).statusCode).toBe(400);
  });

  it('lists the team for assignment (emails only)', async () => {
    const { send, email } = await owner();
    const team = (await send('GET', '/api/v1/admin/team')).json() as {
      users: Array<Record<string, string>>;
    };
    expect(team.users.find((u) => u.email === email)).toEqual({ id: expect.any(String), email });
  });
});

describe('CSV export', () => {
  it('masks personal data, neutralises formulas, keeps Tamil and is audited', async () => {
    const { send, user } = await owner();
    const c = await newCase({ personNameOrVillage: '=HYPERLINK("x")', kinds: ['emergency'] });
    await newCase({ personNameOrVillage: 'திருவள்ளூர்', kinds: ['emergency'] });
    const res = await send('GET', '/api/v1/admin/help-requests/export.csv?helpType=emergency');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const csv = res.body;
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"phone_masked"');
    expect(csv).toContain(`"••••••${c.contactPhone.slice(-4)}"`);
    expect(csv).not.toContain(c.contactPhone);
    expect(csv).not.toMatch(/HYPERLINK|திருவள்ளூர்|Needs school books/);
    expect(csv).toContain('"=•••"'.replace('=', "'="));
    expect(csv).toContain('"த•••"');
    const entry = await db.auditLog.findFirstOrThrow({
      where: { actorId: user.id, action: 'help_request.exported' },
    });
    expect(entry.changedFields).toEqual(['helpType']);
  });

  it('is guarded like every admin route', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/help-requests/export.csv' }))
        .statusCode,
    ).toBe(401);
  });
});
