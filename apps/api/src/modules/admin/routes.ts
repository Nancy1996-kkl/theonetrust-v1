import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  AdminSessionUser,
  AuditListResponse,
  UpdateAdminPreferencesRequest,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { AppError, errorBody } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { auditLog, changedFieldNames, type AuditEntry } from '../audit/audit.ts';
import { AuditQuery, listAuditEntries } from '../audit/query.ts';
import { helpAdminRoutes } from '../help/admin-routes.ts';
import type { AdminGuard } from './guard.ts';

type ScopedEntry = Omit<AuditEntry, 'actorId' | 'correlationId'>;
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Audited writes for admin handlers: actor and correlation ID are filled in automatically,
     * and the change + its audit row commit together.
     */
    audit?: {
      mutate<T>(
        entry: ScopedEntry | ((result: T) => ScopedEntry),
        change: (tx: Tx) => Promise<T>,
      ): Promise<T>;
    };
    auditRecorded?: boolean;
  }
}

export interface AdminRouteOptions {
  guard: AdminGuard;
  /** Undefined when no database is configured (the guard then answers 401/503 first). */
  db?: Db;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PreferencesBody = z.object({ locale: z.enum(['ta', 'en']) });

/**
 * `/api/v1/admin/*`. The guard runs on EVERY request in this scope — including unknown paths,
 * which answer 401 (not 404) without a session, so the admin surface cannot be probed.
 * Every successful mutation must write an audit entry through `request.audit.mutate`;
 * a 2xx mutation without one is turned into a 500 and logged, so a forgotten audit cannot pass
 * tests silently.
 */
export async function adminRoutes(app: FastifyInstance, opts: AdminRouteOptions) {
  function database(): Db {
    if (!opts.db) throw new AppError('SERVICE_UNAVAILABLE');
    return opts.db;
  }

  app.addHook('onRequest', opts.guard);

  app.addHook('preHandler', async (request: FastifyRequest) => {
    if (!opts.db || !request.admin) return;
    const audit = auditLog(opts.db);
    const actorId = request.admin.userId;
    request.audit = {
      async mutate(entry, change) {
        const result = await audit.mutate(
          (value) => ({
            ...(typeof entry === 'function' ? entry(value) : entry),
            actorId,
            correlationId: request.id,
          }),
          change,
        );
        request.auditRecorded = true;
        return result;
      },
    };
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (!UNSAFE.has(request.method) || reply.statusCode >= 400 || request.auditRecorded) {
      return payload;
    }
    request.log.error({ route: request.routeOptions.url }, 'Admin mutation without an audit entry');
    reply.code(500).header('content-type', 'application/json; charset=utf-8');
    return JSON.stringify(errorBody('INTERNAL_ERROR', request.id));
  });

  app.setNotFoundHandler({ preHandler: opts.guard }, (request, reply) => {
    reply.code(404).send(errorBody('NOT_FOUND', request.id));
  });

  function auditFor(request: FastifyRequest) {
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    return request.audit;
  }

  async function currentUser(request: FastifyRequest) {
    const user =
      request.admin &&
      (await database().adminUser.findUnique({ where: { id: request.admin.userId } }));
    if (!user) throw new AppError('UNAUTHORIZED');
    return user;
  }

  app.get('/me', async (request): Promise<AdminSessionUser> => {
    const user = await currentUser(request);
    return { email: user.email, role: user.role, locale: user.locale };
  });

  /** Saves the dashboard language to the account, so it is the same on every device. */
  app.patch('/me', async (request): Promise<AdminSessionUser> => {
    const body: UpdateAdminPreferencesRequest = parseInput(PreferencesBody, request.body);
    const user = await currentUser(request);
    const updated = await auditFor(request).mutate(
      {
        action: 'admin.preferences.update',
        entityType: 'admin_user',
        entityId: user.id,
        changedFields: changedFieldNames({ locale: user.locale }, body),
      },
      (tx) => tx.adminUser.update({ where: { id: user.id }, data: { locale: body.locale } }),
    );
    return { email: updated.email, role: updated.role, locale: updated.locale };
  });

  if (opts.db) await helpAdminRoutes(app, { db: opts.db });

  /** Read-only. There is intentionally no PUT/PATCH/DELETE for audit entries. */
  app.get('/audit-log', async (request): Promise<AuditListResponse> => {
    return listAuditEntries(database(), parseInput(AuditQuery, request.query));
  });
}
