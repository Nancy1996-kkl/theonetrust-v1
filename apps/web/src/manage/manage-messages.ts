import type { DonorSubscriptionStatus, MethodRoute } from '@theonetrust/contracts';
import type { UiLang } from '../components/ui/ui-strings.ts';

/** Manage monthly giving page (#32). Same keys in both languages (manage.test.tsx). */
export const MANAGE_MESSAGES = {
  en: {
    pageTitle: 'Your monthly giving',
    loading: 'Loading…',
    notFoundTitle: 'Link not found',
    notFoundText:
      'This link does not match any monthly giving. Check that the whole link was copied, or contact the trust.',
    unavailableTitle: 'This page is not available right now',
    unavailableText: 'Please try again in a few minutes.',
    tryAgain: 'Try again',
    reference: 'Reference',
    amount: 'Amount',
    perMonth: '{amount} every month',
    status: 'Status',
    since: 'Started',
    method: 'Approved with',
    purpose: 'Purpose',
    generalFund: 'General fund — used where the need is greatest',
    cancelTitle: 'Cancel monthly giving',
    cancelText:
      'No more monthly donations will be taken after you cancel. Donations already made are not refunded.',
    cancel: 'Cancel monthly giving',
    confirm: 'Yes, cancel it',
    keep: 'Keep it',
    cancelling: 'Cancelling…',
    cancelled: 'Monthly giving is cancelled. No more donations will be taken.',
    cancelFailed: 'We could not cancel it right now. Nothing was changed — please try again.',
    pauseNote: 'To pause instead, use your UPI app (UPI AutoPay) or contact the trust.',
    changeNote: 'To change the amount, cancel this one and set up a new monthly gift.',
    privacy:
      'Keep this link private — anyone with it can cancel your monthly giving. It never shows your phone number or email.',
    home: 'Back to the home page',
    statuses: {
      ACTIVE: 'Active',
      PENDING: 'Waiting for your bank or UPI app',
      PAUSED: 'Paused',
      CANCELLED: 'Cancelled',
      ENDED: 'Ended',
    } satisfies Record<DonorSubscriptionStatus, string>,
    routes: {
      upi_autopay: 'UPI AutoPay, eMandate or card',
      emandate_card: 'eMandate or card',
    } satisfies Record<MethodRoute, string>,
  },
  ta: {
    pageTitle: 'உங்கள் மாதாந்திர நன்கொடை',
    loading: 'ஏற்றுகிறது…',
    notFoundTitle: 'இணைப்பு கிடைக்கவில்லை',
    notFoundText:
      'இந்த இணைப்பு எந்த மாதாந்திர நன்கொடையுடனும் பொருந்தவில்லை. முழு இணைப்பும் நகலெடுக்கப்பட்டதா எனச் சரிபார்க்கவும், அல்லது அறக்கட்டளையைத் தொடர்புகொள்ளவும்.',
    unavailableTitle: 'இந்தப் பக்கம் இப்போது கிடைக்கவில்லை',
    unavailableText: 'சில நிமிடங்களில் மீண்டும் முயற்சி செய்யவும்.',
    tryAgain: 'மீண்டும் முயற்சி செய்',
    reference: 'குறிப்பு எண்',
    amount: 'தொகை',
    perMonth: 'ஒவ்வொரு மாதமும் {amount}',
    status: 'நிலை',
    since: 'தொடங்கியது',
    method: 'அனுமதித்த முறை',
    purpose: 'நோக்கம்',
    generalFund: 'பொது நிதி — தேவை அதிகமுள்ள இடத்தில் பயன்படுத்தப்படும்',
    cancelTitle: 'மாதாந்திர நன்கொடையை ரத்து செய்',
    cancelText:
      'ரத்து செய்த பிறகு மாதாந்திர நன்கொடைகள் எடுக்கப்படாது. ஏற்கெனவே செய்த நன்கொடைகள் திருப்பி அளிக்கப்படாது.',
    cancel: 'மாதாந்திர நன்கொடையை ரத்து செய்',
    confirm: 'ஆம், ரத்து செய்',
    keep: 'தொடரட்டும்',
    cancelling: 'ரத்து செய்யப்படுகிறது…',
    cancelled: 'மாதாந்திர நன்கொடை ரத்து செய்யப்பட்டது. இனி நன்கொடைகள் எடுக்கப்படாது.',
    cancelFailed:
      'இப்போது ரத்து செய்ய முடியவில்லை. எதுவும் மாறவில்லை — மீண்டும் முயற்சி செய்யவும்.',
    pauseNote:
      'இடைநிறுத்த, உங்கள் UPI செயலியைப் (UPI AutoPay) பயன்படுத்தவும் அல்லது அறக்கட்டளையைத் தொடர்புகொள்ளவும்.',
    changeNote: 'தொகையை மாற்ற, இதை ரத்து செய்து புதிய மாதாந்திர நன்கொடையை அமைக்கவும்.',
    privacy:
      'இந்த இணைப்பைத் தனிப்பட்டதாக வைத்திருங்கள் — இது உள்ள எவரும் உங்கள் மாதாந்திர நன்கொடையை ரத்து செய்ய முடியும். இதில் உங்கள் தொலைபேசி எண் அல்லது மின்னஞ்சல் ஒருபோதும் காட்டப்படாது.',
    home: 'முகப்புப் பக்கத்திற்குத் திரும்பு',
    statuses: {
      ACTIVE: 'செயலில்',
      PENDING: 'உங்கள் வங்கி அல்லது UPI செயலிக்காகக் காத்திருக்கிறது',
      PAUSED: 'இடைநிறுத்தப்பட்டது',
      CANCELLED: 'ரத்து செய்யப்பட்டது',
      ENDED: 'முடிந்தது',
    },
    routes: {
      upi_autopay: 'UPI AutoPay, eMandate அல்லது கார்டு',
      emandate_card: 'eMandate அல்லது கார்டு',
    },
  },
} as const satisfies Record<UiLang, unknown>;
