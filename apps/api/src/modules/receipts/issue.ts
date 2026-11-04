import type { Db } from '../../db/client.ts';
import type { Prisma, Receipt } from '../../generated/prisma/client.ts';
import {
  RECEIPT_TEMPLATE_VERSION,
  formatReceiptNumber,
  newTokenSalt,
  receiptToken,
  receiptTokenHash,
} from './numbering.ts';

type Tx = Prisma.TransactionClient;
export type ReceiptSource = { paymentAttemptId: string } | { bankTransferRecordId: string };

const DEFAULT_RECEIPT_MIN_PAISE = 50_000;

async function nextNumber(tx: Tx, now: Date): Promise<string> {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('receipt_number_seq') AS n`;
  if (!row) throw new Error('receipt_number_seq returned nothing');
  return formatReceiptNumber(now, row.n);
}

/**
 * Called in the SAME transaction that moved the donation to PAID from a verified source (#26,
 * #27, #25), so a receipt exists only for a verified capture. One original per payment: the
 * source column is unique and an existing receipt is returned, so retries never add another.
 * Issued only when the donor asked for one and the verified amount meets the threshold.
 */
export async function issueReceiptIfEligible(
  tx: Tx,
  intentId: string,
  source: ReceiptSource,
  amountPaise: number,
  now: Date,
): Promise<Receipt | null> {
  const existing = await tx.receipt.findUnique({ where: source });
  if (existing) return existing;
  const intent = await tx.donationIntent.findUniqueOrThrow({ where: { id: intentId } });
  if (!intent.wantsReceipt) return null;
  const settings = await tx.trustSettings.findUnique({ where: { id: 1 } });
  if (amountPaise < (settings?.receiptMinPaise ?? DEFAULT_RECEIPT_MIN_PAISE)) return null;
  return tx.receipt.create({
    data: {
      donationIntentId: intentId,
      ...source,
      receiptNumber: await nextNumber(tx, now),
      amountPaise,
      templateVersion: RECEIPT_TEMPLATE_VERSION,
      tokenSalt: newTokenSalt(),
      issuedAt: now,
    },
  });
}

/** Follows corrections to the newest receipt in the chain that starts at `receipt`. */
export async function latestInChain(db: Tx | Db, receipt: Receipt): Promise<Receipt> {
  let current = receipt;
  for (;;) {
    const next = await db.receipt.findUnique({ where: { replacesId: current.id } });
    if (!next) return current;
    current = next;
  }
}

/**
 * Refunds never delete anything (#29). A full refund marks the current acknowledgement as
 * withdrawn (REFUNDED). A partial refund keeps it as evidence (CORRECTED) and adds a new
 * receipt, with a new number, for the net amount the trust kept.
 */
export async function adjustReceiptForRefund(
  tx: Tx,
  paymentAttemptId: string,
  netPaise: number,
  full: boolean,
  now: Date,
): Promise<void> {
  const original = await tx.receipt.findUnique({ where: { paymentAttemptId } });
  if (!original) return;
  const current = await latestInChain(tx, original);
  if (current.voidedAt) return;
  if (full || netPaise <= 0) {
    await tx.receipt.update({
      where: { id: current.id },
      data: { voidedAt: now, voidReason: 'REFUNDED' },
    });
    return;
  }
  if (netPaise === current.amountPaise) return;
  await tx.receipt.update({
    where: { id: current.id },
    data: { voidedAt: now, voidReason: 'CORRECTED' },
  });
  await tx.receipt.create({
    data: {
      donationIntentId: current.donationIntentId,
      replacesId: current.id,
      receiptNumber: await nextNumber(tx, now),
      amountPaise: netPaise,
      templateVersion: RECEIPT_TEMPLATE_VERSION,
      tokenSalt: newTokenSalt(),
      issuedAt: now,
    },
  });
}

/**
 * The share token for a receipt. The hash is saved the first time a link is needed, so issuing
 * a receipt never depends on the key being configured.
 */
export async function shareTokenFor(db: Db, receipt: Receipt, key: Buffer): Promise<string> {
  const token = receiptToken(key, receipt.tokenSalt);
  const hash = receiptTokenHash(token);
  if (receipt.tokenHash !== hash) {
    await db.receipt.update({ where: { id: receipt.id }, data: { tokenHash: hash } });
  }
  return token;
}

/** The donor-facing link token for a PAID donation's current, valid acknowledgement. */
export async function currentReceiptToken(
  db: Db,
  intentId: string,
  key: Buffer | undefined,
): Promise<string | undefined> {
  if (!key) return undefined;
  const originals = await db.receipt.findMany({
    where: { donationIntentId: intentId, replacesId: null },
    orderBy: { issuedAt: 'asc' },
  });
  for (const original of originals) {
    const current = await latestInChain(db, original);
    if (!current.voidedAt) return shareTokenFor(db, current, key);
  }
  return undefined;
}
