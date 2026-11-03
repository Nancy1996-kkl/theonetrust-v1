import type { AdminSessionStage } from '@theonetrust/contracts';
import { AppError } from '../../http/errors.ts';
import { type AuthKeys, decrypt, encrypt, randomToken, sha256Hex } from '../../security/crypto.ts';
import { burnPasswordCheck, verifyPassword } from './passwords.ts';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './recovery-codes.ts';
import type { AuthRepository } from './repository.ts';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp.ts';

export interface AuthConfig {
  keys: AuthKeys;
  /** Inactivity limit for a signed-in session. */
  idleMs: number;
  /** Absolute lifetime of a signed-in session. */
  maxMs: number;
  /** Lifetime of the half-signed-in session between password and code. */
  pendingMs: number;
  maxFailures: number;
  lockoutMs: number;
  issuer: string;
}

type Session = NonNullable<Awaited<ReturnType<AuthRepository['findSession']>>>;
type User = Session['adminUser'];

export interface ResolvedSession {
  session: Session;
  user: User;
  stage: Exclude<AdminSessionStage, 'SIGNED_OUT'>;
}

export interface IssuedSession {
  token: string;
  stage: Exclude<AdminSessionStage, 'SIGNED_OUT'>;
  user: User;
  maxAgeSeconds: number;
}

/** Throttle for writing last_seen_at: at most once a minute per session. */
const TOUCH_EVERY_MS = 60_000;

function stageOf(session: { mfaVerifiedAt: Date | null }, user: User): ResolvedSession['stage'] {
  if (session.mfaVerifiedAt) return 'ACTIVE';
  return user.totpEnabledAt ? 'MFA_VERIFY' : 'MFA_SETUP';
}

/**
 * Owner sign-in: password (Argon2id) → authenticator code (TOTP) → full session.
 * The password step only ever yields a short-lived session that can do nothing but finish MFA.
 * Every privilege change issues a new session token (no session fixation).
 */
export function authService(repo: AuthRepository, config: AuthConfig, now: () => Date) {
  async function issue(user: User, mfaVerified: boolean): Promise<IssuedSession> {
    const token = randomToken();
    const lifetime = mfaVerified ? config.maxMs : config.pendingMs;
    const at = now();
    await repo.createSession({
      adminUserId: user.id,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(at.getTime() + lifetime),
      now: at,
      mfaVerified,
    });
    return {
      token,
      user,
      stage: mfaVerified ? 'ACTIVE' : user.totpEnabledAt ? 'MFA_VERIFY' : 'MFA_SETUP',
      maxAgeSeconds: Math.floor(lifetime / 1000),
    };
  }

  function isLocked(user: User): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > now().getTime();
  }

  /** Counts a wrong password or code; locks the account at the limit. Returns true if now locked. */
  async function registerFailure(user: User, correlationId: string, action: string) {
    const lockExpired = user.lockedUntil !== null && !isLocked(user);
    const failures = (lockExpired ? 0 : user.failedLoginCount) + 1;
    const locked = failures >= config.maxFailures;
    await repo.recordFailure(
      user.id,
      locked ? 0 : failures,
      locked ? new Date(now().getTime() + config.lockoutMs) : null,
    );
    await repo.audit({ actorId: user.id, action, correlationId });
    if (locked)
      await repo.audit({ actorId: user.id, action: 'auth.account.locked', correlationId });
    return locked;
  }

  return {
    async login(emailInput: string, password: string, correlationId: string) {
      const email = emailInput.trim().toLowerCase();
      const user = await repo.findUserByEmail(email);
      if (!user || !user.active || !user.passwordHash) {
        await burnPasswordCheck(password);
        await repo.audit({ actorId: null, action: 'auth.login.unknown_account', correlationId });
        throw new AppError('INVALID_CREDENTIALS');
      }
      if (isLocked(user)) {
        await burnPasswordCheck(password);
        await repo.audit({ actorId: user.id, action: 'auth.login.locked', correlationId });
        throw new AppError('INVALID_CREDENTIALS');
      }
      if (!(await verifyPassword(user.passwordHash, password))) {
        await registerFailure(user, correlationId, 'auth.login.wrong_password');
        throw new AppError('INVALID_CREDENTIALS');
      }
      await repo.audit({ actorId: user.id, action: 'auth.login.password_ok', correlationId });
      return issue(user, false);
    },

    async resolve(token: string | undefined): Promise<ResolvedSession | null> {
      if (!token) return null;
      const session = await repo.findSession(sha256Hex(token));
      const at = now().getTime();
      if (!session || session.revokedAt || session.expiresAt.getTime() <= at) return null;
      const user = session.adminUser;
      if (!user.active) return null;
      if (session.mfaVerifiedAt && at - session.lastSeenAt.getTime() > config.idleMs) return null;
      if (at - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
        await repo.touchSession(session.id, now());
      }
      return { session, user, stage: stageOf(session, user) };
    },

    async beginMfaSetup(current: ResolvedSession) {
      if (current.stage !== 'MFA_SETUP') throw new AppError('CONFLICT');
      const secret = generateTotpSecret();
      await repo.storePendingTotp(
        current.user.id,
        new Uint8Array(encrypt(secret, config.keys.encryption)),
        config.keys.version,
      );
      return { secret, otpauthUri: otpauthUri(secret, current.user.email, config.issuer) };
    },

    async enableMfa(current: ResolvedSession, code: string, correlationId: string) {
      const user = await repo.findUserById(current.user.id);
      if (current.stage !== 'MFA_SETUP' || !user?.totpSecretCiphertext) {
        throw new AppError('CONFLICT');
      }
      const secret = decrypt(user.totpSecretCiphertext, config.keys.encryption);
      const step = verifyTotp(secret, code.trim(), now(), null);
      if (step === null || !(await repo.consumeTotpStep(user.id, step))) {
        const locked = await registerFailure(user, correlationId, 'auth.mfa.setup_wrong_code');
        if (locked) await repo.revokeSession(current.session.id, now());
        throw new AppError('INVALID_CODE');
      }
      const recoveryCodes = generateRecoveryCodes();
      await repo.enableTotp(user.id, recoveryCodes.map(hashRecoveryCode), now());
      await repo.clearFailures(user.id, now());
      await repo.revokeSession(current.session.id, now());
      await repo.audit({
        actorId: user.id,
        action: 'auth.mfa.enabled',
        correlationId,
        changedFields: ['totp_enabled_at', 'recovery_codes'],
      });
      const issued = await issue({ ...user, totpEnabledAt: now() }, true);
      return { ...issued, recoveryCodes };
    },

    async verifyMfa(current: ResolvedSession, input: string, correlationId: string) {
      const user = current.user;
      if (current.stage !== 'MFA_VERIFY' || !user.totpSecretCiphertext) {
        throw new AppError('CONFLICT');
      }
      if (isLocked(user)) {
        await repo.revokeSession(current.session.id, now());
        throw new AppError('INVALID_CODE');
      }
      const code = input.trim();
      let ok = false;
      let action = 'auth.mfa.verified';
      if (/^\d{6}$/.test(code)) {
        const secret = decrypt(user.totpSecretCiphertext, config.keys.encryption);
        const step = verifyTotp(
          secret,
          code,
          now(),
          user.totpLastStep === null ? null : Number(user.totpLastStep),
        );
        ok = step !== null && (await repo.consumeTotpStep(user.id, step));
      } else {
        const recovery = normalizeRecoveryCode(code);
        ok =
          recovery !== null &&
          (await repo.useRecoveryCode(user.id, hashRecoveryCode(recovery), now()));
        action = 'auth.mfa.recovery_code_used';
      }
      if (!ok) {
        const locked = await registerFailure(user, correlationId, 'auth.mfa.wrong_code');
        if (locked) await repo.revokeSession(current.session.id, now());
        throw new AppError('INVALID_CODE');
      }
      await repo.clearFailures(user.id, now());
      await repo.revokeSession(current.session.id, now());
      await repo.audit({ actorId: user.id, action, correlationId });
      return issue(user, true);
    },

    async logout(current: ResolvedSession, correlationId: string) {
      await repo.revokeSession(current.session.id, now());
      await repo.audit({ actorId: current.user.id, action: 'auth.logout', correlationId });
    },
  };
}

export type AuthService = ReturnType<typeof authService>;
