import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { APP_VERSION, buildApp } from './app.ts';
import { loadEnv } from './config/env.ts';

let app: FastifyInstance;

function createApp(): FastifyInstance {
  app = buildApp(loadEnv({ NODE_ENV: 'test' }));
  return app;
}

afterEach(async () => {
  await app.close();
});

describe('GET /api/v1/health', () => {
  it('returns ok with service metadata', async () => {
    const res = await createApp().inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ status: 'ok', service: 'theonetrust-api', version: APP_VERSION });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it('is only served under the versioned prefix', async () => {
    const res = await createApp().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(404);
  });
});

describe('correlation IDs', () => {
  it('generates a correlation ID when none is sent', async () => {
    const res = await createApp().inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed caller correlation ID', async () => {
    const res = await createApp().inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-correlation-id': 'abc12345-trace' },
    });
    expect(res.headers['x-correlation-id']).toBe('abc12345-trace');
  });

  it('replaces a malformed or injected correlation ID', async () => {
    const res = await createApp().inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-correlation-id': '<script>alert(1)</script>' },
    });
    expect(res.headers['x-correlation-id']).not.toContain('<');
  });
});

describe('error envelope', () => {
  it('returns a stable 404 body with the correlation ID', async () => {
    const res = await createApp().inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        correlationId: res.headers['x-correlation-id'],
      },
    });
  });

  it('hides internal error details from the public response', async () => {
    const instance = createApp();
    instance.get('/api/v1/__boom', async () => {
      throw new Error('database password is hunter2');
    });
    const res = await instance.inject({ method: 'GET', url: '/api/v1/__boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('hunter2');
    expect(res.json().error.code).toBe('INTERNAL_ERROR');
  });

  it('maps client errors to a generic 4xx body', async () => {
    const instance = createApp();
    instance.post('/api/v1/__echo', async (req) => req.body);
    const res = await instance.inject({
      method: 'POST',
      url: '/api/v1/__echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });
});

describe('Cashfree wiring (Phase 4)', () => {
  const cashfreeEnv = {
    NODE_ENV: 'test',
    PAYMENT_PROVIDER: 'cashfree',
    CASHFREE_ENV: 'sandbox',
    CASHFREE_CLIENT_ID: 'TEST0123456789',
    CASHFREE_CLIENT_SECRET: 'cf-secret-0123456789',
    PUBLIC_SITE_URL: 'https://theonetrust.example',
  };

  it('registers the Cashfree webhook; without a database it answers 503, never 404', async () => {
    app = buildApp(loadEnv(cashfreeEnv));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/cashfree',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(503);
  });

  it('with online giving off (none), the Cashfree webhook stays unavailable', async () => {
    app = buildApp(loadEnv({ ...cashfreeEnv, PAYMENT_PROVIDER: 'none' }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/cashfree',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(503);
  });

  it('the retired Razorpay webhook address no longer exists (404)', async () => {
    app = buildApp(loadEnv(cashfreeEnv));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/razorpay',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(404);
  });
});
