import { createHmac, randomBytes } from 'node:crypto';
import type { FastifyRateLimitOptions, FastifyRateLimitStore } from '@fastify/rate-limit';
import type { Db } from '../db/client.ts';
import { qualified } from '../db/client.ts';

/**
 * Shared rate limits (Phase 2c). On Vercel many short-lived instances serve the API, each with its
 * own memory, so an in-memory counter lets an attacker spread across instances (or wait for a cold
 * start). Routes that set their own `config.rateLimit` — sign-in, donations, payment status,
 * receipts, help — count in Postgres instead, so every instance shares one counter. The global
 * per-request limit stays in memory: cheap, and only a first layer.
 *
 * - The stored key is HMAC(secret, route + client key): never a raw IP.
 * - One atomic upsert per request; the window uses the database clock, so instances agree.
 * - If the database fails: routes in `failClosedPrefixes` (sign-in) refuse the request;
 *   every other route lets it through (logged), so a database blip never blocks donors.
 */
export interface SharedStoreOptions {
  db: Db;
  /** HMAC key (from AUTH_SECRET_KEY). Without one, a random per-process key is used. */
  hashKey?: Buffer;
  failClosedPrefixes?: readonly string[];
  onError?: (error: unknown, route: string) => void;
}

interface Counter {
  current: number;
  ttl: number;
}
type Callback = (error: Error | null, result?: Counter) => void;

/** In-memory fallback for the global limit (same behaviour as the plugin's own store). */
class MemoryCounter {
  private readonly hits = new Map<string, { count: number; start: number }>();

  incr(key: string, timeWindow: number): Counter {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.start + timeWindow <= now) {
      if (this.hits.size > 10_000) this.hits.clear(); // bounded memory
      this.hits.set(key, { count: 1, start: now });
      return { current: 1, ttl: timeWindow };
    }
    entry.count += 1;
    return { current: entry.count, ttl: entry.start + timeWindow - now };
  }
}

export function sharedRateLimitStore(options: SharedStoreOptions) {
  const hashKey = options.hashKey ?? randomBytes(32);
  const failClosed = options.failClosedPrefixes ?? ['/api/v1/auth/'];

  async function hit(key: string, timeWindow: number): Promise<Counter> {
    const table = qualified('rate_limit_buckets');
    // One statement: start a new window when the old one has ended, otherwise count up.
    const rows = await options.db.$queryRawUnsafe<Array<{ hits: number; ttl_ms: number }>>(
      `INSERT INTO ${table} AS b (key, window_start, hits) VALUES ($1, now(), 1)
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN b.window_start + make_interval(secs => $2 / 1000.0) <= now()
                     THEN 1 ELSE b.hits + 1 END,
         window_start = CASE WHEN b.window_start + make_interval(secs => $2 / 1000.0) <= now()
                     THEN now() ELSE b.window_start END
       RETURNING hits,
         GREATEST(0, CEIL(EXTRACT(EPOCH FROM (window_start
           + make_interval(secs => $2 / 1000.0) - now())) * 1000))::int AS ttl_ms`,
      key,
      timeWindow,
    );
    const row = rows[0];
    if (!row) throw new Error('rate limit upsert returned nothing');
    return { current: Number(row.hits), ttl: Number(row.ttl_ms) };
  }

  /** A store for one route: shared in Postgres when the route sets its own limit. */
  function routeStore(
    url: string,
    method: string,
    shared: boolean,
    memory: MemoryCounter,
  ): FastifyRateLimitStore {
    const route = `${method} ${url}`.trim();
    const closed = failClosed.some((prefix) => url.startsWith(prefix));
    return {
      incr(clientKey: string, callback: Callback, timeWindow: number, max: number) {
        if (!shared) {
          callback(null, memory.incr(`${route}|${clientKey}`, timeWindow));
          return;
        }
        const key = createHmac('sha256', hashKey).update(`${route}|${clientKey}`).digest('hex');
        hit(key, timeWindow).then(
          (counter) => callback(null, counter),
          (error: unknown) => {
            options.onError?.(error, route);
            // Fail closed for sign-in (count as over the limit), open for everything else.
            callback(null, { current: closed ? max + 1 : 1, ttl: timeWindow });
          },
        );
      },
      child(routeOptions: FastifyRateLimitOptions & { routeInfo?: unknown }) {
        const info = routeOptions.routeInfo as
          | { url?: string; method?: string | string[]; config?: { rateLimit?: unknown } }
          | undefined;
        const ownLimit = Boolean(info?.config?.rateLimit);
        const method = Array.isArray(info?.method) ? info.method.join(',') : (info?.method ?? '');
        return routeStore(info?.url ?? url, method, ownLimit, memory);
      },
    } as FastifyRateLimitStore;
  }

  /**
   * The constructor @fastify/rate-limit expects (`store` option). `new` on a function that returns
   * an object yields that object: the global, in-memory store.
   */
  function SharedRateLimitStore(): FastifyRateLimitStore {
    return routeStore('global', '', false, new MemoryCounter());
  }
  return SharedRateLimitStore as unknown as new (
    options: FastifyRateLimitOptions,
  ) => FastifyRateLimitStore;
}
