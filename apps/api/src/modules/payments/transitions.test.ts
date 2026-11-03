import { describe, expect, it, vi } from 'vitest';
import { DONATION_STATUSES } from '@theonetrust/contracts';
import { AppError } from '../../http/errors.ts';
import { canTransition, transitionDonation } from './transitions.ts';

function tx(status: string | null, count = 1) {
  return {
    donationIntent: {
      findUnique: vi.fn(async () => (status ? { id: 'i', status } : null)),
      updateMany: vi.fn(async () => ({ count })),
    },
  } as never;
}

describe('donation state transitions', () => {
  it('never leaves FAILED or REFUNDED, and PAID only towards a refund', () => {
    for (const to of DONATION_STATUSES) {
      if (to !== 'FAILED') expect(canTransition('FAILED', to)).toBe(false);
      if (to !== 'REFUNDED') expect(canTransition('REFUNDED', to)).toBe(false);
    }
    expect(canTransition('PAID', 'PENDING')).toBe(false);
    expect(canTransition('PAID', 'FAILED')).toBe(false);
    expect(canTransition('PAID', 'REFUND_PENDING')).toBe(true);
    expect(canTransition('PENDING', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'PAID')).toBe(true);
  });

  it('refuses PAID from a donor report or a status poll', async () => {
    for (const source of ['donor_report', 'gateway_status', 'owner_review'] as const) {
      await expect(transitionDonation(tx('PENDING'), 'i', 'PAID', source)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });

  it('moves a valid transition with a conditional update', async () => {
    const t = tx('PENDING');
    expect(await transitionDonation(t, 'i', 'PAID', 'owner_bank_evidence')).toEqual({
      from: 'PENDING',
      to: 'PAID',
    });
  });

  it('is a no-op for the same status, and rejects unknown, illegal or concurrent changes', async () => {
    expect(await transitionDonation(tx('PAID'), 'i', 'PAID', 'gateway_verified')).toEqual({
      from: 'PAID',
      to: 'PAID',
    });
    await expect(
      transitionDonation(tx(null), 'i', 'FAILED', 'gateway_status'),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      transitionDonation(tx('FAILED'), 'i', 'PENDING', 'gateway_status'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      transitionDonation(tx('PENDING', 0), 'i', 'FAILED', 'gateway_status'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
