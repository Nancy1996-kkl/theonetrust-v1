import { RECEIPT_METHODS, type ReceiptMethod, type ReceiptView } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { latestInChain, shareTokenFor } from './issue.ts';
import { receiptTokenHash } from './numbering.ts';

function methodOf(raw: string | null | undefined, bank: boolean): ReceiptMethod {
  if (bank) return 'bank_transfer';
  return (RECEIPT_METHODS as readonly string[]).includes(raw ?? '')
    ? (raw as ReceiptMethod)
    : 'other';
}

/**
 * Looks a receipt up by its share token and builds the public view: an allow-list of fields.
 * Donor email, phone, PAN, address, provider IDs and internal IDs are never read into it.
 */
export async function receiptViewByToken(
  db: Db,
  token: string,
  key: Buffer,
): Promise<ReceiptView | null> {
  const receipt = await db.receipt.findUnique({
    where: { tokenHash: receiptTokenHash(token) },
    include: {
      donationIntent: {
        select: {
          publicReference: true,
          donorName: true,
          programme: { select: { titleEn: true, titleTa: true } },
        },
      },
    },
  });
  if (!receipt) return null;

  // The payment source sits on the original of a correction chain.
  let original: {
    replacesId: string | null;
    paymentAttemptId: string | null;
    bankTransferRecordId: string | null;
  } = receipt;
  while (original.replacesId) {
    original = await db.receipt.findUniqueOrThrow({
      where: { id: original.replacesId },
      select: { replacesId: true, paymentAttemptId: true, bankTransferRecordId: true },
    });
  }
  const attempt = original.paymentAttemptId
    ? await db.paymentAttempt.findUnique({
        where: { id: original.paymentAttemptId },
        select: { method: true },
      })
    : null;
  const settings = await db.trustSettings.findUnique({ where: { id: 1 } });

  let replacementToken: string | null = null;
  if (receipt.voidReason === 'CORRECTED') {
    const latest = await latestInChain(db, receipt);
    if (latest.id !== receipt.id) replacementToken = await shareTokenFor(db, latest, key);
  }

  const approvalValid =
    settings?.taxBenefitEnabled === true &&
    settings.section354Approval !== null &&
    settings.approvalValidUntil !== null &&
    settings.approvalValidUntil.getTime() >=
      Date.parse(receipt.issuedAt.toISOString().slice(0, 10));
  const programme = receipt.donationIntent.programme;

  return {
    receiptNumber: receipt.receiptNumber,
    donationReference: receipt.donationIntent.publicReference,
    issuedAt: receipt.issuedAt.toISOString(),
    amountPaise: receipt.amountPaise,
    currency: 'INR',
    method: methodOf(attempt?.method, original.bankTransferRecordId !== null),
    // A chosen programme is the purpose; no programme means the general fund.
    purpose: programme ? { en: programme.titleEn, ta: programme.titleTa } : null,
    donorName: receipt.donationIntent.donorName,
    trust: {
      legalName: settings?.legalName ?? null,
      registration: settings?.registrationText ?? null,
    },
    approval:
      approvalValid && settings.section354Approval && settings.approvalValidUntil
        ? {
            reference: settings.section354Approval,
            validUntil: settings.approvalValidUntil.toISOString().slice(0, 10),
          }
        : null,
    state:
      receipt.voidReason === 'REFUNDED'
        ? 'REFUNDED'
        : receipt.voidReason === 'CORRECTED'
          ? 'REPLACED'
          : 'VALID',
    replacementToken,
    templateVersion: receipt.templateVersion,
  };
}
