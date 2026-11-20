import type { Db } from '../../db/client.ts';
import type { PaymentProvider } from '../donations/provider.ts';
import { processDueNotifications, type WorkerDeps } from '../notifications/worker.ts';
import { recheckAttempt } from '../payments/recheck.ts';

/**
 * The daily safety net (Phase 2d). Vercel's free plan runs a cron once a day; the serverless
 * function also drains the outbox right after payments, so this job only catches what slipped:
 *
 * 1. outbox: send every due email / sheet row (the worker claims rows, so overlapping runs never
 *    send twice);
 * 2. payments: re-check with the gateway every online donation still unsettled after
 *    RECHECK_MIN_AGE_MS and younger than RECHECK_MAX_AGE_MS (a lost webhook or closed tab);
 * 3. housekeeping: delete rate-limit counters whose window ended long ago.
 *
 * Each step runs on its own: one failing never stops the others. The report holds counts and
 * error NAMES only — no personal data.
 */
export const RECHECK_MIN_AGE_MS = 15 * 60_000;
export const RECHECK_MAX_AGE_MS = 7 * 86_400_000;
export const RECHECK_BATCH = 50;
export const OUTBOX_MAX_PASSES = 10;
export const RATE_LIMIT_KEEP_MS = 86_400_000;

export interface DailyJobDeps {
  db: Db;
  outbox?: WorkerDeps | undefined;
  provider?: PaymentProvider | undefined;
  now: () => Date;
}

type Step<T> = { ok: true; skipped?: string } & T;
type Failed = { ok: false; error: string };

export interface DailyReport {
  outbox: Step<{ sent: number; retrying: number; failed: number }> | Failed;
  payments: Step<{ checked: number; paid: number }> | Failed;
  rateLimits: Step<{ deleted: number }> | Failed;
}

const failed = (error: unknown): Failed => ({
  ok: false,
  error: error instanceof Error ? error.name : 'unknown',
});

async function drainOutbox(outbox: WorkerDeps | undefined) {
  if (!outbox)
    return { ok: true as const, skipped: 'no_email_or_sheet', sent: 0, retrying: 0, failed: 0 };
  const total = { sent: 0, retrying: 0, failed: 0 };
  for (let pass = 0; pass < OUTBOX_MAX_PASSES; pass++) {
    const r = await processDueNotifications(outbox);
    total.sent += r.sent;
    total.retrying += r.retrying;
    total.failed += r.failed;
    if (r.sent + r.retrying + r.failed + r.cancelled === 0) break;
  }
  return { ok: true as const, ...total };
}

async function recheckUnsettled(deps: DailyJobDeps) {
  if (!deps.provider) return { ok: true as const, skipped: 'no_gateway', checked: 0, paid: 0 };
  const now = deps.now().getTime();
  const intents = await deps.db.donationIntent.findMany({
    where: {
      channel: 'CHECKOUT',
      status: { in: ['CREATED', 'PENDING', 'AUTHORIZED'] },
      createdAt: {
        lte: new Date(now - RECHECK_MIN_AGE_MS),
        gte: new Date(now - RECHECK_MAX_AGE_MS),
      },
      paymentAttempts: { some: {} },
    },
    include: { paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'asc' },
    take: RECHECK_BATCH,
  });
  let paid = 0;
  for (const intent of intents) {
    const attempt = intent.paymentAttempts[0];
    if (!attempt) continue;
    try {
      const { status } = await recheckAttempt(deps.db, deps.provider, attempt, deps.now());
      if (status === 'PAID') paid += 1;
    } catch {
      // Gateway error for one donation: leave it as it is (never a guess); the next run retries.
    }
  }
  return { ok: true as const, checked: intents.length, paid };
}

export async function runDailyJobs(deps: DailyJobDeps): Promise<DailyReport> {
  const [outbox, payments, rateLimits] = await Promise.all([
    drainOutbox(deps.outbox).catch(failed),
    recheckUnsettled(deps).catch(failed),
    deps.db.rateLimitBucket
      .deleteMany({
        where: { windowStart: { lt: new Date(deps.now().getTime() - RATE_LIMIT_KEEP_MS) } },
      })
      .then((r) => ({ ok: true as const, deleted: r.count }))
      .catch(failed),
  ]);
  return { outbox, payments, rateLimits };
}
