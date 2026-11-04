import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  MANAGE_TOKEN_PATTERN,
  MONTHLY_CONSENT_VERSION,
  SUBSCRIPTION_REFERENCE_PATTERN,
  UPI_AUTOPAY_MAX_PAISE,
  methodRouteFor,
  methodsFor,
  normalizeIndianMobile,
  type ManageView,
  type SubscriptionResponse,
  type SubscriptionVerifyResponse,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import type { DonationSubscription } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { PaymentProviderError } from '../donations/provider.ts';
import type { SubscriptionProvider } from './provider.ts';
import {
  TOTAL_COUNT,
  donorStatus,
  firstCharge,
  manageToken,
  manageTokenHash,
  newManageSalt,
  newSubscriptionReference,
  nextStatus,
} from './rules.ts';

const DONATION_MIN_PAISE = 100;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;

const Body = z
  .object({
    amountPaise: z.number().int().min(DONATION_MIN_PAISE),
    currency: z.literal('INR'),
    programme: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .nullable(),
    donorName: z.string().trim().min(1).max(120),
    donorEmail: z.email().max(254).nullable().optional(),
    donorPhone: z.string().max(20).nullable().optional(),
    consent: z.literal(true),
    mandateConsent: z.literal(true),
    consentVersion: z.literal(MONTHLY_CONSENT_VERSION),
    locale: z.enum(['ta', 'en']),
  })
  .strict();
const VerifyBody = z.object({
  publicReference: z.string().regex(SUBSCRIPTION_REFERENCE_PATTERN),
  subscriptionId: z.string().regex(/^sub_[A-Za-z0-9]{6,40}$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  signature: z.string().max(128),
});
const TokenParams = z.object({ token: z.string().regex(MANAGE_TOKEN_PATTERN) });
const CancelBody = z.object({ confirm: z.literal(true) });

export interface SubscriptionRouteOptions {
  db?: Db;
  provider?: SubscriptionProvider;
  keyId?: string;
  /** HMAC key for manage-link tokens. */
  manageKey?: Buffer;
  enabled: boolean;
  perHour: number;
  now: () => Date;
}

const istDate = (d: Date | null) =>
  d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10) : null;

function privateHeaders(reply: FastifyReply) {
  reply
    .header('cache-control', 'no-store')
    .header('x-robots-tag', 'noindex, nofollow')
    .header('referrer-policy', 'no-referrer');
}

/**
 * Monthly giving (#32): `POST /subscriptions` (consent → Razorpay subscription with a reused
 * fixed-amount plan), `POST /subscriptions/verify` (signature + fetched status), and the
 * private `/subscriptions/manage/:token` view and cancel. Closed (503) unless switched on.
 */
export async function subscriptionRoutes(app: FastifyInstance, opts: SubscriptionRouteOptions) {
  const limit = { rateLimit: { max: opts.perHour, timeWindow: 3_600_000 } };

  function deps() {
    if (!opts.enabled || !opts.db || !opts.provider || !opts.manageKey || !opts.keyId) {
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    return { db: opts.db, provider: opts.provider, manageKey: opts.manageKey, keyId: opts.keyId };
  }

  /** One Razorpay plan per amount, created once and reused. */
  async function planFor(db: Db, provider: SubscriptionProvider, amountPaise: number) {
    const existing = await db.subscriptionPlan.findFirst({
      where: { provider: 'RAZORPAY', amountPaise, period: 'monthly', interval: 1 },
    });
    if (existing) return existing.providerPlanId;
    const { planId } = await provider.createPlan({
      amountPaise,
      name: `Monthly donation ₹${(amountPaise / 100).toFixed(2)}`,
    });
    try {
      await db.subscriptionPlan.create({ data: { providerPlanId: planId, amountPaise } });
      return planId;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      // Another request created the plan first: use that one.
      const winner = await db.subscriptionPlan.findFirstOrThrow({
        where: { provider: 'RAZORPAY', amountPaise, period: 'monthly', interval: 1 },
      });
      return winner.providerPlanId;
    }
  }

  function response(row: DonationSubscription, keyId: string): SubscriptionResponse {
    const route = methodRouteFor(row.amountPaise);
    return {
      publicReference: row.publicReference,
      amountPaise: row.amountPaise,
      currency: 'INR',
      methodRoute: route,
      allowedMethods: methodsFor(route),
      warning: row.amountPaise > UPI_AUTOPAY_MAX_PAISE ? 'psp_limit' : null,
      startDate: istDate(row.startAt),
      checkout: { provider: 'RAZORPAY', keyId, subscriptionId: row.providerSubscriptionId },
    };
  }

  app.post('/', { config: limit }, async (request, reply) => {
    const { db, provider, manageKey, keyId } = deps();
    const body = parseInput(Body, request.body);
    const keyHeader = request.headers['idempotency-key'];
    const idempotencyKey = typeof keyHeader === 'string' ? keyHeader : undefined;
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'Idempotency-Key', issue: 'invalid' }]);
    }
    const problems: Array<{ path: string; issue: string }> = [];
    const phone = body.donorPhone ? normalizeIndianMobile(body.donorPhone) : null;
    if (body.donorPhone && !phone) problems.push({ path: 'donorPhone', issue: 'invalid' });
    if (!body.donorEmail && !body.donorPhone) {
      problems.push({ path: 'donorEmail', issue: 'contact_required' });
    }
    const settings = await db.trustSettings.findUnique({ where: { id: 1 } });
    if (body.amountPaise > (settings?.maxDonationPaise ?? 50_000_000)) {
      problems.push({ path: 'amountPaise', issue: 'too_big' });
    }
    let programmeId: string | null = null;
    if (body.programme && body.programme !== 'general') {
      const programme = await db.programme.findUnique({ where: { slug: body.programme } });
      if (!programme?.active) problems.push({ path: 'programme', issue: 'invalid' });
      else programmeId = programme.id;
    }
    if (problems.length > 0) throw new AppError('VALIDATION_ERROR', problems);

    if (idempotencyKey) {
      const existing = await db.donationSubscription.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.amountPaise !== body.amountPaise) throw new AppError('CONFLICT');
        return reply.code(200).send(response(existing, keyId));
      }
    }

    const now = opts.now();
    const { startAt } = firstCharge(now);
    const reference = newSubscriptionReference();
    let sub;
    try {
      const planId = await planFor(db, provider, body.amountPaise);
      sub = await provider.createSubscription({
        planId,
        totalCount: TOTAL_COUNT,
        ...(startAt && { startAt: Math.floor(startAt.getTime() / 1000) }),
        // References only: no name, email or phone goes to Razorpay notes.
        notes: { reference },
      });
    } catch (error) {
      request.log.warn(
        { reason: error instanceof PaymentProviderError ? error.reason : 'unknown' },
        'Subscription create failed',
      );
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    const salt = newManageSalt();
    const row = await db.donationSubscription.create({
      data: {
        publicReference: reference,
        providerSubscriptionId: sub.subscriptionId,
        providerPlanId: sub.planId,
        programmeId,
        amountPaise: body.amountPaise,
        methodRoute: methodRouteFor(body.amountPaise),
        donorName: body.donorName,
        donorEmail: body.donorEmail ?? null,
        donorPhone: phone,
        manageTokenSalt: salt,
        manageTokenHash: manageTokenHash(manageToken(manageKey, salt)),
        idempotencyKey: idempotencyKey ?? null,
        consentAt: now,
        consentVersion: body.consentVersion,
        startAt,
        locale: body.locale,
      },
    });
    return reply.code(201).send(response(row, keyId));
  });

  /** Checkout callback: signature first, then the status FETCHED from Razorpay decides. */
  app.post('/verify', { config: limit }, async (request): Promise<SubscriptionVerifyResponse> => {
    const { db, provider, manageKey } = deps();
    const body = parseInput(VerifyBody, request.body);
    const row = await db.donationSubscription.findUnique({
      where: { publicReference: body.publicReference },
    });
    if (!row || row.providerSubscriptionId !== body.subscriptionId) throw new AppError('NOT_FOUND');
    if (
      !provider.verifySubscriptionSignature(body.paymentId, body.subscriptionId, body.signature)
    ) {
      request.log.warn({ ref: row.publicReference }, 'Subscription signature rejected');
      throw new AppError('VALIDATION_ERROR', [{ path: 'signature', issue: 'invalid' }]);
    }
    let status = row.status;
    try {
      const remote = await provider.fetchSubscription(row.providerSubscriptionId);
      status = nextStatus(row.status, remote.status);
      if (status !== row.status) {
        await db.$transaction(async (tx) => {
          const moved = await tx.donationSubscription.updateMany({
            where: { id: row.id, status: row.status },
            data: { status, ...(status === 'CANCELLED' && { cancelledAt: opts.now() }) },
          });
          // First authorisation: email the private manage link (donors with an email only).
          if (moved.count === 1 && donorStatus(status) === 'ACTIVE' && row.donorEmail) {
            await tx.notificationOutbox.createMany({
              data: [
                {
                  eventType: 'subscription.authorised',
                  entityRef: `donation_subscription:${row.id}`,
                  template: 'donor_subscription_started',
                  locale: row.locale,
                  dedupeKey: `subscription.authorised:${row.id}`,
                },
              ],
              skipDuplicates: true,
            });
          }
        });
      }
    } catch {
      // Signature fine but Razorpay could not be asked: stays as it is; webhooks follow (#33).
    }
    const shown = donorStatus(status);
    return {
      publicReference: row.publicReference,
      status: shown,
      ...(shown === 'ACTIVE' && { manageToken: manageToken(manageKey, row.manageTokenSalt) }),
    };
  });

  async function byToken(token: unknown) {
    const { db } = deps();
    const parsed = TokenParams.safeParse(token);
    if (!parsed.success) throw new AppError('NOT_FOUND');
    const row = await db.donationSubscription.findUnique({
      where: { manageTokenHash: manageTokenHash(parsed.data.token) },
      include: { programme: { select: { titleEn: true, titleTa: true } } },
    });
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  function view(row: Awaited<ReturnType<typeof byToken>>): ManageView {
    return {
      publicReference: row.publicReference,
      amountPaise: row.amountPaise,
      status: donorStatus(row.status),
      methodRoute: row.methodRoute === 'upi_autopay' ? 'upi_autopay' : 'emandate_card',
      startDate: istDate(row.startAt ?? row.createdAt),
      programme: row.programme ? { en: row.programme.titleEn, ta: row.programme.titleTa } : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  app.get('/manage/:token', { config: limit }, async (request, reply) => {
    privateHeaders(reply);
    return view(await byToken(request.params));
  });

  /** Cancels at Razorpay FIRST; only a confirmed cancel is recorded. Idempotent. */
  app.post('/manage/:token/cancel', { config: limit }, async (request, reply) => {
    privateHeaders(reply);
    const { db, provider } = deps();
    parseInput(CancelBody, request.body);
    const row = await byToken(request.params);
    if (row.status === 'CANCELLED' || row.status === 'COMPLETED') return view(row);
    let remote;
    try {
      remote = await provider.cancelSubscription(row.providerSubscriptionId);
    } catch (error) {
      request.log.warn(
        {
          reason: error instanceof PaymentProviderError ? error.reason : 'unknown',
          ref: row.publicReference,
        },
        'Subscription cancel failed',
      );
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    if (remote.status !== 'cancelled') throw new AppError('SERVICE_UNAVAILABLE');
    const now = opts.now();
    await db.donationSubscription.updateMany({
      where: { id: row.id, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    return view({ ...row, status: 'CANCELLED', cancelledAt: now });
  });
}
