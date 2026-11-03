import { describe, expect, it } from 'vitest';
import { rupeesToPaise } from '@theonetrust/contracts';
import { donationRepository } from './repositories/donations.ts';
import { unique, useTestDb } from '../test/db.ts';

const db = useTestDb();
const donations = donationRepository(db);

/** Postgres error code from a failed Prisma call through the pg driver adapter. */
async function pgError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  }
  throw new Error('expected the database to reject this write');
}

function newIntent() {
  return donations.createIntent({ amountPaise: rupeesToPaise(500), donorName: 'Synthetic Donor' });
}

describe('migration from an empty database', () => {
  it('creates every table in the data model', async () => {
    const rows = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
    expect(rows.map((r) => r.table_name)).toEqual([
      '_prisma_migrations',
      'admin_recovery_codes',
      'admin_sessions',
      'admin_users',
      'audit_logs',
      'bank_transfer_records',
      'content_sections',
      'donation_intents',
      'donation_subscriptions',
      'donor_identity_records',
      'help_request_notes',
      'help_requests',
      'impact_metrics',
      'notification_outbox',
      'payment_attempts',
      'programmes',
      'receipts',
      'tax_certificate_tracking',
      'transparency_documents',
      'trust_settings',
      'webhook_events',
    ]);
  });

  it('uses UUID primary keys and integer paise columns', async () => {
    const rows = await db.$queryRaw<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'donation_intents'
        AND column_name IN ('id', 'amount_paise')
      ORDER BY column_name`;
    expect(rows).toEqual([
      { column_name: 'amount_paise', data_type: 'integer' },
      { column_name: 'id', data_type: 'uuid' },
    ]);
  });

  it('stores no card, UPI or plain PAN columns anywhere', async () => {
    const rows = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns WHERE table_schema = 'public'`;
    const names = rows.map((r) => r.column_name);
    expect(names.filter((n) => /card|cvv|upi_pin|^pan$|pan_number/.test(n))).toEqual([]);
  });
});

describe('money constraints', () => {
  it('rejects a donation below ₹1 (100 paise)', async () => {
    const err = await pgError(
      db.donationIntent.create({
        data: { publicReference: unique('ref'), amountPaise: 99, donorName: 'X' },
      }),
    );
    expect(err).toContain('donation_intents_amount_min');
  });

  it('rejects non-INR currency', async () => {
    const err = await pgError(
      db.donationIntent.create({
        data: { publicReference: unique('ref'), amountPaise: 100, donorName: 'X', currency: 'USD' },
      }),
    );
    expect(err).toContain('donation_intents_currency_inr');
  });

  it('rejects captured above the order amount and refunds above captured', async () => {
    const intent = await newIntent();
    for (const data of [
      { capturedPaise: 50_001 },
      { capturedPaise: 100, refundedPaise: 101 },
      { capturedPaise: -1 },
    ]) {
      const err = await pgError(
        db.paymentAttempt.create({
          data: {
            donationIntentId: intent.id,
            providerOrderId: unique('order'),
            amountPaise: 50_000,
            ...data,
          },
        }),
      );
      expect(err).toContain('payment_attempts_amounts_valid');
    }
  });
});

describe('uniqueness of provider and receipt identifiers', () => {
  it('rejects a duplicate provider order ID and payment ID', async () => {
    const intent = await newIntent();
    const orderId = unique('order');
    const paymentId = unique('pay');
    await db.paymentAttempt.create({
      data: {
        donationIntentId: intent.id,
        providerOrderId: orderId,
        providerPaymentId: paymentId,
        amountPaise: 50_000,
      },
    });
    expect(
      await pgError(
        db.paymentAttempt.create({
          data: { donationIntentId: intent.id, providerOrderId: orderId, amountPaise: 50_000 },
        }),
      ),
    ).toContain('provider_order_id');
    expect(
      await pgError(
        db.paymentAttempt.create({
          data: {
            donationIntentId: intent.id,
            providerOrderId: unique('order'),
            providerPaymentId: paymentId,
            amountPaise: 50_000,
          },
        }),
      ),
    ).toContain('provider_payment_id');
  });

  it('allows many attempts without a payment ID yet (NULLs are not duplicates)', async () => {
    const intent = await newIntent();
    for (let i = 0; i < 2; i += 1) {
      await donations.addPaymentAttempt({
        donationIntentId: intent.id,
        providerOrderId: unique('order'),
        amountPaise: rupeesToPaise(500),
      });
    }
    expect(await db.paymentAttempt.count({ where: { donationIntentId: intent.id } })).toBe(2);
  });

  it('deduplicates webhook events per provider', async () => {
    const eventId = unique('evt');
    const data = { providerEventId: eventId, eventType: 'payment.captured', signatureValid: true };
    await db.webhookEvent.create({ data });
    expect(await pgError(db.webhookEvent.create({ data }))).toContain('provider_event_id');
  });

  it('allows one receipt per payment and unique receipt numbers', async () => {
    const intent = await newIntent();
    const attempt = await donations.addPaymentAttempt({
      donationIntentId: intent.id,
      providerOrderId: unique('order'),
      amountPaise: rupeesToPaise(500),
    });
    const other = await donations.addPaymentAttempt({
      donationIntentId: intent.id,
      providerOrderId: unique('order'),
      amountPaise: rupeesToPaise(500),
    });
    const number = unique('TOT-R');
    const base = { donationIntentId: intent.id, templateVersion: 'v1' };
    await db.receipt.create({
      data: {
        ...base,
        paymentAttemptId: attempt.id,
        receiptNumber: number,
        tokenHash: unique('h'),
      },
    });
    expect(
      await pgError(
        db.receipt.create({
          data: {
            ...base,
            paymentAttemptId: attempt.id,
            receiptNumber: unique('n'),
            tokenHash: unique('h'),
          },
        }),
      ),
    ).toContain('payment_attempt_id');
    expect(
      await pgError(
        db.receipt.create({
          data: {
            ...base,
            paymentAttemptId: other.id,
            receiptNumber: number,
            tokenHash: unique('h'),
          },
        }),
      ),
    ).toContain('receipt_number');
  });
});

describe('referential integrity', () => {
  it('refuses to delete a donation that has payment records', async () => {
    const intent = await newIntent();
    await donations.addPaymentAttempt({
      donationIntentId: intent.id,
      providerOrderId: unique('order'),
      amountPaise: rupeesToPaise(500),
    });
    expect(await pgError(db.donationIntent.delete({ where: { id: intent.id } }))).toMatch(
      /foreign key|P2003|23001|23503/i,
    );
  });
});

describe('tax and evidence rules', () => {
  it('never marks Form 114 issued without its reference and date', async () => {
    const intent = await newIntent();
    const err = await pgError(
      db.taxCertificateTracking.create({
        data: {
          donationIntentId: intent.id,
          financialYear: '2026-27',
          status: 'FORM_114_ISSUED',
          form113Reference: 'F113-SYN',
        },
      }),
    );
    expect(err).toContain('tax_certificate_tracking_form114_evidence');
  });

  it('requires a financial year like 2026-27', async () => {
    const intent = await newIntent();
    const err = await pgError(
      db.taxCertificateTracking.create({
        data: { donationIntentId: intent.id, financialYear: '2026' },
      }),
    );
    expect(err).toContain('tax_certificate_tracking_fy_format');
  });

  it('does not publish an impact metric without source, period, date and approval', async () => {
    const err = await pgError(
      db.impactMetric.create({
        data: { labelTa: 'சோதனை', labelEn: 'Synthetic', value: 1n, status: 'PUBLISHED' },
      }),
    );
    expect(err).toContain('impact_metrics_published_evidence');
  });

  it('only matches a bank transfer with a donation, an admin and a time', async () => {
    const err = await pgError(
      db.bankTransferRecord.create({
        data: {
          bankReference: unique('UTR'),
          amountPaise: 100_000,
          receivedOn: new Date('2026-11-01'),
          status: 'MATCHED',
        },
      }),
    );
    expect(err).toContain('bank_transfer_records_match_evidence');
  });

  it('stores PAN ciphertext only together with its key version', async () => {
    const intent = await newIntent();
    const err = await pgError(
      db.donorIdentityRecord.create({
        data: {
          donationIntentId: intent.id,
          fullName: 'Synthetic Donor',
          panCiphertext: new Uint8Array([1, 2, 3]),
        },
      }),
    );
    expect(err).toContain('donor_identity_records_pan_pair');
  });
});

describe('settings and audit log', () => {
  it('keeps trust settings a single row with tax benefit off by default', async () => {
    const settings = await db.trustSettings.upsert({ where: { id: 1 }, create: {}, update: {} });
    expect(settings).toMatchObject({ id: 1, taxBenefitEnabled: false, receiptMinPaise: 50_000 });
    expect(await pgError(db.trustSettings.create({ data: { id: 2 } }))).toContain(
      'trust_settings_singleton',
    );
  });

  it('is append-only: updates and deletes are refused', async () => {
    const entry = await db.auditLog.create({
      data: { action: 'settings.update', entityType: 'trust_settings', changedFields: ['x'] },
    });
    expect(
      await pgError(db.auditLog.update({ where: { id: entry.id }, data: { reason: 'edit' } })),
    ).toContain('append-only');
    expect(await pgError(db.auditLog.delete({ where: { id: entry.id } }))).toContain('append-only');
  });
});
