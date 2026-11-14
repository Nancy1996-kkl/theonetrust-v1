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
    ta: 'இந்தக் கொள்கையை அறக்கட்டளை இப்போது சரிபார்த்து வருகிறது. கீழே குறித்துள்ள பகுதிகள் அது முடிந்த பிறகு சேர்க்கப்படும்.',
  },
  pendingSection: {
    en: 'Being reviewed — this part will be added after the trust confirms it.',
    ta: 'சரிபார்ப்பில் உள்ளது — அறக்கட்டளை உறுதி செய்த பிறகு இந்தப் பகுதி சேர்க்கப்படும்.',
  },
  draftLabel: { en: 'Draft — not yet confirmed', ta: 'வரைவு — இன்னும் உறுதியாகவில்லை' },
  contactHeading: { en: 'Questions about this policy', ta: 'இந்தக் கொள்கை பற்றிய கேள்விகள்' },
  contactLead: {
    en: 'Contact us and we will reply as soon as we can:',
    ta: 'எங்களைத் தொடர்பு கொள்ளுங்கள், சீக்கிரம் பதில் சொல்கிறோம்:',
  },
  otherPolicies: { en: 'Other policies', ta: 'மற்ற கொள்கைகள்' },
  kicker: { en: 'Our policies', ta: 'எங்கள் கொள்கைகள்' },
  onThisPage: { en: 'On this page', ta: 'இந்தப் பக்கத்தில்' },
  emailUs: { en: 'Email us', ta: 'மின்னஞ்சல் அனுப்புங்கள்' },
  callUs: { en: 'Call us', ta: 'அழைக்கவும்' },
  whatsappUs: { en: 'Chat on WhatsApp', ta: 'WhatsApp-இல் பேசுங்கள்' },
  callHours: { en: 'Call hours', ta: 'அழைக்கும் நேரம்' },
  formNotice: {
    en: 'By continuing you agree to our',
    ta: 'தொடர்ந்தால், இவற்றை ஏற்றுக்கொள்கிறீர்கள்:',
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
      'நீங்கள் நன்கொடை கொடுக்கும்போதும் உதவி கேட்கும்போதும் நாங்கள் வாங்கும் விவரங்கள் என்ன, அவை ஏன் தேவை, அவற்றை எப்படிப் பாதுகாக்கிறோம் — இதை இந்தக் கொள்கை சொல்கிறது.',
    ),
    sections: [
      {
        id: 'donors',
        confirmed: true,
        heading: p('When you donate', 'நீங்கள் நன்கொடை கொடுக்கும்போது'),
        paragraphs: [
          p(
            'Required: your name and one way to contact you (phone or email), the amount and the need you chose.',
            'கட்டாயம்: உங்கள் பெயர், உங்களைத் தொடர்பு கொள்ள ஒரு வழி (தொலைபேசி அல்லது மின்னஞ்சல்), தொகை, நீங்கள் தேர்வு செய்த தேவை.',
          ),
          p(
            'Optional: an email address for your acknowledgement. Your PAN and address are asked only if you choose a tax option, and only when that option is available.',
            'விருப்பப்பட்டால்: ஒப்புகை அனுப்ப மின்னஞ்சல் முகவரி. வரி விலக்கு வசதி இருக்கும்போது, நீங்கள் அதைத் தேர்வு செய்தால் மட்டும் உங்கள் PAN, முகவரி கேட்போம்.',
          ),
          p(
            'Card, UPI and bank details are entered on Razorpay, our payment provider. We never see or store them.',
            'கார்டு, UPI, வங்கி விவரங்களை நீங்கள் Razorpay-இல் (நாங்கள் பயன்படுத்தும் பணம் செலுத்தும் நிறுவனம்) மட்டுமே போடுவீர்கள். அவற்றை நாங்கள் பார்ப்பதும் இல்லை, வைத்துக்கொள்வதும் இல்லை.',
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
            'யாருக்கு உதவி தேவை, என்ன உதவி, ஒரு சின்ன விளக்கம், தொலைபேசி எண், எப்போது அழைக்கலாம் — இவ்வளவுதான் கேட்போம். முதல் முறை கேட்கும்போது மருத்துவ ஆவணங்கள், வருமானச் சான்று, ஆதார், புகைப்படம் எதுவும் கேட்க மாட்டோம்.',
          ),
          p(
            'If you ask on behalf of someone else, please make sure they agree to being contacted.',
            'வேறொருவருக்காக நீங்கள் கேட்டால், நாங்கள் அவர்களைத் தொடர்பு கொள்ள அவர்கள் சம்மதிக்கிறார்களா என்று முன்பே கேட்டுக்கொள்ளுங்கள்.',
          ),
        ],
      },
      {
        id: 'use',
        confirmed: true,
        heading: p('How we use it', 'அதை எப்படிப் பயன்படுத்துகிறோம்'),
        paragraphs: [
          p('We use your information only to:', 'உங்கள் விவரங்களை இதற்கு மட்டுமே பயன்படுத்துவோம்:'),
        ],
        list: [
          p('process and verify your donation', 'உங்கள் நன்கொடையைப் பதிவு செய்து சரிபார்க்க'),
          p('send your acknowledgement', 'உங்கள் ஒப்புகையை அனுப்ப'),
          p(
            'contact you about your donation or request',
            'உங்கள் நன்கொடை அல்லது கோரிக்கை பற்றி உங்களைத் தொடர்பு கொள்ள',
          ),
          p('keep the records the law requires', 'சட்டப்படி வைத்திருக்க வேண்டிய பதிவுகளுக்காக'),
        ],
      },
      {
        id: 'sharing',
        confirmed: true,
        heading: p('Who can see it', 'அதை யார் பார்க்க முடியும்'),
        paragraphs: [
          p(
            'Only the trust’s authorised people, through a protected dashboard. Service providers that run the site for us — payment (Razorpay), email and hosting — process it only to provide their service.',
            'பாதுகாப்பான நிர்வாகப் பக்கம் வழியாக, அறக்கட்டளை அனுமதித்தவர்கள் மட்டுமே பார்க்க முடியும். எங்களுக்காக இந்தத் தளத்தை இயக்கும் நிறுவனங்கள் — பணம் செலுத்துதல் (Razorpay), மின்னஞ்சல், இணையதளத்தை இயக்கும் சேவை — தங்கள் வேலைக்குத் தேவையான அளவு மட்டுமே இவற்றைக் கையாளும்.',
          ),
          p(
            'We never sell your information or show it publicly. Your name, phone, email, PAN or address never appear in links or on public pages, including acknowledgement links.',
            'உங்கள் விவரங்களை நாங்கள் யாருக்கும் விற்பதும் இல்லை, வெளியே காட்டுவதும் இல்லை. உங்கள் பெயர், தொலைபேசி, மின்னஞ்சல், PAN, முகவரி — எதுவும் இணைப்புகளிலோ பொதுப் பக்கங்களிலோ (ஒப்புகை இணைப்பிலும்கூட) வராது.',
          ),
          p(
            'If you choose a tax option, your name, PAN, address and the amount are reported to the Income Tax Department, as the trust must do for such donations. They are stored encrypted.',
            'நீங்கள் வரி விலக்கைத் தேர்வு செய்தால், உங்கள் பெயர், PAN, முகவரி, தொகை ஆகியவை வருமான வரித் துறைக்குத் தெரிவிக்கப்படும் — இப்படிப்பட்ட நன்கொடைகளுக்கு அறக்கட்டளை இதைச் செய்தாக வேண்டும். இவை மறைகுறியாக்கம் செய்து பாதுகாப்பாக வைக்கப்படும்.',
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
            'நீங்கள் தேர்வு செய்த மொழியை உங்கள் உலாவியிலேயே நினைவில் வைக்கிறோம். விளம்பரத்துக்கோ உங்களைப் பின்தொடரவோ எந்தச் சிறு கோப்பும் (குக்கீ) வைப்பதில்லை.',
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
            'வரி, கணக்குச் சட்டங்கள் சொல்லும் காலம் வரை நன்கொடைப் பதிவுகள் வைக்கப்படும். உதவிக் கோரிக்கைகள் நாங்கள் உதவும் வரையும், அது முடிந்த பிறகு ஒரு குறிப்பிட்ட காலம் வரையும் வைக்கப்படும்.',
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
            'எங்களுக்கு எழுதிக் கேட்டால், உங்கள் விவரங்களைப் பார்க்கலாம், திருத்தலாம், நீக்கச் சொல்லலாம்; உங்களைத் தொடர்பு கொள்ளக் கொடுத்த சம்மதத்தையும் திரும்ப வாங்கலாம். ஆனால் சட்டப்படி வைத்திருக்க வேண்டிய பதிவுகளை அந்தக் காலம் முடியும் வரை நீக்க முடியாது.',
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
      'இந்த இணையதளத்தைப் பயன்படுத்தும்போதும், நன்கொடை கொடுக்கும்போதும், உதவி கேட்கும்போதும் இந்த விதிமுறைகள் பொருந்தும்.',
    ),
    sections: [
      {
        id: 'donations',
        confirmed: true,
        heading: p('Donations', 'நன்கொடைகள்'),
        paragraphs: [
          p(
            'Donations are voluntary gifts from ₹1 upwards. They are not payment for goods or services, and nothing is delivered in return.',
            'நன்கொடை என்பது ₹1 முதல் நீங்களாக விரும்பிக் கொடுப்பது. அது எந்தப் பொருளுக்கோ சேவைக்கோ கொடுக்கும் விலை இல்லை; அதற்குப் பதிலாக எதுவும் தரப்படாது.',
          ),
          p(
            'A donation is complete only when our server has verified the payment with Razorpay. A payment screen, QR scan, UTR number or screenshot is not proof of payment.',
            'பணம் வந்ததை Razorpay-இடம் நாங்கள் சரிபார்த்த பிறகுதான் நன்கொடை முடிந்ததாகும். பணம் செலுத்திய திரை, QR ஸ்கேன், UTR எண், திரைப் படம் — இவை பணம் வந்ததற்கான சான்று ஆகாது.',
          ),
          p(
            'We do not charge donors any fee.',
            'நன்கொடை கொடுப்பவர்களிடம் நாங்கள் எந்தக் கூடுதல் கட்டணமும் வாங்குவதில்லை.',
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
            'பணம் வந்தது உறுதியான பிறகு நன்கொடை ஒப்புகை கிடைக்கும். அது வரிச் சான்றிதழ் இல்லை. அறக்கட்டளைக்கான ஒப்புதல் உறுதியாகி இந்தத் தளத்தில் காட்டப்படும் வரை, வரி விலக்கு கிடைக்கும் என்று நாங்கள் சொல்வதில்லை.',
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
            'பொது நன்கொடைகள் அதிகம் தேவைப்படும் இடத்தில் பயன்படும். நீங்கள் தேர்வு செய்த தேவைக்கு வேண்டிய முழுப் பணமும் வந்துவிட்டாலோ, அந்த வேலை முடிந்துவிட்டாலோ, அந்தத் தொகை மிக அவசரமான தேவைக்குப் பயன்படும்.',
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
            'கோரிக்கை அனுப்பினாலே உதவி கிடைக்கும் என்று உறுதி சொல்ல முடியாது. உங்கள் தேவையைப் புரிந்துகொள்ள நாங்கள் உங்களைத் திரும்ப அழைப்போம்.',
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
            'உண்மையான விவரங்களை மட்டும் கொடுங்கள்; பொய்யான கோரிக்கை அனுப்புவது, தளத்தின் பாதுகாப்பை உடைக்க முயல்வது போல் தவறாகப் பயன்படுத்த வேண்டாம். இந்த விதிமுறைகளை நாங்கள் மாற்றலாம்; இந்தப் பக்கத்தில் இருப்பதுதான் இப்போது பொருந்தும்.',
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
      'பணம் திரும்பத் தருதல், ரத்து, திருத்தம் — கொள்கை',
    ),
    intro: p(
      'Donations are voluntary and are normally not refunded. This page explains when we do refund, how to cancel monthly giving and how to correct a mistake.',
      'நன்கொடை நீங்களாக விரும்பிக் கொடுப்பது; பொதுவாக அது திருப்பித் தரப்படாது. எப்போது திருப்பித் தருவோம், மாதாந்திர நன்கொடையை எப்படி ரத்து செய்வது, தவறு இருந்தால் எப்படித் திருத்துவது — இதை இந்தப் பக்கம் சொல்கிறது.',
    ),
    sections: [
      {
        id: 'when-refund',
        confirmed: true,
        heading: p('When we refund', 'எப்போது திருப்பித் தருகிறோம்'),
        paragraphs: [
          p('We refund a donation if:', 'இப்படி நடந்தால் நன்கொடையைத் திருப்பித் தருவோம்:'),
        ],
        list: [
          p(
            'you were charged twice for the same donation',
            'ஒரே நன்கொடைக்கு இரண்டு முறை பணம் எடுக்கப்பட்டிருந்தால்',
          ),
          p(
            'the amount was clearly entered by mistake',
            'தொகையைத் தெளிவாகத் தவறாகப் போட்டிருந்தால்',
          ),
          p(
            'the payment was made without your permission',
            'உங்கள் அனுமதி இல்லாமல் பணம் செலுத்தப்பட்டிருந்தால்',
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
            'தேதி, தொகை, பணம் செலுத்திய குறிப்பு எண் — இவற்றுடன் எங்களைத் தொடர்பு கொள்ளுங்கள். திருப்பித் தர ஒப்புக்கொண்ட பணம், நீங்கள் செலுத்திய அதே வழியில் Razorpay மூலம் திரும்ப அனுப்பப்படும்; அது உங்கள் கணக்கில் எப்போது வரும் என்பது உங்கள் வங்கியைப் பொறுத்தது.',
          ),
        ],
      },
      {
        id: 'failed',
        confirmed: true,
        heading: p('Failed or pending payments', 'தோல்வியடைந்த அல்லது இன்னும் உறுதியாகாத பணம்'),
        paragraphs: [
          p(
            'If money left your account but the payment failed, it is normally reversed by your bank automatically. Please do not pay again while a payment shows as pending.',
            'உங்கள் கணக்கிலிருந்து பணம் போய், செலுத்துதல் தோல்வியடைந்தால், பொதுவாக உங்கள் வங்கியே அதைத் திருப்பித் தந்துவிடும். “இன்னும் உறுதியாகவில்லை” என்று காட்டும்போது மறுபடி பணம் செலுத்த வேண்டாம்.',
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
            'மாதாந்திர நன்கொடை மின்னஞ்சலில் இருக்கும் “நிர்வகி” இணைப்பைத் திறந்து, கணக்கில் நுழையாமலே எப்போது வேண்டுமானாலும் ரத்து செய்யலாம். UPI AutoPay-ஐ உங்கள் UPI செயலியிலேயே நிறுத்தி வைக்கலாம் அல்லது ரத்து செய்யலாம். மேலே சொன்ன காரணங்களில் ஒன்று இல்லையென்றால், ரத்து செய்வதற்கு முன் செலுத்திய பணம் திருப்பித் தரப்படாது.',
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
            'ஒப்புகையில் உங்கள் பெயரோ வேறு விவரமோ தவறாக இருந்தால், எங்களைத் தொடர்பு கொள்ளுங்கள். திருத்திய ஒப்புகையைத் தருவோம்; பழைய பதிவையும் அப்படியே வைத்திருப்போம்.',
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
            'இது பொருந்தாது. இந்தத் தளத்தில் நன்கொடை மட்டுமே வாங்குகிறோம்; எந்தப் பொருளும் விற்பதும் இல்லை, அனுப்புவதும் இல்லை.',
          ),
        ],
      },
    ],
  },
};

export const POLICY_ORDER: PolicyId[] = ['terms', 'privacy', 'refund'];
