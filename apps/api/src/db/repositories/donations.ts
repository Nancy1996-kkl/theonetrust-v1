import type { Paise } from '@theonetrust/contracts';
import type { Db } from '../client.ts';
import type { Locale } from '../../generated/prisma/enums.ts';
import { newDonationReference } from '../references.ts';

export interface NewDonationIntent {
  amountPaise: Paise;
  donorName: string;
  donorEmail?: string | null;
  donorPhone?: string | null;
  programmeId?: string | null;
  hideNamePublicly?: boolean;
  wantsReceipt?: boolean;
  wantsTaxCertificate?: boolean;
  coverFee?: boolean;
  locale?: Locale;
}

export interface NewPaymentAttempt {
  donationIntentId: string;
  providerOrderId: string;
  amountPaise: Paise;
}

/**
 * Ledger writes for donations. Status changes are NOT here: they belong to the payment
 * transition service (#24/#25), which is the only code allowed to move an intent to PAID.
 */
export function donationRepository(db: Db) {
  return {
    createIntent(input: NewDonationIntent) {
      return db.donationIntent.create({
        data: { ...input, publicReference: newDonationReference(), status: 'CREATED' },
      });
    },

    findByPublicReference(publicReference: string) {
      return db.donationIntent.findUnique({ where: { publicReference } });
    },

    addPaymentAttempt(input: NewPaymentAttempt) {
      return db.paymentAttempt.create({ data: { ...input, provider: 'RAZORPAY' } });
    },

    findAttemptByProviderOrderId(providerOrderId: string) {
      return db.paymentAttempt.findUnique({ where: { providerOrderId } });
    },
  };
}
