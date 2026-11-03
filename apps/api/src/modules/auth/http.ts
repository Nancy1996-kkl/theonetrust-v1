import type { FastifyReply, FastifyRequest } from 'fastify';
import { CSRF_HEADER, type AdminSessionResponse } from '@theonetrust/contracts';
import { AppError } from '../../http/errors.ts';
import { safeEqual, type AuthKeys } from '../../security/crypto.ts';
import type { IssuedSession, ResolvedSession } from './service.ts';
import { csrfTokenFor, sessionCookieName, sessionCookieOptions } from './session-cookie.ts';

export interface AuthHttpContext {
  production: boolean;
  allowedOrigins: readonly string[];
  keys: AuthKeys;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function readSessionToken(request: FastifyRequest, production: boolean): string | undefined {
  const value = request.cookies[sessionCookieName(production)];
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

export function setSessionCookie(reply: FastifyReply, ctx: AuthHttpContext, issued: IssuedSession) {
  reply.setCookie(
    sessionCookieName(ctx.production),
    issued.token,
    sessionCookieOptions(ctx.production, issued.maxAgeSeconds),
  );
}

export function clearSessionCookie(reply: FastifyReply, ctx: AuthHttpContext) {
  reply.clearCookie(sessionCookieName(ctx.production), sessionCookieOptions(ctx.production, 0));
}

/**
 * Cross-site request checks for cookie-authenticated, state-changing requests:
 * 1. a browser `Origin`, when sent, must be one of our web origins;
 * 2. with a session, `x-csrf-token` must be the token bound to that session.
 * (The cookie is also SameSite=Strict — this is defence in depth.)
 */
export function assertSameSite(
  request: FastifyRequest,
  ctx: AuthHttpContext,
  sessionToken: string | undefined,
) {
  if (!UNSAFE.has(request.method)) return;
  const origin = request.headers.origin;
  if (origin !== undefined && !ctx.allowedOrigins.includes(origin)) {
    throw new AppError('CSRF_FAILED');
  }
  if (sessionToken === undefined) return;
  const sent = request.headers[CSRF_HEADER];
  if (typeof sent !== 'string' || !safeEqual(sent, csrfTokenFor(ctx.keys, sessionToken))) {
    throw new AppError('CSRF_FAILED');
  }
}

export function sessionResponse(
  ctx: AuthHttpContext,
  token: string,
  resolved: Pick<ResolvedSession, 'stage' | 'user'>,
): AdminSessionResponse {
  return {
    stage: resolved.stage,
    user: { email: resolved.user.email, role: resolved.user.role, locale: resolved.user.locale },
    csrfToken: csrfTokenFor(ctx.keys, token),
  };
}
