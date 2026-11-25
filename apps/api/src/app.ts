import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { sharedRateLimitStore } from './http/rate-limit-store.ts';
import { jobRoutes } from './modules/jobs/routes.ts';
import { outboxDeps } from './modules/notifications/deps.ts';
import type { WorkerDeps } from './modules/notifications/worker.ts';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { API_V1_PREFIX, CSRF_HEADER } from '@theonetrust/contracts';
import type { Env } from './config/env.ts';
import type { Db } from './db/client.ts';
import { AppError, codeFor, errorBody } from './http/errors.ts';
import { registerRawBodyJsonParser } from './http/raw-body.ts';
import { registerSecurityHeaders } from './http/security.ts';
import { adminGuard } from './modules/admin/guard.ts';
import { adminRoutes } from './modules/admin/routes.ts';
import { documentFileRoutes } from './modules/cms/document-routes.ts';
import { localDocumentStore, type DocumentStore } from './modules/cms/storage.ts';
import type { AuthHttpContext } from './modules/auth/http.ts';
import { authRepository } from './modules/auth/repository.ts';
import { authRoutes, unavailableAuthRoutes } from './modules/auth/routes.ts';
import { authService } from './modules/auth/service.ts';
import { publicContentRepository } from './modules/public-content/repository.ts';
import { publicContentRoutes } from './modules/public-content/routes.ts';
import { helpPublicRoutes } from './modules/help/public-routes.ts';
import { donationRoutes } from './modules/donations/routes.ts';
import { paymentVerifyRoutes } from './modules/payments/verify-routes.ts';
import { cashfreeWebhookRoutes } from './modules/payments/cashfree-webhook-routes.ts';
import { cashfreeProvider } from './modules/donations/cashfree.ts';
import type { PaymentProvider } from './modules/donations/provider.ts';
import { receiptRoutes } from './modules/receipts/routes.ts';
import { healthRoutes } from './routes/health.ts';
import { deriveAuthKeys } from './security/crypto.ts';

export const APP_VERSION = '0.0.0';

export const CORRELATION_HEADER = 'x-correlation-id';
const SAFE_CORRELATION_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Personal data and secrets that must never reach a log line, at any of the first two depths. */
const PII_KEYS = [
  'phone',
  'mobile',
  'email',
  'pan',
  'address',
  'fullName',
  'donorName',
  'password',
  'otp',
  'token',
  'secret',
];

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-webhook-signature"]',
  'res.headers["set-cookie"]',
  ...PII_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

export interface BuildAppOptions {
  /** Tests: outbox settings for the daily job (defaults to the configured email/sheet). */
  outbox?: WorkerDeps;
  /** Tests: the shared rate-limit key; apps given the same key share counters (Phase 2c). */
  rateLimitKey?: Buffer;
  /** Tests: shorten the Idempotency-Key race wait (IDEMPOTENT_REPLAY_WAIT_MS). */
  idempotencyWaitMs?: number;
  /** Tests capture log lines here to assert on redaction. Defaults to stdout. */
  logStream?: Writable;
  /** Database client (from src/db/client.ts). Without it, sign-in answers 503. */
  db?: Db;
  /** Clock, injectable for session-expiry and authenticator tests. */
  now?: () => Date;
  /** Payment provider; defaults to Cashfree when PAYMENT_PROVIDER=cashfree and it is configured. */
  paymentProvider?: PaymentProvider;
  /** Private transparency-document storage (#36); defaults to DOCUMENT_STORAGE_DIR when set. */
  documentStore?: DocumentStore;
}

export const TOTP_ISSUER = 'Theonetrust.in';

/** Logs the path only: a query string could carry personal data even though we never put it there. */
function serializeRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: request.url.split('?', 1)[0] ?? '',
    correlationId: request.id,
  };
}

/**
 * Builds the Fastify app without listening, so tests can use app.inject().
 * Every module registers under the versioned prefix.
 */
export function buildApp(env: Env, options: BuildAppOptions = {}): FastifyInstance {
  const production = env.NODE_ENV === 'production';
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' && !options.logStream ? 'silent' : env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      serializers: { req: serializeRequest },
      ...(options.logStream && { stream: options.logStream }),
    },
    bodyLimit: env.BODY_LIMIT_BYTES,
    // Accept a well-formed caller correlation ID, otherwise generate one.
    genReqId: (req) => {
      const incoming = req.headers[CORRELATION_HEADER];
      return typeof incoming === 'string' && SAFE_CORRELATION_ID.test(incoming)
        ? incoming
        : randomUUID();
    },
    // Trust X-Forwarded-For only from the configured proxy addresses, never from anyone (#38).
    trustProxy: production && env.TRUST_PROXY !== 'none' ? env.TRUST_PROXY : false,
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header(CORRELATION_HEADER, request.id);
  });
  registerSecurityHeaders(app, production);
  registerRawBodyJsonParser(app);

  // Only the listed web origins may call the API from a browser. Others get no CORS headers.
  app.register(cors, {
    origin: (origin, callback) => {
      callback(null, origin === undefined || env.CORS_ORIGINS.includes(origin));
    },
    // Every method an API route uses; PUT is the owner's content draft (#36, found in #38).
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', CORRELATION_HEADER, CSRF_HEADER, 'idempotency-key'],
    exposedHeaders: [CORRELATION_HEADER, 'retry-after'],
    credentials: true,
    maxAge: 600,
  });

  // Per-IP limit on every route; routes can set a stricter `config.rateLimit`. With a database,
  // those stricter route limits are shared by every serverless instance (Phase 2c).
  app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: () => new AppError('RATE_LIMITED'),
    ...(options.db && {
      store: sharedRateLimitStore({
        db: options.db,
        // Tests: each app is its own "instance" unless a test passes one key to share counters.
        ...(options.rateLimitKey
          ? { hashKey: options.rateLimitKey }
          : env.NODE_ENV !== 'test' &&
            env.AUTH_SECRET_KEY && { hashKey: deriveAuthKeys(env.AUTH_SECRET_KEY).rateLimit }),
        onError: (error, route) =>
          app.log.warn(
            { route, reason: error instanceof Error ? error.name : 'unknown' },
            'Shared rate limit unavailable',
          ),
      }),
    }),
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send(errorBody('NOT_FOUND', request.id));
  });

  app.setErrorHandler((error, request, reply) => {
    const { status, code } = codeFor(error);
    if (status >= 500) request.log.error({ err: error }, 'Unhandled error');
    else request.log.info({ code, status }, 'Request rejected');
    const fields = error instanceof AppError ? error.fields : undefined;
    // Public responses stay generic; details live only in private logs.
    reply.code(status).send(errorBody(code, request.id, fields));
  });

  const pingDb = options.db;
  app.register(healthRoutes, {
    prefix: API_V1_PREFIX,
    version: APP_VERSION,
    ...(pingDb && { ping: () => pingDb.$queryRaw`SELECT 1` }),
  });

  // Purpose-specific keys from AUTH_SECRET_KEY (owner sign-in, CSRF, receipt links).
  const keys = env.AUTH_SECRET_KEY ? deriveAuthKeys(env.AUTH_SECRET_KEY) : undefined;

  // Donations (#23): the server owns intents, amounts and gateway orders.
  const siteUrl = env.PUBLIC_SITE_URL ?? env.CORS_ORIGINS[0] ?? 'http://localhost:5173';
  const paymentProvider =
    options.paymentProvider ??
    (env.PAYMENT_PROVIDER === 'cashfree' &&
    env.CASHFREE_CLIENT_ID &&
    env.CASHFREE_CLIENT_SECRET &&
    env.CASHFREE_ENV
      ? cashfreeProvider({
          clientId: env.CASHFREE_CLIENT_ID,
          clientSecret: env.CASHFREE_CLIENT_SECRET,
          mode: env.CASHFREE_ENV,
          apiVersion: env.CASHFREE_API_VERSION,
          siteUrl,
          ...(siteUrl.startsWith('https://') && {
            notifyUrl: `${siteUrl.replace(/\/+$/, '')}${API_V1_PREFIX}/webhooks/cashfree`,
          }),
          orderExpiryMinutes: env.CASHFREE_ORDER_EXPIRY_MINUTES,
          now: options.now ?? (() => new Date()),
        })
      : undefined);
  app.register(donationRoutes, {
    ...(options.idempotencyWaitMs !== undefined && {
      idempotencyWaitMs: options.idempotencyWaitMs,
    }),
    ...(keys && { encryption: { key: keys.encryption, version: keys.version } }),
    prefix: `${API_V1_PREFIX}/donation-intents`,
    perHour: env.DONATION_RATE_LIMIT_PER_HOUR,
    now: options.now ?? (() => new Date()),
    ...(options.db && { db: options.db }),
    ...(paymentProvider && { provider: paymentProvider }),
  });

  // Payment verification and donor status re-check (#26).
  // Daily safety-net job for Vercel Cron (Phase 2d): outbox, unsettled payments, housekeeping.
  app.register(jobRoutes, {
    prefix: `${API_V1_PREFIX}/internal`,
    cronSecret: env.CRON_SECRET,
    ...(options.db && {
      deps: {
        db: options.db,
        outbox: options.outbox ?? outboxDeps(env, options.db),
        provider: paymentProvider,
        now: options.now ?? (() => new Date()),
      },
    }),
  });

  app.register(paymentVerifyRoutes, {
    prefix: API_V1_PREFIX,
    verifyPerHour: env.DONATION_RATE_LIMIT_PER_HOUR * 3,
    statusPerHour: env.DONATION_RATE_LIMIT_PER_HOUR * 6,
    failedRecheckWindowMs: env.FAILED_RECHECK_WINDOW_MS,
    now: options.now ?? (() => new Date()),
    ...(keys && { receiptKey: keys.receipt }),
    ...(options.db && { db: options.db }),
    ...(paymentProvider && { provider: paymentProvider }),
  });

  // Cashfree webhook (Phase 4c): signed with the client secret; the order is always re-fetched.
  app.register(cashfreeWebhookRoutes, {
    prefix: `${API_V1_PREFIX}/webhooks`,
    now: options.now ?? (() => new Date()),
    reprocessAfterMs: env.WEBHOOK_REPROCESS_AFTER_MS,
    ...(options.db && { db: options.db }),
    ...(paymentProvider && { provider: paymentProvider }),
    ...(env.CASHFREE_CLIENT_SECRET && { secret: env.CASHFREE_CLIENT_SECRET }),
  });

  // Donation acknowledgements (#29): private share link + PDF on demand.
  app.register(receiptRoutes, {
    prefix: `${API_V1_PREFIX}/receipts`,
    siteUrl,
    perHour: env.RECEIPT_RATE_LIMIT_PER_HOUR,
    ...(options.db && { db: options.db }),
    ...(keys && { key: keys.receipt }),
  });

  // Get Help (#22): public submissions, rate-limited, honeypot, validated with the form's rules.
  app.register(helpPublicRoutes, {
    prefix: `${API_V1_PREFIX}/help-requests`,
    perHour: env.HELP_RATE_LIMIT_PER_HOUR,
    duplicateWindowMs: env.HELP_DUPLICATE_WINDOW_MINUTES * 60_000,
    now: options.now ?? (() => new Date()),
    ...(options.db && { db: options.db }),
    ...(env.OWNER_NOTIFICATION_EMAIL && { ownerEmail: env.OWNER_NOTIFICATION_EMAIL }),
  });

  // Public content for the landing page (#21): published records only.
  app.register(publicContentRoutes, {
    prefix: `${API_V1_PREFIX}/public`,
    cacheSeconds: env.PUBLIC_CACHE_SECONDS,
    ...(options.db && { repo: publicContentRepository(options.db) }),
    ...(env.PUBLIC_DOCUMENTS_BASE_URL && { documentsBaseUrl: env.PUBLIC_DOCUMENTS_BASE_URL }),
  });

  // Transparency files (#36): only PUBLISHED documents are ever served from private storage.
  const documentStore =
    options.documentStore ??
    (env.DOCUMENT_STORAGE_DIR ? localDocumentStore(env.DOCUMENT_STORAGE_DIR) : undefined);
  app.register(documentFileRoutes, {
    prefix: `${API_V1_PREFIX}/documents`,
    cacheSeconds: env.PUBLIC_CACHE_SECONDS,
    db: options.db,
    store: documentStore,
  });

  // Owner sign-in (#19). Needs both a database and AUTH_SECRET_KEY; otherwise it is closed (503).
  app.register(cookie);
  const auth =
    options.db && keys
      ? (() => {
          const ctx: AuthHttpContext = { production, allowedOrigins: env.CORS_ORIGINS, keys };
          const repo = authRepository(options.db);
          const service = authService(
            repo,
            {
              keys,
              idleMs: env.SESSION_IDLE_MINUTES * 60_000,
              maxMs: env.SESSION_MAX_HOURS * 3_600_000,
              pendingMs: 10 * 60_000,
              maxFailures: env.LOGIN_MAX_FAILURES,
              lockoutMs: env.LOGIN_LOCKOUT_MINUTES * 60_000,
              issuer: TOTP_ISSUER,
            },
            options.now ?? (() => new Date()),
          );
          return { ctx, service, repo };
        })()
      : undefined;
  if (auth) {
    app.register(authRoutes, {
      prefix: `${API_V1_PREFIX}/auth`,
      ctx: auth.ctx,
      service: auth.service,
    });
  } else {
    app.register(unavailableAuthRoutes, { prefix: `${API_V1_PREFIX}/auth` });
  }
  app.register(adminRoutes, {
    prefix: `${API_V1_PREFIX}/admin`,
    guard: adminGuard(auth && { ctx: auth.ctx, service: auth.service }, production),
    emailSending: env.EMAIL_PROVIDER !== 'none',
    paymentProvider,
    ...(keys && { receiptKey: keys.receipt, encryptionKey: keys.encryption }),
    staleAfterMinutes: env.ADMIN_STALE_PENDING_MINUTES,
    documents: {
      store: documentStore,
      maxBytes: env.DOCUMENT_MAX_BYTES,
      publicBaseUrl: env.PUBLIC_DOCUMENTS_BASE_URL,
    },
    ownerEmail: env.OWNER_NOTIFICATION_EMAIL,
    paymentStatus: {
      mode:
        env.PAYMENT_PROVIDER !== 'cashfree' || !env.CASHFREE_CLIENT_ID || !env.CASHFREE_ENV
          ? 'not_configured'
          : env.CASHFREE_ENV === 'production'
            ? 'live'
            : 'test',
      keyId: env.CASHFREE_CLIENT_ID,
      keySecretSet: Boolean(env.CASHFREE_CLIENT_SECRET),
      // Cashfree signs its webhooks with the client secret: no separate webhook secret exists.
      webhookSecretSet: Boolean(env.CASHFREE_CLIENT_SECRET),
    },
    now: options.now ?? (() => new Date()),
    ...(auth && options.db && { db: options.db }),
  });

  return app;
}
