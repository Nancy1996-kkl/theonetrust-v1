import { processDueNotifications, type WorkerDeps } from './worker.ts';

/** Runs the worker on a timer; one pass at a time. Returns a stop function. */
export function startOutboxWorker(
  deps: WorkerDeps,
  intervalMs: number,
  log: { error: (obj: object, msg: string) => void },
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processDueNotifications(deps)
      .catch((err: unknown) => log.error({ err }, 'Notification worker pass failed'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
