import { buildApp } from './app.ts';
import { EnvValidationError, loadEnv } from './config/env.ts';
import { createDb } from './db/client.ts';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = env.DATABASE_URL ? createDb(env.DATABASE_URL) : undefined;
  const app = buildApp(env, db ? { db } : {});
  app.addHook('onClose', async () => {
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
