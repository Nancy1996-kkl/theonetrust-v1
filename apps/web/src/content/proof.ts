import type { Bilingual } from './landing.ts';

/**
 * Proof and questions (issue #13): impact & stories, transparency centre, FAQ, contact,
 * final call to action. Same gating rule as landing.ts — `confirmed: false` is hidden on the
 * live site and shown as "Draft" only in preview builds.
 *
 * Payment and tax answers follow docs/research/2026-10-payment-limits.md and the plan
 * (docs/website-plan.md §7, §17). The tax answer states the honest current status: no deduction
 * is promised until the CA confirms approval (taxBenefitEnabled defaults off).
 */

export interface ImpactMetric {
  id: string;
  value: string;
  label: Bilingual;
  /** Required to publish: where the figure comes from, the period it covers and when it was updated. */
  source: Bilingual;
  period: Bilingual;
  updated: string; // ISO date
  confirmed: boolean;
}

export interface Story {
  id: string;
  title: Bilingual;
  body: Bilingual;
  /** Documented consent (guardian/organisation for minors). Without it a story is never shown. */
  consent: boolean;
  confirmed: boolean;
}

export interface TransparencyDocument {
  id: string;
  title: Bilingual;
  language: 'en' | 'ta' | 'en+ta';
  period: Bilingual;
  published: string; // ISO date
  fileType: 'PDF' | 'JPG' | 'PNG';
  url: string;
  /** Approved by the owner for public release (personal and bank data redacted). */
  approved: boolean;
}

export interface Faq {
  id: string;
  question: Bilingual;
  answer: Bilingual;
  confirmed: boolean;
}

export interface ProofContent {
  impact: {
    title: Bilingual;
    metrics: ImpactMetric[];
    stories: Story[];
    emptyTitle: Bilingual;
    emptyBody: Bilingual;
    sourceLabel: Bilingual;
    periodLabel: Bilingual;
    updatedLabel: Bilingual;
    seeDocuments: Bilingual;
  };
  transparency: {
    title: Bilingual;
    documents: TransparencyDocument[];
    emptyTitle: Bilingual;
    emptyBody: Bilingual;
    download: Bilingual;
    languageNames: Record<TransparencyDocument['language'], Bilingual>;
    tableCaption: Bilingual;
    columns: {
      document: Bilingual;
      language: Bilingual;
      period: Bilingual;
      published: Bilingual;
      file: Bilingual;
    };
  };
  faq: { title: Bilingual; items: Faq[]; emptyTitle: Bilingual };
  contact: {
    title: Bilingual;
    addressLabel: Bilingual;
    helpTitle: Bilingual;
    helpBody: Bilingual;
    helpCta: Bilingual;
    whatsappCta: Bilingual;
  };
  finalCta: {
    title: { confirmed: boolean; value: Bilingual };
    fallbackTitle: Bilingual;
    amountLegend: Bilingual;
    presetsRupees: number[];
    donateCta: Bilingual;
  };
  states: {
    loadingTitle: Bilingual;
    errorTitle: Bilingual;
    errorBody: Bilingual;
    retry: Bilingual;
  };
}

export const PROOF_CONTENT: ProofContent = {
  impact: {
    title: { en: 'Our impact', ta: 'எங்கள் தாக்கம்' },
    metrics: [], // [CONFIRM] #1 — only sourced, dated figures
    stories: [], // [CONFIRM] #1 — only with documented consent
    emptyTitle: {
      en: 'Figures will be published here',
      ta: 'புள்ளிவிவரங்கள் இங்கே வெளியிடப்படும்',
    },
    emptyBody: {
      en: 'We publish numbers only when they have a source and a date. Until then, our documents show the trust’s details.',
      ta: 'ஆதாரமும் தேதியும் உள்ள எண்களை மட்டுமே வெளியிடுகிறோம். அதுவரை அறக்கட்டளையின் விவரங்களை எங்கள் ஆவணங்களில் காணலாம்.',
    },
    sourceLabel: { en: 'Source', ta: 'ஆதாரம்' },
    periodLabel: { en: 'Period', ta: 'காலம்' },
    updatedLabel: { en: 'Updated', ta: 'புதுப்பிக்கப்பட்டது' },
    seeDocuments: { en: 'See our documents', ta: 'எங்கள் ஆவணங்களைப் பாருங்கள்' },
  },
  transparency: {
    title: { en: 'Transparency', ta: 'வெளிப்படைத்தன்மை' },
    documents: [], // [CONFIRM] #1 — owner-approved documents only
    emptyTitle: {
      en: 'Documents will be published here',
      ta: 'ஆவணங்கள் இங்கே வெளியிடப்படும்',
    },
    emptyBody: {
      en: 'Registration, reports and policies appear here once the trust approves them for publication.',
      ta: 'பதிவு, அறிக்கைகள் மற்றும் கொள்கைகளை அறக்கட்டளை அங்கீகரித்தவுடன் இங்கே காணலாம்.',
    },
    download: { en: 'Download', ta: 'பதிவிறக்கு' },
    languageNames: {
      en: { en: 'English', ta: 'ஆங்கிலம்' },
      ta: { en: 'Tamil', ta: 'தமிழ்' },
      'en+ta': { en: 'English and Tamil', ta: 'ஆங்கிலம் மற்றும் தமிழ்' },
    },
    tableCaption: { en: 'Published documents', ta: 'வெளியிடப்பட்ட ஆவணங்கள்' },
    columns: {
      document: { en: 'Document', ta: 'ஆவணம்' },
      language: { en: 'Language', ta: 'மொழி' },
      period: { en: 'Period', ta: 'காலம்' },
      published: { en: 'Published', ta: 'வெளியீடு' },
      file: { en: 'File', ta: 'கோப்பு' },
    },
  },
  faq: {
    title: { en: 'Questions', ta: 'கேள்விகள்' },
    emptyTitle: { en: 'Answers will be added soon', ta: 'பதில்கள் விரைவில் சேர்க்கப்படும்' },
    items: [
      {
        id: 'donation-use',
        confirmed: false, // [CONFIRM] #1 — the trust's own allocation policy
        question: {
          en: 'How is my donation used?',
          ta: 'என் நன்கொடை எப்படிப் பயன்படுத்தப்படுகிறது?',
        },
        answer: {
          en: 'General donations go where the need is greatest at the time. The trust will publish how funds are allocated in its transparency documents.',
          ta: 'பொது நன்கொடைகள் அந்த நேரத்தில் மிகவும் தேவைப்படும் இடத்திற்குச் செல்லும். நிதி எப்படி ஒதுக்கப்படுகிறது என்பதை அறக்கட்டளை தனது வெளிப்படைத்தன்மை ஆவணங்களில் வெளியிடும்.',
        },
      },
      {
        id: 'earmarking',
        confirmed: false, // [CONFIRM] #1 — whether separate accounting per need is possible
        question: {
          en: 'Can I choose what my donation is for?',
          ta: 'என் நன்கொடை எதற்காக என்று நான் தேர்ந்தெடுக்கலாமா?',
        },
        answer: {
          en: 'Yes. Choose a need on a “Ways we help” card, or “Where it’s needed most” for the general fund. If a need is fully funded or closes, the amount is used for the most urgent needs.',
          ta: 'ஆம். “நாங்கள் உதவும் வழிகள்” பகுதியில் ஒரு தேவையைத் தேர்ந்தெடுங்கள், அல்லது பொது நிதிக்கு “மிகவும் தேவைப்படும் இடத்திற்கு” என்பதைத் தேர்ந்தெடுங்கள். ஒரு தேவைக்கு முழு நிதி கிடைத்துவிட்டால் அல்லது அது முடிந்துவிட்டால், அந்தத் தொகை மிக அவசரத் தேவைகளுக்குப் பயன்படுத்தப்படும்.',
        },
      },
      {
        id: 'pending-failed',
        confirmed: true,
        question: {
          en: 'My payment is pending or failed. What should I do?',
          ta: 'என் கட்டணம் நிலுவையில் உள்ளது அல்லது தோல்வியடைந்தது. நான் என்ன செய்ய வேண்டும்?',
        },
        answer: {
          en: 'A donation counts only after our server confirms it with the payment provider. If it shows as pending, use “Check again” and do not pay a second time. If money left your account but the payment failed, it is normally reversed by your bank automatically. If it is not, contact us with the date and amount.',
          ta: 'கட்டண நிறுவனத்துடன் எங்கள் சர்வர் உறுதிசெய்த பிறகே நன்கொடை கணக்கில் சேரும். நிலுவையில் இருப்பதாகக் காட்டினால், “மீண்டும் சரிபார்” என்பதைப் பயன்படுத்துங்கள்; இரண்டாவது முறை செலுத்த வேண்டாம். உங்கள் கணக்கிலிருந்து பணம் போய் கட்டணம் தோல்வியடைந்தால், பொதுவாக உங்கள் வங்கி தானாகவே அதைத் திருப்பித் தரும். அப்படி இல்லையெனில், தேதி மற்றும் தொகையுடன் எங்களைத் தொடர்பு கொள்ளுங்கள்.',
        },
      },
      {
        id: 'upi-failed',
        confirmed: true,
        question: { en: 'Why did my UPI payment fail?', ta: 'என் UPI கட்டணம் ஏன் தோல்வியடைந்தது?' },
        answer: {
          en: 'Banks and UPI apps set their own limits. The usual limit is ₹1 lakh per payment, but some banks set a lower limit, and new UPI users can often send only ₹5,000 in their first 24 hours. Try a smaller amount, a card or netbanking, or try again later.',
          ta: 'வங்கிகளும் UPI செயலிகளும் தங்களுக்கென வரம்புகளை வைத்துள்ளன. வழக்கமான வரம்பு ஒரு கட்டணத்துக்கு ₹1 லட்சம்; சில வங்கிகள் குறைந்த வரம்பு வைக்கலாம், புதிய UPI பயனர்கள் முதல் 24 மணி நேரத்தில் பெரும்பாலும் ₹5,000 மட்டுமே அனுப்ப முடியும். சிறிய தொகை, கார்டு அல்லது நெட்பேங்கிங் மூலம் முயற்சிக்கவும், அல்லது பின்னர் மீண்டும் முயற்சிக்கவும்.',
        },
      },
      {
        id: 'acknowledgement',
        confirmed: true,
        question: { en: 'When do I get my acknowledgement?', ta: 'ஒப்புகை எப்போது கிடைக்கும்?' },
        answer: {
          en: 'As soon as your payment is verified — never before. Above the minimum amount shown in the donate panel you can download a donation acknowledgement, and we email the link if you gave an email address.',
          ta: 'உங்கள் கட்டணம் சரிபார்க்கப்பட்டவுடன் — அதற்கு முன் ஒருபோதும் இல்லை. நன்கொடைப் பகுதியில் காட்டப்படும் குறைந்தபட்சத் தொகைக்கு மேல், நன்கொடை ஒப்புகையைப் பதிவிறக்கலாம்; மின்னஞ்சல் முகவரி கொடுத்திருந்தால் அதன் இணைப்பை அனுப்புவோம்.',
        },
      },
      {
        id: 'tax',
        confirmed: true, // honest status — update only when the CA confirms approval
        question: { en: 'Can I claim a tax deduction?', ta: 'வரி விலக்கு கோர முடியுமா?' },
        answer: {
          en: 'Not at the moment. The trust has not yet confirmed approval for donations to be tax-deductible, so we do not promise a deduction. You receive a donation acknowledgement, not a tax certificate. We will update this answer if approval is confirmed.',
          ta: 'தற்போது இல்லை. நன்கொடைகளுக்கு வரி விலக்கு பெறுவதற்கான ஒப்புதலை அறக்கட்டளை இன்னும் உறுதிசெய்யவில்லை, எனவே வரி விலக்கை நாங்கள் உறுதியளிப்பதில்லை. உங்களுக்கு நன்கொடை ஒப்புகை கிடைக்கும், வரிச் சான்றிதழ் அல்ல. ஒப்புதல் உறுதியானால் இந்தப் பதிலைப் புதுப்பிப்போம்.',
        },
      },
      {
        id: 'upi-over-2000',
        confirmed: true,
        question: {
          en: 'Does the ₹2,000 limit apply to UPI donations?',
          ta: '₹2,000 வரம்பு UPI நன்கொடைகளுக்குப் பொருந்துமா?',
        },
        answer: {
          en: 'No. The ₹2,000 limit for tax deductions applies only to cash. UPI, cards and netbanking are not cash, so a larger online gift is not affected. Whether any deduction applies depends on the trust’s approval (see the question above).',
          ta: 'இல்லை. வரி விலக்குக்கான ₹2,000 வரம்பு ரொக்கத்துக்கு மட்டுமே பொருந்தும். UPI, கார்டு, நெட்பேங்கிங் ஆகியவை ரொக்கம் அல்ல, எனவே பெரிய ஆன்லைன் நன்கொடை இதனால் பாதிக்கப்படாது. ஏதேனும் விலக்கு கிடைக்குமா என்பது அறக்கட்டளையின் ஒப்புதலைப் பொறுத்தது (மேலே உள்ள கேள்வியைப் பாருங்கள்).',
        },
      },
      {
        id: 'stop-monthly',
        confirmed: false, // [CONFIRM] — monthly giving enablement (#32)
        question: {
          en: 'How do I stop monthly giving?',
          ta: 'மாதாந்திர நன்கொடையை எப்படி நிறுத்துவது?',
        },
        answer: {
          en: 'Use the “manage” link in your monthly-giving email to cancel at any time, without logging in. UPI AutoPay can also be paused or cancelled in your UPI app.',
          ta: 'மாதாந்திர நன்கொடை மின்னஞ்சலில் உள்ள “நிர்வகி” இணைப்பின் மூலம், உள்நுழையாமலேயே எப்போது வேண்டுமானாலும் ரத்து செய்யலாம். UPI AutoPay-ஐ உங்கள் UPI செயலியிலும் இடைநிறுத்தலாம் அல்லது ரத்து செய்யலாம்.',
        },
      },
      {
        id: 'request-help',
        confirmed: true,
        question: { en: 'How do I ask for help?', ta: 'உதவி எப்படிக் கேட்பது?' },
        answer: {
          en: 'Press “Get Help” and tell us briefly what is needed, or call or WhatsApp us. We will call you back. Sending a request does not guarantee help.',
          ta: '“உதவி பெற” என்பதை அழுத்தி, என்ன தேவை என்று சுருக்கமாகச் சொல்லுங்கள், அல்லது எங்களை அழைக்கவும் அல்லது WhatsApp செய்யவும். நாங்கள் உங்களைத் திரும்ப அழைப்போம். கோரிக்கை அனுப்புவது உதவிக்கு உத்தரவாதம் அல்ல.',
        },
      },
      {
        id: 'data-use',
        confirmed: true,
        question: {
          en: 'How is my information used?',
          ta: 'என் தகவல்கள் எப்படிப் பயன்படுத்தப்படுகின்றன?',
        },
        answer: {
          en: 'Your name and contact details are used only to process your donation or request, send your acknowledgement and contact you about it. They are never shown publicly or sold. The privacy policy has the details.',
          ta: 'உங்கள் பெயரும் தொடர்பு விவரங்களும் உங்கள் நன்கொடை அல்லது கோரிக்கையைச் செயல்படுத்த, ஒப்புகையை அனுப்ப மற்றும் அது தொடர்பாக உங்களைத் தொடர்பு கொள்ள மட்டுமே பயன்படுத்தப்படும். அவை ஒருபோதும் பொதுவில் காட்டப்படுவதில்லை, விற்கப்படுவதுமில்லை. விவரங்கள் தனியுரிமைக் கொள்கையில் உள்ளன.',
        },
      },
      {
        id: 'report-concern',
        confirmed: true,
        question: { en: 'How do I report a concern?', ta: 'ஒரு புகாரை எப்படித் தெரிவிப்பது?' },
        answer: {
          en: 'Call, WhatsApp or email us using the details under “Contact”. Tell us what happened and how we can reach you.',
          ta: '“தொடர்பு” பகுதியில் உள்ள விவரங்களைப் பயன்படுத்தி எங்களை அழைக்கவும், WhatsApp செய்யவும் அல்லது மின்னஞ்சல் அனுப்பவும். என்ன நடந்தது, உங்களை எப்படித் தொடர்பு கொள்வது என்பதைச் சொல்லுங்கள்.',
        },
      },
    ],
  },
  contact: {
    title: { en: 'Contact us', ta: 'எங்களைத் தொடர்பு கொள்ள' },
    addressLabel: { en: 'Address', ta: 'முகவரி' },
    helpTitle: { en: 'Ask for help', ta: 'உதவி கேளுங்கள்' },
    helpBody: {
      en: 'For yourself or for someone you know. Tell us briefly what is needed and we will call you back. Sending a request does not guarantee help.',
      ta: 'உங்களுக்காகவோ உங்களுக்குத் தெரிந்தவருக்காகவோ. என்ன தேவை என்று சுருக்கமாகச் சொல்லுங்கள், நாங்கள் உங்களைத் திரும்ப அழைப்போம். கோரிக்கை அனுப்புவது உதவிக்கு உத்தரவாதம் அல்ல.',
    },
    helpCta: { en: 'Get Help', ta: 'உதவி பெற' },
    whatsappCta: { en: 'WhatsApp us', ta: 'WhatsApp செய்யுங்கள்' },
  },
  finalCta: {
    title: {
      confirmed: false, // [CONFIRM] #1 — draft from the wireframe
      value: {
        en: 'Your contribution can change a life.',
        ta: 'உங்கள் பங்களிப்பு ஒரு வாழ்க்கையை மாற்றும்.',
      },
    },
    fallbackTitle: { en: 'Make a donation', ta: 'நன்கொடை அளியுங்கள்' },
    amountLegend: { en: 'Choose an amount', ta: 'தொகையைத் தேர்ந்தெடுங்கள்' },
    presetsRupees: [500, 1000, 2000, 5000],
    donateCta: { en: 'Donate now', ta: 'இப்போதே நன்கொடை அளியுங்கள்' },
  },
  states: {
    loadingTitle: { en: 'Loading…', ta: 'ஏற்றப்படுகிறது…' },
    errorTitle: { en: 'This section could not be loaded', ta: 'இந்தப் பகுதியை ஏற்ற முடியவில்லை' },
    errorBody: {
      en: 'Please check your connection and try again.',
      ta: 'உங்கள் இணைய இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
    },
    retry: { en: 'Try again', ta: 'மீண்டும் முயற்சிக்கவும்' },
  },
};

/** A metric is publishable only with a source, a period and an update date (spec §4.7). */
export function isPublishableMetric(metric: ImpactMetric): boolean {
  return Boolean(
    metric.value.trim() &&
    metric.source.en.trim() &&
    metric.source.ta.trim() &&
    metric.period.en.trim() &&
    metric.period.ta.trim() &&
    !Number.isNaN(Date.parse(metric.updated)),
  );
}

/** A story is shown only with documented consent. */
export function isPublishableStory(story: Story): boolean {
  return story.consent;
}
