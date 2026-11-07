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
    title: { en: 'Our impact', ta: 'எங்கள் பணியின் பலன்' },
    metrics: [], // [CONFIRM] #1 — only sourced, dated figures
    stories: [], // [CONFIRM] #1 — only with documented consent
    emptyTitle: {
      en: 'Figures will be published here',
      ta: 'எண்ணிக்கைகள் இங்கே வரும்',
    },
    emptyBody: {
      en: 'We publish numbers only when they have a source and a date. Until then, our documents show the trust’s details.',
      ta: 'ஆதாரமும் தேதியும் உள்ள எண்களை மட்டுமே இங்கே போடுவோம். அதுவரை அறக்கட்டளையின் விவரங்களை எங்கள் ஆவணங்களில் பார்க்கலாம்.',
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
      ta: 'ஆவணங்கள் இங்கே வரும்',
    },
    emptyBody: {
      en: 'Registration, reports and policies appear here once the trust approves them for publication.',
      ta: 'பதிவு, அறிக்கைகள், கொள்கைகள் — அறக்கட்டளை ஒப்புதல் கொடுத்தவுடன் இங்கே பார்க்கலாம்.',
    },
    download: { en: 'Download', ta: 'பதிவிறக்கு' },
    languageNames: {
      en: { en: 'English', ta: 'ஆங்கிலம்' },
      ta: { en: 'Tamil', ta: 'தமிழ்' },
      'en+ta': { en: 'English and Tamil', ta: 'ஆங்கிலம், தமிழ்' },
    },
    tableCaption: { en: 'Published documents', ta: 'வெளியிடப்பட்ட ஆவணங்கள்' },
    columns: {
      document: { en: 'Document', ta: 'ஆவணம்' },
      language: { en: 'Language', ta: 'மொழி' },
      period: { en: 'Period', ta: 'காலம்' },
      published: { en: 'Published', ta: 'வெளியிட்ட தேதி' },
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
          ta: 'பொது நன்கொடைகள் அந்த நேரத்தில் அதிகம் தேவைப்படும் இடத்துக்குப் போகும். பணம் எப்படிப் பிரித்துச் செலவிடப்படுகிறது என்பதை அறக்கட்டளை தன் வெளிப்படைத்தன்மை ஆவணங்களில் சொல்லும்.',
        },
      },
      {
        id: 'earmarking',
        confirmed: false, // [CONFIRM] #1 — whether separate accounting per need is possible
        question: {
          en: 'Can I choose what my donation is for?',
          ta: 'என் நன்கொடை எதற்குப் போக வேண்டும் என்று நானே தேர்வு செய்யலாமா?',
        },
        answer: {
          en: 'Yes. Choose a need on a “Ways we help” card, or “Where it’s needed most” for the general fund. If a need is fully funded or closes, the amount is used for the most urgent needs.',
          ta: 'ஆம். “நாங்கள் உதவும் வழிகள்” பகுதியில் ஒரு தேவையைத் தேர்வு செய்யுங்கள், அல்லது பொது நிதிக்கு “அதிகம் தேவைப்படும் இடத்துக்கு” என்பதைத் தேர்வு செய்யுங்கள். ஒரு தேவைக்கு வேண்டிய முழுப் பணமும் வந்துவிட்டாலோ, அந்த வேலை முடிந்துவிட்டாலோ, மீதித் தொகை மிக அவசரமான தேவைக்குப் பயன்படும்.',
        },
      },
      {
        id: 'pending-failed',
        confirmed: true,
        question: {
          en: 'My payment is pending or failed. What should I do?',
          ta: 'என் பணம் இன்னும் உறுதியாகவில்லை, அல்லது செலுத்த முடியவில்லை. இப்போது என்ன செய்வது?',
        },
        answer: {
          en: 'A donation counts only after our server confirms it with the payment provider. If it shows as pending, use “Check again” and do not pay a second time. If money left your account but the payment failed, it is normally reversed by your bank automatically. If it is not, contact us with the date and amount.',
          ta: 'பணம் வந்தது என்று பணம் செலுத்தும் நிறுவனத்திடம் நாங்கள் சரிபார்த்த பிறகே நன்கொடை கணக்கில் சேரும். “இன்னும் உறுதியாகவில்லை” என்று காட்டினால், “மீண்டும் சரிபார்” என்பதை அழுத்துங்கள்; மறுபடி பணம் செலுத்த வேண்டாம். உங்கள் கணக்கிலிருந்து பணம் போய், செலுத்துதல் தோல்வியடைந்தால், பொதுவாக உங்கள் வங்கியே அதைத் திருப்பித் தந்துவிடும். அப்படித் திரும்ப வரவில்லை என்றால், தேதியையும் தொகையையும் சொல்லி எங்களைத் தொடர்பு கொள்ளுங்கள்.',
        },
      },
      {
        id: 'upi-failed',
        confirmed: true,
        question: { en: 'Why did my UPI payment fail?', ta: 'என் UPI பணம் ஏன் போகவில்லை?' },
        answer: {
          en: 'Banks and UPI apps set their own limits. The usual limit is ₹1 lakh per payment, but some banks set a lower limit, and new UPI users can often send only ₹5,000 in their first 24 hours. Try a smaller amount, a card or netbanking, or try again later.',
          ta: 'வங்கிகளும் UPI செயலிகளும் தங்களுக்கென்று ஒரு வரம்பு வைத்திருக்கின்றன. பொதுவாக ஒரு முறைக்கு ₹1 லட்சம் வரை அனுப்பலாம்; சில வங்கிகள் இதைவிடக் குறைவாக வைத்திருக்கும். புதிதாக UPI தொடங்கியவர்கள் முதல் 24 மணி நேரத்தில் பெரும்பாலும் ₹5,000 வரை மட்டுமே அனுப்ப முடியும். சின்னத் தொகையாக அனுப்பிப் பாருங்கள், அல்லது கார்டு / நெட்பேங்கிங் மூலம் செலுத்துங்கள், இல்லையென்றால் கொஞ்சம் கழித்து மறுபடி முயற்சி செய்யுங்கள்.',
        },
      },
      {
        id: 'acknowledgement',
        confirmed: true,
        question: { en: 'When do I get my acknowledgement?', ta: 'ஒப்புகை எப்போது கிடைக்கும்?' },
        answer: {
          en: 'As soon as your payment is verified — never before. Above the minimum amount shown in the donate panel you can download a donation acknowledgement, and we email the link if you gave an email address.',
          ta: 'உங்கள் பணம் வந்தது உறுதியானவுடன் — அதற்கு முன் எப்போதும் இல்லை. நன்கொடைப் பகுதியில் சொல்லியிருக்கும் குறைந்த தொகைக்கு மேல் கொடுத்தால், ஒப்புகையைப் பதிவிறக்கிக்கொள்ளலாம்; மின்னஞ்சல் கொடுத்திருந்தால் அதன் இணைப்பையும் அனுப்புவோம்.',
        },
      },
      {
        id: 'tax',
        confirmed: true, // honest status — update only when the CA confirms approval
        question: { en: 'Can I claim a tax deduction?', ta: 'வரி விலக்கு கிடைக்குமா?' },
        answer: {
          en: 'Not at the moment. The trust has not yet confirmed approval for donations to be tax-deductible, so we do not promise a deduction. You receive a donation acknowledgement, not a tax certificate. We will update this answer if approval is confirmed.',
          ta: 'இப்போதைக்கு இல்லை. நன்கொடைக்கு வரி விலக்கு தருவதற்கான ஒப்புதல் அறக்கட்டளைக்கு இன்னும் உறுதியாகவில்லை, அதனால் வரி விலக்கு கிடைக்கும் என்று நாங்கள் சொல்ல முடியாது. உங்களுக்கு நன்கொடை ஒப்புகை கிடைக்கும், வரிச் சான்றிதழ் அல்ல. ஒப்புதல் கிடைத்தவுடன் இந்தப் பதிலை மாற்றுவோம்.',
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
          ta: 'இல்லை. வரி விலக்குக்கான ₹2,000 வரம்பு கையில் கொடுக்கும் பணத்துக்கு (ரொக்கம்) மட்டும்தான். UPI, கார்டு, நெட்பேங்கிங் ரொக்கம் இல்லை, அதனால் இணையம் வழியாகக் கொடுக்கும் பெரிய நன்கொடைக்கு இந்த வரம்பு இல்லை. விலக்கு கிடைக்குமா என்பது அறக்கட்டளையின் ஒப்புதலைப் பொறுத்தது (மேலே உள்ள கேள்வியைப் பாருங்கள்).',
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
          ta: 'மாதாந்திர நன்கொடை மின்னஞ்சலில் இருக்கும் “நிர்வகி” இணைப்பைத் திறந்து, கணக்கில் நுழையாமலே எப்போது வேண்டுமானாலும் ரத்து செய்யலாம். UPI AutoPay-ஐ உங்கள் UPI செயலியிலேயே நிறுத்தி வைக்கலாம் அல்லது ரத்து செய்யலாம்.',
        },
      },
      {
        id: 'request-help',
        confirmed: true,
        question: { en: 'How do I ask for help?', ta: 'உதவி எப்படிக் கேட்பது?' },
        answer: {
          en: 'Press “Get Help” and tell us briefly what is needed, or call or WhatsApp us. We will call you back. Sending a request does not guarantee help.',
          ta: '“உதவி பெற” என்பதை அழுத்தி, என்ன தேவை என்று சுருக்கமாகச் சொல்லுங்கள். இல்லையென்றால் எங்களை அழையுங்கள் அல்லது WhatsApp செய்யுங்கள். நாங்கள் உங்களைத் திரும்ப அழைப்போம். கோரிக்கை அனுப்பினாலே உதவி கிடைக்கும் என்று உறுதி சொல்ல முடியாது.',
        },
      },
      {
        id: 'data-use',
        confirmed: true,
        question: {
          en: 'How is my information used?',
          ta: 'என் விவரங்களை எதற்குப் பயன்படுத்துவீர்கள்?',
        },
        answer: {
          en: 'Your name and contact details are used only to process your donation or request, send your acknowledgement and contact you about it. They are never shown publicly or sold. The privacy policy has the details.',
          ta: 'உங்கள் பெயரையும் தொடர்பு விவரங்களையும் உங்கள் நன்கொடையையோ கோரிக்கையையோ கவனிக்க, ஒப்புகை அனுப்ப, அதைப் பற்றி உங்களிடம் பேச — இதற்கு மட்டுமே பயன்படுத்துவோம். அவற்றை யாருக்கும் காட்டுவதும் இல்லை, விற்பதும் இல்லை. முழு விவரம் தனியுரிமைக் கொள்கையில் உள்ளது.',
        },
      },
      {
        id: 'report-concern',
        confirmed: true,
        question: { en: 'How do I report a concern?', ta: 'ஏதாவது புகார் சொல்ல வேண்டுமென்றால்?' },
        answer: {
          en: 'Call, WhatsApp or email us using the details under “Contact”. Tell us what happened and how we can reach you.',
          ta: '“தொடர்பு” பகுதியில் உள்ள விவரங்களை வைத்து எங்களை அழையுங்கள், WhatsApp செய்யுங்கள், அல்லது மின்னஞ்சல் அனுப்புங்கள். என்ன நடந்தது, உங்களை எப்படித் தொடர்பு கொள்வது என்று சொல்லுங்கள்.',
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
      ta: 'உங்களுக்கோ உங்களுக்குத் தெரிந்தவருக்கோ கேட்கலாம். என்ன தேவை என்று சுருக்கமாகச் சொல்லுங்கள், நாங்கள் உங்களைத் திரும்ப அழைப்போம். கோரிக்கை அனுப்பினாலே உதவி கிடைக்கும் என்று உறுதி சொல்ல முடியாது.',
    },
    helpCta: { en: 'Get Help', ta: 'உதவி பெற' },
    whatsappCta: { en: 'WhatsApp us', ta: 'WhatsApp செய்யுங்கள்' },
  },
  finalCta: {
    title: {
      confirmed: false, // [CONFIRM] #1 — draft from the wireframe
      value: {
        en: 'Your contribution can change a life.',
        ta: 'நீங்கள் கொடுப்பது ஒருவரின் வாழ்க்கையையே மாற்றும்.',
      },
    },
    fallbackTitle: { en: 'Make a donation', ta: 'நன்கொடை கொடுங்கள்' },
    amountLegend: { en: 'Choose an amount', ta: 'தொகையைத் தேர்ந்தெடுங்கள்' },
    presetsRupees: [500, 1000, 2000, 5000],
    donateCta: { en: 'Donate now', ta: 'இப்போதே நன்கொடை கொடுங்கள்' },
  },
  states: {
    loadingTitle: { en: 'Loading…', ta: 'கொஞ்சம் பொறுங்கள்…' },
    errorTitle: { en: 'This section could not be loaded', ta: 'இந்தப் பகுதியை ஏற்ற முடியவில்லை' },
    errorBody: {
      en: 'Please check your connection and try again.',
      ta: 'இணையம் சரியாக இருக்கிறதா என்று பார்த்து, மறுபடி முயற்சி செய்யுங்கள்.',
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
