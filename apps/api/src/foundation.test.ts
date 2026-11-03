import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { AppError } from './http/errors.ts';
import { HSTS_HEADER, SECURITY_HEADERS } from './http/security.ts';
import { parseInput } from './http/validation.ts';
import { createTestApp, type TestApp } from './test/harness.ts';

let current: TestApp | undefined;

async function start(env: Record<string, string> = {}, routes?: (app: FastifyInstance) => void) {
  current = await createTestApp(env, routes);
  return current;
}

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

const Contact = z.object({
  name: z.string().min(1),
  message: z.string().min(1).max(500),
  meta: z.strictObject({ source: z.enum(['web', 'whatsapp']) }).optional(),
});

function contactRoute(app: FastifyInstance) {
  app.post('/__contact', async (request) => {
    const input = parseInput(Contact, request.body);
    return { ok: true, length: input.message.length };
  });
}

function postJson(t: TestApp, url: string, body: unknown, headers: Record<string, string> = {}) {
  return t.app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...headers },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('strict input validation', () => {
  it('accepts a valid body', async () => {
    const t = await start({}, contactRoute);
    const res = await postJson(t, '/api/v1/__contact', { name: 'A', message: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, length: 5 });
  });

  it('rejects unknown top-level fields with VALIDATION_ERROR and the field path', async () => {
    const t = await start({}, contactRoute);
    const res = await postJson(t, '/api/v1/__contact', {
      name: 'A',
      message: 'hi',
      isAdmin: true,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are missing or invalid.',
        correlationId: res.headers['x-correlation-id'],
        fields: [{ path: 'isAdmin', issue: 'unknown_field' }],
      },
    });
  });

  it('rejects unknown nested fields declared strict', async () => {
    const t = await start({}, contactRoute);
    const res = await postJson(t, '/api/v1/__contact', {
      name: 'A',
      message: 'hi',
      meta: { source: 'web', extra: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual([{ path: 'meta.extra', issue: 'unknown_field' }]);
  });

  it('lists every missing or invalid field without echoing submitted values', async () => {
    const t = await start({}, contactRoute);
    const secret = '9876543210-private';
    const res = await postJson(t, '/api/v1/__contact', { message: secret.repeat(40) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual([
      { path: 'name', issue: 'invalid_type' },
      { path: 'message', issue: 'too_big' },
    ]);
    expect(res.body).not.toContain('9876543210');
  });

  it('rejects a body that is not an object', async () => {
    const t = await start({}, contactRoute);
    const res = await postJson(t, '/api/v1/__contact', '[1,2]');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual([{ path: '(root)', issue: 'invalid_type' }]);
  });

  it('leaves non-object schemas as they are', () => {
    expect(parseInput(z.string().trim(), '  ok ')).toBe('ok');
    expect(() => parseInput(z.number(), 'x')).toThrow(AppError);
  });

  it('rejects prototype-poisoning payloads', async () => {
    const t = await start({}, contactRoute);
    const res = await postJson(t, '/api/v1/__contact', '{"__proto__":{"x":1},"name":"A"}');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('maps Fastify schema validation errors to VALIDATION_ERROR', async () => {
    const t = await start({}, (app) => {
      app.get(
        '/__query',
        { schema: { querystring: { type: 'object', required: ['q'] } } },
        async () => ({ ok: true }),
      );
    });
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/__query' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('request size and type', () => {
  it('rejects bodies over BODY_LIMIT_BYTES with PAYLOAD_TOO_LARGE', async () => {
    const t = await start({ BODY_LIMIT_BYTES: '1024' }, contactRoute);
    const res = await postJson(t, '/api/v1/__contact', { name: 'A', message: 'x'.repeat(2000) });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects unsupported content types', async () => {
    const t = await start({}, contactRoute);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/__contact',
      headers: { 'content-type': 'application/xml' },
      payload: '<a/>',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('stable error codes', () => {
  it.each([
    ['UNAUTHORIZED', 401],
    ['FORBIDDEN', 403],
    ['CONFLICT', 409],
  ] as const)('AppError(%s) returns %i with the public message only', async (code, status) => {
    const t = await start({}, (app) => {
      app.get('/__fail', async () => {
        throw new AppError(code);
      });
    });
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/__fail' });
    expect(res.statusCode).toBe(status);
    expect(res.json().error.code).toBe(code);
    expect(res.json().error.fields).toBeUndefined();
  });

  it('maps an unclassified 4xx to BAD_REQUEST', async () => {
    const t = await start({}, (app) => {
      app.get('/__teapot', async () => {
        throw Object.assign(new Error('teapot internals'), { statusCode: 418 });
      });
    });
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/__teapot' });
    expect(res.statusCode).toBe(418);
    expect(res.json().error.code).toBe('BAD_REQUEST');
    expect(res.body).not.toContain('internals');
  });

  it('treats a thrown non-error as INTERNAL_ERROR', async () => {
    const t = await start({}, (app) => {
      app.get('/__weird', async () => {
        throw Object.assign(new Error('x'), { statusCode: 'nope' });
      });
    });
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/__weird' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL_ERROR');
  });
});

describe('rate limiting', () => {
  it('returns 429 RATE_LIMITED with retry headers once the limit is used up', async () => {
    const t = await start({ RATE_LIMIT_MAX: '2' });
    const ok1 = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    const ok2 = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    const limited = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect([ok1.statusCode, ok2.statusCode]).toEqual([200, 200]);
    expect(ok1.headers['x-ratelimit-limit']).toBe('2');
    expect(ok2.headers['x-ratelimit-remaining']).toBe('0');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a moment and try again.',
        correlationId: limited.headers['x-correlation-id'],
      },
    });
    // The limited response still carries the security headers.
    expect(limited.headers['x-content-type-options']).toBe('nosniff');
  });

  it('counts each client IP separately', async () => {
    const t = await start({ RATE_LIMIT_MAX: '1' });
    const a = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      remoteAddress: '10.0.0.1',
    });
    const b = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      remoteAddress: '10.0.0.2',
    });
    const a2 = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      remoteAddress: '10.0.0.1',
    });
    expect([a.statusCode, b.statusCode, a2.statusCode]).toEqual([200, 200, 429]);
  });

  it('lets a route set a stricter limit', async () => {
    const t = await start({}, (app) => {
      app.post(
        '/__strict',
        { config: { rateLimit: { max: 1, timeWindow: 60_000 } } },
        async () => ({ ok: true }),
      );
    });
    const first = await postJson(t, '/api/v1/__strict', {});
    const second = await postJson(t, '/api/v1/__strict', {});
    expect([first.statusCode, second.statusCode]).toEqual([200, 429]);
  });
});

describe('CORS allowlist', () => {
  const env = { CORS_ORIGINS: 'https://theonetrust.in,https://www.theonetrust.in' };

  it('allows a listed origin and exposes the correlation ID', async () => {
    const t = await start(env);
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://www.theonetrust.in' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://www.theonetrust.in');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-expose-headers']).toContain('x-correlation-id');
    expect(res.headers.vary).toContain('Origin');
  });

  it('sends no CORS headers to an unlisted origin', async () => {
    const t = await start(env);
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('does not treat a look-alike origin as listed', async () => {
    const t = await start(env);
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://theonetrust.in.evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a preflight from a listed origin with the allowed methods and headers', async () => {
    const t = await start(env);
    const res = await t.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/health',
      headers: {
        origin: 'https://theonetrust.in',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://theonetrust.in');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('content-type');
    expect(res.headers['access-control-max-age']).toBe('600');
  });

  it('serves same-origin and server-to-server calls (no Origin header)', async () => {
    const t = await start(env);
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe('security headers', () => {
  it('sends the API security headers on success and on errors', async () => {
    const t = await start();
    for (const url of ['/api/v1/health', '/api/v1/nope']) {
      const res = await t.app.inject({ method: 'GET', url });
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(res.headers[name]).toBe(value);
      }
      expect(res.headers['strict-transport-security']).toBeUndefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('adds HSTS only in production', async () => {
    const t = await start({
      NODE_ENV: 'production',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://u:p@db.example/app',
    });
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.headers['strict-transport-security']).toBe(HSTS_HEADER);
  });
});

describe('raw body for webhooks', () => {
  function webhookRoutes(app: FastifyInstance) {
    app.post('/__webhook', { config: { rawBody: true } }, async (request) => ({
      raw: request.rawBody?.toString('utf8'),
      parsed: request.body,
    }));
    app.post('/__plain', async (request) => ({ hasRaw: request.rawBody !== undefined }));
  }

  it('keeps the exact bytes on routes that opt in, and still parses JSON', async () => {
    const t = await start({}, webhookRoutes);
    // Spacing and key order matter for signatures: the raw body must be byte-identical.
    const payload = '{ "event":"payment.captured",  "amount": 50000 }';
    const res = await postJson(t, '/api/v1/__webhook', payload);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      raw: payload,
      parsed: { event: 'payment.captured', amount: 50000 },
    });
  });

  it('does not keep the raw body on ordinary routes', async () => {
    const t = await start({}, webhookRoutes);
    const res = await postJson(t, '/api/v1/__plain', { a: 1 });
    expect(res.json()).toEqual({ hasRaw: false });
  });

  it('still rejects malformed JSON on a raw-body route', async () => {
    const t = await start({}, webhookRoutes);
    const res = await postJson(t, '/api/v1/__webhook', '{oops');
    expect(res.statusCode).toBe(400);
  });
});

describe('structured logs', () => {
  it('logs the path without the query string and with the correlation ID', async () => {
    const t = await start();
    await t.app.inject({
      method: 'GET',
      url: '/api/v1/health?phone=9876543210',
      headers: { 'x-correlation-id': 'trace-12345678' },
    });
    const incoming = t.logs().find((line) => line.msg === 'incoming request');
    expect(incoming?.req).toEqual({
      method: 'GET',
      url: '/api/v1/health',
      correlationId: 'trace-12345678',
    });
    expect(JSON.stringify(t.logs())).not.toContain('9876543210');
  });

  it('redacts personal data and secrets that a module logs', async () => {
    const t = await start({}, (app) => {
      app.get('/__log', async (request) => {
        request.log.info(
          {
            phone: '9876543210',
            donor: { email: 'donor@example.com', pan: 'ABCDE1234F', city: 'Chennai' },
            payment: { card: { token: 'tok_live_x' } },
          },
          'donor event',
        );
        return { ok: true };
      });
    });
    await t.app.inject({ method: 'GET', url: '/api/v1/__log' });
    const line = t.logs().find((entry) => entry.msg === 'donor event');
    expect(line).toMatchObject({
      phone: '[REDACTED]',
      donor: { email: '[REDACTED]', pan: '[REDACTED]', city: 'Chennai' },
      payment: { card: { token: '[REDACTED]' } },
    });
    const all = JSON.stringify(t.logs());
    for (const leak of ['9876543210', 'donor@example.com', 'ABCDE1234F', 'tok_live_x']) {
      expect(all).not.toContain(leak);
    }
  });

  it('logs rejected requests by code, never the body', async () => {
    const t = await start({}, contactRoute);
    await postJson(t, '/api/v1/__contact', {
      name: 'A',
      message: 'hi',
      secretField: 'zzz-private',
    });
    const rejected = t.logs().find((line) => line.msg === 'Request rejected');
    expect(rejected).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    expect(JSON.stringify(t.logs())).not.toContain('zzz-private');
  });
});
