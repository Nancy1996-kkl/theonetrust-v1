import type { ReceiptMethod } from '@theonetrust/contracts';
import { RECEIPT_METHODS } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { ownerEmailFor } from '../../db/repositories/trust-settings.ts';
import type { NotificationOutbox } from '../../generated/prisma/client.ts';
import { currentReceipt, shareTokenFor } from '../receipts/issue.ts';
import { verifyUrl } from '../receipts/routes.ts';
import { manageToken } from '../subscriptions/rules.ts';
import { EmailSendError, type EmailProvider } from './provider.ts';
import {
  renderDonorDonationPaid,
  renderDonorSubscriptionStarted,
  renderDonorSubscriptionProblem,
  renderOwnerDonationPaid,
  renderOwnerHelpRequest,
  type DonationPaidContext,
  type RenderedEmail,
} from './templates.ts';

/**
 * Outbox worker (#30). Picks due PENDING rows, claims each one (so two API instances never send
 * the same email), renders it from the database, sends it, and records the result. A failure
 * is retried with backoff; after MAX_ATTEMPTS, or on a permanent provider error, the row is
 * FAILED and shown to the owner, who can retry it. Payments are never touched here.
 */
export const MAX_ATTEMPTS = 6;
/** Wait before attempt n+1 (index = attempts made so far − 1). */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const LEASE_MS = 5 * 60_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_NAME = 'Theonetrust.in';

export interface WorkerDeps {
  db: Db;
  provider?: EmailProvider | undefined;
  ownerEmail?: string | undefined;
  siteUrl: string;
  receiptKey?: Buffer | undefined;
  /** Manage-link key for monthly giving emails (#32). */
  manageKey?: Buffer | undefined;
  now: () => Date;
  batchSize?: number;
}

export interface RunResult {
  sent: number;
  retrying: number;
  failed: number;
  cancelled: number;
}

type Built = { to: string; email: RenderedEmail } | { cancel: string };

const site = (deps: WorkerDeps, path: string) => `${deps.siteUrl.replace(/\/$/, '')}${path}`;

async function donationContext(
  deps: WorkerDeps,
  intentId: string,
): Promise<{ ctx: DonationPaidContext; email: string | null; status: string } | null> {
  const intent = await deps.db.donationIntent.findUnique({
    where: { id: intentId },
    include: {
      programme: { select: { titleEn: true, titleTa: true } },
      paymentAttempts: { where: { capturedPaise: { gt: 0 } }, orderBy: { createdAt: 'desc' } },
      bankTransfers: { where: { status: 'MATCHED' }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!intent) return null;
  const attempt = intent.paymentAttempts[0];
  const bank = intent.bankTransfers[0];
  const receipt = await currentReceipt(deps.db, intent.id);
  const token =
    receipt && deps.receiptKey ? await shareTokenFor(deps.db, receipt, deps.receiptKey) : null;
  const settings = await deps.db.trustSettings.findUnique({ where: { id: 1 } });
  const method: ReceiptMethod = bank
    ? 'bank_transfer'
    : (RECEIPT_METHODS as readonly string[]).includes(attempt?.method ?? '')
      ? (attempt?.method as ReceiptMethod)
      : 'other';
  return {
    email: intent.donorEmail,
    status: intent.status,
    ctx: {
      reference: intent.publicReference,
      amountPaise:
        receipt?.amountPaise ?? attempt?.capturedPaise ?? bank?.amountPaise ?? intent.amountPaise,
      programme: intent.programme
        ? { en: intent.programme.titleEn, ta: intent.programme.titleTa }
        : null,
      method,
      paymentReference: attempt?.providerPaymentId ?? bank?.bankReference ?? null,
      receiptNumber: token ? (receipt?.receiptNumber ?? null) : null,
      receiptUrl: token
        ? verifyUrl(deps.siteUrl, token, intent.locale === 'ta' ? 'ta' : 'en')
        : null,
      donorName: intent.donorName,
      trustName: settings?.legalName ?? SITE_NAME,
      dashboardUrl: site(deps, '/admin'),
    },
  };
}

/** Renders a row from current data, or says why it should not be sent. */
export async function buildEmail(deps: WorkerDeps, row: NotificationOutbox): Promise<Built> {
  const [kind, id = ''] = row.entityRef.split(':');
  if (row.template === 'owner_help_request_new' && kind === 'help_request') {
    const ownerEmail = await ownerEmailFor(deps.db, deps.ownerEmail);
    if (!ownerEmail) return { cancel: 'no_owner_email' };
    const help = await deps.db.helpRequest.findUnique({
      where: { id },
      select: { id: true, reference: true, kind: true },
    });
    if (!help) return { cancel: 'entity_missing' };
    return {
      to: ownerEmail,
      email: renderOwnerHelpRequest({
        reference: help.reference,
        kind: help.kind,
        dashboardUrl: site(deps, `/admin/help-requests/${help.id}`),
      }),
    };
  }
  if (
    kind === 'donation_intent' &&
    (row.template === 'owner_donation_paid' || row.template === 'donor_donation_paid')
  ) {
    const ownerEmail =
      row.template === 'owner_donation_paid'
        ? await ownerEmailFor(deps.db, deps.ownerEmail)
        : undefined;
    if (row.template === 'owner_donation_paid' && !ownerEmail) return { cancel: 'no_owner_email' };
    const found = await donationContext(deps, id);
    if (!found) return { cancel: 'entity_missing' };
    if (row.template === 'owner_donation_paid') {
      return { to: ownerEmail ?? '', email: renderOwnerDonationPaid(found.ctx) };
    }
    if (!found.email || !EMAIL.test(found.email)) return { cancel: 'no_donor_email' };
    // A refund before sending: do not thank the donor for money that went back.
    if (found.status !== 'PAID') return { cancel: 'not_paid' };
    return {
      to: found.email,
      email: renderDonorDonationPaid(found.ctx, row.locale === 'ta' ? 'ta' : 'en'),
    };
  }
  if (row.template === 'donor_subscription_started' && kind === 'donation_subscription') {
    const sub = await deps.db.donationSubscription.findUnique({ where: { id } });
    if (!sub) return { cancel: 'entity_missing' };
    if (!sub.donorEmail || !EMAIL.test(sub.donorEmail)) return { cancel: 'no_donor_email' };
    if (sub.status === 'CANCELLED' || sub.status === 'COMPLETED') return { cancel: 'not_active' };
    if (!deps.manageKey) return { cancel: 'no_link_key' };
    const lang = row.locale === 'ta' ? 'ta' : 'en';
    const token = manageToken(deps.manageKey, sub.manageTokenSalt);
    const settings = await deps.db.trustSettings.findUnique({ where: { id: 1 } });
    return {
      to: sub.donorEmail,
      email: renderDonorSubscriptionStarted(
        {
          donorName: sub.donorName,
          amountPaise: sub.amountPaise,
          startDate: sub.startAt
            ? new Date(sub.startAt.getTime() + 330 * 60_000).toISOString().slice(0, 10)
            : null,
          manageUrl: site(deps, `${lang === 'ta' ? '/ta' : ''}/manage/${token}`),
          trustName: settings?.legalName ?? SITE_NAME,
        },
        lang,
      ),
    };
  }
  if (row.template === 'donor_subscription_problem' && kind === 'donation_subscription') {
    const sub = await deps.db.donationSubscription.findUnique({ where: { id } });
    if (!sub) return { cancel: 'entity_missing' };
    if (!sub.donorEmail || !EMAIL.test(sub.donorEmail)) return { cancel: 'no_donor_email' };
    // Already fixed or ended by the time we send: no alarming email.
    if (sub.status !== 'ACTIVE' && sub.status !== 'HALTED') return { cancel: 'not_active' };
    const lang = row.locale === 'ta' ? 'ta' : 'en';
    const settings = await deps.db.trustSettings.findUnique({ where: { id: 1 } });
    return {
      to: sub.donorEmail,
      email: renderDonorSubscriptionProblem(
        {
          donorName: sub.donorName,
          amountPaise: sub.amountPaise,
          halted: sub.status === 'HALTED',
          manageUrl: deps.manageKey
            ? site(
                deps,
                `${lang === 'ta' ? '/ta' : ''}/manage/${manageToken(deps.manageKey, sub.manageTokenSalt)}`,
              )
            : null,
          trustName: settings?.legalName ?? SITE_NAME,
        },
        lang,
      ),
    };
  }
  return { cancel: 'unknown_template' };
}

export function backoffFor(attemptsMade: number): number {
  return BACKOFF_MS[Math.min(attemptsMade, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[0] ?? 60_000;
}

/** One pass over due notifications. Never throws for a single bad row. */
export async function processDueNotifications(deps: WorkerDeps): Promise<RunResult> {
  const result: RunResult = { sent: 0, retrying: 0, failed: 0, cancelled: 0 };
  if (!deps.provider) return result; // EMAIL_PROVIDER=none: everything stays queued
  const now = deps.now();
  const due = await deps.db.notificationOutbox.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: deps.batchSize ?? 20,
  });
  for (const row of due) {
    // Claim: only the instance that moves nextAttemptAt from the value it read may send.
    const claimed = await deps.db.notificationOutbox.updateMany({
      where: { id: row.id, status: 'PENDING', nextAttemptAt: row.nextAttemptAt },
      data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (claimed.count !== 1) continue;

    let code: string;
    let permanent = false;
    try {
      const built = await buildEmail(deps, row);
      if ('cancel' in built) {
        await deps.db.notificationOutbox.update({
          where: { id: row.id },
          data: { status: 'CANCELLED', lastError: built.cancel, failedAt: now },
        });
        result.cancelled++;
        continue;
      }
      await deps.provider.send({ to: built.to, ...built.email, idempotencyKey: row.id });
      await deps.db.notificationOutbox.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: now, lastError: null, retryCount: row.retryCount + 1 },
      });
      result.sent++;
      continue;
    } catch (error) {
      // Codes only: never the provider's body, the address or the message.
      code = error instanceof EmailSendError ? error.code : 'internal';
      permanent = error instanceof EmailSendError && error.permanent;
    }
    const attempts = row.retryCount + 1;
    if (permanent || attempts >= MAX_ATTEMPTS) {
      await deps.db.notificationOutbox.update({
        where: { id: row.id },
        data: { status: 'FAILED', retryCount: attempts, lastError: code, failedAt: now },
      });
      result.failed++;
    } else {
      await deps.db.notificationOutbox.update({
        where: { id: row.id },
        data: {
          retryCount: attempts,
          lastError: code,
          nextAttemptAt: new Date(now.getTime() + backoffFor(attempts)),
        },
      });
      result.retrying++;
    }
  }
  return result;
}
