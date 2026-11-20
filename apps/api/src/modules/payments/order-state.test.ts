import { describe, expect, it } from 'vitest';
import {
  decisivePayments,
  isRanked,
  NON_CLAIMING_STATES,
  PAYMENT_STATES,
  rank,
  type NormalisedPayment,
} from './order-state.ts';

const pay = (state: NormalisedPayment['state'], id: string = state): NormalisedPayment => ({
  paymentId: `pay_${id}`,
  orderId: 'order_X',
  state,
  amountPaise: 100,
  currency: 'INR',
  method: 'upi',
  refundedPaise: 0,
});

describe('gateway-neutral payment states (Phase 1b)', () => {
  it('only settling states claim an attempt; Razorpay’s stored "created" still counts as pending', () => {
    for (const state of PAYMENT_STATES) {
      const claims = !NON_CLAIMING_STATES.has(state);
      expect([state, claims]).toEqual([
        state,
        ['authorized', 'captured', 'refunded', 'unknown'].includes(state),
      ]);
    }
    expect(NON_CLAIMING_STATES.has('created')).toBe(true);
  });

  it('ranks a payment’s life forward; legacy "created" ranks with pending; unknown is unranked', () => {
    expect(rank('pending')).toBe(rank('created'));
    expect(rank('failed')).toBeLessThan(rank('authorized'));
    expect(rank('authorized')).toBeLessThan(rank('captured'));
    expect(rank('captured')).toBeLessThan(rank('refunded'));
    expect(rank(null)).toBe(-1);
    expect(isRanked('unknown')).toBe(false);
    expect(isRanked('captured')).toBe(true);
  });

  it('decisive payments: every captured one, else the authorized one, else the first reported', () => {
    const order = (payments: NormalisedPayment[]) => ({ orderRef: 'order_X', payments });
    expect(decisivePayments(order([]))).toEqual([]);
    expect(decisivePayments(order([pay('failed'), pay('pending')]))).toEqual([pay('failed')]);
    expect(decisivePayments(order([pay('failed'), pay('authorized')]))).toEqual([
      pay('authorized'),
    ]);
    expect(
      decisivePayments(order([pay('failed'), pay('captured', 'a'), pay('captured', 'b')])),
    ).toEqual([pay('captured', 'a'), pay('captured', 'b')]);
  });
});
