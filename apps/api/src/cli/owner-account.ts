import type { Db } from '../db/client.ts';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
} from '../modules/auth/passwords.ts';

export class OwnerAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerAccountError';
  }
}

export function checkNewPassword(password: string, email: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new OwnerAccountError(
      `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters (a passphrase is best).`,
    );
  }
  if (password.toLowerCase().includes((email.split('@')[0] ?? email).toLowerCase())) {
    throw new OwnerAccountError('Password must not contain the email name.');
  }
}

/**
 * Creates the owner account, or resets its password. A reset also turns the authenticator off
 * and signs out every session, so the owner enrols a new authenticator at the next sign-in.
 * Run from a trusted machine only (`pnpm --filter @theonetrust/api owner:set-password`).
 */
export async function setOwnerPassword(db: Db, emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new OwnerAccountError('Enter a valid email.');
  checkNewPassword(password, email);
  const passwordHash = await hashPassword(password);
  const reset = {
    passwordHash,
    totpSecretCiphertext: null,
    totpKeyVersion: null,
    totpEnabledAt: null,
    totpLastStep: null,
    failedLoginCount: 0,
    lockedUntil: null,
    active: true,
  };
  const user = await db.adminUser.upsert({
    where: { email },
    create: { email, role: 'OWNER', ...reset },
    update: reset,
  });
  await db.adminSession.updateMany({
    where: { adminUserId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await db.adminRecoveryCode.deleteMany({ where: { adminUserId: user.id } });
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'auth.owner.password_set',
      entityType: 'admin_user',
      entityId: user.id,
      changedFields: ['password_hash', 'totp_enabled_at'],
    },
  });
  return { id: user.id, email: user.email };
}
