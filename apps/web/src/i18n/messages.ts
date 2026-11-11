/**
 * Interface text for the public shell (#11) in English and Tamil.
 * Every key must exist in both languages with non-empty text — messages.test.ts fails CI otherwise.
 * Tamil follows the reviewed wireframe draft (docs/design/wireframes/landing.html); final copy is
 * reviewed by the trust (#37). Page content (hero, sections) arrives with #12 and #13.
 */
const en = {
  skipToContent: 'Skip to main content',
  homeLink: 'Theonetrust.in — home',
  sectionsNav: 'Sections',
  navAbout: 'About',
  navWays: 'Ways we help',
  navServices: 'Services',
  navImpact: 'Impact',
  navTransparency: 'Transparency',
  navContact: 'Contact',
  navFaq: 'Questions',
  donate: 'Donate',
  getHelp: 'Get Help',
  menu: 'Menu',
  footerNav: 'Footer',
  footerExplore: 'Explore',
  footerHelp: 'Help',
  footerLegal: 'Legal',
  receiptHelp: 'Receipt help',
  terms: 'Terms',
  privacy: 'Privacy',
  refund: 'Refund & cancellation',
  phoneWhatsapp: 'Phone and WhatsApp',
  email: 'Email',
  location: 'Location',
  callHours: 'Call hours',
  notFoundTitle: 'Page not found',
  notFoundBody: 'The page you are looking for does not exist or has moved.',
  goHome: 'Go to the home page',
};

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

const ta: Messages = {
  skipToContent: 'நேராக முக்கியப் பகுதிக்குச் செல்ல',
  homeLink: 'Theonetrust.in — முகப்பு',
  sectionsNav: 'பிரிவுகள்',
  navAbout: 'எங்களைப் பற்றி',
  navWays: 'உதவிகள்',
  navServices: 'சேவைகள்',
  navImpact: 'பணியின் பலன்',
  navTransparency: 'வெளிப்படைத்தன்மை',
  navContact: 'தொடர்பு',
  navFaq: 'கேள்விகள்',
  donate: 'நன்கொடை',
  getHelp: 'உதவி பெற',
  menu: 'பட்டியல்',
  footerNav: 'பக்கத்தின் கீழ்ப் பகுதி',
  footerExplore: 'பக்கங்கள்',
  footerHelp: 'உதவி',
  footerLegal: 'விதிகள், கொள்கைகள்',
  receiptHelp: 'ஒப்புகைச் சீட்டு உதவி',
  terms: 'விதிமுறைகள்',
  privacy: 'தனியுரிமை',
  refund: 'பணம் திரும்பத் தருதல், ரத்து',
  phoneWhatsapp: 'தொலைபேசி / WhatsApp',
  email: 'மின்னஞ்சல்',
  location: 'இடம்',
  callHours: 'அழைப்பு நேரம்',
  notFoundTitle: 'பக்கம் கிடைக்கவில்லை',
  notFoundBody:
    'நீங்கள் தேடிய பக்கம் இங்கே இல்லை. அது நீக்கப்பட்டிருக்கலாம் அல்லது வேறு இடத்துக்கு மாறியிருக்கலாம்.',
  goHome: 'முகப்புப் பக்கத்துக்குச் செல்ல',
};

export const MESSAGES: { en: Messages; ta: Messages } = { en, ta };
