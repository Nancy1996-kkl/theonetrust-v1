import type { Prisma } from '../../generated/prisma/client.ts';

type Tx = Prisma.TransactionClient;

/**
 * Queues the "donation verified" emails IN the transaction that marked the donation PAID (#30),
 * so the queue and the ledger agree. Sending happens later in the worker, outside any payment
 * transaction: an email failure can never roll a payment back. Rows hold references only — the
 * worker looks details up when it sends. `skipDuplicates` (ON CONFLICT DO NOTHING) keeps retries
 * from queueing twice without aborting the transaction.
 *
 * Client, Nov 2026: every donor who gave an email address gets a thank-you email (with the
 * acknowledgement link when one was issued), and every paid donation is also added as a row to
 * the trust's Google Sheet (`sheet_donation_paid`, sent by the same worker).
 */
export async function enqueueDonationPaid(tx: Tx, intentId: string): Promise<void> {
  const intent = await tx.donationIntent.findUniqueOrThrow({
    where: { id: intentId },
    select: { donorEmail: true, locale: true },
  });
  const entityRef = `donation_intent:${intentId}`;
  const rows: Prisma.NotificationOutboxCreateManyInput[] = [
    {
      eventType: 'donation.paid',
      entityRef,
      template: 'owner_donation_paid',
      locale: 'en',
      dedupeKey: `donation.paid:owner:${intentId}`,
    },
    {
      eventType: 'donation.paid',
      entityRef,
      template: 'sheet_donation_paid',
      locale: 'en',
      dedupeKey: `donation.paid:sheet:${intentId}`,
    },
  ];
  if (intent.donorEmail) {
    rows.push({
      eventType: 'donation.paid',
      entityRef,
      template: 'donor_donation_paid',
      locale: intent.locale,
      dedupeKey: `donation.paid:donor:${intentId}`,
    });
  }
  await tx.notificationOutbox.createMany({ data: rows, skipDuplicates: true });
}
