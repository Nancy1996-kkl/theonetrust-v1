import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from './config/env.ts';
import defaultHandler, { createServerlessHandler, stripCatchAllParam } from './serverless.ts';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

/** Serves the handler like Vercel does: a plain Node request/response pair per call. */
async function serve(handler: ReturnType<typeof createServerlessHandler>): Promise<string> {
  const server = createServer((req, res) => void handler(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const devEnv = () => loadEnv({ NODE_ENV: 'test' });

function addProbes(app: FastifyInstance) {
  app.get('/api/v1/__probe', async (request) => ({ query: request.query, ip: request.ip }));
  app.post('/api/v1/__probe', { config: { rawBody: true } }, async (request) => ({
    sha256: createHash('sha256')
      .update(request.rawBody ?? Buffer.alloc(0))
      .digest('hex'),
  }));
}

describe('stripCatchAllParam (Vercel adds ?path=… to catch-all routes)', () => {
  it.each([
    ['/api/v1/health', '/api/v1/health'],
    ['/api/v1/health?path=v1%2Fhealth', '/api/v1/health'],
    ['/api/v1/x?giftPaise=100&path=v1%2Fx', '/api/v1/x?giftPaise=100'],
    ['/api/v1/x?path=v1%2Fx&a=1&b=2', '/api/v1/x?a=1&b=2'],
    ['/api/v1/x?path', '/api/v1/x'],
    ['/api/v1/x?pathway=1', '/api/v1/x?pathway=1'],
    ['/api/v1/x?', '/api/v1/x'],
    ['/api/v1/x?path=a&path=b&c=1', '/api/v1/x?c=1'],
  ])('%s → %s', (input, expected) => {
    expect(stripCatchAllParam(input)).toBe(expected);
  });
});

describe('serverless handler (Phase 2a)', () => {
  it('serves the API: health 200, unknown path 404 JSON, the catch-all parameter never reaches routes', async () => {
    const base = await serve(createServerlessHandler({ readEnv: devEnv, configure: addProbes }));
    const health = await fetch(`${base}/api/v1/health?path=v1%2Fhealth`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    const missing = await fetch(`${base}/api/v1/nope?path=v1%2Fnope`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    const probe = await fetch(`${base}/api/v1/__probe?giftPaise=100&path=v1%2F__probe`);
    expect(((await probe.json()) as { query: unknown }).query).toEqual({ giftPaise: '100' });
  });

  it('passes the raw body through byte for byte (webhook signatures depend on it)', async () => {
    const base = await serve(createServerlessHandler({ readEnv: devEnv, configure: addProbes }));
    const body = '{"a":1,  "b":"x" ,"c":[ 1,2 ]}'; // odd spacing a re-serialiser would change
    const res = await fetch(`${base}/api/v1/__probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(((await res.json()) as { sha256: string }).sha256).toBe(
      createHash('sha256').update(body).digest('hex'),
    );
  });

  it('builds the app once per instance and reuses it', async () => {
    const readEnv = vi.fn(devEnv);
    const base = await serve(createServerlessHandler({ readEnv }));
    await fetch(`${base}/api/v1/health`);
    await fetch(`${base}/api/v1/health`);
    expect(readEnv).toHaveBeenCalledTimes(1);
  });

  it('a broken configuration answers 503 with the generic body and logs variable NAMES only', async () => {
    const logError = vi.fn();
    const secretish = 'postgresql://user:VERY-SECRET-PASSWORD@db.example.org/x';
    const base = await serve(
      createServerlessHandler({
        // Production without AUTH_SECRET_KEY: refused by loadEnv.
        readEnv: () => loadEnv({ NODE_ENV: 'production', DATABASE_URL: secretish }),
        logError,
      }),
    );
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${base}/api/v1/health`);
      expect(res.status).toBe(503);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
      });
    }
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]![0]).toContain('AUTH_SECRET_KEY');
    expect(logError.mock.calls[0]![0]).not.toContain('VERY-SECRET-PASSWORD');
  });

  it('in production the client IP comes from Vercel’s x-forwarded-for (request arrives from loopback)', async () => {
    // Vercel connects from loopback and overwrites x-forwarded-for with the one real client IP
    // (spike, Nov 2026); production trusts only local proxies, so this is the IP rate limits see.
    const base = await serve(
      createServerlessHandler({
        readEnv: () =>
          loadEnv({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://app@127.0.0.1:1/never-connected',
            DATABASE_SCHEMA: 'theonetrust',
            AUTH_SECRET_KEY: randomBytes(32).toString('base64'),
          }),
        configure: addProbes,
      }),
    );
    const res = await fetch(`${base}/api/v1/__probe`, {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(((await res.json()) as { ip: string }).ip).toBe('203.0.113.9');
  });

  it('a failure while building the app answers 503 and is retried on the next request', async () => {
    const logError = vi.fn();
    let attempts = 0;
    const base = await serve(
      createServerlessHandler({
        readEnv: devEnv,
        logError,
        configure: (app) => {
          attempts += 1;
          if (attempts === 1) throw new TypeError('boom: secret-ish detail');
          addProbes(app);
        },
      }),
    );
    const first = await fetch(`${base}/api/v1/health`);
    expect(first.status).toBe(503);
    expect(await first.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(logError).toHaveBeenCalledWith('API failed to start: TypeError');
    expect(JSON.stringify(logError.mock.calls)).not.toContain('secret-ish');
    expect((await fetch(`${base}/api/v1/health`)).status).toBe(200); // fresh build, now healthy
    expect(attempts).toBe(2);
  });

  it('HEAD, a CORS preflight and an over-limit body go through the normal app rules', async () => {
    const base = await serve(
      createServerlessHandler({
        readEnv: () =>
          loadEnv({
            NODE_ENV: 'test',
            CORS_ORIGINS: 'https://theonetrust.example',
            BODY_LIMIT_BYTES: '2048',
          }),
        configure: addProbes,
      }),
    );
    expect((await fetch(`${base}/api/v1/health`, { method: 'HEAD' })).status).toBe(200);
    const preflight = await fetch(`${base}/api/v1/__probe`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://theonetrust.example',
        'access-control-request-method': 'POST',
      },
    });
    expect(preflight.status).toBeLessThan(300);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      'https://theonetrust.example',
    );
    const big = await fetch(`${base}/api/v1/__probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: 'y'.repeat(4096) }),
    });
    expect(big.status).toBe(413);
    expect(await big.text()).not.toMatch(/at \w+ \(|node_modules|\.ts:\d/); // no stack trace
  });

  it('exports a ready-to-use default handler for Vercel', () => {
    expect(typeof defaultHandler).toBe('function');
  });
});
