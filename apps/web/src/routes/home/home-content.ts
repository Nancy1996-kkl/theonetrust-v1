import type { Bilingual } from '../../content/landing.ts';

/**
 * Words for the home page (redesign approved by the client, Nov 2026). Plain, warm and specific — no
 * figures, names or promises are invented here: numbers, programmes, FAQ and contact details
 * come from the trust's own published content. The trust reviews this wording before it moves
 * to the live home page.
 */
export interface ExploreTab {
  id: string;
  label: Bilingual;
  title: Bilingual;
  body: Bilingual;
  points: Bilingual[];
}

export interface Step {
  title: Bilingual;
  body: Bilingual;
}

export const HOME_TEXT = {
  photo: { en: 'Photo', ta: 'படம்' },
  // 2 · Mission & vision
  visionKicker: { en: 'About the trust', ta: 'அறக்கட்டளையைப் பற்றி' },
  visionTitle: { en: 'Our mission & vision', ta: 'எங்கள் பணியும் கனவும்' },
  visionIntro: {
    en: 'We are a small trust from Kanchipuram. We help people we can reach and see — a student who cannot pay the exam fee, a family that needs groceries this week, an elder who lives alone.',
    ta: 'நாங்கள் காஞ்சிபுரத்தைச் சேர்ந்த ஒரு சிறிய அறக்கட்டளை. நேரில் சென்று பார்க்கக்கூடியவர்களுக்கு உதவுகிறோம் — தேர்வுக் கட்டணம் கட்ட முடியாத மாணவர், இந்த வாரம் மளிகைப் பொருள் தேவைப்படும் குடும்பம், தனியாக வாழும் முதியவர்.',
  },
  vision: { en: 'Vision', ta: 'எங்கள் கனவு' },
  visionBody: {
    en: 'No one around us should go without food, schooling or care just because they cannot pay.',
    ta: 'பணம் இல்லை என்ற ஒரே காரணத்துக்காக, நம்மைச் சுற்றி யாரும் உணவு, படிப்பு, மருத்துவம் இல்லாமல் இருக்கக் கூடாது.',
  },
  mission: { en: 'Mission', ta: 'எங்கள் பணி' },
  missionBody: {
    en: 'Reach people in need quickly, spend every rupee carefully, and tell donors honestly where their money went.',
    ta: 'தேவைப்படுபவர்களை விரைவாகச் சென்றடைவது, ஒவ்வொரு ரூபாயையும் கவனமாகச் செலவு செய்வது, நன்கொடை எங்கே போனது என்று கொடுத்தவர்களிடம் நேர்மையாகச் சொல்வது.',
  },

  // 3 · Where help is needed
  needKicker: { en: 'Choose a cause', ta: 'எதற்குக் கொடுக்கலாம்' },
  needTitle: { en: 'Where help is needed', ta: 'எங்கே உதவி தேவை' },
  needIntro: {
    en: 'Pick where your gift should go. Not sure? The general fund goes wherever the need is greatest that week.',
    ta: 'உங்கள் நன்கொடை எதற்குப் போக வேண்டும் என்று தேர்வு செய்யுங்கள். முடிவு செய்ய முடியவில்லையா? பொது நிதி, அந்த வாரம் அதிகம் தேவைப்படும் இடத்துக்குப் போகும்.',
  },
  give: { en: 'Give', ta: 'கொடுங்கள்' },

  // 3b · Services
  servicesKicker: { en: 'What we do', ta: 'நாங்கள் செய்வது' },
  servicesTitle: {
    en: 'Four ways we stand with families',
    ta: 'நான்கு வழிகளில் குடும்பங்களுக்குத் துணை நிற்கிறோம்',
  },

  // 4 · Explore tabs
  exploreKicker: { en: 'Our activities', ta: 'எங்கள் பணிகள்' },
  exploreTitle: { en: 'Explore what your gift does', ta: 'உங்கள் நன்கொடை என்ன செய்கிறது' },
  exploreTabsLabel: { en: 'Areas of work', ta: 'பணிப் பிரிவுகள்' },

  // 5 · Impact
  impactKicker: { en: 'Our impact', ta: 'எங்கள் பணியின் பலன்' },
  impactEmpty: {
    en: 'We will put numbers here only when we can back them with records. Until then, ask us — we are happy to tell you what your gift did.',
    ta: 'பதிவுகளோடு நிரூபிக்க முடிந்த பிறகுதான் இங்கே எண்ணிக்கைகளைப் போடுவோம். அதுவரை எங்களிடம் கேளுங்கள் — உங்கள் நன்கொடை என்ன செய்தது என்று மகிழ்ச்சியாகச் சொல்வோம்.',
  },

  // 6 · How it works
  howKicker: { en: 'Simple and safe', ta: 'எளிது, பாதுகாப்பானது' },
  howTitle: { en: 'How your gift reaches people', ta: 'உங்கள் நன்கொடை எப்படிப் போய்ச் சேருகிறது' },

  // 7 · Donation
  donateKicker: { en: 'Give today', ta: 'இன்றே கொடுங்கள்' },
  donateTitle: { en: 'Be a part of our mission', ta: 'எங்கள் பணியில் நீங்களும் சேருங்கள்' },
  donateLead: {
    en: 'Any amount helps. Give once, or set up a small gift every month.',
    ta: 'எந்தத் தொகையும் உதவும். ஒருமுறை கொடுக்கலாம், அல்லது மாதந்தோறும் ஒரு சின்னத் தொகை கொடுக்கலாம்.',
  },
  donateBody: {
    en: 'Choose an amount or type your own (from ₹1). Pay by UPI, card or netbanking — the payment opens in a secure window on this page.',
    ta: 'ஒரு தொகையைத் தேர்வு செய்யுங்கள், அல்லது நீங்களே எழுதுங்கள் (₹1 முதல்). UPI, கார்டு, நெட்பேங்கிங் — எதில் வேண்டுமானாலும் இதே பக்கத்தில் பாதுகாப்பாகச் செலுத்தலாம்.',
  },
  donateOther: { en: 'Other amount', ta: 'வேறு தொகை' },
  donateNow: { en: 'Donate now', ta: 'இப்போதே நன்கொடை கொடுங்கள்' },
  monthlyNote: {
    en: 'Want to give every month? Choose “Monthly” in the next step — you can stop any time.',
    ta: 'மாதந்தோறும் கொடுக்க விரும்புகிறீர்களா? அடுத்த படியில் “மாதந்தோறும்” என்பதைத் தேர்வு செய்யுங்கள் — எப்போது வேண்டுமானாலும் நிறுத்தலாம்.',
  },
  smallAct: { en: 'Small act, big change', ta: 'சிறு உதவி, பெரிய மாற்றம்' },
  bandTitle: { en: 'Every contribution matters.', ta: 'ஒவ்வொரு நன்கொடையும் முக்கியம்.' },
  bandDonate: { en: 'Donate', ta: 'நன்கொடை' },
  bandVolunteer: { en: 'Volunteer', ta: 'தன்னார்வலர் ஆகுங்கள்' },
  bandPartner: { en: 'Partner with us', ta: 'எங்களோடு கைகோருங்கள்' },

  // 8 · Contact
  contactKicker: { en: 'We are here', ta: 'நாங்கள் இருக்கிறோம்' },
  contactTitle: { en: 'Talk to us', ta: 'எங்களோடு பேசுங்கள்' },
  contactBody: {
    en: 'Want to know more before you give, or need help yourself? Call or WhatsApp us — a real person from the trust will answer.',
    ta: 'கொடுப்பதற்கு முன் இன்னும் தெரிந்துகொள்ள வேண்டுமா, அல்லது உங்களுக்கே உதவி தேவையா? போன் செய்யுங்கள் அல்லது WhatsApp-இல் எழுதுங்கள் — அறக்கட்டளையிலிருந்து ஒருவர் நேரடியாகப் பதில் சொல்வார்.',
  },
  whatsappUs: { en: 'Chat on WhatsApp', ta: 'WhatsApp-இல் பேசுங்கள்' },
  askHelp: { en: 'Ask for help', ta: 'உதவி கேளுங்கள்' },

  // 9 · FAQ
  faqKicker: { en: 'Good to know', ta: 'தெரிந்துகொள்ளுங்கள்' },
  faqTitle: { en: 'Questions people ask', ta: 'அடிக்கடி கேட்கப்படும் கேள்விகள்' },

  // 10 · Footer
} satisfies Record<string, Bilingual>;

/** How it works — four steps, each with one plain line. */
export const STEPS: Step[] = [
  {
    title: { en: 'Choose a cause', ta: 'எதற்கு என்று தேர்வு செய்யுங்கள்' },
    body: {
      en: 'Education, health, food, elders — or the general fund.',
      ta: 'கல்வி, மருத்துவம், உணவு, முதியவர்கள் — அல்லது பொது நிதி.',
    },
  },
  {
    title: { en: 'Pick an amount', ta: 'தொகையைத் தேர்வு செய்யுங்கள்' },
    body: {
      en: 'Any amount from ₹1. Give once, or every month.',
      ta: '₹1 முதல் எந்தத் தொகையும். ஒருமுறை, அல்லது மாதந்தோறும்.',
    },
  },
  {
    title: { en: 'Pay securely', ta: 'பாதுகாப்பாகச் செலுத்துங்கள்' },
    body: {
      en: 'UPI, card or netbanking through Razorpay.',
      ta: 'Razorpay வழியாக UPI, கார்டு, நெட்பேங்கிங்.',
    },
  },
  {
    title: { en: 'We confirm and say thank you', ta: 'உறுதி செய்து நன்றி சொல்கிறோம்' },
    body: {
      en: 'Once the money reaches the trust, you get a thank-you and an acknowledgement.',
      ta: 'பணம் அறக்கட்டளைக்கு வந்ததும், நன்றியும் ஒப்புகையும் உங்களுக்கு வரும்.',
    },
  },
];

/** Explore tabs — kinds of help, no figures or named people. */
export const EXPLORE_TABS: ExploreTab[] = [
  {
    id: 'education',
    label: { en: 'Education', ta: 'கல்வி' },
    title: { en: 'Education assistance', ta: 'கல்வி உதவி' },
    body: {
      en: 'A child should not leave school over a fee. We help students stay in class — from the first standard to college.',
      ta: 'கட்டணம் கட்ட முடியவில்லை என்பதற்காக எந்தக் குழந்தையும் பள்ளியை விடக் கூடாது. முதல் வகுப்பிலிருந்து கல்லூரி வரை மாணவர்கள் படிப்பைத் தொடர உதவுகிறோம்.',
    },
    points: [
      { en: 'School, college and exam fees', ta: 'பள்ளி, கல்லூரி, தேர்வுக் கட்டணம்' },
      { en: 'Books, notebooks and stationery', ta: 'புத்தகம், நோட்டு, எழுதுபொருட்கள்' },
      { en: 'Uniforms, bags and shoes', ta: 'சீருடை, பை, காலணி' },
    ],
  },
  {
    id: 'children',
    label: { en: 'Children', ta: 'குழந்தைகள்' },
    title: { en: 'A safe and happy childhood', ta: 'பாதுகாப்பான, மகிழ்ச்சியான குழந்தைப் பருவம்' },
    body: {
      en: 'When a family is struggling, children feel it first. We help with good food, clothes and the small joys every child deserves.',
      ta: 'ஒரு குடும்பம் கஷ்டப்படும்போது, முதலில் பாதிக்கப்படுவது குழந்தைகள்தான். நல்ல சாப்பாடு, உடை, ஒவ்வொரு குழந்தைக்கும் கிடைக்க வேண்டிய சின்னச் சின்ன சந்தோஷங்களுக்கு உதவுகிறோம்.',
    },
    points: [
      { en: 'Nutritious meals', ta: 'சத்தான சாப்பாடு' },
      { en: 'Clothes for school and festivals', ta: 'பள்ளிக்கும் பண்டிகைக்கும் உடை' },
      { en: 'Birthday and festival treats', ta: 'பிறந்தநாள், பண்டிகை இனிப்புகள்' },
    ],
  },
  {
    id: 'healthcare',
    label: { en: 'Healthcare', ta: 'மருத்துவம்' },
    title: { en: 'Treatment on time', ta: 'சரியான நேரத்தில் சிகிச்சை' },
    body: {
      en: 'Medicines, tests and the bus fare to the hospital add up quickly. A small gift can mean someone sees a doctor this week, not next month.',
      ta: 'மருந்து, பரிசோதனை, மருத்துவமனைக்குப் போகும் பஸ் செலவு — எல்லாம் சேர்ந்து வேகமாகக் கூடிவிடும். ஒரு சின்ன நன்கொடைகூட, அடுத்த மாதம் இல்லாமல் இந்த வாரமே ஒருவர் டாக்டரைப் பார்க்க உதவும்.',
    },
    points: [
      { en: 'Medicines', ta: 'மருந்துகள்' },
      { en: 'Tests and check-ups', ta: 'பரிசோதனைகள்' },
      { en: 'Travel to the hospital', ta: 'மருத்துவமனைக்குப் போகும் செலவு' },
    ],
  },
  {
    id: 'elderly',
    label: { en: 'Elderly', ta: 'முதியவர்கள்' },
    title: { en: 'Care for our elders', ta: 'நம் முதியவர்களுக்குக் கவனிப்பு' },
    body: {
      en: 'Many elders around us live alone. We help with groceries and medicines, and someone drops by to check they are well.',
      ta: 'நம்மைச் சுற்றி பல முதியவர்கள் தனியாக வாழ்கிறார்கள். மளிகைப் பொருட்கள், மருந்துகளுக்கு உதவுகிறோம்; அவர்கள் நலமாக இருக்கிறார்களா என்று ஒருவர் வந்து பார்த்துக்கொள்கிறார்.',
    },
    points: [
      { en: 'Monthly groceries', ta: 'மாத மளிகைப் பொருட்கள்' },
      { en: 'Regular medicines', ta: 'தொடர் மருந்துகள்' },
      { en: 'A friendly visit', ta: 'அன்பாக நலம் விசாரிக்கும் வருகை' },
    ],
  },
];

export interface Service {
  id: string;
  icon: 'health' | 'education' | 'food' | 'emergency';
  title: Bilingual;
  body: Bilingual;
}

/** "What we do" cards. */
export const SERVICES: Service[] = [
  {
    id: 'health',
    icon: 'health',
    title: { en: 'Medical & health', ta: 'மருத்துவமும் நலமும்' },
    body: {
      en: 'Medicines, tests and hospital travel for people who cannot afford them.',
      ta: 'செலவு செய்ய முடியாதவர்களுக்கு மருந்து, பரிசோதனை, மருத்துவமனைப் பயணச் செலவு.',
    },
  },
  {
    id: 'education',
    icon: 'education',
    title: { en: 'Education', ta: 'கல்வி' },
    body: {
      en: 'Fees, books and uniforms, so money never stops a student.',
      ta: 'கட்டணம், புத்தகம், சீருடை — பணம் இல்லை என்பதற்காக எந்த மாணவரின் படிப்பும் நிற்கக் கூடாது.',
    },
  },
  {
    id: 'food',
    icon: 'food',
    title: { en: 'Food support', ta: 'உணவு உதவி' },
    body: {
      en: 'Grocery kits and meals for families and elders going through a hard time.',
      ta: 'கஷ்டத்தில் இருக்கும் குடும்பங்களுக்கும் முதியவர்களுக்கும் மளிகைப் பொருட்களும் சாப்பாடும்.',
    },
  },
  {
    id: 'emergency',
    icon: 'emergency',
    title: { en: 'Emergency help', ta: 'அவசர உதவி' },
    body: {
      en: 'Quick support after an accident, illness or loss. Ask us — we will call you back.',
      ta: 'விபத்து, நோய், இழப்பு போன்ற நேரங்களில் விரைவான உதவி. கேளுங்கள் — நாங்களே உங்களை அழைக்கிறோம்.',
    },
  },
];
