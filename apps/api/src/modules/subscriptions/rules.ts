import { createHmac, randomBytes } from 'node:crypto';
import { monthlyStartDate, type DonorSubscriptionStatus } from '@theonetrust/contracts';
import { newDonationReference } from '../../db/references.ts';
import { sha256Hex } from '../../security/crypto.ts';
import type { SubscriptionStatus } from '../../generated/prisma/client.ts';

/** Charges until the donor cancels: 10 years of months is Razorpay's practical "open-ended". */
export const TOTAL_COUNT = 120;
/**
 * First charge (shared rule, packages/contracts `monthlyStartDate`): on days 1–28 (IST) it is on
 * authorisation; from the 29th it waits until the 1st of next month at 09:00 IST, so no schedule
 * ever falls on the last day of a cycle.
 */
export function firstCharge(now: Date): { startAt: Date | null; startDate: string | null } {
  const startDate = monthlyStartDate(now);
  return {
    startAt: startDate ? new Date(Date.parse(`${startDate}T09:00:00+05:30`)) : null,
    startDate,
  };
}

export function newSubscriptionReference(): string {
  return newDonationReference().replace('TOT-D-', 'TOT-M-');
}

export function newManageSalt(): string {
  return randomBytes(16).toString('base64url');
}

export function manageToken(key: Buffer, salt: string): string {
  return createHmac('sha256', key).update(`manage:${salt}`).digest('base64url');
}

export function manageTokenHash(token: string): string {
  return sha256Hex(token);
}

/** Razorpay subscription status → ours. Unknown values never move anything. */
export const PROVIDER_STATUS: Record<string, SubscriptionStatus> = {
  created: 'CREATED',
  authenticated: 'AUTHENTICATED',
  active: 'ACTIVE',
  pending: 'ACTIVE',
  halted: 'HALTED',
  paused: 'PAUSED',
  cancelled: 'CANCELLED',
  completed: 'COMPLETED',
  expired: 'COMPLETED',
};

const TERMINAL: SubscriptionStatus[] = ['CANCELLED', 'COMPLETED'];

/** Forward-only: a cancelled or completed subscription never comes back. */
export function nextStatus(current: SubscriptionStatus, provider: string): SubscriptionStatus {
  const mapped = PROVIDER_STATUS[provider];
  if (!mapped || TERMINAL.includes(current)) return current;
  if (mapped === 'CREATED' && current !== 'CREATED') return current;
  return mapped;
}

export function donorStatus(status: SubscriptionStatus): DonorSubscriptionStatus {
  switch (status) {
    case 'AUTHENTICATED':
    case 'ACTIVE':
      return 'ACTIVE';
    case 'PAUSED':
      return 'PAUSED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'COMPLETED':
      return 'ENDED';
    default:
      return 'PENDING'; // CREATED, HALTED: not giving right now
  }
}
