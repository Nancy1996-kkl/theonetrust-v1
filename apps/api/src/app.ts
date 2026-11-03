import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { API_V1_PREFIX, CSRF_HEADER } from '@theonetrust/contracts';
import type { Env } from './config/env.ts';
import type { Db } from './db/client.ts';
import { AppError, codeFor, errorBody } from './http/errors.ts';
import { registerRawBodyJsonParser } from './http/raw-body.ts';
import { registerSecurityHeaders } from './http/security.ts';
import { adminGuard } from './modules/admin/guard.ts';
import { adminRoutes } from './modules/admin/routes.ts';
import type { AuthHttpContext } from './modules/auth/http.ts';
import { authRepository } from './modules/auth/repository.ts';
import { authRoutes, unavailableAuthRoutes } from './modules/auth/routes.ts';
import { authService } from './modules/auth/service.ts';
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
  'req.headers["x-razorpay-signature"]',
  'res.headers["set-cookie"]',
  ...PII_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

export interface BuildAppOptions {
  /** Tests capture log lines here to assert on redaction. Defaults to stdout. */
  logStream?: Writable;
  /** Database client (from src/db/client.ts). Without it, sign-in answers 503. */
  db?: Db;
  /** Clock, injectable for session-expiry and authenticator tests. */
  now?: () => Date;
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
    trustProxy: production,
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
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', CORRELATION_HEADER, CSRF_HEADER, 'idempotency-key'],
    exposedHeaders: [CORRELATION_HEADER, 'retry-after'],
    credentials: true,
    maxAge: 600,
  });

  // Per-IP limit on every route; routes can set a stricter `config.rateLimit`.
  app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: () => new AppError('RATE_LIMITED'),
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

  app.register(healthRoutes, { prefix: API_V1_PREFIX, version: APP_VERSION });

  // Owner sign-in (#19). Needs both a database and AUTH_SECRET_KEY; otherwise it is closed (503).
  app.register(cookie);
  const keys = env.AUTH_SECRET_KEY ? deriveAuthKeys(env.AUTH_SECRET_KEY) : undefined;
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
    ...(auth && options.db && { db: options.db }),
  });

  return app;
}
