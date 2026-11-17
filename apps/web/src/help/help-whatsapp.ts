import type { CallTime, HelpFor, HelpKind } from '@theonetrust/contracts';
import type { UiLang } from '../components/ui/ui-strings.ts';
import {
  CALL_TIME_LABELS,
  HELP_FOR_LABELS,
  HELP_KIND_LABELS,
  HELP_MESSAGES,
} from './help-messages.ts';

/**
 * WhatsApp hand-off for Get Help (client, Nov 2026): no API or database. The form builds a
 * plain-text request and opens the trust's own WhatsApp chat; the person presses send there and,
 * for education help, attaches the income-certificate photo in that chat. This website never
 * receives or stores the request or any document.
 *
 * Privacy: the text carries no phone number, name, village or address (WhatsApp already shows the
 * sender's number to the trust). Free text is limited to what the person typed themselves.
 */
export type CertAnswer = 'have' | 'none';
export type ContactWay = 'whatsapp' | 'phone';

export interface WhatsAppHelpInput {
  helpFor: HelpFor;
  age: number;
  kinds: HelpKind[];
  otherNeed: string;
  cert: CertAnswer | null;
  contactWay: ContactWay;
  description: string;
  callLanguage: UiLang;
  bestTime: CallTime;
}

export const AGE_MIN = 1;
export const AGE_MAX = 120;

/** Whole years only, 1–120. Returns null for anything else (blank, decimals, letters). */
export function parseAge(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d{1,3}$/.test(value)) return null;
  const age = Number(value);
  return age >= AGE_MIN && age <= AGE_MAX ? age : null;
}

/** Only the trust's own https://wa.me/<digits> link is accepted as the destination. */
export function isTrustWhatsAppUrl(url: string | null): url is string {
  return url !== null && /^https:\/\/wa\.me\/\d{8,15}$/.test(url);
}

export function buildWhatsAppText(input: WhatsAppHelpInput, lang: UiLang): string {
  const t = HELP_MESSAGES[lang];
  const needs = input.kinds
    .map((k) =>
      k === 'other' && input.otherNeed.trim()
        ? `${HELP_KIND_LABELS.other[lang]}: ${input.otherNeed.trim()}`
        : HELP_KIND_LABELS[k][lang],
    )
    .join(', ');
  const lines = [
    `*${t.waHeader}*`,
    `${t.waFor}: ${HELP_FOR_LABELS[input.helpFor][lang]}`,
    `${t.waAge}: ${input.age}`,
    `${t.waNeed}: ${needs}`,
  ];
  if (input.kinds.includes('education') && input.cert) {
    const way = input.contactWay === 'whatsapp' ? t.contactWayWhatsapp : t.contactWayPhone;
    lines.push(
      `${t.waCert}: ${input.cert === 'have' ? t.waCertHave : t.waCertNone.replace('{way}', way)}`,
    );
  }
  const details = input.description.trim();
  if (details) lines.push(`${t.waDetails}: ${details}`);
  lines.push(
    `${t.waLanguage}: ${input.callLanguage === 'ta' ? 'தமிழ்' : 'English'}`,
    `${t.waBestTime}: ${CALL_TIME_LABELS[input.bestTime][lang]}`,
  );
  return lines.join('\n');
}

export function whatsAppSendUrl(trustUrl: string, text: string): string {
  return `${trustUrl}?text=${encodeURIComponent(text)}`;
}
