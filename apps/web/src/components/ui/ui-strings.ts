import { createContext, useContext } from 'react';

/**
 * Built-in wording used by the primitives themselves (close buttons, loading text, step
 * counters). Page copy is always passed in by the caller; only generic control wording lives
 * here. Every key must exist in both languages — ui-strings.test.ts enforces parity.
 */
export type UiLang = 'en' | 'ta';

export interface UiStrings {
  close: string;
  loading: string;
  required: string;
  optional: string;
  dismiss: string;
  notifications: string;
  stepOf: (current: number, total: number) => string;
  stepCompleted: string;
  stepCurrent: string;
  otherAmount: string;
  amountInvalid: string;
  errorPrefix: string;
  successPrefix: string;
  warningPrefix: string;
  infoPrefix: string;
  languageSwitch: string;
  tableScrollHint: string;
}

export const UI_STRINGS: Record<UiLang, UiStrings> = {
  en: {
    close: 'Close',
    loading: 'Loading…',
    required: 'required',
    optional: 'optional',
    dismiss: 'Dismiss',
    notifications: 'Notifications',
    stepOf: (current, total) => `Step ${current} of ${total}`,
    stepCompleted: 'completed',
    stepCurrent: 'current step',
    otherAmount: 'Other amount (₹)',
    amountInvalid: 'Enter a whole rupee amount of ₹1 or more.',
    errorPrefix: 'Error:',
    successPrefix: 'Success:',
    warningPrefix: 'Warning:',
    infoPrefix: 'Information:',
    languageSwitch: 'Language',
    tableScrollHint: 'Scroll sideways to see all columns.',
  },
  ta: {
    close: 'மூடு',
    loading: 'ஏற்றப்படுகிறது…',
    required: 'கட்டாயம்',
    optional: 'விருப்பத்தேர்வு',
    dismiss: 'நீக்கு',
    notifications: 'அறிவிப்புகள்',
    stepOf: (current, total) => `படி ${current} / ${total}`,
    stepCompleted: 'முடிந்தது',
    stepCurrent: 'தற்போதைய படி',
    otherAmount: 'வேறு தொகை (₹)',
    amountInvalid: '₹1 அல்லது அதற்கு மேற்பட்ட முழு ரூபாய் தொகையை உள்ளிடவும்.',
    errorPrefix: 'பிழை:',
    successPrefix: 'வெற்றி:',
    warningPrefix: 'எச்சரிக்கை:',
    infoPrefix: 'தகவல்:',
    languageSwitch: 'மொழி',
    tableScrollHint: 'எல்லா நெடுவரிசைகளையும் காண பக்கவாட்டில் நகர்த்தவும்.',
  },
};

/** Each language is written in its own script and marked with lang, so it is read correctly. */
export const LANGUAGE_NAMES: Record<UiLang, string> = { en: 'English', ta: 'தமிழ்' };

/** The language the primitives speak. The app shell (#11) provides it from the route. */
export const UiLangContext = createContext<UiLang>('en');

export function useUiStrings(): UiStrings {
  return UI_STRINGS[useContext(UiLangContext)];
}
