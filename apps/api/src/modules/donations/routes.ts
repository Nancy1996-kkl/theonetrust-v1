import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DONATION_MIN_PAISE,
  FEE_COVER_METHODS,
  normalizeIndianMobile,
  toPaise,
  type DonationEstimateResponse,
  type DonationIntentResponse,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { donationRepository } from '../../db/repositories/donations.ts';
import { trustSettingsRepository } from '../../db/repositories/trust-settings.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { feeCoverFor, parseFeeTable, type FeeMethod } from './fees.ts';
import { PaymentProviderError, type PaymentProvider } from './provider.ts';

const IntentBody = z.object({
  giftPaise: z.number().int().min(DONATION_MIN_PAISE),
  // International payments stay disabled until FCRA/bank/gateway approval (plan §6).
  currency: z.literal('INR'),
  programme: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .nullable(),
  donorName: z.string().trim().min(1).max(100),
  donorEmail: z.email().max(254).nullable().optional(),
  donorPhone: z.string().max(30).nullable().optional(),
  hideNamePublicly: z.boolean(),
  wantsReceipt: z.boolean(),
  coverFee: z.boolean(),
  feeMethod: z.enum(FEE_COVER_METHODS).optional(),
  consent: z.literal(true),
  locale: z.enum(['ta', 'en']),
});

const EstimateQuery = z.object({
  giftPaise: z.coerce.number().int().min(DONATION_MIN_PAISE).optional(),
  method: z.enum(FEE_COVER_METHODS).optional(),
});

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;

export interface DonationRouteOptions {
  db?: Db;
  provider?: PaymentProvider;
  perHour: number;
  now: () => Date;
}

/**
 * `POST /api/v1/donation-intents` (spec §6 steps 3–4) and the fee/limit estimate.
 * The server validates gift, currency, programme, contact and consent; computes the optional fee
 * cover; creates the intent and the Razorpay order; and returns only the public key ID, the order
 * ID and the amount.
 */
export async function donationRoutes(app: FastifyInstance, opts: DonationRouteOptions) {
  const limit = { rateLimit: { max: opts.perHour, timeWindow: 3_600_000 } };

  function deps() {
    if (!opts.db || !opts.provider) throw new AppError('SERVICE_UNAVAILABLE');
    return { db: opts.db, provider: opts.provider };
  }

  async function feeFor(db: Db, giftPaise: number, method: FeeMethod | undefined) {
    const settings = await trustSettingsRepository(db).get();
    const table = parseFeeTable(settings.feeTable);
    const fee = table ? feeCoverFor(giftPaise, table, method, opts.now()) : null;
    return { settings, table, fee };
  }

  app.get('/estimate', { config: limit }, async (request): Promise<DonationEstimateResponse> => {
    const { db } = deps();
    const query = parseInput(EstimateQuery, request.query);
    const { settings, table, fee } = await feeFor(
      db,
      query.giftPaise ?? DONATION_MIN_PAISE,
      query.method,
    );
    return {
      minPaise: DONATION_MIN_PAISE,
      maxPaise: settings.maxDonationPaise,
      feeCoverOffered: table !== null,
      ...(query.giftPaise !== undefined &&
        fee !== null && { feePaise: fee, amountPaise: query.giftPaise + fee }),
    };
  });

  app.post('/', { config: limit }, async (request, reply) => {
    const { db, provider } = deps();
    const body = parseInput(IntentBody, request.body);
    const keyHeader = request.headers['idempotency-key'];
    const idempotencyKey = typeof keyHeader === 'string' ? keyHeader : undefined;
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'Idempotency-Key', issue: 'invalid' }]);
    }

    const problems: Array<{ path: string; issue: string }> = [];
    const phone = body.donorPhone ? normalizeIndianMobile(body.donorPhone) : null;
    if (body.donorPhone && !phone) problems.push({ path: 'donorPhone', issue: 'invalid' });
    if (!body.donorEmail && !body.donorPhone)
      problems.push({ path: 'donorEmail', issue: 'contact_required' });

    const { settings, table, fee } = await feeFor(db, body.giftPaise, body.feeMethod);
    if (body.giftPaise > settings.maxDonationPaise)
      problems.push({ path: 'giftPaise', issue: 'too_big' });
    if (body.coverFee && (!table || fee === null))
      problems.push({ path: 'coverFee', issue: 'not_offered' });

    let programmeId: string | null = null;
    if (body.programme && body.programme !== 'general') {
      const programme = await db.programme.findUnique({ where: { slug: body.programme } });
      if (!programme?.active) problems.push({ path: 'programme', issue: 'invalid' });
      else programmeId = programme.id;
    }
    if (problems.length > 0) throw new AppError('VALIDATION_ERROR', problems);

    const donations = donationRepository(db);
    const feePaise = body.coverFee && fee !== null ? fee : 0;

    // A retry with the same key returns the same order instead of charging twice.
    if (idempotencyKey) {
      const existing = await db.donationIntent.findUnique({
        where: { idempotencyKey },
        include: { paymentAttempts: { orderBy: { createdAt: 'asc' }, take: 1 } },
      });
      if (existing) {
        const attempt = existing.paymentAttempts[0];
        if (existing.giftPaise !== body.giftPaise || existing.feePaise !== feePaise || !attempt) {
          throw new AppError('CONFLICT');
        }
        return reply
          .code(200)
          .send(response(existing, attempt.providerOrderId, provider.publicKeyId));
      }
    }

    const intent = await donations.createIntent({
      giftPaise: toPaise(body.giftPaise),
      feePaise,
      programmeId,
      donorName: body.donorName,
      donorEmail: body.donorEmail ?? null,
      donorPhone: phone,
      hideNamePublicly: body.hideNamePublicly,
      wantsReceipt: body.wantsReceipt,
      coverFee: feePaise > 0,
      locale: body.locale,
      idempotencyKey: idempotencyKey ?? null,
      consentAt: opts.now(),
    });

    let order;
    try {
      order = await provider.createOrder({
        amountPaise: intent.amountPaise,
        currency: 'INR',
        receipt: intent.publicReference,
        notes: {
          donation_reference: intent.publicReference,
          programme: body.programme ?? 'general',
        },
      });
    } catch (error) {
      // The intent stays CREATED with no order; the donor can try again.
      request.log.warn(
        {
          reason: error instanceof PaymentProviderError ? error.reason : 'unknown',
          ref: intent.publicReference,
        },
        'Payment order not created',
      );
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    await donations.addPaymentAttempt({
      donationIntentId: intent.id,
      providerOrderId: order.orderId,
      amountPaise: toPaise(order.amountPaise),
    });
    return reply.code(201).send(response(intent, order.orderId, provider.publicKeyId));
  });
}

function response(
  intent: { publicReference: string; giftPaise: number; feePaise: number; amountPaise: number },
  orderId: string,
  keyId: string,
): DonationIntentResponse {
  return {
    publicReference: intent.publicReference,
    giftPaise: intent.giftPaise,
    feePaise: intent.feePaise,
    amountPaise: intent.amountPaise,
    currency: 'INR',
    checkout: { provider: 'RAZORPAY', keyId, orderId },
  };
}
