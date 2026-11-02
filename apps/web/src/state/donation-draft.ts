import { createContext, useContext } from 'react';
import { rupeesToPaise, type Paise } from '@theonetrust/contracts';
import { parseRupees } from '../components/ui/amount.ts';

/**
 * What the donor has chosen so far. Lives in the app shell, above the language routes, so
 * switching தமிழ் / English never clears it (issue #11). Never contains personal data.
 */
export interface DonationDraft {
  programme: string | null;
  amountPaise: Paise | null;
  frequency: 'once' | 'monthly';
}

export const EMPTY_DRAFT: DonationDraft = { programme: null, amountPaise: null, frequency: 'once' };

const PROGRAMME_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/**
 * Reads the approved pre-fill keys (?programme=&amount=&frequency=, sitemap URL rules).
 * Anything unknown or invalid is ignored — the server validates everything again.
 */
export function draftFromSearch(search: string): DonationDraft {
  const params = new URLSearchParams(search);
  const programme = params.get('programme')?.trim().toLowerCase() ?? '';
  const amount = parseRupees(params.get('amount') ?? '');
  return {
    programme: PROGRAMME_SLUG.test(programme) ? programme : null,
    amountPaise: amount.ok ? rupeesToPaise(amount.rupees) : null,
    frequency: params.get('frequency') === 'monthly' ? 'monthly' : 'once',
  };
}

export interface DonationDraftApi {
  draft: DonationDraft;
  updateDraft: (patch: Partial<DonationDraft>) => void;
}

export const DonationDraftContext = createContext<DonationDraftApi | null>(null);

export function useDonationDraft(): DonationDraftApi {
  const api = useContext(DonationDraftContext);
  if (!api) throw new Error('useDonationDraft must be used inside the app shell');
  return api;
}
