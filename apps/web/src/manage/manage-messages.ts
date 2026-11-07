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
    loading: 'கொஞ்சம் பொறுங்கள்…',
    notFoundTitle: 'இணைப்பு கிடைக்கவில்லை',
    notFoundText:
      'இந்த இணைப்புக்கு எந்த மாதாந்திர நன்கொடையும் இல்லை. இணைப்பை முழுதாக நகலெடுத்தீர்களா என்று பாருங்கள், அல்லது அறக்கட்டளையைத் தொடர்பு கொள்ளுங்கள்.',
    unavailableTitle: 'இந்தப் பக்கம் இப்போது கிடைக்கவில்லை',
    unavailableText: 'சில நிமிடம் கழித்து மறுபடி முயற்சி செய்யுங்கள்.',
    tryAgain: 'மீண்டும் முயற்சி செய்',
    reference: 'குறிப்பு எண்',
    amount: 'தொகை',
    perMonth: 'ஒவ்வொரு மாதமும் {amount}',
    status: 'நிலை',
    since: 'தொடங்கியது',
    method: 'எந்த வழியில் அனுமதி கொடுத்தீர்கள்',
    purpose: 'நோக்கம்',
    generalFund: 'பொது நிதி — அதிகம் தேவைப்படும் இடத்தில் பயன்படும்',
    cancelTitle: 'மாதாந்திர நன்கொடையை ரத்து செய்',
    cancelText:
      'ரத்து செய்த பிறகு இனி மாதா மாதம் பணம் எடுக்கப்படாது. ஏற்கெனவே கொடுத்த நன்கொடைகள் திருப்பித் தரப்படாது.',
    cancel: 'மாதாந்திர நன்கொடையை ரத்து செய்',
    confirm: 'ஆம், ரத்து செய்',
    keep: 'வேண்டாம், தொடரட்டும்',
    cancelling: 'ரத்து செய்கிறோம்…',
    cancelled: 'மாதாந்திர நன்கொடை ரத்து ஆகிவிட்டது. இனி பணம் எடுக்கப்படாது.',
    cancelFailed:
      'இப்போது ரத்து செய்ய முடியவில்லை. எதுவும் மாறவில்லை — மறுபடி முயற்சி செய்யுங்கள்.',
    pauseNote:
      'கொஞ்ச காலம் நிறுத்தி வைக்க, உங்கள் UPI செயலியில் (UPI AutoPay) செய்யுங்கள், அல்லது அறக்கட்டளையைத் தொடர்பு கொள்ளுங்கள்.',
    changeNote:
      'தொகையை மாற்ற வேண்டுமென்றால், இதை ரத்து செய்துவிட்டு புதிதாக மாதாந்திர நன்கொடை தொடங்குங்கள்.',
    privacy:
      'இந்த இணைப்பை யாருக்கும் கொடுக்காதீர்கள் — இது யாரிடம் இருந்தாலும் உங்கள் மாதாந்திர நன்கொடையை ரத்து செய்ய முடியும். இதில் உங்கள் தொலைபேசி எண்ணோ மின்னஞ்சலோ வராது.',
    home: 'முகப்புப் பக்கத்துக்குத் திரும்ப',
    statuses: {
      ACTIVE: 'நடப்பில் உள்ளது',
      PENDING: 'உங்கள் வங்கி / UPI செயலியின் அனுமதிக்குக் காத்திருக்கிறது',
      PAUSED: 'தற்காலிகமாக நிறுத்தப்பட்டுள்ளது',
      CANCELLED: 'ரத்து செய்யப்பட்டது',
      ENDED: 'முடிந்தது',
    },
    routes: {
      upi_autopay: 'UPI AutoPay, eMandate அல்லது கார்டு',
      emandate_card: 'eMandate அல்லது கார்டு',
    },
  },
} as const satisfies Record<UiLang, unknown>;
