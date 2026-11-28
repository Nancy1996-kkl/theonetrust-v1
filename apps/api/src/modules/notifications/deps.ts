import type { Env } from '../../config/env.ts';
import type { Db } from '../../db/client.ts';
import { deriveAuthKeys } from '../../security/crypto.ts';
import { selectEmailProvider } from './provider.ts';
import { selectSheetProvider } from './sheet.ts';
import type { WorkerDeps } from './worker.ts';

/**
 * What the notification outbox needs to send (emails, Google Sheet rows). One definition for the
 * long-running server's timer, the serverless inline drain and the daily job (Phase 2d).
 * Undefined when neither an email provider nor a sheet is configured: rows then wait, safely.
 */
export function outboxDeps(env: Env, db: Db): WorkerDeps | undefined {
  const provider = selectEmailProvider(env);
  const sheet = selectSheetProvider(env);
  if (!provider && !sheet) return undefined;
  const keys = env.AUTH_SECRET_KEY ? deriveAuthKeys(env.AUTH_SECRET_KEY) : undefined;
  return {
    db,
    provider,
    sheet,
    ownerEmail: env.OWNER_NOTIFICATION_EMAIL,
    siteUrl: env.PUBLIC_SITE_URL ?? env.CORS_ORIGINS[0] ?? 'http://localhost:5173',
    receiptKey: keys?.receipt,
    now: () => new Date(),
  };
}
