import { buildApp } from './app.ts';
import { EnvValidationError, loadEnv } from './config/env.ts';
import { createDb } from './db/client.ts';
import { selectEmailProvider } from './modules/notifications/provider.ts';
import { startOutboxWorker } from './modules/notifications/schedule.ts';
import { deriveAuthKeys } from './security/crypto.ts';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = env.DATABASE_URL ? createDb(env.DATABASE_URL) : undefined;
  const app = buildApp(env, db ? { db } : {});
  // Notification outbox (#30): sends queued emails outside any payment transaction.
  const provider = selectEmailProvider(env);
  const stopWorker =
    db && provider
      ? startOutboxWorker(
          {
            db,
            provider,
            ownerEmail: env.OWNER_NOTIFICATION_EMAIL,
            siteUrl: env.PUBLIC_SITE_URL ?? env.CORS_ORIGINS[0] ?? 'http://localhost:5173',
            receiptKey: env.AUTH_SECRET_KEY
              ? deriveAuthKeys(env.AUTH_SECRET_KEY).receipt
              : undefined,
            now: () => new Date(),
          },
          env.EMAIL_WORKER_INTERVAL_MS,
          app.log,
        )
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
