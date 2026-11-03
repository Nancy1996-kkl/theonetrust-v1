import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';
import { sessionCookieName, sessionCookieOptions } from './session-cookie.ts';

let app: FastifyInstance;
afterEach(async () => {
  await app.close();
});

/** Every route the app registers under /api/v1/admin, collected as Fastify adds them. */
async function adminRoutesOf(instance: FastifyInstance) {
  const found: Array<{ method: string; url: string }> = [];
  instance.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/api/v1/admin')) return;
    for (const method of [route.method].flat()) {
      if (method !== 'HEAD') found.push({ method, url: route.url });
    }
  });
  await instance.ready();
  return found;
}

describe('admin API without a session', () => {
  it('answers 401 on every registered /api/v1/admin route', async () => {
    app = buildApp(loadEnv({ NODE_ENV: 'test' }));
    const routes = await adminRoutesOf(app);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const res = await app.inject({ method: route.method as 'GET', url: route.url });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    }
  });

  it.each(['GET', 'POST', 'DELETE'] as const)(
    'answers 401 (not 404) for unknown admin paths: %s',
    async (method) => {
      app = buildApp(loadEnv({ NODE_ENV: 'test' }));
      const res = await app.inject({ method, url: '/api/v1/admin/does-not-exist' });
      expect(res.statusCode).toBe(401);
    },
  );

  it('ignores a malformed session cookie', async () => {
    app = buildApp(loadEnv({ NODE_ENV: 'test' }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      cookies: { tot_admin: 'short' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('answers 503 (closed, never open) when a cookie is sent but sign-in is not configured', async () => {
    app = buildApp(loadEnv({ NODE_ENV: 'test' }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      cookies: { tot_admin: 'a'.repeat(43) },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it.each([
    ['GET', '/api/v1/auth/session'],
    ['POST', '/api/v1/auth/login'],
    ['POST', '/api/v1/auth/mfa/verify'],
    ['POST', '/api/v1/auth/logout'],
  ] as const)('%s %s answers 503 without a database or AUTH_SECRET_KEY', async (method, url) => {
    app = buildApp(loadEnv({ NODE_ENV: 'test' }));
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(503);
  });
});

describe('session cookie', () => {
  it('uses the __Host- prefix with Secure in production', () => {
    expect(sessionCookieName(true)).toBe('__Host-tot_admin');
    expect(sessionCookieOptions(true, 60)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60,
    });
  });

  it('works on http://localhost in development', () => {
    expect(sessionCookieName(false)).toBe('tot_admin');
    expect(sessionCookieOptions(false, 60)).toMatchObject({ httpOnly: true, secure: false });
  });
});
