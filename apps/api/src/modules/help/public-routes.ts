import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CALL_TIMES,
  HELP_DESCRIPTION_MAX,
  HELP_FOR,
  HELP_KINDS,
  HELP_PERSON_MAX,
  normalizeIndianMobile,
  validateHelpRequest,
  type HelpRequest,
  type HelpRequestAccepted,
} from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { ownerEmailFor } from '../../db/repositories/trust-settings.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { newHelpReference } from './reference.ts';

const locale = z.enum(['ta', 'en']);

/** Shapes from packages/contracts; cross-field rules come from validateHelpRequest. */
const WizardBody = z.object({
  mode: z.literal('wizard'),
  helpFor: z.enum(HELP_FOR),
  kinds: z.array(z.enum(HELP_KINDS)).min(1).max(HELP_KINDS.length),
  description: z.string().max(HELP_DESCRIPTION_MAX),
  phone: z.string().max(30),
  personNameOrVillage: z.string().max(HELP_PERSON_MAX),
  callLanguage: locale,
  bestTime: z.enum(CALL_TIMES),
  consentContact: z.literal(true),
  consentThirdParty: z.boolean(),
  pageLanguage: locale,
  website: z.string().max(200),
});

const CallbackBody = z.object({
  mode: z.literal('callback'),
  phone: z.string().max(30),
  consentContact: z.literal(true),
  pageLanguage: locale,
  website: z.string().max(200),
});

export interface HelpPublicOptions {
  db?: Db;
  perHour: number;
  duplicateWindowMs: number;
  ownerEmail?: string;
  now: () => Date;
}

/** A filled honeypot means a bot: answer like a success, store nothing. */
function isHoneypotHit(body: unknown): boolean {
  const website = (body as { website?: unknown } | null)?.website;
  return typeof website === 'string' && website.trim() !== '';
}

/**
 * `POST /api/v1/help-requests` and `/help-requests/callback` (plan §5). Rate-limited per IP,
 * honeypot, server-side validation with the same rules as the form, duplicate protection,
 * owner notification through the outbox (only once an owner email is configured).
 */
export async function helpPublicRoutes(app: FastifyInstance, opts: HelpPublicOptions) {
  const limit = { rateLimit: { max: opts.perHour, timeWindow: 3_600_000 } };

  async function accept(request: HelpRequest, requestId: string): Promise<HelpRequestAccepted> {
    const db = opts.db;
    if (!db) throw new AppError('SERVICE_UNAVAILABLE');
    const problems = validateHelpRequest(request);
    if (problems.length > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        problems.map((path) => ({ path, issue: 'invalid' })),
      );
    }
    const phone = normalizeIndianMobile(request.phone);
    /* c8 ignore next -- validateHelpRequest already rejected an invalid phone */
    if (!phone) throw new AppError('VALIDATION_ERROR', [{ path: 'phone', issue: 'invalid' }]);
    const now = opts.now();
    const kind = request.mode === 'wizard' ? 'FULL' : 'CALLBACK';

    // Same phone again within the window (double tap, retry after a timeout): same reference.
    if (opts.duplicateWindowMs > 0) {
      const recent = await db.helpRequest.findFirst({
        where: {
          contactPhone: phone,
          kind,
          createdAt: { gte: new Date(now.getTime() - opts.duplicateWindowMs) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) return { reference: recent.reference };
    }

    const data =
      request.mode === 'wizard'
        ? {
            kind: 'FULL' as const,
            forWhom: request.helpFor,
            helpTypes: request.kinds,
            description: request.description.trim() || null,
            personNameOrVillage:
              request.helpFor === 'self' ? null : request.personNameOrVillage.trim() || null,
            locale: request.callLanguage,
            pageLocale: request.pageLanguage,
            bestTime: request.bestTime,
            thirdPartyConsentAt: request.helpFor === 'self' ? null : now,
          }
        : {
            kind: 'CALLBACK' as const,
            helpTypes: [],
            locale: request.pageLanguage,
            pageLocale: request.pageLanguage,
          };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reference = newHelpReference();
      try {
        await db.$transaction(async (tx) => {
          const created = await tx.helpRequest.create({
            data: { ...data, reference, contactPhone: phone, consentAt: now, createdAt: now },
          });
          await tx.auditLog.create({
            data: {
              actorId: null,
              action: 'help_request.created',
              entityType: 'help_request',
              entityId: created.id,
              changedFields: [],
              correlationId: requestId,
            },
          });
          if (await ownerEmailFor(tx, opts.ownerEmail)) {
            // The worker looks the request up by reference; no personal data in the outbox.
            await tx.notificationOutbox.create({
              data: {
                eventType: 'help_request.created',
                entityRef: `help_request:${created.id}`,
                template: 'owner_help_request_new',
                locale: 'en',
                dedupeKey: `help_request.created:${created.id}`,
              },
            });
          }
        });
        return { reference };
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'P2002' || attempt === 2) throw error; // retry only a reference collision
      }
    }
    /* c8 ignore next */
    throw new AppError('INTERNAL_ERROR');
  }

  app.post('/', { config: limit }, async (request, reply) => {
    if (isHoneypotHit(request.body)) {
      request.log.info('Help request honeypot hit');
      return reply.code(201).send({ reference: newHelpReference() });
    }
    const body = parseInput(WizardBody, request.body) as HelpRequest;
    return reply.code(201).send(await accept(body, request.id));
  });

  app.post('/callback', { config: limit }, async (request, reply) => {
    if (isHoneypotHit(request.body)) {
      request.log.info('Help callback honeypot hit');
      return reply.code(201).send({ reference: newHelpReference() });
    }
    const body = parseInput(CallbackBody, request.body) as HelpRequest;
    return reply.code(201).send(await accept(body, request.id));
  });
}
