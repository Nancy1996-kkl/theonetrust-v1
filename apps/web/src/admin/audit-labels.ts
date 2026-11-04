import type { UiLang } from '../components/ui/ui-strings.ts';

/** Plain-language names for audit actions. Unknown actions show their code. */
const LABELS: Record<string, { en: string; ta: string }> = {
  'auth.login.password_ok': { en: 'Password accepted', ta: 'கடவுச்சொல் ஏற்கப்பட்டது' },
  'auth.login.wrong_password': { en: 'Wrong password', ta: 'தவறான கடவுச்சொல்' },
  'auth.login.unknown_account': {
    en: 'Sign-in with an unknown email',
    ta: 'தெரியாத மின்னஞ்சலுடன் உள்நுழைவு முயற்சி',
  },
  'auth.login.locked': { en: 'Sign-in while locked', ta: 'பூட்டிய நிலையில் உள்நுழைவு முயற்சி' },
  'auth.account.locked': {
    en: 'Account locked after failed attempts',
    ta: 'தவறான முயற்சிகளால் கணக்கு பூட்டப்பட்டது',
  },
  'auth.mfa.enabled': { en: 'Authenticator app set up', ta: 'அங்கீகரிப்புச் செயலி அமைக்கப்பட்டது' },
  'auth.mfa.verified': {
    en: 'Signed in with authenticator code',
    ta: 'அங்கீகரிப்புக் குறியீட்டுடன் உள்நுழைந்தார்',
  },
  'auth.mfa.recovery_code_used': {
    en: 'Signed in with a recovery code',
    ta: 'மீட்புக் குறியீட்டுடன் உள்நுழைந்தார்',
  },
  'auth.mfa.wrong_code': { en: 'Wrong authenticator code', ta: 'தவறான அங்கீகரிப்புக் குறியீடு' },
  'auth.mfa.setup_wrong_code': {
    en: 'Wrong code during setup',
    ta: 'அமைப்பின்போது தவறான குறியீடு',
  },
  'auth.logout': { en: 'Signed out', ta: 'வெளியேறினார்' },
  'auth.owner.password_set': {
    en: 'Owner password set or reset',
    ta: 'உரிமையாளர் கடவுச்சொல் அமைக்கப்பட்டது',
  },
  'help_request.created': { en: 'Help request received', ta: 'உதவிக் கோரிக்கை பெறப்பட்டது' },
  'help_request.status_changed': {
    en: 'Help request status changed',
    ta: 'உதவிக் கோரிக்கை நிலை மாற்றப்பட்டது',
  },
  'help_request.updated': { en: 'Help request updated', ta: 'உதவிக் கோரிக்கை புதுப்பிக்கப்பட்டது' },
  'help_request.note_added': {
    en: 'Note added to a help request',
    ta: 'உதவிக் கோரிக்கையில் குறிப்பு சேர்க்கப்பட்டது',
  },
  'help_request.exported': {
    en: 'Help requests exported (masked)',
    ta: 'உதவிக் கோரிக்கைகள் ஏற்றுமதி (மறைக்கப்பட்டது)',
  },
  'bank_transfer.credit_recorded': {
    en: 'Bank credit recorded and matched',
    ta: 'வங்கி வரவு பதிவாகிப் பொருந்தியது',
  },
  'bank_transfer.credit_unmatched': {
    en: 'Bank credit recorded — exception',
    ta: 'வங்கி வரவு பதிவானது — விதிவிலக்கு',
  },
  'bank_transfer.confirmed_paid': {
    en: 'Bank transfer confirmed — donation paid',
    ta: 'வங்கிப் பரிமாற்றம் உறுதி — நன்கொடை செலுத்தப்பட்டது',
  },
  'bank_transfer.credit_rejected': {
    en: 'Bank credit rejected',
    ta: 'வங்கி வரவு நிராகரிக்கப்பட்டது',
  },
  'payment_exception.resolved': {
    en: 'Payment exception resolved',
    ta: 'கட்டண விதிவிலக்கு தீர்க்கப்பட்டது',
  },
  'notification.retry': {
    en: 'Email queued again',
    ta: 'மின்னஞ்சல் மீண்டும் வரிசையில் சேர்க்கப்பட்டது',
  },
  'admin.preferences.update': { en: 'Dashboard language changed', ta: 'பலகை மொழி மாற்றப்பட்டது' },
};

export function auditActionLabel(action: string, lang: UiLang): string {
  return LABELS[action]?.[lang] ?? action;
}

/** Date and time in India Standard Time, in the dashboard language. */
export function formatAuditTime(iso: string, lang: UiLang): string {
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

/** A YYYY-MM-DD date field → the start of that day in IST, as an ISO timestamp. */
export function istDayStart(date: string, addDays = 0): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const start = new Date(`${date}T00:00:00+05:30`);
  return new Date(start.getTime() + addDays * 86_400_000).toISOString();
}
