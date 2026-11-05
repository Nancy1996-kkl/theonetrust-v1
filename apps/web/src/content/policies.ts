import type { Bilingual } from './landing.ts';

/**
 * Policy pages (issue #14) required by Razorpay before live payments: /privacy, /terms,
 * /refund-policy (with "shipping does not apply"). English and Tamil must say the same thing —
 * policies.test.ts checks the structure matches section by section.
 *
 * Text describes the practices built into this site (plan §7–§12, spec §12, CLAUDE.md privacy
 * rules). Anything that needs the trust's or counsel's decision is `confirmed: false`: on the
 * live site such a section shows a "being reviewed" placeholder instead of the draft wording,
 * and the draft is visible (marked) only in preview builds. Not legal advice — counsel reviews
 * before launch (#38, #39).
 */
export type PolicyId = 'privacy' | 'terms' | 'refund';

export interface PolicySection {
  id: string;
  heading: Bilingual;
  paragraphs: Bilingual[];
  list?: Bilingual[];
  confirmed: boolean;
}

export interface Policy {
  id: PolicyId;
  /** English path; the Tamil mirror is /ta + path (ADR 0004). */
  path: '/privacy' | '/terms' | '/refund-policy';
  title: Bilingual;
  intro: Bilingual;
  sections: PolicySection[];
}

export const POLICY_UI = {
  pendingNotice: {
    en: 'This policy is being reviewed by the trust. Parts marked below will be completed after that review.',
    ta: 'இந்தக் கொள்கையை அறக்கட்டளை மதிப்பாய்வு செய்து வருகிறது. கீழே குறிக்கப்பட்ட பகுதிகள் அந்த மதிப்பாய்வுக்குப் பிறகு நிறைவு செய்யப்படும்.',
  },
  pendingSection: {
    en: 'Being reviewed — this part will be added after the trust confirms it.',
    ta: 'மதிப்பாய்வில் உள்ளது — அறக்கட்டளை உறுதிசெய்த பிறகு இந்தப் பகுதி சேர்க்கப்படும்.',
  },
  draftLabel: { en: 'Draft — not yet confirmed', ta: 'வரைவு — இன்னும் உறுதிசெய்யப்படவில்லை' },
  contactHeading: { en: 'Questions about this policy', ta: 'இந்தக் கொள்கை பற்றிய கேள்விகள்' },
  contactLead: {
    en: 'Contact us and we will reply as soon as we can:',
    ta: 'எங்களைத் தொடர்பு கொள்ளுங்கள், விரைவில் பதில் அளிப்போம்:',
  },
  otherPolicies: { en: 'Other policies', ta: 'மற்ற கொள்கைகள்' },
  formNotice: {
    en: 'By continuing you agree to our',
    ta: 'தொடர்வதன் மூலம் நீங்கள் ஏற்றுக்கொள்வது:',
  },
  and: { en: 'and', ta: 'மற்றும்' },
  policyLinksLabel: { en: 'Policies', ta: 'கொள்கைகள்' },
} satisfies Record<string, Bilingual>;

const p = (en: string, ta: string): Bilingual => ({ en, ta });

export const POLICIES: Record<PolicyId, Policy> = {
  privacy: {
    id: 'privacy',
    path: '/privacy',
    title: p('Privacy policy', 'தனியுரிமைக் கொள்கை'),
    intro: p(
      'This policy explains what information we collect when you donate or ask for help, why we need it and how we protect it.',
      'நீங்கள் நன்கொடை அளிக்கும்போது அல்லது உதவி கேட்கும்போது நாங்கள் சேகரிக்கும் தகவல்கள், அவை ஏன் தேவை, அவற்றை எப்படிப் பாதுகாக்கிறோம் என்பதை இந்தக் கொள்கை விளக்குகிறது.',
    ),
    sections: [
      {
        id: 'donors',
        confirmed: true,
        heading: p('When you donate', 'நீங்கள் நன்கொடை அளிக்கும்போது'),
        paragraphs: [
          p(
            'Required: your name and one way to contact you (phone or email), the amount and the need you chose.',
            'கட்டாயம்: உங்கள் பெயர், உங்களைத் தொடர்பு கொள்ள ஒரு வழி (தொலைபேசி அல்லது மின்னஞ்சல்), தொகை மற்றும் நீங்கள் தேர்ந்தெடுத்த தேவை.',
          ),
          p(
            'Optional: an email address for your acknowledgement. Your PAN and address are asked only if you choose a tax option, and only when that option is available.',
            'விருப்பத்தேர்வு: ஒப்புகைக்கான மின்னஞ்சல் முகவரி. நீங்கள் வரி விருப்பத்தைத் தேர்ந்தெடுத்தால் மட்டுமே, அந்த விருப்பம் கிடைக்கும்போது மட்டுமே, உங்கள் PAN மற்றும் முகவரி கேட்கப்படும்.',
          ),
          p(
            'Card, UPI and bank details are entered on Razorpay, our payment provider. We never see or store them.',
            'கார்டு, UPI மற்றும் வங்கி விவரங்கள் எங்கள் கட்டண நிறுவனமான Razorpay-இல் உள்ளிடப்படுகின்றன. அவற்றை நாங்கள் ஒருபோதும் பார்ப்பதுமில்லை, சேமிப்பதுமில்லை.',
          ),
        ],
      },
      {
        id: 'help-seekers',
        confirmed: true,
        heading: p('When you ask for help', 'நீங்கள் உதவி கேட்கும்போது'),
        paragraphs: [
          p(
            'We ask only for who needs help, the kind of help, a short description, a phone number and the best time to call. We do not ask for medical records, income proof, Aadhaar or photos in the first request.',
            'யாருக்கு உதவி தேவை, எந்த வகையான உதவி, ஒரு சிறு விளக்கம், தொலைபேசி எண் மற்றும் அழைக்க ஏற்ற நேரம் ஆகியவற்றை மட்டுமே கேட்கிறோம். முதல் கோரிக்கையில் மருத்துவ ஆவணங்கள், வருமானச் சான்று, ஆதார் அல்லது புகைப்படங்களைக் கேட்பதில்லை.',
          ),
          p(
            'If you ask on behalf of someone else, please make sure they agree to being contacted.',
            'வேறொருவருக்காக நீங்கள் கேட்டால், அவர்களைத் தொடர்பு கொள்வதற்கு அவர்கள் சம்மதிக்கிறார்களா என்பதை உறுதிசெய்யுங்கள்.',
          ),
        ],
      },
      {
        id: 'use',
        confirmed: true,
        heading: p('How we use it', 'அதை எப்படிப் பயன்படுத்துகிறோம்'),
        paragraphs: [
          p(
            'We use your information only to:',
            'உங்கள் தகவல்களை இவற்றுக்கு மட்டுமே பயன்படுத்துகிறோம்:',
          ),
        ],
        list: [
          p('process and verify your donation', 'உங்கள் நன்கொடையைச் செயல்படுத்தி சரிபார்க்க'),
          p('send your acknowledgement', 'உங்கள் ஒப்புகையை அனுப்ப'),
          p(
            'contact you about your donation or request',
            'உங்கள் நன்கொடை அல்லது கோரிக்கை பற்றி உங்களைத் தொடர்பு கொள்ள',
          ),
          p('keep the records the law requires', 'சட்டப்படி தேவையான பதிவுகளை வைத்திருக்க'),
        ],
      },
      {
        id: 'sharing',
        confirmed: true,
        heading: p('Who can see it', 'அதை யார் பார்க்க முடியும்'),
        paragraphs: [
          p(
            'Only the trust’s authorised people, through a protected dashboard. Service providers that run the site for us — payment (Razorpay), email and hosting — process it only to provide their service.',
            'பாதுகாக்கப்பட்ட நிர்வாகப் பக்கத்தின் மூலம் அறக்கட்டளையின் அங்கீகரிக்கப்பட்ட நபர்கள் மட்டுமே. எங்களுக்காகத் தளத்தை இயக்கும் சேவை நிறுவனங்கள் — கட்டணம் (Razorpay), மின்னஞ்சல் மற்றும் ஹோஸ்டிங் — தங்கள் சேவையை வழங்க மட்டுமே அதைக் கையாளுகின்றன.',
          ),
          p(
            'We never sell your information or show it publicly. Your name, phone, email, PAN or address never appear in links or on public pages, including acknowledgement links.',
            'உங்கள் தகவல்களை நாங்கள் ஒருபோதும் விற்பதில்லை, பொதுவில் காட்டுவதுமில்லை. உங்கள் பெயர், தொலைபேசி, மின்னஞ்சல், PAN அல்லது முகவரி இணைப்புகளிலோ பொதுப் பக்கங்களிலோ — ஒப்புகை இணைப்புகள் உட்பட — ஒருபோதும் தோன்றாது.',
          ),
          p(
            'If you choose a tax option, your name, PAN, address and the amount are reported to the Income Tax Department, as the trust must do for such donations. They are stored encrypted.',
            'நீங்கள் வரி விருப்பத்தைத் தேர்ந்தெடுத்தால், உங்கள் பெயர், PAN, முகவரி மற்றும் தொகை வருமான வரித் துறைக்குத் தெரிவிக்கப்படும் — அத்தகைய நன்கொடைகளுக்கு அறக்கட்டளை இதைச் செய்ய வேண்டும். அவை மறைகுறியாக்கம் செய்து சேமிக்கப்படுகின்றன.',
          ),
        ],
      },
      {
        id: 'browser',
        confirmed: true,
        heading: p('In your browser', 'உங்கள் உலாவியில்'),
        paragraphs: [
          p(
            'We remember your language choice in your browser. We do not use advertising or tracking cookies.',
            'உங்கள் மொழித் தேர்வை உங்கள் உலாவியில் நினைவில் வைக்கிறோம். விளம்பர அல்லது கண்காணிப்பு குக்கீகளை நாங்கள் பயன்படுத்துவதில்லை.',
          ),
        ],
      },
      {
        id: 'retention',
        confirmed: false, // [CONFIRM] trust + counsel — legal retention periods
        heading: p('How long we keep it', 'எவ்வளவு காலம் வைத்திருக்கிறோம்'),
        paragraphs: [
          p(
            'Donation records are kept for as long as tax and accounting law requires. Help requests are kept while we are helping and for a limited time after the request is closed.',
            'வரி மற்றும் கணக்கியல் சட்டம் கோரும் காலம் வரை நன்கொடைப் பதிவுகள் வைக்கப்படும். உதவிக் கோரிக்கைகள் நாங்கள் உதவும் வரையிலும், கோரிக்கை முடிந்த பிறகு குறிப்பிட்ட காலம் வரையிலும் வைக்கப்படும்.',
          ),
        ],
      },
      {
        id: 'rights',
        confirmed: false, // [CONFIRM] counsel — DPDP Act 2023 / Rules 2025 rights and grievance contact
        heading: p('Your choices', 'உங்கள் தேர்வுகள்'),
        paragraphs: [
          p(
            'You can ask to see, correct or delete your information, or withdraw consent to be contacted, by writing to us. Records the law requires us to keep cannot be deleted before that period ends.',
            'எங்களுக்கு எழுதுவதன் மூலம் உங்கள் தகவல்களைப் பார்க்க, திருத்த அல்லது நீக்கக் கேட்கலாம், அல்லது தொடர்பு கொள்வதற்கான சம்மதத்தைத் திரும்பப் பெறலாம். சட்டப்படி வைத்திருக்க வேண்டிய பதிவுகளை அந்தக் காலம் முடியும் முன் நீக்க முடியாது.',
          ),
        ],
      },
    ],
  },
  terms: {
    id: 'terms',
    path: '/terms',
    title: p('Terms of use', 'பயன்பாட்டு விதிமுறைகள்'),
    intro: p(
      'These terms apply when you use this website, make a donation or ask for help.',
      'இந்த இணையதளத்தைப் பயன்படுத்தும்போது, நன்கொடை அளிக்கும்போது அல்லது உதவி கேட்கும்போது இந்த விதிமுறைகள் பொருந்தும்.',
    ),
    sections: [
      {
        id: 'donations',
        confirmed: true,
        heading: p('Donations', 'நன்கொடைகள்'),
        paragraphs: [
          p(
            'Donations are voluntary gifts from ₹1 upwards. They are not payment for goods or services, and nothing is delivered in return.',
            'நன்கொடைகள் ₹1 முதல் தன்னார்வமாக அளிக்கப்படும் கொடைகள். அவை பொருட்கள் அல்லது சேவைகளுக்கான கட்டணம் அல்ல, அவற்றுக்கு ஈடாக எதுவும் வழங்கப்படாது.',
          ),
          p(
            'A donation is complete only when our server has verified the payment with Razorpay. A payment screen, QR scan, UTR number or screenshot is not proof of payment.',
            'Razorpay உடன் எங்கள் சர்வர் கட்டணத்தைச் சரிபார்த்த பிறகே நன்கொடை நிறைவடையும். கட்டணத் திரை, QR ஸ்கேன், UTR எண் அல்லது திரைப்பிடிப்பு கட்டணத்துக்கான சான்று அல்ல.',
          ),
          p(
            'We do not charge donors any fee.',
            'நன்கொடையாளர்களிடம் நாங்கள் எந்தக் கட்டணமும் வசூலிப்பதில்லை.',
          ),
        ],
      },
      {
        id: 'acknowledgement-tax',
        confirmed: true,
        heading: p('Acknowledgements and tax', 'ஒப்புகைகளும் வரியும்'),
        paragraphs: [
          p(
            'After a verified payment you can receive a donation acknowledgement. It is not a tax certificate. We do not promise a tax deduction unless the trust’s approval is confirmed and shown on this website.',
            'கட்டணம் சரிபார்க்கப்பட்ட பிறகு நன்கொடை ஒப்புகையைப் பெறலாம். அது வரிச் சான்றிதழ் அல்ல. அறக்கட்டளையின் ஒப்புதல் உறுதிசெய்யப்பட்டு இந்த இணையதளத்தில் காட்டப்படாவிட்டால், வரி விலக்கை நாங்கள் உறுதியளிப்பதில்லை.',
          ),
        ],
      },
      {
        id: 'use-of-funds',
        confirmed: false, // [CONFIRM] #1 — allocation and earmarking policy
        heading: p('How donations are used', 'நன்கொடைகள் எப்படிப் பயன்படுத்தப்படுகின்றன'),
        paragraphs: [
          p(
            'General donations are used where the need is greatest. If a need you chose is fully funded or closes, the amount is used for the most urgent needs.',
            'பொது நன்கொடைகள் மிகவும் தேவைப்படும் இடத்தில் பயன்படுத்தப்படும். நீங்கள் தேர்ந்தெடுத்த தேவைக்கு முழு நிதி கிடைத்துவிட்டால் அல்லது அது முடிந்துவிட்டால், அந்தத் தொகை மிக அவசரத் தேவைகளுக்குப் பயன்படுத்தப்படும்.',
          ),
        ],
      },
      {
        id: 'help-requests',
        confirmed: true,
        heading: p('Help requests', 'உதவிக் கோரிக்கைகள்'),
        paragraphs: [
          p(
            'Sending a request does not guarantee help. We will call you back to understand the need.',
            'கோரிக்கை அனுப்புவது உதவிக்கு உத்தரவாதம் அல்ல. தேவையைப் புரிந்துகொள்ள நாங்கள் உங்களைத் திரும்ப அழைப்போம்.',
          ),
        ],
      },
      {
        id: 'site',
        confirmed: true,
        heading: p('Using this website', 'இந்த இணையதளத்தைப் பயன்படுத்துதல்'),
        paragraphs: [
          p(
            'Please give true information and do not misuse the site, for example by sending false requests or trying to break its security. We may change these terms; the version on this page applies.',
            'உண்மையான தகவல்களைக் கொடுங்கள்; பொய்யான கோரிக்கைகளை அனுப்புவது அல்லது பாதுகாப்பை உடைக்க முயல்வது போன்று தளத்தைத் தவறாகப் பயன்படுத்த வேண்டாம். இந்த விதிமுறைகளை நாங்கள் மாற்றலாம்; இந்தப் பக்கத்தில் உள்ள பதிப்பே பொருந்தும்.',
          ),
        ],
      },
      {
        id: 'law',
        confirmed: false, // [CONFIRM] counsel — governing law and jurisdiction
        heading: p('Governing law', 'பொருந்தும் சட்டம்'),
        paragraphs: [
          p(
            'These terms are governed by the laws of India.',
            'இந்த விதிமுறைகள் இந்தியச் சட்டங்களுக்கு உட்பட்டவை.',
          ),
        ],
      },
    ],
  },
  refund: {
    id: 'refund',
    path: '/refund-policy',
    title: p(
      'Refund, cancellation and correction policy',
      'பணம் திரும்பப்பெறுதல், ரத்து மற்றும் திருத்தக் கொள்கை',
    ),
    intro: p(
      'Donations are voluntary and are normally not refunded. This page explains when we do refund, how to cancel monthly giving and how to correct a mistake.',
      'நன்கொடைகள் தன்னார்வமானவை, பொதுவாகத் திருப்பித் தரப்படுவதில்லை. எப்போது திருப்பித் தருகிறோம், மாதாந்திர நன்கொடையை எப்படி ரத்து செய்வது, தவறை எப்படித் திருத்துவது என்பதை இந்தப் பக்கம் விளக்குகிறது.',
    ),
    sections: [
      {
        id: 'when-refund',
        confirmed: true,
        heading: p('When we refund', 'எப்போது திருப்பித் தருகிறோம்'),
        paragraphs: [
          p('We refund a donation if:', 'இந்தச் சூழல்களில் நன்கொடையைத் திருப்பித் தருகிறோம்:'),
        ],
        list: [
          p(
            'you were charged twice for the same donation',
            'ஒரே நன்கொடைக்கு இரண்டு முறை கட்டணம் வசூலிக்கப்பட்டால்',
          ),
          p(
            'the amount was clearly entered by mistake',
            'தொகை தெளிவாகத் தவறுதலாக உள்ளிடப்பட்டிருந்தால்',
          ),
          p(
            'the payment was made without your permission',
            'உங்கள் அனுமதியின்றி கட்டணம் செலுத்தப்பட்டிருந்தால்',
          ),
        ],
      },
      {
        id: 'how-refund',
        confirmed: false, // [CONFIRM] trust — request window and processing time
        heading: p('How to ask and how long it takes', 'எப்படிக் கேட்பது, எவ்வளவு நேரம் ஆகும்'),
        paragraphs: [
          p(
            'Contact us with the date, amount and payment reference. Approved refunds go back to the original payment method through Razorpay; your bank decides when it appears in your account.',
            'தேதி, தொகை மற்றும் கட்டணக் குறிப்பு எண்ணுடன் எங்களைத் தொடர்பு கொள்ளுங்கள். அங்கீகரிக்கப்பட்ட பணம் Razorpay மூலம் நீங்கள் செலுத்திய அதே முறைக்குத் திருப்பி அனுப்பப்படும்; அது உங்கள் கணக்கில் எப்போது வரும் என்பதை உங்கள் வங்கி முடிவு செய்யும்.',
          ),
        ],
      },
      {
        id: 'failed',
        confirmed: true,
        heading: p('Failed or pending payments', 'தோல்வியடைந்த அல்லது நிலுவையிலுள்ள கட்டணங்கள்'),
        paragraphs: [
          p(
            'If money left your account but the payment failed, it is normally reversed by your bank automatically. Please do not pay again while a payment shows as pending.',
            'உங்கள் கணக்கிலிருந்து பணம் போய் கட்டணம் தோல்வியடைந்தால், பொதுவாக உங்கள் வங்கி தானாகவே அதைத் திருப்பித் தரும். கட்டணம் நிலுவையில் இருப்பதாகக் காட்டும்போது மீண்டும் செலுத்த வேண்டாம்.',
          ),
        ],
      },
      {
        id: 'monthly',
        confirmed: false, // [CONFIRM] — monthly giving enablement (#32)
        heading: p('Cancelling monthly giving', 'மாதாந்திர நன்கொடையை ரத்து செய்தல்'),
        paragraphs: [
          p(
            'You can cancel at any time with the “manage” link in your monthly-giving email, without logging in. UPI AutoPay can also be paused or cancelled in your UPI app. Payments already made before you cancel are not refunded unless one of the reasons above applies.',
            'மாதாந்திர நன்கொடை மின்னஞ்சலில் உள்ள “நிர்வகி” இணைப்பின் மூலம், உள்நுழையாமலேயே எப்போது வேண்டுமானாலும் ரத்து செய்யலாம். UPI AutoPay-ஐ உங்கள் UPI செயலியிலும் இடைநிறுத்தலாம் அல்லது ரத்து செய்யலாம். மேலே உள்ள காரணங்களில் ஒன்று பொருந்தினால் தவிர, ரத்து செய்வதற்கு முன் செலுத்திய கட்டணங்கள் திருப்பித் தரப்படாது.',
          ),
        ],
      },
      {
        id: 'corrections',
        confirmed: true,
        heading: p('Correcting an acknowledgement', 'ஒப்புகையைத் திருத்துதல்'),
        paragraphs: [
          p(
            'If your name or other details on an acknowledgement are wrong, contact us. We issue a corrected acknowledgement and keep the original record.',
            'ஒப்புகையில் உங்கள் பெயர் அல்லது பிற விவரங்கள் தவறாக இருந்தால், எங்களைத் தொடர்பு கொள்ளுங்கள். திருத்தப்பட்ட ஒப்புகையை வழங்கி, அசல் பதிவையும் வைத்திருப்போம்.',
          ),
        ],
      },
      {
        id: 'shipping',
        confirmed: true,
        heading: p('Shipping', 'அனுப்புதல் (ஷிப்பிங்)'),
        paragraphs: [
          p(
            'Not applicable. This website accepts donations only; no goods are sold or shipped.',
            'பொருந்தாது. இந்த இணையதளம் நன்கொடைகளை மட்டுமே ஏற்கிறது; எந்தப் பொருட்களும் விற்கப்படுவதில்லை, அனுப்பப்படுவதுமில்லை.',
          ),
        ],
      },
    ],
  },
};

export const POLICY_ORDER: PolicyId[] = ['terms', 'privacy', 'refund'];
