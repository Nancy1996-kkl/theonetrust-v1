import { z } from 'zod';

/**
 * Optional "cover the processing fee" estimate (#23, plan §17). The trust's real pricing must be
 * entered by the owner in settings — nothing here is a default price. Rates are basis points
 * (100 bps = 1%). The UPI MDR rule from 15 Oct 2026 (0.4% above ₹2,000, capped at ₹300 for
 * ≥ ₹75,000; docs/research/2026-10-payment-limits.md) is expressed as table data, so it can be
 * corrected without code changes.
 */
const bps = z.number().int().min(0).max(10_000);
const paise = z.number().int().min(0);

const MethodRule = z.strictObject({
  /** Percentage of the charged amount. */
  rateBps: bps,
  /** Fixed amount per payment. */
  fixedPaise: paise.default(0),
  /** GST on the fee, e.g. 1800 for 18%. */
  gstBps: bps.default(0),
  /** Fee applies only above this amount (e.g. UPI MDR above ₹2,000 = 200000). */
  abovePaise: paise.optional(),
  /** Maximum fee before GST. */
  capPaise: paise.optional(),
  /** First day (IST, YYYY-MM-DD) the rule applies; before that the fee is zero. */
  effectiveFrom: z.iso.date().optional(),
});
export type MethodRule = z.output<typeof MethodRule>;

export const FEE_METHODS = ['upi', 'card', 'netbanking'] as const;
export type FeeMethod = (typeof FEE_METHODS)[number];

export const FeeTable = z.strictObject({
  version: z.string().min(1).max(40),
  /** Method assumed when the donor does not say how they will pay. */
  defaultMethod: z.enum(FEE_METHODS),
  methods: z.partialRecord(z.enum(FEE_METHODS), MethodRule),
});
export type FeeTable = z.output<typeof FeeTable>;

/** Parses the stored table; anything invalid means fee cover is not offered. */
export function parseFeeTable(value: unknown): FeeTable | null {
  if (value === null || value === undefined) return null;
  const result = FeeTable.safeParse(value);
  return result.success ? result.data : null;
}

function istDate(now: Date): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Fee on a charged amount under one rule (integer paise, rounded up — never under-covers). */
export function feeOn(chargedPaise: number, rule: MethodRule, now: Date): number {
  if (rule.effectiveFrom && istDate(now) < rule.effectiveFrom) return 0;
  if (rule.abovePaise !== undefined && chargedPaise <= rule.abovePaise) return 0;
  let fee = Math.ceil((chargedPaise * rule.rateBps) / 10_000) + rule.fixedPaise;
  if (rule.capPaise !== undefined) fee = Math.min(fee, rule.capPaise);
  return fee + Math.ceil((fee * rule.gstBps) / 10_000);
}

/**
 * Amount to ADD to a gift so that, after the provider takes its fee from the total, the trust
 * receives the full gift. Solved by iteration because the fee depends on the total.
 * Returns null when the method has no rule (fee cover not offered for it).
 */
export function feeCoverFor(
  giftPaise: number,
  table: FeeTable,
  method: FeeMethod | undefined,
  now: Date,
): number | null {
  const rule = table.methods[method ?? table.defaultMethod];
  if (!rule) return null;
  let cover = 0;
  for (let i = 0; i < 10; i += 1) {
    const next = feeOn(giftPaise + cover, rule, now);
    if (next <= cover) return cover;
    cover = next;
  }
  /* c8 ignore next 2 -- converges in 2-3 steps for any rate below 100% */
  return cover;
}
