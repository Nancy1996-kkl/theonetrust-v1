/**
 * Phase 2b rehearsal (local only, run by rehearse-local.sh): the real app, connected as the
 * restricted theonetrust_app role to the local mirror, makes, verifies and acknowledges a
 * donation; every forbidden action must be refused. Exits 1 on any failure.
 */
import { buildApp } from '../../src/app.ts';
import { loadEnv } from '../../src/config/env.ts';
import { createDb } from '../../src/db/client.ts';
import { fakeCashfree } from '../../src/test/fake-cashfree.ts';

const url = process.env.REHEARSAL_APP_URL ?? '';
if (
  !/^postgresql:\/\/theonetrust_app:[^@]+@(localhost|127\.0\.0\.1):\d+\/tt_rehearsal$/.test(url)
) {
  console.error('REHEARSAL_APP_URL must be the local tt_rehearsal database as theonetrust_app');
  process.exit(1);
}
const db = createDb(url, {}, 'theonetrust');
// The real Cashfree adapter against a local fake: nothing leaves the machine.
const cf = fakeCashfree('rehearsal-cashfree-secret-01');
const app = buildApp(loadEnv({ NODE_ENV: 'test', ...cf.env }), {
  db,
  paymentProvider: cf.provider,
});
const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = '') => results.push([name, ok, detail]);
async function denied(name: string, action: () => Promise<unknown>) {
  try {
    await action();
    check(name, false, 'was ALLOWED');
  } catch (error) {
    const message = String((error as Error).message);
    check(
      name,
      /42501|permission denied|must be owner/.test(message),
      message.split('\n').pop() ?? '',
    );
  }
}

const created = await app.inject({
  method: 'POST',
  url: '/api/v1/donation-intents',
  remoteAddress: '10.1.1.1',
  payload: {
    giftPaise: 100_000,
    currency: 'INR',
    programme: null,
    donorName: 'Rehearsal Donor',
    donorEmail: 'rehearsal@example.org',
    donorPhone: '+919876543210',
    hideNamePublicly: true,
    wantsReceipt: true,
    coverFee: false,
    consent: true,
    locale: 'en',
  },
});
check('create a donation in theonetrust', created.statusCode === 201, String(created.statusCode));
const { publicReference } = created.json() as { publicReference: string };
cf.pay(publicReference);
const verified = await app.inject({
  method: 'POST',
  url: '/api/v1/payments/verify',
  remoteAddress: '10.1.1.2',
  payload: { publicReference },
});
check('verified payment → PAID', (verified.json() as { status: string }).status === 'PAID');
check(
  'acknowledgement numbered (sequence via the role search_path)',
  (await db.receipt.count()) === 1,
);
const programme = await db.programme.create({
  data: { slug: `rehearsal-${Date.now()}`, titleTa: 'ஒத்திகை', titleEn: 'Rehearsal' },
});
await db.programme.delete({ where: { id: programme.id } });
check('delete in an allowed table (programmes)', true);
await denied('delete payment history refused', () => db.donationStatusEvent.deleteMany({}));
await denied('delete receipts refused', () => db.receipt.deleteMany({}));
await denied('delete audit log refused', () => db.auditLog.deleteMany({}));
await denied('switch off an append-only trigger refused', () =>
  db.$executeRawUnsafe('ALTER TABLE theonetrust.audit_logs DISABLE TRIGGER USER'),
);
await denied('drop a trust table refused', () =>
  db.$executeRawUnsafe('DROP TABLE theonetrust.programmes'),
);
await denied('read the cafe refused', () => db.$queryRawUnsafe('SELECT * FROM public.cafe_orders'));
await denied('write the same-name cafe table refused', () =>
  db.$executeRawUnsafe("UPDATE public.programmes SET note = 'x'"),
);
await denied('write the migration history refused', () =>
  db.$executeRawUnsafe('DELETE FROM theonetrust._prisma_migrations'),
);
await app.close();
await db.$disconnect();
for (const [name, ok, detail] of results) {
  console.warn(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail.slice(0, 90)}]` : ''}`);
}
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
