/**
 * Vercel serverless entry (Phase 2a of docs/decisions/2026-11-20-cashfree-migration-plan.md).
 * `api/[...path].mjs` hands every /api request here; Fastify does the rest exactly as in
 * `server.ts` (which stays the entry for local development and CI). Behaviour proven on a
 * preview first: docs/research/2026-11-20-vercel-serverless-spike.md.
 *
 * Differences from the long-running server, all deliberate:
 * - no listen(), no signal handlers and no timers (the outbox is drained by a job in Phase 2d);
 * - the app and its database pool are built once per instance and reused across requests;
 * - a few database connections per instance (DB_POOL_MAX), short idle timeouts;
 * - a broken configuration answers 503 with the generic error body and logs only the names of
 *   the missing variables, never their values.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOptions } from './app.ts';
import { EnvValidationError, loadEnv, type Env } from './config/env.ts';
import { createDb } from './db/client.ts';

/**
 * Vercel's catch-all route adds the matched segments as a `path` query parameter
 * (`/api/v1/x?path=v1%2Fx`). Our routes never use a `path` query, and strict query validation
 * would refuse it, so it is removed; every other parameter is kept in order.
 */
export function stripCatchAllParam(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const kept = url
    .slice(q + 1)
    .split('&')
    .filter((pair) => pair !== '' && !/^path(=|$)/.test(pair));
  return kept.length > 0 ? `${url.slice(0, q)}?${kept.join('&')}` : url.slice(0, q);
}

const UNAVAILABLE = JSON.stringify({
  error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
});

export interface ServerlessOptions {
  /** Environment source (tests pass their own). */
  readEnv?: () => Env;
  /** Extra app options (tests inject a database or provider). */
  appOptions?: BuildAppOptions;
  /** Tests: add routes before the app is ready. */
  configure?: (app: FastifyInstance) => void;
  /** Where configuration errors are reported (names only). */
  logError?: (message: string) => void;
}

export function createServerlessHandler(options: ServerlessOptions = {}) {
  let ready: Promise<FastifyInstance | null> | undefined;

  async function init(): Promise<FastifyInstance | null> {
    let env: Env;
    try {
      env = (options.readEnv ?? (() => loadEnv()))();
    } catch (error) {
      const message = error instanceof EnvValidationError ? error.message : 'Invalid configuration';
      (options.logError ?? ((m) => console.error(m)))(message);
      return null;
    }
    const db =
      options.appOptions?.db ??
      (env.DATABASE_URL
        ? createDb(env.DATABASE_URL, {
            max: env.DB_POOL_MAX,
            idleTimeoutMillis: 5_000,
            connectionTimeoutMillis: 5_000,
          })
        : undefined);
    const app = buildApp(env, { ...options.appOptions, ...(db && { db }) });
    options.configure?.(app);
    await app.ready();
    return app;
  }

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    ready ??= init();
    const app = await ready;
    if (!app) {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(UNAVAILABLE);
      return;
    }
    if (req.url) req.url = stripCatchAllParam(req.url);
    app.server.emit('request', req, res);
  };
}

/** The handler Vercel runs (one per instance, reused across requests). */
export default createServerlessHandler();
