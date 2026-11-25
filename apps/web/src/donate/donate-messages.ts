import type { UiLang } from '../components/ui/ui-strings.ts';

/**
 * Donate panel text (#24). Copy follows the reviewed wireframe (docs/design/wireframes/donate.html,
 * #7); final copy is reviewed by the trust (#37). Every key exists in both languages
 * (donate.test.tsx checks). `{amount}` and `{fee}` are filled in by the panel.
 */
const en = {
  title: 'Donate',
  progress: 'Donation progress',
  stepNeed: 'Need',
  stepAmount: 'Amount',
  stepDetails: 'Details',
  stepPay: 'Pay',
  whereGo: 'Where should your gift go?',
  generalText: 'General fund — used for the most urgent needs.',
  earmarkedText: 'For this need.',
  continue: 'Continue',
  back: 'Back',
  howMuch: 'How much would you like to give?',
  minAmount: 'Any amount from ₹1',
  maxAmount: 'For gifts above {amount}, please pay by bank transfer.',
  coverFee: 'Add {fee} to cover the payment fee',
  coverFeeHint: 'Optional. So the trust receives your full gift.',
  methodsTitle: 'Ways to pay',
  methodsText:
    'UPI up to ₹1,00,000 per payment (your bank may allow less). Card or netbanking for any amount. Bank transfer for large gifts.',
  yourDetails: 'Your details',
  detailsWhy: 'Kept private. The trust keeps a record of every donor.',
  fullName: 'Full name',
  mobile: 'Mobile number',
  mobileError: 'Enter a 10-digit mobile number',
  mobileHint:
    'Our payment partner needs your mobile number to take the payment. We never sell it or show it publicly.',
  payAgainSameOrder: 'Open the payment window again',
  payAgainHint:
    'Closed the payment window before paying? Open it again: it is the same payment, so you can never be charged twice.',
  noDoubleCharge: "You won't be charged twice for this donation. This can take a few minutes.",
  confirmedTitle: 'This donation is confirmed',
  confirmedText: 'The trust has received this payment.',
  confirmedHelp:
    'If this was your donation, the acknowledgement reaches you by email if you gave one. Otherwise, contact the trust with this reference.',
  email: 'Email',
  emailError: 'Enter a valid email address',
  contactError: 'Give a mobile number or an email so the trust can reach you about this gift.',
  nameError: 'Enter your name',
  ackOpt: 'Send me a donation acknowledgement',
  ackHint: 'Offered from {amount}. A link to view it after payment, and by email if you add one.',
  hideName: "Don't show my name publicly",
  consent: 'The trust may keep these details to record my donation.',
  consentError: 'Please tick this box to continue.',
  review: 'Check and pay',
  sumNeed: 'Need',
  sumAmount: 'Amount',
  sumGift: 'Gift',
  sumFee: 'Payment fee',
  sumName: 'Name',
  trustLine: 'Secure payment via Cashfree · UPI QR or app, card, netbanking',
  payNow: 'Pay {amount} securely',
  confirming: 'Confirming your payment…',
  dontClose: "Please don't close this page or pay again.",
  thanks: 'Thank you — payment received',
  reference: 'Reference',
  backToPage: 'Back to the page',
  consentTitle: 'Please check before you agree',
  taxOpt: 'I want to claim a tax deduction for this donation',
  taxExplain:
    'A deduction is possible only under the old tax regime, and only for donations not paid in cash. The trust needs your PAN and address to report your donation to the Income Tax Department; they are stored encrypted and never shown on receipts, links or emails.',
  pan: 'PAN',
  panError: 'Enter your PAN, e.g. ABCDE1234F',
  address: 'Postal address',
  addressError: 'Enter your full postal address',
  taxAck: 'I understand the deduction applies only if I file under the old tax regime.',
  taxAckError: 'Please tick this box to opt in, or untick the deduction option.',
  viewReceipt: 'View your donation acknowledgement',
  pending: "We're confirming your payment",
  dontPayAgain: "Please don't pay again. This can take a few minutes.",
  checkAgain: 'Check again',
  pendingHelp:
    "If money left your account and this doesn't change, contact us with this reference.",
  failed: "Payment didn't go through",
  failedText: 'Your details are kept. You can try again or use another way to pay.',
  tryAgain: 'Try again',
  failedHelp: 'If money left your account, contact us with this reference.',
  bankTransferLink: 'Giving a large amount? Pay by bank transfer',
  bankTitle: 'Pay by bank transfer (NEFT / RTGS / IMPS)',
  accName: 'Account name',
  accNo: 'Account number',
  ifsc: 'IFSC',
  bankName: 'Bank',
  bankUseReference: 'Write this reference in the transfer remarks so we can find your gift.',
  notYet: 'Not confirmed yet',
  bankText:
    "We confirm your gift when the transfer reaches the trust's account, then send your acknowledgement.",
  utr: 'Bank reference (UTR)',
  utrHint: 'Helps us find your transfer. It does not confirm the payment by itself.',
  utrError: 'Enter 6–30 letters and numbers, or leave it empty.',
  doneTransfer: "I've made the transfer",
  closedTitle: 'Online donations open soon',
  closedText:
    'Online payments are not switched on yet. Please contact the trust to give, or come back soon.',
  invalidTitle: 'Some details need checking',
  invalidText: 'Please check the amount and your details, then try again.',
  waitTitle: 'Please wait a moment',
  waitText: 'There were many attempts from this connection. Please try again in a few minutes.',
  netTitle: 'Could not reach the trust',
  netText: 'Your choices are kept. Check your connection and try again.',
};

export type DonateMessageKey = keyof typeof en;

const ta: Record<DonateMessageKey, string> = {
  title: 'நன்கொடை',
  progress: 'நன்கொடை — எந்தப் படியில் இருக்கிறீர்கள்',
  stepNeed: 'தேவை',
  stepAmount: 'தொகை',
  stepDetails: 'விவரங்கள்',
  stepPay: 'பணம் செலுத்த',
  whereGo: 'உங்கள் நன்கொடை எதற்குப் போக வேண்டும்?',
  generalText: 'பொது நிதி — மிக அவசரமான தேவைக்குப் பயன்படும்.',
  earmarkedText: 'இந்தத் தேவைக்கு.',
  continue: 'தொடரவும்',
  back: 'பின்னால்',
  howMuch: 'எவ்வளவு கொடுக்க விரும்புகிறீர்கள்?',
  minAmount: '₹1 முதல் எவ்வளவு வேண்டுமானாலும்',
  maxAmount: '{amount}-க்கு மேல் கொடுக்க, வங்கிப் பரிமாற்றம் மூலம் செலுத்துங்கள்.',
  coverFee: 'பணம் அனுப்பும் செலவுக்காக {fee} சேர்த்துக் கொடுக்கிறேன்',
  coverFeeHint: 'விருப்பப்பட்டால் மட்டும். இதனால் அறக்கட்டளைக்கு முழுத் தொகையும் வந்து சேரும்.',
  methodsTitle: 'செலுத்தும் வழிகள்',
  methodsText:
    'UPI-இல் ஒரு முறைக்கு ₹1,00,000 வரை (உங்கள் வங்கி இதைவிடக் குறைவாக வைத்திருக்கலாம்). எந்தத் தொகைக்கும் கார்டு அல்லது நெட்பேங்கிங். பெரிய தொகைக்கு வங்கிப் பரிமாற்றம்.',
  yourDetails: 'உங்கள் விவரங்கள்',
  detailsWhy:
    'இவை வெளியே யாருக்கும் தெரியாது. நன்கொடை கொடுத்த ஒவ்வொருவரின் பதிவையும் அறக்கட்டளை வைத்திருக்கும்.',
  fullName: 'முழுப் பெயர்',
  mobile: 'கைபேசி எண்',
  mobileError: '10 இலக்க கைபேசி எண்ணை எழுதுங்கள்',
  mobileHint:
    'பணம் செலுத்த, எங்கள் கட்டண நிறுவனத்துக்கு உங்கள் கைபேசி எண் தேவை. இதை நாங்கள் யாருக்கும் விற்பதும் இல்லை, வெளியே காட்டுவதும் இல்லை.',
  payAgainSameOrder: 'கட்டணச் சாளரத்தை மீண்டும் திறக்கவும்',
  payAgainHint:
    'பணம் செலுத்தும் முன் சாளரத்தை மூடிவிட்டீர்களா? மீண்டும் திறக்கலாம்: இது அதே பணம் செலுத்துதல்தான், அதனால் இரண்டு முறை பணம் எடுக்கப்படாது.',
  noDoubleCharge:
    'இந்த நன்கொடைக்கு இரண்டு முறை பணம் எடுக்கப்படாது. இதற்குச் சில நிமிடங்கள் ஆகலாம்.',
  confirmedTitle: 'இந்த நன்கொடை உறுதியாகிவிட்டது',
  confirmedText: 'இந்தப் பணம் அறக்கட்டளைக்கு வந்து சேர்ந்துவிட்டது.',
  confirmedHelp:
    'இது உங்கள் நன்கொடை என்றால், நீங்கள் மின்னஞ்சல் கொடுத்திருந்தால் ஒப்புகை அதில் வரும். இல்லையென்றால், இந்தக் குறிப்பு எண்ணுடன் அறக்கட்டளையைத் தொடர்பு கொள்ளுங்கள்.',
  email: 'மின்னஞ்சல்',
  emailError: 'சரியான மின்னஞ்சல் முகவரியை எழுதுங்கள்',
  contactError:
    'இந்த நன்கொடை பற்றி அறக்கட்டளை உங்களைத் தொடர்பு கொள்ள, கைபேசி எண் அல்லது மின்னஞ்சல் — ஏதாவது ஒன்று கொடுங்கள்.',
  nameError: 'உங்கள் பெயரை எழுதுங்கள்',
  ackOpt: 'எனக்கு நன்கொடை ஒப்புகை அனுப்புங்கள்',
  ackHint:
    '{amount} முதல். பணம் செலுத்திய பிறகு பார்க்க ஒரு இணைப்பு கிடைக்கும்; மின்னஞ்சல் கொடுத்திருந்தால் அதிலும் அனுப்புவோம்.',
  hideName: 'என் பெயரைப் பொதுவில் காட்ட வேண்டாம்',
  consent: 'என் நன்கொடையைப் பதிவு செய்ய, அறக்கட்டளை இந்த விவரங்களை வைத்துக்கொள்ளலாம்.',
  consentError: 'தொடர, இந்தக் கட்டத்தில் குறியிடுங்கள்.',
  review: 'ஒருமுறை பார்த்துவிட்டுச் செலுத்துங்கள்',
  sumNeed: 'தேவை',
  sumAmount: 'தொகை',
  sumGift: 'நன்கொடை',
  sumFee: 'பணம் அனுப்பும் செலவு',
  sumName: 'பெயர்',
  trustLine: 'Cashfree மூலம் பாதுகாப்பாகச் செலுத்தலாம் · UPI QR அல்லது செயலி, கார்டு, நெட்பேங்கிங்',
  payNow: '{amount} பாதுகாப்பாகச் செலுத்து',
  confirming: 'உங்கள் பணம் வந்ததா என்று பார்க்கிறோம்…',
  dontClose: 'இந்தப் பக்கத்தை மூட வேண்டாம், மறுபடி பணம் செலுத்த வேண்டாம்.',
  thanks: 'நன்றி — உங்கள் பணம் வந்து சேர்ந்தது',
  reference: 'குறிப்பு எண்',
  backToPage: 'பக்கத்துக்குத் திரும்ப',
  consentTitle: 'ஒப்புக்கொள்ளும் முன் இதைப் படியுங்கள்',
  taxOpt: 'இந்த நன்கொடைக்கு வரி விலக்கு வேண்டும்',
  taxExplain:
    'பழைய வரி முறையில் இருப்பவர்களுக்கு மட்டும், ரொக்கமாகக் கொடுக்காத நன்கொடைக்கு மட்டும் விலக்கு கிடைக்கும். உங்கள் நன்கொடையை வருமான வரித் துறைக்குத் தெரிவிக்க அறக்கட்டளைக்கு உங்கள் PAN, முகவரி தேவை; அவை மறைகுறியாக்கம் செய்து பாதுகாப்பாக வைக்கப்படும், ஒப்புகையிலோ இணைப்பிலோ மின்னஞ்சலிலோ எப்போதும் வராது.',
  pan: 'PAN',
  panError: 'உங்கள் PAN-ஐ எழுதுங்கள், எ.கா. ABCDE1234F',
  address: 'அஞ்சல் முகவரி',
  addressError: 'உங்கள் முழு அஞ்சல் முகவரியை எழுதுங்கள்',
  taxAck:
    'பழைய வரி முறையில் கணக்குத் தாக்கல் செய்தால் மட்டுமே விலக்கு கிடைக்கும் என்று எனக்குத் தெரியும்.',
  taxAckError:
    'இந்தக் கட்டத்தில் குறியிடுங்கள், அல்லது வரி விலக்கு வேண்டாம் என்று எடுத்துவிடுங்கள்.',
  viewReceipt: 'உங்கள் நன்கொடை ஒப்புகையைப் பாருங்கள்',
  pending: 'உங்கள் பணம் வந்ததா என்று இன்னும் பார்த்துக்கொண்டிருக்கிறோம்',
  dontPayAgain: 'மறுபடி பணம் செலுத்த வேண்டாம். இதற்குச் சில நிமிடங்கள் ஆகலாம்.',
  checkAgain: 'மீண்டும் சரிபார்',
  pendingHelp:
    'உங்கள் கணக்கிலிருந்து பணம் போய், இது இன்னும் மாறவில்லை என்றால், இந்தக் குறிப்பு எண்ணைச் சொல்லி எங்களைத் தொடர்பு கொள்ளுங்கள்.',
  failed: 'பணம் செலுத்த முடியவில்லை',
  failedText:
    'நீங்கள் கொடுத்த விவரங்கள் அப்படியே இருக்கின்றன. மறுபடி முயற்சி செய்யலாம், அல்லது வேறு வழியில் செலுத்தலாம்.',
  tryAgain: 'மீண்டும் முயற்சி செய்',
  failedHelp:
    'உங்கள் கணக்கிலிருந்து பணம் போயிருந்தால், இந்தக் குறிப்பு எண்ணைச் சொல்லி எங்களைத் தொடர்பு கொள்ளுங்கள்.',
  bankTransferLink: 'பெரிய தொகையா? வங்கிப் பரிமாற்றம் மூலம் செலுத்துங்கள்',
  bankTitle: 'வங்கிப் பரிமாற்றம் மூலம் செலுத்துங்கள் (NEFT / RTGS / IMPS)',
  accName: 'கணக்குப் பெயர்',
  accNo: 'கணக்கு எண்',
  ifsc: 'IFSC',
  bankName: 'வங்கி',
  bankUseReference:
    'உங்கள் நன்கொடையை நாங்கள் கண்டுபிடிக்க, பணம் அனுப்பும்போது குறிப்பு இடத்தில் இந்த எண்ணை எழுதுங்கள்.',
  notYet: 'இன்னும் உறுதியாகவில்லை',
  bankText:
    'பணம் அறக்கட்டளையின் கணக்குக்கு வந்ததும் உங்கள் நன்கொடையை உறுதி செய்து, ஒப்புகை அனுப்புவோம்.',
  utr: 'வங்கிக் குறிப்பு எண் (UTR)',
  utrHint:
    'உங்கள் பணத்தைக் கண்டுபிடிக்க இது உதவும். ஆனால் இதை மட்டும் வைத்து பணம் வந்ததாக உறுதி செய்ய மாட்டோம்.',
  utrError: '6 முதல் 30 வரை எழுத்துகள் / எண்கள் எழுதுங்கள், அல்லது காலியாக விடுங்கள்.',
  doneTransfer: 'பணம் அனுப்பிவிட்டேன்',
  closedTitle: 'இணையம் வழியாக நன்கொடை கொடுக்கும் வசதி சீக்கிரம் தொடங்கும்',
  closedText:
    'இணையம் வழியாகப் பணம் செலுத்தும் வசதி இன்னும் தொடங்கவில்லை. நன்கொடை கொடுக்க அறக்கட்டளையைத் தொடர்பு கொள்ளுங்கள், அல்லது கொஞ்ச நாள் கழித்து மறுபடி வாருங்கள்.',
  invalidTitle: 'சில விவரங்களை ஒருமுறை பாருங்கள்',
  invalidText:
    'தொகையும் உங்கள் விவரங்களும் சரியாக இருக்கிறதா என்று பார்த்து, மறுபடி முயற்சி செய்யுங்கள்.',
  waitTitle: 'கொஞ்ச நேரம் பொறுங்கள்',
  waitText:
    'இங்கிருந்து நிறைய முறை முயற்சி செய்திருக்கிறீர்கள். சில நிமிடம் கழித்து மறுபடி முயற்சி செய்யுங்கள்.',
  netTitle: 'அறக்கட்டளையின் தளத்தோடு இணைய முடியவில்லை',
  netText:
    'நீங்கள் தேர்வு செய்தவை அப்படியே இருக்கின்றன. இணையம் சரியாக இருக்கிறதா என்று பார்த்து, மறுபடி முயற்சி செய்யுங்கள்.',
};

export const DONATE_MESSAGES: Record<UiLang, Record<DonateMessageKey, string>> = { en, ta };

/** Client, Nov 2026: quick picks ₹1, ₹10, ₹100 and ₹1,000; any amount from ₹1 under "Other". */
export const DONATE_PRESETS_RUPEES = [1, 10, 100, 1000] as const;
