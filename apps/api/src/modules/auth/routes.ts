import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  AdminSessionResponse,
  MfaEnableResponse,
  MfaSetupResponse,
} from '@theonetrust/contracts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { PASSWORD_MAX_LENGTH } from './passwords.ts';
import {
  type AuthHttpContext,
  assertSameSite,
  clearSessionCookie,
  readSessionToken,
  sessionResponse,
  setSessionCookie,
} from './http.ts';
import type { AuthService, ResolvedSession } from './service.ts';

const LoginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

const CodeBody = z.object({ code: z.string().trim().min(6).max(20) });

/** Stricter than the global limit: brute-force protection on the sign-in steps (per IP). */
const SIGN_IN_LIMIT = { rateLimit: { max: 10, timeWindow: 15 * 60_000 } };

export interface AuthRouteOptions {
  ctx: AuthHttpContext;
  service: AuthService;
}

/** `/api/v1/auth/*` — public by design; everything under `/api/v1/admin/*` is guarded. */
export async function authRoutes(app: FastifyInstance, { ctx, service }: AuthRouteOptions) {
  async function current(
    request: FastifyRequest,
  ): Promise<{ token: string; resolved: ResolvedSession }> {
    const token = readSessionToken(request, ctx.production);
    const resolved = await service.resolve(token);
    if (!token || !resolved) throw new AppError('UNAUTHORIZED');
    assertSameSite(request, ctx, token);
    return { token, resolved };
  }

  app.get('/session', async (request, reply): Promise<AdminSessionResponse> => {
    const token = readSessionToken(request, ctx.production);
    const resolved = await service.resolve(token);
    if (!token || !resolved) {
      if (request.cookies && Object.keys(request.cookies).length > 0)
        clearSessionCookie(reply, ctx);
      return { stage: 'SIGNED_OUT' };
    }
    return sessionResponse(ctx, token, resolved);
  });

  app.post(
    '/login',
    { config: SIGN_IN_LIMIT },
    async (request, reply): Promise<AdminSessionResponse> => {
      assertSameSite(request, ctx, undefined);
      const body = parseInput(LoginBody, request.body);
      // A new sign-in replaces whatever session this browser had.
      const previous = await service.resolve(readSessionToken(request, ctx.production));
      if (previous) await service.logout(previous, request.id);
      const issued = await service.login(body.email, body.password, request.id);
      setSessionCookie(reply, ctx, issued);
      return sessionResponse(ctx, issued.token, issued);
    },
  );

  app.post('/mfa/setup', { config: SIGN_IN_LIMIT }, async (request): Promise<MfaSetupResponse> => {
    const { resolved } = await current(request);
    return service.beginMfaSetup(resolved);
  });

  app.post(
    '/mfa/enable',
    { config: SIGN_IN_LIMIT },
    async (request, reply): Promise<MfaEnableResponse> => {
      const { resolved } = await current(request);
      const { code } = parseInput(CodeBody, request.body);
      const issued = await service.enableMfa(resolved, code, request.id);
      setSessionCookie(reply, ctx, issued);
      return { ...sessionResponse(ctx, issued.token, issued), recoveryCodes: issued.recoveryCodes };
    },
  );

  app.post(
    '/mfa/verify',
    { config: SIGN_IN_LIMIT },
    async (request, reply): Promise<AdminSessionResponse> => {
      const { resolved } = await current(request);
      const { code } = parseInput(CodeBody, request.body);
      const issued = await service.verifyMfa(resolved, code, request.id);
      setSessionCookie(reply, ctx, issued);
      return sessionResponse(ctx, issued.token, issued);
    },
  );

  app.post('/logout', async (request, reply) => {
    const token = readSessionToken(request, ctx.production);
    const resolved = await service.resolve(token);
    if (token && resolved) {
      assertSameSite(request, ctx, token);
      await service.logout(resolved, request.id);
    }
    clearSessionCookie(reply, ctx);
    return reply.code(204).send();
  });
}

/** Without a database or AUTH_SECRET_KEY, sign-in is unavailable — never silently open. */
export async function unavailableAuthRoutes(app: FastifyInstance) {
  const unavailable = async () => {
    throw new AppError('SERVICE_UNAVAILABLE');
  };
  app.get('/session', unavailable);
  for (const path of ['/login', '/mfa/setup', '/mfa/enable', '/mfa/verify', '/logout']) {
    app.post(path, unavailable);
  }
}
