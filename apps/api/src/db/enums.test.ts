import { describe, expect, it } from 'vitest';
import {
  DONATION_STATUSES,
  HELP_REQUEST_STATUSES,
  LOCALES,
  TAX_CERTIFICATE_STATUSES,
} from '@theonetrust/contracts';
import {
  DonationStatus,
  HelpRequestStatus,
  Locale,
  TaxCertificateStatus,
} from '../generated/prisma/enums.ts';

/** The database enums must be exactly the shared contract statuses — no drift. */
describe('database enums match packages/contracts', () => {
  it.each([
    ['DonationStatus', DonationStatus, DONATION_STATUSES],
    ['HelpRequestStatus', HelpRequestStatus, HELP_REQUEST_STATUSES],
    ['TaxCertificateStatus', TaxCertificateStatus, TAX_CERTIFICATE_STATUSES],
    ['Locale', Locale, LOCALES],
  ] as const)('%s', (_name, dbEnum, contract) => {
    expect(Object.values(dbEnum).sort()).toEqual([...contract].sort());
  });
});
