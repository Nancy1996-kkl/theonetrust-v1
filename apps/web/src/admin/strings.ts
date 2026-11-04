import type { UiLang } from '../components/ui/ui-strings.ts';

/** Owner dashboard text (#19). Both languages must have every key — strings.test.ts checks. */
const en = {
  dashboardName: 'Theonetrust.in — owner dashboard',
  signInTitle: 'Owner sign in',
  signInIntro: 'Only the trust owner can sign in. You will need your authenticator app.',
  email: 'Email',
  password: 'Password',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  setupTitle: 'Set up your authenticator app',
  setupIntro:
    'For safety, the dashboard needs a code from an authenticator app (for example Google Authenticator or Microsoft Authenticator) every time you sign in.',
  setupStep1: 'Open your authenticator app and choose to add an account with a setup key.',
  setupStep2: 'Enter this key (spaces do not matter):',
  setupKeyLabel: 'Setup key',
  setupOpenApp: 'Or open it in the authenticator app on this phone',
  setupStep3: 'Type the 6-digit code the app shows.',
  verifyTitle: 'Enter your code',
  verifyIntro: 'Open your authenticator app and type the 6-digit code for Theonetrust.in.',
  code: '6-digit code',
  codeHint: 'The code changes every 30 seconds.',
  recoveryCode: 'Recovery code',
  recoveryHint: 'Like ABCDE-23456. Each recovery code works once.',
  useRecovery: 'Lost your phone? Use a recovery code',
  useApp: 'Use the authenticator app instead',
  continue: 'Continue',
  checking: 'Checking…',
  recoveryTitle: 'Save your recovery codes',
  recoveryIntro:
    'If you lose your phone, each of these codes lets you sign in once. Write them down or print them and keep them somewhere safe. They will not be shown again.',
  recoverySaved: 'I have saved these codes somewhere safe',
  recoveryListLabel: 'Recovery codes',
  goToDashboard: 'Go to the dashboard',
  loading: 'Loading…',
  signOut: 'Sign out',
  signedInAs: 'Signed in as',
  overviewTitle: 'Overview',
  overviewEmptyTitle: 'Nothing to show yet',
  overviewEmpty: 'The dashboard modules (donations, receipts, help requests) are added next.',
  errorInvalidCredentials:
    'Email or password is incorrect, or the account is locked for a while after too many attempts.',
  errorInvalidCode: 'That code is not valid. Check the app and try again.',
  errorRateLimited: 'Too many attempts. Please wait a few minutes and try again.',
  errorExpired: 'Your sign-in expired. Please start again.',
  errorUnavailable: 'Sign-in is not available right now. Please try again later.',
  errorNetwork: 'Could not reach the server. Check your connection and try again.',
  errorGeneric: 'Something went wrong. Please try again.',
  errorRequired: 'Please fill this in.',
  errorCodeFormat: 'Enter the 6 digits from the app.',
};

export type AdminStrings = typeof en;

const ta: AdminStrings = {
  dashboardName: 'Theonetrust.in — உரிமையாளர் பலகை',
  signInTitle: 'உரிமையாளர் உள்நுழைவு',
  signInIntro:
    'அறக்கட்டளை உரிமையாளர் மட்டுமே உள்நுழைய முடியும். உங்கள் அங்கீகரிப்புச் செயலி தேவைப்படும்.',
  email: 'மின்னஞ்சல்',
  password: 'கடவுச்சொல்',
  signIn: 'உள்நுழைக',
  signingIn: 'உள்நுழைகிறது…',
  setupTitle: 'அங்கீகரிப்புச் செயலியை அமைக்கவும்',
  setupIntro:
    'பாதுகாப்புக்காக, ஒவ்வொரு முறை உள்நுழையும்போதும் அங்கீகரிப்புச் செயலியிலிருந்து (உதாரணம்: Google Authenticator, Microsoft Authenticator) ஒரு குறியீடு தேவை.',
  setupStep1:
    'அங்கீகரிப்புச் செயலியைத் திறந்து, அமைப்புக் குறியீட்டுடன் கணக்கைச் சேர்க்கத் தேர்ந்தெடுக்கவும்.',
  setupStep2: 'இந்தக் குறியீட்டை உள்ளிடவும் (இடைவெளிகள் முக்கியமில்லை):',
  setupKeyLabel: 'அமைப்புக் குறியீடு',
  setupOpenApp: 'அல்லது இந்தத் தொலைபேசியில் உள்ள செயலியில் திறக்கவும்',
  setupStep3: 'செயலி காட்டும் 6 இலக்கக் குறியீட்டை உள்ளிடவும்.',
  verifyTitle: 'உங்கள் குறியீட்டை உள்ளிடவும்',
  verifyIntro:
    'அங்கீகரிப்புச் செயலியைத் திறந்து Theonetrust.in-க்கான 6 இலக்கக் குறியீட்டை உள்ளிடவும்.',
  code: '6 இலக்கக் குறியீடு',
  codeHint: 'குறியீடு ஒவ்வொரு 30 விநாடிக்கும் மாறும்.',
  recoveryCode: 'மீட்புக் குறியீடு',
  recoveryHint: 'ABCDE-23456 போல. ஒவ்வொரு மீட்புக் குறியீடும் ஒரு முறை மட்டுமே செயல்படும்.',
  useRecovery: 'தொலைபேசி தொலைந்ததா? மீட்புக் குறியீட்டைப் பயன்படுத்தவும்',
  useApp: 'அங்கீகரிப்புச் செயலியைப் பயன்படுத்தவும்',
  continue: 'தொடரவும்',
  checking: 'சரிபார்க்கிறது…',
  recoveryTitle: 'மீட்புக் குறியீடுகளைச் சேமிக்கவும்',
  recoveryIntro:
    'தொலைபேசி தொலைந்தால், இந்தக் குறியீடுகள் ஒவ்வொன்றும் ஒரு முறை உள்நுழைய உதவும். எழுதி அல்லது அச்சிட்டுப் பாதுகாப்பான இடத்தில் வைக்கவும். இவை மீண்டும் காட்டப்படாது.',
  recoverySaved: 'இந்தக் குறியீடுகளைப் பாதுகாப்பாகச் சேமித்துவிட்டேன்',
  recoveryListLabel: 'மீட்புக் குறியீடுகள்',
  goToDashboard: 'பலகைக்குச் செல்லவும்',
  loading: 'ஏற்றுகிறது…',
  signOut: 'வெளியேறு',
  signedInAs: 'உள்நுழைந்தவர்',
  overviewTitle: 'மேலோட்டம்',
  overviewEmptyTitle: 'இன்னும் காட்ட எதுவும் இல்லை',
  overviewEmpty:
    'பலகைப் பகுதிகள் (நன்கொடைகள், ரசீதுகள், உதவிக் கோரிக்கைகள்) அடுத்து சேர்க்கப்படும்.',
  errorInvalidCredentials:
    'மின்னஞ்சல் அல்லது கடவுச்சொல் தவறு, அல்லது பல தவறான முயற்சிகளுக்குப் பிறகு கணக்கு சிறிது நேரம் பூட்டப்பட்டுள்ளது.',
  errorInvalidCode: 'அந்தக் குறியீடு சரியில்லை. செயலியைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
  errorRateLimited: 'அதிக முயற்சிகள். சில நிமிடங்கள் காத்திருந்து மீண்டும் முயற்சிக்கவும்.',
  errorExpired: 'உள்நுழைவு காலாவதியானது. மீண்டும் தொடங்கவும்.',
  errorUnavailable: 'உள்நுழைவு இப்போது கிடைக்கவில்லை. பின்னர் முயற்சிக்கவும்.',
  errorNetwork: 'சேவையகத்தை அணுக முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
  errorGeneric: 'ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.',
  errorRequired: 'இதை நிரப்பவும்.',
  errorCodeFormat: 'செயலியில் உள்ள 6 இலக்கங்களை உள்ளிடவும்.',
};

export const ADMIN_STRINGS: Record<UiLang, AdminStrings> = { en, ta };
