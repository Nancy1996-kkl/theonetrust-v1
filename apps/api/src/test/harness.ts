import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { API_V1_PREFIX } from '@theonetrust/contracts';
import { buildApp } from '../app.ts';
import { loadEnv } from '../config/env.ts';

export interface TestApp {
  app: FastifyInstance;
  /** Every log line written so far, parsed. */
  logs: () => Array<Record<string, unknown>>;
}

/**
 * Integration harness: a real app (all hooks, plugins and handlers) with test env defaults.
 * Register extra routes through `routes` — they run inside the app before it is ready.
 * Callers must `await app.close()`.
 */
export async function createTestApp(
  env: Record<string, string> = {},
  routes?: (app: FastifyInstance) => void,
): Promise<TestApp> {
  const lines: string[] = [];
  const logStream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
      callback();
    },
  });
  const app = buildApp(loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'info', ...env }), { logStream });
  if (routes) app.register(async (scoped) => routes(scoped), { prefix: API_V1_PREFIX });
  await app.ready();
  return { app, logs: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
}
