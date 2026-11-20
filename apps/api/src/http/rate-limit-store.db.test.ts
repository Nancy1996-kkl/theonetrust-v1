import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import { loadEnv } from '../config/env.ts';
import { useTestDb } from '../test/db.ts';

/**
 * Phase 2c: on Vercel each serverless instance has its own memory. Routes with their own limit
 * must count in Postgres, so two instances (two apps on one database here) share one counter.
 */
const db = useTestDb();
const env = loadEnv({ NODE_ENV: 'test' });
/** Same key for every app here: they behave like serverless instances of one deployment. */
const sharedKey = randomBytes(32);
const apps: FastifyInstance[] = [];
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

let ip = 0;
const nextIp = () => `10.77.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;

/** One "instance": the app with test routes registered before it is ready. */
async function instance(): Promise<FastifyInstance> {
  const app = buildApp(env, { db, rateLimitKey: sharedKey });
  // Registered as a plugin, like the real routes, so the rate-limit plugin is loaded first.
  app.register(async (scope) => {
    scope.get(
      '/api/v1/__limited',
      { config: { rateLimit: { max: 3, timeWindow: 60_000 } } },
      async () => ({ ok: true }),
    );
    scope.get(
      '/api/v1/__short',
      { config: { rateLimit: { max: 1, timeWindow: 1_000 } } },
      async () => ({ ok: true }),
    );
    scope.post(
      '/api/v1/auth/__limited',
      { config: { rateLimit: { max: 3, timeWindow: 60_000 } } },
      async () => ({ ok: true }),
    );
    scope.get('/api/v1/__global', async () => ({ ok: true })); // no own limit: in memory
  });
  await app.ready();
  apps.push(app);
  return app;
}

const get = (app: FastifyInstance, url: string, remoteAddress: string) =>
  app.inject({ method: 'GET', url, remoteAddress });

describe('shared rate limits (Phase 2c)', () => {
  it('two instances share ONE counter: the 4th request is refused, whichever instance gets it', async () => {
    const [a, b] = [await instance(), await instance()];
    const client = nextIp();
    const codes = [];
    for (const app of [a, b, a, b])
      codes.push((await get(app, '/api/v1/__limited', client)).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    const refused = await get(b, '/api/v1/__limited', client);
    expect(refused.statusCode).toBe(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(refused.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    // Another client and another route have their own counters.
    expect((await get(a, '/api/v1/__limited', nextIp())).statusCode).toBe(200);
  });

  it('a new window starts when the old one ends (database clock)', async () => {
    const app = await instance();
    const client = nextIp();
    expect((await get(app, '/api/v1/__short', client)).statusCode).toBe(200);
    expect((await get(app, '/api/v1/__short', client)).statusCode).toBe(429);
    await new Promise((r) => setTimeout(r, 1_100));
    expect((await get(app, '/api/v1/__short', client)).statusCode).toBe(200);
  });

  it('never stores a raw IP: keys are 64-hex HMACs; the global limit writes nothing', async () => {
    const app = await instance();
    const client = nextIp();
    const before = await db.rateLimitBucket.count();
    await get(app, '/api/v1/__global', client);
    expect(await db.rateLimitBucket.count()).toBe(before); // memory only
    await get(app, '/api/v1/__limited', client);
    const rows = await db.rateLimitBucket.findMany();
    expect(rows.length).toBe(before + 1);
    for (const row of rows) {
      expect(row.key).toMatch(/^[0-9a-f]{64}$/);
      expect(row.key).not.toContain(client);
    }
  });

  it('database down: public routes stay open, sign-in routes refuse (fail closed)', async () => {
    const app = await instance();
    const spy = vi.spyOn(db, '$queryRawUnsafe').mockRejectedValue(new Error('db down'));
    try {
      const client = nextIp();
      for (let i = 0; i < 5; i++) {
        expect((await get(app, '/api/v1/__limited', client)).statusCode).toBe(200);
      }
      const signIn = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/__limited',
        remoteAddress: client,
      });
      expect(signIn.statusCode).toBe(429);
    } finally {
      spy.mockRestore();
    }
  });
});
