import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { API_V1_PREFIX } from '@theonetrust/contracts';
import type { Env } from './config/env.ts';
import { AppError, codeFor, errorBody } from './http/errors.ts';
import { registerRawBodyJsonParser } from './http/raw-body.ts';
import { registerSecurityHeaders } from './http/security.ts';
import { healthRoutes } from './routes/health.ts';

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
}

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
    allowedHeaders: ['content-type', CORRELATION_HEADER, 'idempotency-key'],
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

  return app;
}
