import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DONATION_MIN_PAISE,
  FEE_COVER_METHODS,
  normalizeIndianMobile,
  toPaise,
  type BankTransferIntentResponse,
  type DonationEstimateResponse,
  type DonationIntentResponse,
  type DonationQrResponse,
  type TrustBankAccount,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { donationRepository } from '../../db/repositories/donations.ts';
import { trustSettingsRepository } from '../../db/repositories/trust-settings.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { feeCoverFor, parseFeeTable, type FeeMethod } from './fees.ts';
import { PaymentProviderError, type PaymentProvider } from './provider.ts';
import { transitionDonation } from '../payments/transitions.ts';
import { normalizePan, sealAddress, sealPan, taxOptInOffered } from '../tax/identity.ts';

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
  channel: z.enum(['checkout', 'bank_transfer', 'qr']).default('checkout'),
  /**
   * Tax-benefit opt-in (#34). Accepted ONLY when the trust's approval is recorded, valid and
   * switched on; otherwise refused. PAN and address are encrypted before they are stored.
   */
  taxOptIn: z
    .object({
      pan: z.string().max(20),
      address: z.string().trim().min(10).max(300),
      oldRegimeAck: z.literal(true),
    })
    .strict()
    .optional(),
});

const ClaimBody = z.object({
  utr: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{6,30}$/))
    .nullable(),
});
const ReferenceParams = z.object({ reference: z.string().regex(/^TOT-D-[0-9A-HJKMNP-TV-Z]{12}$/) });

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
  /** Monthly giving is switched on and configured (#32). */
  monthlyOffered?: boolean;
  /** AES-256-GCM key (+ version) for PAN and address at rest (#34). */
  encryption?: { key: Buffer; version: number };
  /** One-time UPI QR in the pop-up (client, Nov 2026). Absent = not offered. */
  qr?: { maxPaise: number; expiryMinutes: number };
}

/**
 * `POST /api/v1/donation-intents` (spec §6 steps 3–4) and the fee/limit estimate.
 * The server validates gift, currency, programme, contact and consent; computes the optional fee
 * cover; creates the intent and the Razorpay order; and returns only the public key ID, the order
 * ID and the amount.
 */
export async function donationRoutes(app: FastifyInstance, opts: DonationRouteOptions) {
  const limit = { rateLimit: { max: opts.perHour, timeWindow: 3_600_000 } };

  function database(): Db {
    if (!opts.db) throw new AppError('SERVICE_UNAVAILABLE');
    return opts.db;
  }

  function deps() {
    if (!opts.db || !opts.provider) throw new AppError('SERVICE_UNAVAILABLE');
    return { db: opts.db, provider: opts.provider };
  }

  /** QR is offered only when switched on AND the provider can make QR codes. */
  function qrReady() {
    return opts.qr && opts.provider?.createQrCode ? opts.qr : null;
  }

  async function feeFor(db: Db, giftPaise: number, method: FeeMethod | undefined) {
    const settings = await trustSettingsRepository(db).get();
    const table = parseFeeTable(settings.feeTable);
    const fee = table ? feeCoverFor(giftPaise, table, method, opts.now()) : null;
    return { settings, table, fee };
  }

  app.get('/estimate', { config: limit }, async (request): Promise<DonationEstimateResponse> => {
    const db = database();
    const query = parseInput(EstimateQuery, request.query);
    const { settings, table, fee } = await feeFor(
      db,
      query.giftPaise ?? DONATION_MIN_PAISE,
      query.method,
    );
    return {
      minPaise: DONATION_MIN_PAISE,
      maxPaise: settings.maxDonationPaise,
      receiptMinPaise: settings.receiptMinPaise,
      feeCoverOffered: table !== null && opts.provider !== undefined,
      bankTransferOffered: bankAccount(settings) !== null,
      monthlyOffered: opts.monthlyOffered === true,
      taxOptInOffered: opts.encryption !== undefined && taxOptInOffered(settings, opts.now()),
      qrOffered: qrReady() !== null,
      ...(qrReady() && {
        qrMaxPaise: Math.min(qrReady()?.maxPaise ?? 0, settings.maxDonationPaise),
      }),
      ...(query.giftPaise !== undefined &&
        fee !== null && { feePaise: fee, amountPaise: query.giftPaise + fee }),
    };
  });

  app.post('/', { config: limit }, async (request, reply) => {
    const body = parseInput(IntentBody, request.body);
    const bank = body.channel === 'bank_transfer';
    const db = database();
    const provider = bank ? undefined : deps().provider;
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
    if (body.coverFee && (bank || !table || fee === null)) {
      problems.push({ path: 'coverFee', issue: 'not_offered' });
    }
    const account = bankAccount(settings);
    if (bank && !account) problems.push({ path: 'channel', issue: 'not_offered' });
    const qr = body.channel === 'qr' ? qrReady() : null;
    if (body.channel === 'qr' && !qr) problems.push({ path: 'channel', issue: 'not_offered' });
    let pan: string | null = null;
    if (body.taxOptIn) {
      if (!opts.encryption || !taxOptInOffered(settings, opts.now())) {
        problems.push({ path: 'taxOptIn', issue: 'not_offered' });
      } else {
        pan = normalizePan(body.taxOptIn.pan);
        if (!pan) problems.push({ path: 'taxOptIn.pan', issue: 'invalid' });
      }
    }

    let programmeId: string | null = null;
    if (body.programme && body.programme !== 'general') {
      const programme = await db.programme.findUnique({ where: { slug: body.programme } });
      if (!programme?.active) problems.push({ path: 'programme', issue: 'invalid' });
      else programmeId = programme.id;
    }
    if (problems.length > 0) throw new AppError('VALIDATION_ERROR', problems);

    const donations = donationRepository(db);
    const feePaise = body.coverFee && fee !== null ? fee : 0;
    if (qr && body.giftPaise + feePaise > qr.maxPaise) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'giftPaise', issue: 'too_big_for_qr' }]);
    }

    // A retry with the same key returns the same order instead of charging twice.
    if (idempotencyKey) {
      const existing = await db.donationIntent.findUnique({
        where: { idempotencyKey },
        include: { paymentAttempts: { orderBy: { createdAt: 'asc' }, take: 1 } },
      });
      if (existing) {
        if (
          bank &&
          account &&
          existing.channel === 'BANK_TRANSFER' &&
          existing.giftPaise === body.giftPaise
        ) {
          return reply.code(200).send(bankResponse(existing, account));
        }
        const attempt = existing.paymentAttempts[0];
        if (existing.giftPaise !== body.giftPaise || existing.feePaise !== feePaise || !attempt) {
          throw new AppError('CONFLICT');
        }
        if (qr) {
          if (!attempt.qrExpiresAt) throw new AppError('CONFLICT');
          return reply.code(200).send(qrResponse(existing, attempt.qrExpiresAt));
        }
        return reply
          .code(200)
          .send(response(existing, attempt.providerOrderId, provider?.publicKeyId ?? ''));
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
      channel: bank ? 'BANK_TRANSFER' : 'CHECKOUT',
    });

    // Tax opt-in (#34): private identity record, PAN and address encrypted at rest.
    if (body.taxOptIn && pan && opts.encryption) {
      const { key, version } = opts.encryption;
      await db.$transaction([
        db.donorIdentityRecord.create({
          data: {
            donationIntentId: intent.id,
            fullName: body.donorName,
            addressLine: sealAddress(body.taxOptIn.address, key),
            ...sealPan(pan, key, version),
          },
        }),
        db.donationIntent.update({ where: { id: intent.id }, data: { wantsTaxCertificate: true } }),
      ]);
    }

    // Bank transfer: no provider order. The owner confirms the credit from the bank statement.
    if (bank && account) return reply.code(201).send(bankResponse(intent, account));
    /* c8 ignore next -- deps() above guarantees a provider for checkout */
    if (!provider) throw new AppError('SERVICE_UNAVAILABLE');

    if (qr && provider.createQrCode) {
      let made;
      try {
        made = await provider.createQrCode({
          amountPaise: intent.amountPaise,
          reference: intent.publicReference,
          closeBy: new Date(opts.now().getTime() + qr.expiryMinutes * 60_000),
          notes: {
            donation_reference: intent.publicReference,
            programme: body.programme ?? 'general',
          },
        });
      } catch (error) {
        request.log.warn(
          {
            reason: error instanceof PaymentProviderError ? error.reason : 'unknown',
            ref: intent.publicReference,
          },
          'Payment QR not created',
        );
        throw new AppError('SERVICE_UNAVAILABLE');
      }
      await db.paymentAttempt.create({
        data: {
          donationIntentId: intent.id,
          provider: 'RAZORPAY',
          providerOrderId: made.qrId,
          amountPaise: toPaise(made.amountPaise),
          qrImageUrl: made.imageUrl,
          qrExpiresAt: made.closeBy,
        },
      });
      return reply.code(201).send(qrResponse(intent, made.closeBy));
    }

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

  /**
   * The QR picture for a donation's current QR (client, Nov 2026). Fetched from Razorpay on the
   * server, so the page needs no third-party image host. Only while the QR can still be paid.
   */
  app.get('/:reference/qr.png', { config: limit }, async (request, reply) => {
    const { reference } = parseInput(ReferenceParams, request.params);
    const { db, provider } = deps();
    const intent = await db.donationIntent.findUnique({
      where: { publicReference: reference },
      include: { paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const attempt = intent?.paymentAttempts[0];
    if (
      !intent ||
      !attempt?.qrImageUrl ||
      !attempt.qrExpiresAt ||
      attempt.qrExpiresAt <= opts.now() ||
      !['CREATED', 'PENDING'].includes(intent.status) ||
      !provider.fetchQrImage
    ) {
      throw new AppError('NOT_FOUND');
    }
    let image;
    try {
      image = await provider.fetchQrImage(attempt.qrImageUrl);
    } catch {
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    return reply
      .header('content-type', image.contentType)
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .send(image.data);
  });

  /**
   * The donor says they made the transfer (optional UTR). This only marks the intent as waiting
   * for the owner; it can NEVER mark it paid — the owner confirms with bank evidence (#25).
   */
  app.post('/:reference/bank-transfer-claim', { config: limit }, async (request, reply) => {
    const db = database();
    const { reference } = parseInput(ReferenceParams, request.params);
    const { utr } = parseInput(ClaimBody, request.body);
    const intent = await db.donationIntent.findUnique({ where: { publicReference: reference } });
    if (!intent || intent.channel !== 'BANK_TRANSFER') throw new AppError('NOT_FOUND');
    if (intent.status === 'CREATED' || intent.status === 'PENDING') {
      await db.$transaction(async (tx) => {
        await tx.bankTransferClaim.create({ data: { donationIntentId: intent.id, utr } });
        if (intent.status === 'CREATED')
          await transitionDonation(tx, intent.id, 'PENDING', 'donor_report');
      });
    }
    // Same answer whatever the state: the donor sees "not confirmed yet" until the owner confirms.
    return reply
      .code(202)
      .send({ publicReference: reference, status: intent.status === 'PAID' ? 'PAID' : 'PENDING' });
  });
}

function bankAccount(settings: {
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
}): TrustBankAccount | null {
  const { bankAccountName, bankAccountNumber, bankIfsc, bankName } = settings;
  return bankAccountName && bankAccountNumber && bankIfsc && bankName
    ? { accountName: bankAccountName, accountNumber: bankAccountNumber, ifsc: bankIfsc, bankName }
    : null;
}

function bankResponse(
  intent: { publicReference: string; giftPaise: number; amountPaise: number },
  account: TrustBankAccount,
): BankTransferIntentResponse {
  return {
    publicReference: intent.publicReference,
    giftPaise: intent.giftPaise,
    feePaise: 0,
    amountPaise: intent.amountPaise,
    currency: 'INR',
    bankTransfer: account,
  };
}

function qrResponse(
  intent: { publicReference: string; giftPaise: number; feePaise: number; amountPaise: number },
  expiresAt: Date,
): DonationQrResponse {
  return {
    publicReference: intent.publicReference,
    giftPaise: intent.giftPaise,
    feePaise: intent.feePaise,
    amountPaise: intent.amountPaise,
    currency: 'INR',
    qr: {
      imagePath: `/donation-intents/${intent.publicReference}/qr.png`,
      expiresAt: expiresAt.toISOString(),
    },
  };
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
