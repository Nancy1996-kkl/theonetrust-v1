import type { CallTime, HelpFor, HelpKind } from '@theonetrust/contracts';
import type { UiLang } from '../components/ui/ui-strings.ts';

/**
 * Get Help panel text (issue #15). Wording and Tamil follow the reviewed wireframe
 * (docs/design/wireframes/help.html); the trust reviews final copy (#37).
 * help-messages.test.ts checks both languages have every key.
 */
const en = {
  title: 'Get Help',
  startTitle: 'How would you like to ask for help?',
  startWho: 'For yourself or for someone you know.',
  fillForm: 'Tell us what you need (5 short steps)',
  callMeBack: 'Just call me back',
  whatsapp: 'Chat on WhatsApp',
  call: 'Call',
  noGuarantee: 'Asking does not guarantee help. We will call you to understand your situation.',
  back: 'Back',
  continue: 'Continue',
  progress: 'Steps to ask for help',
  stepWho: 'Who',
  stepKind: 'Kind of help',
  stepDescribe: 'Describe',
  stepContact: 'Contact',
  stepSend: 'Send',
  whoTitle: 'Who needs help?',
  whoError: 'Choose who needs help.',
  kindTitle: 'What kind of help is needed?',
  kindHint: 'Choose one or more.',
  kindError: 'Choose at least one kind of help.',
  danger:
    'If someone’s life is in danger, call 112 now. This form is not for emergencies that cannot wait.',
  descTitle: 'Tell us briefly (optional)',
  descLabel: 'What is needed',
  descHint: 'In Tamil or English. A few words are enough — we will call you.',
  noDocs:
    'Please don’t send documents, Aadhaar, medical reports or income proof here. If needed, we will ask safely later.',
  counter: 'characters',
  skip: 'Skip this step',
  contactTitle: 'How can we reach you?',
  yourMobile: 'Your mobile or WhatsApp number',
  mobileHint: '10-digit mobile number',
  mobileError: 'Enter a 10-digit mobile number.',
  theirName: 'Their name or village',
  theirNameHint: 'Only if they are comfortable sharing it.',
  language: 'Language for the call',
  bestTime: 'Best time to call',
  consentTitle: 'Before you send',
  consentLegend: 'Agreement',
  consentContact: 'The trust may call or WhatsApp this number about this request.',
  consentContactError: 'Please agree so that we can call you.',
  consentOther: 'I believe the person agrees to this request, or cannot ask for themselves.',
  consentOtherError: 'Please confirm the person agrees, or cannot ask for themselves.',
  send: 'Send request',
  sending: 'Sending…',
  sentTitle: 'Your request is sent',
  sentText: 'We will call you. Please keep your phone with you.',
  reference: 'Reference',
  sentHelp: 'If it’s urgent, call or WhatsApp us now.',
  backToPage: 'Back to the page',
  cbTitle: 'We’ll call you back',
  callMe: 'Call me back',
  netTitle: 'Not sent yet',
  netText: 'Your answers are kept. Check your internet and try again.',
  tryAgain: 'Try again',
  waitTitle: 'Please wait a few minutes',
  waitText:
    'We’ve received several requests from this device. If you need help now, call or WhatsApp us.',
  closedTitle: 'Online requests are not open yet',
  closedText: 'Please call or WhatsApp us — we will listen and help you ask.',
  invalidTitle: 'Some answers need checking',
  invalidText: 'Please go back and check your answers, or call or WhatsApp us.',
  hours: 'Hours',
};

export type HelpMessageKey = keyof typeof en;

const ta: Record<HelpMessageKey, string> = {
  title: 'உதவி பெற',
  startTitle: 'எப்படி உதவி கேட்க விரும்புகிறீர்கள்?',
  startWho: 'உங்களுக்காகவோ உங்களுக்குத் தெரிந்தவருக்காகவோ.',
  fillForm: 'என்ன தேவை என்று சொல்லுங்கள் (5 சிறிய படிகள்)',
  callMeBack: 'என்னைத் திரும்ப அழையுங்கள்',
  whatsapp: 'WhatsApp-ல் பேசுங்கள்',
  call: 'அழைக்க',
  noGuarantee:
    'கேட்பது உதவிக்கு உத்தரவாதம் அல்ல. உங்கள் நிலையைப் புரிந்துகொள்ள நாங்கள் உங்களை அழைப்போம்.',
  back: 'பின்செல்',
  continue: 'தொடரவும்',
  progress: 'உதவி கேட்கும் படிகள்',
  stepWho: 'யாருக்கு',
  stepKind: 'உதவி வகை',
  stepDescribe: 'விவரம்',
  stepContact: 'தொடர்பு',
  stepSend: 'அனுப்பு',
  whoTitle: 'யாருக்கு உதவி தேவை?',
  whoError: 'யாருக்கு உதவி தேவை என்பதைத் தேர்ந்தெடுக்கவும்.',
  kindTitle: 'என்ன வகையான உதவி தேவை?',
  kindHint: 'ஒன்று அல்லது அதற்கு மேல் தேர்ந்தெடுக்கவும்.',
  kindError: 'குறைந்தது ஒரு உதவி வகையைத் தேர்ந்தெடுக்கவும்.',
  danger:
    'யாருடைய உயிருக்காவது ஆபத்து என்றால், இப்போதே 112-ஐ அழையுங்கள். காத்திருக்க முடியாத அவசரங்களுக்கு இந்தப் படிவம் இல்லை.',
  descTitle: 'சுருக்கமாகச் சொல்லுங்கள் (விருப்பத்திற்குரியது)',
  descLabel: 'என்ன தேவை',
  descHint: 'தமிழிலோ ஆங்கிலத்திலோ. சில வார்த்தைகள் போதும் — நாங்கள் உங்களை அழைப்போம்.',
  noDocs:
    'இங்கே ஆவணங்கள், ஆதார், மருத்துவ அறிக்கைகள் அல்லது வருமானச் சான்றுகளை அனுப்ப வேண்டாம். தேவைப்பட்டால், பின்னர் பாதுகாப்பாகக் கேட்போம்.',
  counter: 'எழுத்துகள்',
  skip: 'இந்தப் படியைத் தவிர்',
  contactTitle: 'உங்களை எப்படித் தொடர்பு கொள்வது?',
  yourMobile: 'உங்கள் கைபேசி அல்லது WhatsApp எண்',
  mobileHint: '10 இலக்க கைபேசி எண்',
  mobileError: '10 இலக்க கைபேசி எண்ணை உள்ளிடவும்.',
  theirName: 'அவரது பெயர் அல்லது ஊர்',
  theirNameHint: 'அவர் பகிர விரும்பினால் மட்டும்.',
  language: 'அழைப்புக்கான மொழி',
  bestTime: 'அழைக்க ஏற்ற நேரம்',
  consentTitle: 'அனுப்பும் முன்',
  consentLegend: 'ஒப்புதல்',
  consentContact:
    'இந்தக் கோரிக்கை குறித்து அறக்கட்டளை இந்த எண்ணை அழைக்கலாம் அல்லது WhatsApp செய்யலாம்.',
  consentContactError: 'உங்களை அழைக்க நாங்கள் அனுமதி பெற வேண்டும் — தயவுசெய்து ஒப்புக்கொள்ளுங்கள்.',
  consentOther:
    'அந்த நபர் இந்தக் கோரிக்கைக்கு ஒப்புக்கொள்கிறார், அல்லது தானே கேட்க முடியாது என்று நம்புகிறேன்.',
  consentOtherError:
    'அந்த நபர் ஒப்புக்கொள்கிறார் அல்லது தானே கேட்க முடியாது என்பதை உறுதிசெய்யவும்.',
  send: 'கோரிக்கையை அனுப்பு',
  sending: 'அனுப்பப்படுகிறது…',
  sentTitle: 'உங்கள் கோரிக்கை அனுப்பப்பட்டது',
  sentText: 'நாங்கள் உங்களை அழைப்போம். உங்கள் கைபேசியை அருகில் வைத்திருங்கள்.',
  reference: 'குறிப்பு எண்',
  sentHelp: 'அவசரம் என்றால், இப்போதே அழையுங்கள் அல்லது WhatsApp செய்யுங்கள்.',
  backToPage: 'பக்கத்திற்குத் திரும்பு',
  cbTitle: 'நாங்கள் உங்களைத் திரும்ப அழைப்போம்',
  callMe: 'என்னைத் திரும்ப அழையுங்கள்',
  netTitle: 'இன்னும் அனுப்பப்படவில்லை',
  netText: 'உங்கள் பதில்கள் சேமிக்கப்பட்டுள்ளன. இணையத்தைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
  tryAgain: 'மீண்டும் முயற்சி செய்',
  waitTitle: 'சில நிமிடங்கள் காத்திருங்கள்',
  waitText:
    'இந்தச் சாதனத்திலிருந்து பல கோரிக்கைகள் வந்துள்ளன. உடனடியாக உதவி தேவை என்றால், அழையுங்கள் அல்லது WhatsApp செய்யுங்கள்.',
  closedTitle: 'இணையவழிக் கோரிக்கைகள் இன்னும் தொடங்கப்படவில்லை',
  closedText: 'எங்களை அழையுங்கள் அல்லது WhatsApp செய்யுங்கள் — நாங்கள் கேட்டு உதவுவோம்.',
  invalidTitle: 'சில பதில்களைச் சரிபார்க்க வேண்டும்',
  invalidText:
    'பின்சென்று உங்கள் பதில்களைச் சரிபாருங்கள், அல்லது எங்களை அழையுங்கள் / WhatsApp செய்யுங்கள்.',
  hours: 'நேரம்',
};

export const HELP_MESSAGES: Record<UiLang, Record<HelpMessageKey, string>> = { en, ta };

export const HELP_FOR_LABELS: Record<HelpFor, Record<UiLang, string>> = {
  self: { en: 'Me', ta: 'எனக்கு' },
  someone: { en: 'Someone I know', ta: 'எனக்குத் தெரிந்தவருக்கு' },
  on_behalf: {
    en: 'I’m asking on someone’s behalf (for example, a volunteer)',
    ta: 'ஒருவரின் சார்பாகக் கேட்கிறேன் (உதாரணம்: தன்னார்வலர்)',
  },
};

export const HELP_KIND_LABELS: Record<HelpKind, Record<UiLang, string>> = {
  education: { en: 'Education', ta: 'கல்வி' },
  food: { en: 'Food & essentials', ta: 'உணவு மற்றும் அத்தியாவசியம்' },
  health: { en: 'Health', ta: 'மருத்துவம்' },
  emergency: { en: 'Emergency', ta: 'அவசரம்' },
  livelihood: { en: 'Livelihood', ta: 'வாழ்வாதாரம்' },
  other: { en: 'Other', ta: 'பிற' },
  unsure: { en: 'I don’t know how to explain', ta: 'எப்படிச் சொல்வது என்று தெரியவில்லை' },
};

export const CALL_TIME_LABELS: Record<CallTime, Record<UiLang, string>> = {
  morning: { en: 'Morning', ta: 'காலை' },
  afternoon: { en: 'Afternoon', ta: 'மதியம்' },
  evening: { en: 'Evening', ta: 'மாலை' },
  anytime: { en: 'Any time', ta: 'எப்போதும்' },
};
