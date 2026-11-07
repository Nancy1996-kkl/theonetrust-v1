import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { healthRoutes } from './health.ts';

/** Readiness for uptime monitoring (#39). */
async function app(ping?: () => Promise<unknown>) {
  const a = Fastify();
  await a.register(healthRoutes, { version: 't', ping });
  return a;
}

describe('/health/ready', () => {
  it('is 200 when the database answers', async () => {
    const res = await (await app(async () => 1)).inject('/health/ready');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('is 503 when the database fails or is not configured — without details', async () => {
    const down = await (
      await app(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.1:5432');
      })
    ).inject('/health/ready');
    expect(down.statusCode).toBe(503);
    expect(down.json()).toEqual({ status: 'unavailable', database: 'error' });
    expect(down.body).not.toContain('ECONNREFUSED');
    const none = await (await app()).inject('/health/ready');
    expect(none.statusCode).toBe(503);
    expect(none.json()).toEqual({ status: 'unavailable', database: 'not_configured' });
  });

  it('liveness stays 200 either way', async () => {
    expect((await (await app()).inject('/health')).statusCode).toBe(200);
  });
});
