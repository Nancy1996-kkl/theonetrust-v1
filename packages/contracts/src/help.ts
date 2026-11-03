import type { Locale } from './api.ts';

/**
 * Get Help request DTOs (plan §5, issue #15 front end, #22 API). Shared so the web form and the
 * API validate the same way. Deliberately has NO field for documents, Aadhaar, medical records,
 * income proof or photos (plan §5 rules).
 */
export const HELP_FOR = ['self', 'someone', 'on_behalf'] as const;
export type HelpFor = (typeof HELP_FOR)[number];

export const HELP_KINDS = [
  'education',
  'food',
  'health',
  'emergency',
  'livelihood',
  'other',
  'unsure',
] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

export const CALL_TIMES = ['morning', 'afternoon', 'evening', 'anytime'] as const;
export type CallTime = (typeof CALL_TIMES)[number];

export const HELP_DESCRIPTION_MAX = 500;
export const HELP_PERSON_MAX = 80;

export interface HelpWizardRequest {
  mode: 'wizard';
  helpFor: HelpFor;
  kinds: HelpKind[];
  description: string;
  /** E.164, Indian mobile: +91 followed by 10 digits. */
  phone: string;
  /** Only when asking for someone else, and only if they are comfortable sharing it. */
  personNameOrVillage: string;
  callLanguage: Locale;
  bestTime: CallTime;
  consentContact: true;
  /** Required (true) when helpFor is not 'self'. */
  consentThirdParty: boolean;
  pageLanguage: Locale;
  /** Honeypot: must be empty. Bots fill every field. */
  website: string;
}

export interface CallbackRequest {
  mode: 'callback';
  phone: string;
  consentContact: true;
  pageLanguage: Locale;
  website: string;
}

export type HelpRequest = HelpWizardRequest | CallbackRequest;

export interface HelpRequestAccepted {
  /** Short reference the person can quote on the phone, e.g. HLP-7Q2K. Contains no personal data. */
  reference: string;
}

export const HELP_REFERENCE_PATTERN = /^HLP-[0-9A-HJ-NP-Z]{4,8}$/;

/**
 * Normalises an Indian mobile number typed in any common way ("98765 43210", "+91-98765-43210",
 * "09876543210") to E.164. Returns null unless it is 10 digits starting with 6–9.
 */
export function normalizeIndianMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  const national = digits.replace(/^(?:\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))/, '');
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}

export type HelpField =
  | 'helpFor'
  | 'kinds'
  | 'description'
  | 'phone'
  | 'personNameOrVillage'
  | 'consentContact'
  | 'consentThirdParty'
  | 'website';

/** Field-level problems; empty means valid. Same rules on the server (#22). */
export function validateHelpRequest(request: HelpRequest): HelpField[] {
  const problems: HelpField[] = [];
  if (normalizeIndianMobile(request.phone) === null) problems.push('phone');
  if (request.consentContact !== true) problems.push('consentContact');
  if (request.website !== '') problems.push('website');
  if (request.mode === 'callback') return problems;

  if (!HELP_FOR.includes(request.helpFor)) problems.push('helpFor');
  if (
    request.kinds.length === 0 ||
    request.kinds.some((k) => !HELP_KINDS.includes(k)) ||
    new Set(request.kinds).size !== request.kinds.length
  ) {
    problems.push('kinds');
  }
  if (request.description.length > HELP_DESCRIPTION_MAX) problems.push('description');
  if (request.personNameOrVillage.length > HELP_PERSON_MAX) problems.push('personNameOrVillage');
  if (request.helpFor === 'self' && request.personNameOrVillage !== '') {
    problems.push('personNameOrVillage');
  }
  if (request.helpFor !== 'self' && request.consentThirdParty !== true) {
    problems.push('consentThirdParty');
  }
  return problems;
}
