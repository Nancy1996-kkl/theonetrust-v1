import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@theonetrust/contracts';

export interface HealthRouteOptions {
  version: string;
  /** Checked by /health/ready (#39) so uptime monitoring sees a database outage. */
  ping?: (() => Promise<unknown>) | undefined;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, opts) => {
  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    service: 'theonetrust-api',
    version: opts.version,
    time: new Date().toISOString(),
  }));

  /** Readiness for uptime monitoring (#39): 200 only when the database answers. */
  app.get('/health/ready', async (_request, reply) => {
    if (!opts.ping)
      return reply.code(503).send({ status: 'unavailable', database: 'not_configured' });
    try {
      await opts.ping();
      return { status: 'ok', database: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: 'error' });
    }
  });
};
