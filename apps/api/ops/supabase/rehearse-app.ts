/**
 * Phase 2b rehearsal (local only, run by rehearse-local.sh): the real app, connected as the
 * restricted theonetrust_app role to the local mirror, makes, verifies and acknowledges a
 * donation; every forbidden action must be refused. Exits 1 on any failure.
 */
import { createHmac } from 'node:crypto';
import { buildApp } from '../../src/app.ts';
import { loadEnv } from '../../src/config/env.ts';
import { createDb } from '../../src/db/client.ts';
import {
  razorpayProvider,
  type PaymentProvider,
  type ProviderPayment,
} from '../../src/modules/donations/provider.ts';

const url = process.env.REHEARSAL_APP_URL ?? '';
if (
  !/^postgresql:\/\/theonetrust_app:[^@]+@(localhost|127\.0\.0\.1):\d+\/tt_rehearsal$/.test(url)
) {
  console.error('REHEARSAL_APP_URL must be the local tt_rehearsal database as theonetrust_app');
  process.exit(1);
}
const db = createDb(url, {}, 'theonetrust');
const SECRET = 'rehearsal-key-secret-01';
const remote = new Map<string, ProviderPayment>();
let seq = 0;
const real = razorpayProvider({
  keyId: 'rzp_test_rehearsal01',
  keySecret: SECRET,
  fetch: async () => new Response('{}'),
});
const provider: PaymentProvider = {
  name: 'RAZORPAY',
  publicKeyId: 'rzp_test_rehearsal01',
  verifyCheckoutSignature: real.verifyCheckoutSignature,
  createOrder: async (input) => ({
    orderId: `order_R${String(++seq).padStart(8, '0')}`,
    amountPaise: input.amountPaise,
    currency: 'INR',
    status: 'created',
  }),
  fetchPayment: async (id) => {
    const p = remote.get(id);
    if (!p) throw new Error('unknown payment');
    return p;
  },
  fetchOrderPayments: async (orderId) => [...remote.values()].filter((p) => p.orderId === orderId),
};
const app = buildApp(loadEnv({ NODE_ENV: 'test' }), { db, paymentProvider: provider });
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
    hideNamePublicly: true,
    wantsReceipt: true,
    coverFee: false,
    consent: true,
    locale: 'en',
  },
});
check('create a donation in theonetrust', created.statusCode === 201, String(created.statusCode));
const { publicReference, checkout } = created.json() as {
  publicReference: string;
  checkout: { orderId: string };
};
const payment: ProviderPayment = {
  paymentId: 'pay_R00000001',
  orderId: checkout.orderId,
  amountPaise: 100_000,
  currency: 'INR',
  status: 'captured',
  method: 'upi',
  refundedPaise: 0,
};
remote.set(payment.paymentId, payment);
const verified = await app.inject({
  method: 'POST',
  url: '/api/v1/payments/verify',
  remoteAddress: '10.1.1.2',
  payload: {
    publicReference,
    orderId: checkout.orderId,
    paymentId: payment.paymentId,
    signature: createHmac('sha256', SECRET)
      .update(`${checkout.orderId}|${payment.paymentId}`)
      .digest('hex'),
  },
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
