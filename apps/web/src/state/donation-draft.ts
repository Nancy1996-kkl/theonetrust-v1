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

export const DRAFT_STORAGE_KEY = 'theonetrust:donation-draft';

/**
 * The draft also lives in this tab's sessionStorage, so it survives a full page load (a header
 * link after a language switch, a refresh, a cancelled checkout). It holds no personal data.
 * Approved URL keys win over the stored draft.
 */
export function initialDraft(
  search: string,
  storage: Pick<Storage, 'getItem'> | undefined,
): DonationDraft {
  const fromUrl = draftFromSearch(search);
  if (fromUrl.programme || fromUrl.amountPaise || fromUrl.frequency === 'monthly') return fromUrl;
  try {
    const raw = storage?.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return fromUrl;
    const saved = JSON.parse(raw) as { programme?: unknown; amountPaise?: unknown };
    const params = new URLSearchParams();
    if (typeof saved.programme === 'string') params.set('programme', saved.programme);
    if (typeof saved.amountPaise === 'number' && Number.isInteger(saved.amountPaise)) {
      params.set('amount', String(saved.amountPaise / 100));
    }
    // Re-validated exactly like URL input.
    return draftFromSearch(`?${params.toString()}`);
  } catch {
    return fromUrl;
  }
}

export function saveDraft(
  draft: DonationDraft,
  storage: Pick<Storage, 'setItem'> | undefined,
): void {
  try {
    storage?.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ programme: draft.programme, amountPaise: draft.amountPaise }),
    );
  } catch {
    // Storage can be blocked (private mode); the draft then lasts until the page reloads.
  }
}
