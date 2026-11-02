import type { UiLang } from '../components/ui/ui-strings.ts';

/**
 * Facts about the trust that the public site may show. ONLY values confirmed in issue #1
 * (see docs/design/sitemap.md "Contact facts confirmed so far"). Anything not yet confirmed
 * is null and is hidden by every component — never replace a null with a guess.
 */
export interface TrustFacts {
  siteName: string;
  legalName: string | null;
  registration: string | null;
  established: string | null;
  taxApproval: Record<UiLang, string> | null;
  phone: { display: string; tel: string } | null;
  whatsappUrl: string | null;
  email: string | null;
  area: Record<UiLang, string> | null;
  callHours: Record<UiLang, string> | null;
}

export const TRUST_FACTS: TrustFacts = {
  siteName: 'Theonetrust.in',
  legalName: null, // [CONFIRM] #1
  registration: null, // [CONFIRM] #1
  established: null, // [CONFIRM] #1
  taxApproval: null, // [CONFIRM] #1 + CA — never shown without evidence
  phone: { display: '+91 96005 16999', tel: '+919600516999' },
  whatsappUrl: 'https://wa.me/919600516999',
  email: 'info.theonetrust@gmail.com',
  area: { en: 'Kanchipuram, Tamil Nadu', ta: 'காஞ்சிபுரம், தமிழ்நாடு' },
  callHours: { en: 'Every day, 8 AM – 10 PM', ta: 'தினமும், காலை 8 – இரவு 10' },
};
