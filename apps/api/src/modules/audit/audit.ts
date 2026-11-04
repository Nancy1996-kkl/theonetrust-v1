import type { Db } from '../../db/client.ts';
import type { Prisma } from '../../generated/prisma/client.ts';

/**
 * Append-only audit log (#20). This module is the ONLY writer of `audit_logs` and deliberately
 * has no update or delete function; the database also refuses UPDATE/DELETE with a trigger.
 *
 * Entries hold changed field NAMES, never values — nothing sensitive (PAN, phone, amounts before
 * and after, secrets) can end up in the log.
 */
export interface AuditEntry {
  actorId: string | null;
  /** dot.separated verb, e.g. "admin.preferences.update", "auth.login.password_ok". */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Why the change was made, when the owner gives one. Free text, kept short. */
  reason?: string | null;
  changedFields?: readonly string[];
  correlationId: string | null;
}

export const AUDIT_ACTION_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
export const AUDIT_REASON_MAX = 500;

export class InvalidAuditEntryError extends Error {
  constructor(problem: string) {
    super(`Invalid audit entry: ${problem}`);
    this.name = 'InvalidAuditEntryError';
  }
}

/** Validates and normalises an entry. Throws rather than writing something unreadable. */
export function auditRow(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  if (!AUDIT_ACTION_PATTERN.test(entry.action)) throw new InvalidAuditEntryError('action');
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(entry.entityType))
    throw new InvalidAuditEntryError('entityType');
  const fields = [...new Set(entry.changedFields ?? [])].sort();
  if (!fields.every((name) => FIELD_NAME_PATTERN.test(name))) {
    // A "field name" that looks like a value (an email, a number with spaces…) is refused.
    throw new InvalidAuditEntryError('changedFields');
  }
  const reason = entry.reason?.trim() || null;
  if (reason && reason.length > AUDIT_REASON_MAX) throw new InvalidAuditEntryError('reason');
  return {
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    reason,
    changedFields: fields,
    correlationId: entry.correlationId,
  };
}

/** Names of the fields whose values differ — values themselves are never returned. */
export function changedFieldNames<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): string[] {
  return Object.keys(after)
    .filter((key) => !Object.is(before[key], after[key]))
    .sort();
}

type Tx = Prisma.TransactionClient;

export function auditLog(db: Db) {
  return {
    /** Records an event that is not itself a data change (sign-in, export, view of PAN…). */
    async record(entry: AuditEntry): Promise<void> {
      await db.auditLog.create({ data: auditRow(entry) });
    },

    /**
     * Runs a change and its audit entry in ONE transaction: either both are saved or neither.
     * Admin mutations must go through this (the admin plugin refuses unaudited 2xx mutations).
     */
    async mutate<T>(
      entry: AuditEntry | ((result: T) => AuditEntry),
      change: (tx: Tx) => Promise<T>,
    ): Promise<T> {
      return db.$transaction(async (tx) => {
        const result = await change(tx);
        const resolved = typeof entry === 'function' ? entry(result) : entry;
        await tx.auditLog.create({ data: auditRow(resolved) });
        return result;
      });
    },
  };
}

export type AuditLog = ReturnType<typeof auditLog>;
