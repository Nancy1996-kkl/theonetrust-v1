import { buildApp } from './app.ts';
import { EnvValidationError, loadEnv } from './config/env.ts';
import { createDb } from './db/client.ts';
import { outboxDeps } from './modules/notifications/deps.ts';
import { startOutboxWorker } from './modules/notifications/schedule.ts';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = env.DATABASE_URL ? createDb(env.DATABASE_URL, {}, env.DATABASE_SCHEMA) : undefined;
  const app = buildApp(env, db ? { db } : {});
  // Notification outbox (#30): sends queued emails (and Google Sheet rows) outside any payment
  // transaction, on a timer. On Vercel the serverless entry and the daily job do this instead.
  const outbox = db ? outboxDeps(env, db) : undefined;
  const stopWorker = outbox
    ? startOutboxWorker(outbox, env.EMAIL_WORKER_INTERVAL_MS, app.log)
    : undefined;
  app.addHook('onClose', async () => {
    stopWorker?.();
    await db?.$disconnect();
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
}

main().catch((error: unknown) => {
  // Env errors list variable names only, never their values.
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
