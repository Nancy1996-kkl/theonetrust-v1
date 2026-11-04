import type { Db } from '../../db/client.ts';
import { auditRow } from '../audit/audit.ts';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  correlationId: string;
  changedFields?: string[];
}

/** Every database call the sign-in flow makes. */
export function authRepository(db: Db) {
  return {
    findUserByEmail(email: string) {
      return db.adminUser.findUnique({ where: { email } });
    },

    findUserById(id: string) {
      return db.adminUser.findUnique({ where: { id } });
    },

    recordFailure(userId: string, failures: number, lockedUntil: Date | null) {
      return db.adminUser.update({
        where: { id: userId },
        data: { failedLoginCount: failures, lockedUntil },
      });
    },

    clearFailures(userId: string, lastLoginAt?: Date) {
      return db.adminUser.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: null, ...(lastLoginAt && { lastLoginAt }) },
      });
    },

    createSession(input: {
      adminUserId: string;
      tokenHash: string;
      expiresAt: Date;
      now: Date;
      mfaVerified: boolean;
    }) {
      return db.adminSession.create({
        data: {
          adminUserId: input.adminUserId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          lastSeenAt: input.now,
          mfaVerifiedAt: input.mfaVerified ? input.now : null,
        },
      });
    },

    findSession(tokenHash: string) {
      return db.adminSession.findUnique({ where: { tokenHash }, include: { adminUser: true } });
    },

    touchSession(id: string, now: Date) {
      return db.adminSession.update({ where: { id }, data: { lastSeenAt: now } });
    },

    revokeSession(id: string, now: Date) {
      return db.adminSession.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: now },
      });
    },

    storePendingTotp(userId: string, ciphertext: Uint8Array<ArrayBuffer>, keyVersion: number) {
      return db.adminUser.update({
        where: { id: userId },
        data: { totpSecretCiphertext: ciphertext, totpKeyVersion: keyVersion, totpEnabledAt: null },
      });
    },

    /** Consumes a TOTP step atomically: fails if another request already used this or a later step. */
    async consumeTotpStep(userId: string, step: number): Promise<boolean> {
      const result = await db.adminUser.updateMany({
        where: {
          id: userId,
          OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(step) } }],
        },
        data: { totpLastStep: BigInt(step) },
      });
      return result.count === 1;
    },

    /** Enables TOTP and replaces all recovery codes in one transaction. */
    enableTotp(userId: string, recoveryCodeHashes: string[], now: Date) {
      return db.$transaction([
        db.adminUser.update({ where: { id: userId }, data: { totpEnabledAt: now } }),
        db.adminRecoveryCode.deleteMany({ where: { adminUserId: userId } }),
        db.adminRecoveryCode.createMany({
          data: recoveryCodeHashes.map((codeHash) => ({ adminUserId: userId, codeHash })),
        }),
      ]);
    },

    /** Marks a recovery code used; false if it does not exist, belongs to someone else or was used. */
    async useRecoveryCode(userId: string, codeHash: string, now: Date): Promise<boolean> {
      const result = await db.adminRecoveryCode.updateMany({
        where: { adminUserId: userId, codeHash, usedAt: null },
        data: { usedAt: now },
      });
      return result.count === 1;
    },

    audit(entry: AuditEntry) {
      return db.auditLog.create({
        data: auditRow({
          actorId: entry.actorId,
          action: entry.action,
          entityType: 'admin_user',
          entityId: entry.actorId,
          changedFields: entry.changedFields ?? [],
          correlationId: entry.correlationId,
        }),
      });
    },
  };
}

export type AuthRepository = ReturnType<typeof authRepository>;
