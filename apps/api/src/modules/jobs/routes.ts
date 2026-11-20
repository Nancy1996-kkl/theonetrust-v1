import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../http/errors.ts';
import { runDailyJobs, type DailyJobDeps } from './daily.ts';

/**
 * `GET /api/v1/internal/jobs/daily` (Phase 2d). Vercel Cron calls it once a day with
 * `Authorization: Bearer <CRON_SECRET>`. Without the right secret it answers 404 (the route is not
 * advertised); without CRON_SECRET configured it is always 404. No cookies, so no CSRF.
 */
export async function jobRoutes(
  app: FastifyInstance,
  opts: { cronSecret?: string | undefined; deps?: DailyJobDeps | undefined },
) {
  const expected = opts.cronSecret ? Buffer.from(`Bearer ${opts.cronSecret}`) : undefined;

  app.get(
    '/jobs/daily',
    { config: { rateLimit: { max: 10, timeWindow: 3_600_000 } } },
    async (request) => {
      const given = Buffer.from(String(request.headers.authorization ?? ''));
      const allowed =
        expected !== undefined &&
        given.length === expected.length &&
        timingSafeEqual(given, expected);
      if (!allowed || !opts.deps) throw new AppError('NOT_FOUND');
      const report = await runDailyJobs(opts.deps);
      request.log.info({ report }, 'Daily jobs finished');
      return report;
    },
  );
}
