import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TaxSettings } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { trustSettingsRepository } from '../../db/repositories/trust-settings.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { changedFieldNames } from '../audit/audit.ts';
import { taxOptInOffered } from './identity.ts';

const text = (max: number) => z.string().trim().min(3).max(max).nullable();
const Body = z
  .object({
    taxBenefitEnabled: z.boolean().optional(),
    rnpoReference: text(80).optional(),
    section354Approval: text(80).optional(),
    approvalValidUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    reason: z.string().trim().min(5).max(400),
  })
  .strict();

function view(
  s: {
    taxBenefitEnabled: boolean;
    rnpoReference: string | null;
    section354Approval: string | null;
    approvalValidUntil: Date | null;
  },
  now: Date,
): TaxSettings {
  return {
    taxBenefitEnabled: s.taxBenefitEnabled,
    rnpoReference: s.rnpoReference,
    section354Approval: s.section354Approval,
    approvalValidUntil: s.approvalValidUntil?.toISOString().slice(0, 10) ?? null,
    offeredNow: taxOptInOffered(s, now),
  };
}

/**
 * `/api/v1/admin/tax-settings` (#34). The tax benefit stays OFF until the owner records the CA-
 * confirmed RNPO reference and Section 354 approval with a validity date AND switches it on.
 * Switching on with anything missing or expired is refused. Every change is audited.
 */
export async function taxAdminRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date }) {
  const { db } = opts;

  app.get('/tax-settings', async () => view(await trustSettingsRepository(db).get(), opts.now()));

  app.patch('/tax-settings', async (request) => {
    const body = parseInput(Body, request.body);
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    const current = await trustSettingsRepository(db).get();
    const next = {
      taxBenefitEnabled: body.taxBenefitEnabled ?? current.taxBenefitEnabled,
      rnpoReference: body.rnpoReference === undefined ? current.rnpoReference : body.rnpoReference,
      section354Approval:
        body.section354Approval === undefined
          ? current.section354Approval
          : body.section354Approval,
      approvalValidUntil:
        body.approvalValidUntil === undefined
          ? current.approvalValidUntil
          : body.approvalValidUntil === null
            ? null
            : new Date(`${body.approvalValidUntil}T00:00:00Z`),
    };
    if (next.taxBenefitEnabled && !taxOptInOffered(next, opts.now())) {
      // Never on with a missing or expired approval.
      throw new AppError('VALIDATION_ERROR', [
        { path: 'taxBenefitEnabled', issue: 'approval_incomplete' },
      ]);
    }
    const before = view(current, opts.now());
    const after = view(next, opts.now());
    const updated = await request.audit.mutate(
      {
        action: 'tax_settings.update',
        entityType: 'trust_settings',
        entityId: '1',
        changedFields: changedFieldNames(
          { ...before, offeredNow: undefined },
          { ...after, offeredNow: undefined },
        ),
        reason: body.reason,
      },
      (tx) => tx.trustSettings.update({ where: { id: 1 }, data: next }),
    );
    return view(updated, opts.now());
  });
}
