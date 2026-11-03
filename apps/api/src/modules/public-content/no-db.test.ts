import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';

describe('public content without a database', () => {
  it.each(['/site-content', '/programmes', '/transparency-documents'])(
    '%s answers 503',
    async (path) => {
      const app = buildApp(loadEnv({ NODE_ENV: 'test' }));
      const res = await app.inject({ method: 'GET', url: `/api/v1/public${path}?locale=ta` });
      expect(res.statusCode).toBe(503);
      expect(res.headers['cache-control']).toBe('no-store');
      await app.close();
    },
  );

  it('rejects an unsupported locale or extra parameters', async () => {
    const app = buildApp(loadEnv({ NODE_ENV: 'test' }));
    for (const query of ['locale=fr', 'locale=en&draft=1']) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/public/programmes?${query}` });
      expect(res.statusCode).toBe(400);
    }
    await app.close();
  });
});
