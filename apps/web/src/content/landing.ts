import type { UiLang } from '../components/ui/ui-strings.ts';

/**
 * Landing-page content (issue #12) — the single source for hero, about, ways we help,
 * how a donation helps and how it works. Components never hard-code this text.
 *
 * Gating rule (CLAUDE.md, issue #1): anything about the trust that the trust has not confirmed
 * is `confirmed: false`. Unconfirmed items are NOT rendered on the live site; they are shown,
 * marked "Draft", only when VITE_SHOW_DRAFT_CONTENT=true (review/preview builds).
 * Draft wording comes from the reviewed wireframe (docs/design/wireframes/landing.html).
 * When the owner dashboard exists (#21, #36) this file is replaced by API data of the same shape.
 */
export type Bilingual = Record<UiLang, string>;

export interface Gated<T> {
  confirmed: boolean;
  value: T;
}

export type FundType = 'general' | 'earmarked';

export interface Programme {
  /** URL-safe id passed to the donate panel: /?programme=<slug>#donate */
  slug: string;
  title: Bilingual;
  /** One line: what the help is. */
  summary: Bilingual | null;
  /** Who the help is for. */
  whoFor: Bilingual | null;
  fund: FundType;
  /** The large card in the bento grid (the general fund, so no need looks more important). */
  featured?: boolean;
  confirmed: boolean;
}

export interface DonationExample {
  /** Whole rupees. Shown only when the trust has verified what it covers. */
  amountRupees: number;
  covers: Bilingual;
  confirmed: boolean;
}

export interface LandingContent {
  hero: {
    eyebrow: Gated<Bilingual> | null;
    headline: Gated<Bilingual>;
    /**
     * Words inside the headline set on their own line in the accent colour. Ignored when the
     * (owner-edited) headline no longer contains them, so a CMS edit can never break the title.
     */
    headlineAccent: Bilingual | null;
    lead: Gated<Bilingual> | null;
    donateCta: Bilingual;
    learnMoreCta: Bilingual;
    getHelpPrompt: Bilingual;
    getHelpCta: Bilingual;
    paymentNote: Gated<Bilingual>;
    /** Accessible labels for the banner's pause control (WCAG 2.2.2: moving content > 5 s). */
    pauseBanner: Bilingual;
    playBanner: Bilingual;
  };
  about: {
    title: Bilingual;
    intro: Gated<Bilingual> | null;
    factLabels: {
      legalName: Bilingual;
      registration: Bilingual;
      established: Bilingual;
      area: Bilingual;
      taxApproval: Bilingual;
    };
  };
  ways: {
    title: Bilingual;
    intro: Gated<Bilingual> | null;
    giveCta: Bilingual;
    fundLabels: Record<FundType, Bilingual>;
    whoForLabel: Bilingual;
    programmes: Programme[];
  };
  donationHelps: {
    title: Bilingual;
    illustrativeNote: Bilingual;
    examples: DonationExample[];
  };
  howItWorks: {
    title: Bilingual;
    steps: Bilingual[];
    policyLink: Bilingual;
  };
  draftLabel: Bilingual;
}

const unconfirmedProgramme = (slug: string, title: Bilingual): Programme => ({
  slug,
  title,
  summary: null,
  whoFor: null,
  fund: 'earmarked',
  confirmed: false,
});

export const LANDING_CONTENT: LandingContent = {
  hero: {
    // Hero wording supplied by the site owner with the approved hero design (5 Nov 2026).
    eyebrow: {
      confirmed: true,
      value: { en: 'Together we can', ta: 'ஒன்றிணைந்தால் முடியும்' },
    },
    headline: {
      confirmed: true,
      value: {
        en: 'Build a Better Tomorrow',
        ta: 'சிறந்த நாளையை ஒன்றாக உருவாக்குவோம்',
      },
    },
    headlineAccent: { en: 'Tomorrow', ta: 'சிறந்த நாளையை' },
    lead: {
      confirmed: true,
      value: {
        en: 'We are a non-profit trust working for the development and a better future of underprivileged children and communities.',
        ta: 'பின்தங்கிய குழந்தைகள் மற்றும் சமூகங்களின் வளர்ச்சிக்காகவும் சிறந்த எதிர்காலத்துக்காகவும் செயல்படும் லாப நோக்கற்ற அறக்கட்டளை நாங்கள்.',
      },
    },
    donateCta: { en: 'Donate now', ta: 'இப்போதே நன்கொடை கொடுங்கள்' },
    learnMoreCta: { en: 'Learn more', ta: 'மேலும் அறிய' },
    getHelpPrompt: {
      en: 'Does your family need support?',
      ta: 'உங்கள் குடும்பத்திற்கு உதவி தேவையா?',
    },
    getHelpCta: { en: 'Get Help', ta: 'உதவி பெற' },
    paymentNote: {
      confirmed: false, // [CONFIRM] #1 — Razorpay account not yet live
      value: {
        en: 'Secure payment via Razorpay · UPI, cards, netbanking · Acknowledgement after verified payment',
        ta: 'Razorpay மூலம் பாதுகாப்பாகப் பணம் செலுத்தலாம் · UPI, கார்டு, நெட்பேங்கிங் · பணம் வந்தது உறுதியான பிறகே ஒப்புகை',
      },
    },
    pauseBanner: { en: 'Pause banner animation', ta: 'பதாகை அசைவை நிறுத்து' },
    playBanner: { en: 'Play banner animation', ta: 'பதாகை அசைவை இயக்கு' },
  },
  about: {
    title: { en: 'About the trust', ta: 'அறக்கட்டளையைப் பற்றி' },
    intro: null, // [CONFIRM] #1 — short introduction, mission and vision from the owner
    factLabels: {
      legalName: { en: 'Legal name', ta: 'சட்டப்பூர்வ பெயர்' },
      registration: { en: 'Registration', ta: 'பதிவு' },
      established: { en: 'Established', ta: 'தொடங்கப்பட்டது' },
      area: { en: 'Area', ta: 'பகுதி' },
      taxApproval: { en: 'Tax approval', ta: 'வரி ஒப்புதல்' },
    },
  },
  ways: {
    title: { en: 'Ways we help', ta: 'நாங்கள் உதவும் வழிகள்' },
    intro: null, // [CONFIRM] #1 — final list from the trust
    giveCta: { en: 'Give', ta: 'நன்கொடை கொடுக்க' },
    fundLabels: {
      general: { en: 'General fund', ta: 'பொது நிதி' },
      earmarked: { en: 'For this need', ta: 'இந்தத் தேவைக்கு' },
    },
    whoForLabel: { en: 'For', ta: 'யாருக்கு' },
    programmes: [
      {
        // Giving to the trust's general fund is how every donation works, so it needs no claim.
        slug: 'general',
        title: { en: 'Where it’s needed most', ta: 'அதிகம் தேவைப்படும் இடத்துக்கு' },
        summary: {
          en: 'A general donation the trust uses for the most urgent needs.',
          ta: 'அந்த நேரத்தில் மிக அவசரமான தேவைக்கு அறக்கட்டளை பயன்படுத்தும் பொது நன்கொடை.',
        },
        whoFor: {
          en: 'Whoever needs it most at the time',
          ta: 'அந்த நேரத்தில் மிகவும் தேவைப்படுபவர்கள்',
        },
        fund: 'general',
        featured: true,
        confirmed: true,
      },
      unconfirmedProgramme('education', { en: 'Education', ta: 'கல்வி' }),
      unconfirmedProgramme('food', {
        en: 'Food & essentials',
        ta: 'உணவும் அன்றாடத் தேவைப் பொருட்களும்',
      }),
      unconfirmedProgramme('health', { en: 'Health access', ta: 'மருத்துவ உதவி' }),
      unconfirmedProgramme('emergency', { en: 'Emergency support', ta: 'அவசர உதவி' }),
      unconfirmedProgramme('livelihood', { en: 'Livelihood', ta: 'வாழ்வாதாரம்' }),
      unconfirmedProgramme('other', { en: 'Other help', ta: 'மற்ற உதவிகள்' }),
    ],
  },
  donationHelps: {
    title: { en: 'How a donation helps', ta: 'ஒரு நன்கொடை எப்படி உதவுகிறது' },
    illustrativeNote: {
      en: 'Illustrative examples. Actual costs vary; amounts not used for one need go to the general fund.',
      ta: 'இவை எடுத்துக்காட்டுகள் மட்டுமே. உண்மையான செலவு மாறலாம்; ஒரு தேவைக்குப் பயன்படாத தொகை பொது நிதிக்குப் போகும்.',
    },
    examples: [], // [CONFIRM] #1 — only verified costs; the section stays hidden until then
  },
  howItWorks: {
    title: { en: 'How it works', ta: 'இது எப்படி நடக்கிறது' },
    steps: [
      { en: 'Choose a need', ta: 'தேவையைத் தேர்ந்தெடுங்கள்' },
      { en: 'Choose an amount', ta: 'தொகையைத் தேர்ந்தெடுங்கள்' },
      { en: 'Pay securely', ta: 'பாதுகாப்பாகச் செலுத்துங்கள்' },
      {
        en: 'Get an acknowledgement and updates',
        ta: 'ஒப்புகையும் புதுத் தகவல்களும் உங்களுக்கு வரும்',
      },
    ],
    policyLink: {
      en: 'Payment help, refunds and corrections',
      ta: 'பணம் செலுத்துவதில் உதவி, பணம் திரும்பத் தருதல், திருத்தங்கள்',
    },
  },
  draftLabel: { en: 'Draft — not yet confirmed', ta: 'வரைவு — இன்னும் உறுதியாகவில்லை' },
};

/** Whether unconfirmed content may be shown (preview builds only, always labelled "Draft"). */
export function draftsVisible(
  env: { VITE_SHOW_DRAFT_CONTENT?: string } = import.meta.env,
): boolean {
  return env.VITE_SHOW_DRAFT_CONTENT === 'true';
}

/** A gated value if it may be shown, else null. */
export function visible<T>(item: Gated<T> | null, showDrafts: boolean): Gated<T> | null {
  if (!item) return null;
  return item.confirmed || showDrafts ? item : null;
}
