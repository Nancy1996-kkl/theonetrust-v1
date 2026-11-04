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
  return donations.createIntent({ giftPaise: rupeesToPaise(500), donorName: 'Synthetic Donor' });
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
      'bank_transfer_claims',
      'bank_transfer_records',
      'content_sections',
      'donation_intents',
      'donation_status_events',
      'donation_subscriptions',
      'donor_identity_records',
      'help_request_notes',
      'help_requests',
      'impact_metrics',
      'notification_outbox',
      'payment_attempts',
      'payment_exceptions',
      'programmes',
      'receipts',
      'subscription_plans',
      'subscription_status_events',
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
        data: { publicReference: unique('ref'), amountPaise: 99, giftPaise: 99, donorName: 'X' },
      }),
    );
    expect(err).toMatch(/donation_intents_amount_min|donation_intents_amount_is_gift_plus_fee/);
  });

  it('rejects an amount that is not gift + fee', async () => {
    const err = await pgError(
      db.donationIntent.create({
        data: {
          publicReference: unique('ref'),
          amountPaise: 500,
          giftPaise: 400,
          feePaise: 50,
          donorName: 'X',
        },
      }),
    );
    expect(err).toContain('donation_intents_amount_is_gift_plus_fee');
  });

  it('rejects non-INR currency', async () => {
    const err = await pgError(
      db.donationIntent.create({
        data: {
          publicReference: unique('ref'),
          amountPaise: 100,
          giftPaise: 100,
          donorName: 'X',
          currency: 'USD',
        },
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
    const num = () => `TOT-R-2026-27-${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    const number = num();
    const base = {
      donationIntentId: intent.id,
      templateVersion: 'v1',
      amountPaise: 50_000,
      tokenSalt: unique('salt-salt-salt-salt'),
    };
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
            receiptNumber: num(),
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

  it('only matches a bank transfer with a donation, an admin, a time and a reason', async () => {
    const admin = await db.adminUser.create({
      data: { email: `${unique('bank')}@example.org`, passwordHash: 'x' },
    });
    const base = {
      bankReference: `UTR${Date.now()}`,
      amountPaise: 100_000,
      receivedOn: new Date('2026-11-01'),
      evidence: 'Statement line 1',
      recordedById: admin.id,
    };
    expect(
      await pgError(
        db.bankTransferRecord.create({
          data: { ...base, status: 'MATCHED', decisionReason: 'Seen on statement' },
        }),
      ),
    ).toContain('bank_transfer_records_match_evidence');
    expect(
      await pgError(db.bankTransferRecord.create({ data: { ...base, status: 'REJECTED' } })),
    ).toContain('bank_transfer_records_decision_reason');
    expect(
      await pgError(db.bankTransferRecord.create({ data: { ...base, bankReference: 'utr-1' } })),
    ).toContain('bank_transfer_records_reference_format');
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
