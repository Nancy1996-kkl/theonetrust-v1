import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AdminTrustSettings } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { trustSettingsRepository } from '../../db/repositories/trust-settings.ts';
import { Prisma, type TrustSettings } from '../../generated/prisma/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { changedFieldNames } from '../audit/audit.ts';
import { parseFeeTable } from '../donations/fees.ts';
import { defined } from './content.ts';

/** Server configuration shown as status only. Secrets are never passed in here. */
export interface PaymentConfigStatus {
  keyId: string | undefined;
  keySecretSet: boolean;
  webhookSecretSet: boolean;
  subscriptionsEnabled: boolean;
}

const optional = (max: number) => z.string().trim().min(2).max(max).nullable().optional();
const Body = z.object({
  legalName: optional(200),
  registrationText: optional(400),
  receiptMinPaise: z.number().int().min(0).max(100_000_000).optional(),
  maxDonationPaise: z.number().int().min(100).max(1_000_000_000).optional(),
  ownerEmail: z.email().max(200).nullable().optional(),
  feeTable: z.unknown().optional(),
  reason: z.string().trim().min(5).max(400),
});

function view(
  s: TrustSettings,
  serverOwnerEmail: string | undefined,
  payment: PaymentConfigStatus,
): AdminTrustSettings {
  return {
    legalName: s.legalName,
    registrationText: s.registrationText,
    receiptMinPaise: s.receiptMinPaise,
    maxDonationPaise: s.maxDonationPaise,
    ownerEmail: s.ownerEmail ?? serverOwnerEmail ?? null,
    ownerEmailSource: s.ownerEmail ? 'settings' : serverOwnerEmail ? 'server' : 'none',
    feeTable: s.feeTable,
    payment: {
      mode: !payment.keyId
        ? 'not_configured'
        : payment.keyId.startsWith('rzp_live_')
          ? 'live'
          : 'test',
      keyId: payment.keyId ?? null,
      keySecretSet: payment.keySecretSet,
      webhookSecretSet: payment.webhookSecretSet,
      subscriptionsEnabled: payment.subscriptionsEnabled,
    },
  };
}

/**
 * `/api/v1/admin/settings` (#36): trust profile, receipt threshold, owner email, fee table and
 * largest online gift. Payment keys are server configuration: shown as status, never editable
 * or readable here. Every change needs a reason and is audited (changed field names only).
 */
export async function settingsAdminRoutes(
  app: FastifyInstance,
  opts: { db: Db; ownerEmail?: string | undefined; payment: PaymentConfigStatus },
) {
  const { db } = opts;

  app.get('/settings', async () =>
    view(await trustSettingsRepository(db).get(), opts.ownerEmail, opts.payment),
  );

  app.patch('/settings', async (request) => {
    const { reason, feeTable, ...rest } = parseInput(Body, request.body);
    if (!request.audit) throw new AppError('SERVICE_UNAVAILABLE');
    if (feeTable !== undefined && feeTable !== null && !parseFeeTable(feeTable)) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'feeTable', issue: 'invalid_fee_table' }]);
    }
    const current = await trustSettingsRepository(db).get();
    if (
      (rest.receiptMinPaise ?? current.receiptMinPaise) >
      (rest.maxDonationPaise ?? current.maxDonationPaise)
    ) {
      throw new AppError('VALIDATION_ERROR', [{ path: 'receiptMinPaise', issue: 'above_max' }]);
    }
    const data = {
      ...defined(rest),
      ...(feeTable !== undefined && {
        feeTable: feeTable === null ? Prisma.DbNull : (feeTable as Prisma.InputJsonValue),
      }),
    };
    const changed = changedFieldNames(
      { ...current, feeTable: JSON.stringify(current.feeTable) } as Record<string, unknown>,
      { ...rest, ...(feeTable !== undefined && { feeTable: JSON.stringify(feeTable) }) },
    );
    const updated = await request.audit.mutate(
      {
        action: 'settings.update',
        entityType: 'trust_settings',
        entityId: '1',
        changedFields: changed,
        reason,
      },
      (tx) => tx.trustSettings.update({ where: { id: 1 }, data }),
    );
    return view(updated, opts.ownerEmail, opts.payment);
  });
}
