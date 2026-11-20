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
    donationStatusEvent: { create: vi.fn(async () => ({})) },
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

  it('FAILED → PAID only for gateway-verified money; → MANUAL_REVIEW only for gateway data (F-1)', async () => {
    expect(canTransition('FAILED', 'PAID', 'gateway_verified')).toBe(true);
    for (const source of [
      undefined,
      'owner_bank_evidence',
      'donor_report',
      'gateway_status',
      'owner_review',
    ] as const) {
      expect(canTransition('FAILED', 'PAID', source)).toBe(false);
    }
    // FAILED → MANUAL_REVIEW only for gateway data (money moved on a failed order).
    expect(canTransition('FAILED', 'MANUAL_REVIEW', 'gateway_status')).toBe(true);
    for (const source of [undefined, 'gateway_verified', 'donor_report', 'owner_review'] as const) {
      expect(canTransition('FAILED', 'MANUAL_REVIEW', source)).toBe(false);
    }
    // No other way out of FAILED, whatever the source.
    for (const to of DONATION_STATUSES) {
      if (to !== 'FAILED' && to !== 'PAID' && to !== 'MANUAL_REVIEW') {
        expect(canTransition('FAILED', to, 'gateway_verified')).toBe(false);
      }
    }
    expect(await transitionDonation(tx('FAILED'), 'i', 'PAID', 'gateway_verified')).toEqual({
      from: 'FAILED',
      to: 'PAID',
    });
    await expect(
      transitionDonation(tx('FAILED'), 'i', 'PAID', 'owner_bank_evidence'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
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
    const mock = t as unknown as {
      donationIntent: { updateMany: ReturnType<typeof vi.fn> };
      donationStatusEvent: { create: ReturnType<typeof vi.fn> };
    };
    // #31: the first PAID stamps paid_at, and every change is written to the history.
    expect(mock.donationIntent.updateMany).toHaveBeenCalledWith({
      where: { id: 'i', status: 'PENDING' },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    });
    expect(mock.donationStatusEvent.create).toHaveBeenCalledWith({
      data: {
        donationIntentId: 'i',
        fromStatus: 'PENDING',
        toStatus: 'PAID',
        source: 'owner_bank_evidence',
      },
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
