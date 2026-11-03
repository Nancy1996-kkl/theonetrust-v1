import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../http/errors.ts';
import {
  type AuthHttpContext,
  assertSameSite,
  clearSessionCookie,
  readSessionToken,
} from '../auth/http.ts';
import type { AuthService, ResolvedSession } from '../auth/service.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the admin guard on every `/api/v1/admin/*` request that reaches a handler. */
    admin?: { userId: string; role: 'OWNER' | 'STAFF'; sessionId: string };
  }
}

export type AdminGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * The API-side lock on the owner dashboard. Order matters: no cookie → 401 before anything
 * else, so unauthenticated callers learn nothing (not even whether the service is configured).
 */
export function adminGuard(
  deps: { ctx: AuthHttpContext; service: AuthService } | undefined,
  production: boolean,
): AdminGuard {
  return async (request, reply) => {
    const token = readSessionToken(request, production);
    if (!token) throw new AppError('UNAUTHORIZED');
    if (!deps) throw new AppError('SERVICE_UNAVAILABLE');
    const resolved: ResolvedSession | null = await deps.service.resolve(token);
    if (!resolved) {
      clearSessionCookie(reply, deps.ctx);
      throw new AppError('UNAUTHORIZED');
    }
    // Password alone is never enough: the owner must finish the authenticator step.
    if (resolved.stage !== 'ACTIVE') throw new AppError('MFA_REQUIRED');
    assertSameSite(request, deps.ctx, token);
    request.admin = {
      userId: resolved.user.id,
      role: resolved.user.role,
      sessionId: resolved.session.id,
    };
  };
}
