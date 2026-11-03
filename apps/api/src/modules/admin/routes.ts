import type { FastifyInstance } from 'fastify';
import type { AdminSessionUser } from '@theonetrust/contracts';
import { AppError, errorBody } from '../../http/errors.ts';
import type { AdminGuard } from './guard.ts';

export interface AdminRouteOptions {
  guard: AdminGuard;
  /** Look up the signed-in owner; undefined when no database is configured. */
  findUser?: (
    id: string,
  ) => Promise<{ email: string; role: 'OWNER' | 'STAFF'; locale: 'ta' | 'en' } | null>;
}

/**
 * `/api/v1/admin/*`. The guard runs on EVERY request in this scope — including unknown paths,
 * which answer 401 (not 404) without a session so the admin surface cannot be probed.
 * Feature modules (#20+) register their admin routes inside this plugin.
 */
export async function adminRoutes(app: FastifyInstance, opts: AdminRouteOptions) {
  app.addHook('onRequest', opts.guard);

  app.setNotFoundHandler({ preHandler: opts.guard }, (request, reply) => {
    reply.code(404).send(errorBody('NOT_FOUND', request.id));
  });

  app.get('/me', async (request): Promise<AdminSessionUser> => {
    const user = request.admin && (await opts.findUser?.(request.admin.userId));
    if (!user) throw new AppError('UNAUTHORIZED');
    return { email: user.email, role: user.role, locale: user.locale };
  });
}
