import { describe, expect, it } from 'vitest';
import {
  HELP_DESCRIPTION_MAX,
  HELP_PERSON_MAX,
  HELP_REFERENCE_PATTERN,
  normalizeIndianMobile,
  validateHelpRequest,
  type CallbackRequest,
  type HelpWizardRequest,
} from './index.ts';

describe('normalizeIndianMobile', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['00919876543210', '+919876543210'],
    ['(987) 654-3210', '+919876543210'],
    ['6000000000', '+916000000000'],
  ])('%s → %s', (raw, e164) => {
    expect(normalizeIndianMobile(raw)).toBe(e164);
  });

  it.each([
    '',
    '12345',
    '5876543210', // must start with 6–9
    '98765432101', // 11 digits
    '+1 9876543210',
    '98765abcde',
    '९८७६५४३२१०', // Devanagari digits
    '+91 +98765 43210',
  ])('rejects %j', (raw) => {
    expect(normalizeIndianMobile(raw)).toBeNull();
  });
});

const wizard: HelpWizardRequest = {
  mode: 'wizard',
  helpFor: 'self',
  kinds: ['education'],
  description: '',
  phone: '9876543210',
  personNameOrVillage: '',
  callLanguage: 'ta',
  bestTime: 'anytime',
  consentContact: true,
  consentThirdParty: false,
  pageLanguage: 'ta',
  website: '',
};

const callback: CallbackRequest = {
  mode: 'callback',
  phone: '9876543210',
  consentContact: true,
  pageLanguage: 'en',
  website: '',
};

describe('validateHelpRequest', () => {
  it('accepts a minimal valid wizard request and callback', () => {
    expect(validateHelpRequest(wizard)).toEqual([]);
    expect(validateHelpRequest(callback)).toEqual([]);
  });

  it('accepts a third-party request with consent and an optional village', () => {
    expect(
      validateHelpRequest({
        ...wizard,
        helpFor: 'on_behalf',
        personNameOrVillage: 'Walajabad',
        consentThirdParty: true,
      }),
    ).toEqual([]);
  });

  it.each<[string, Partial<HelpWizardRequest>, string]>([
    ['bad phone', { phone: '123' }, 'phone'],
    ['no kinds', { kinds: [] }, 'kinds'],
    ['unknown kind', { kinds: ['aadhaar' as never] }, 'kinds'],
    ['duplicate kinds', { kinds: ['food', 'food'] }, 'kinds'],
    ['unknown helpFor', { helpFor: 'x' as never }, 'helpFor'],
    ['long description', { description: 'x'.repeat(HELP_DESCRIPTION_MAX + 1) }, 'description'],
    [
      'long name',
      {
        helpFor: 'someone',
        consentThirdParty: true,
        personNameOrVillage: 'x'.repeat(HELP_PERSON_MAX + 1),
      },
      'personNameOrVillage',
    ],
    ['name when asking for self', { personNameOrVillage: 'Me' }, 'personNameOrVillage'],
    ['third party without consent', { helpFor: 'someone' }, 'consentThirdParty'],
    ['honeypot filled', { website: 'http://spam' }, 'website'],
    ['no contact consent', { consentContact: false as never }, 'consentContact'],
  ])('rejects %s', (_name, patch, field) => {
    expect(validateHelpRequest({ ...wizard, ...patch })).toContain(field);
  });

  it('description of exactly the maximum length is fine', () => {
    expect(
      validateHelpRequest({ ...wizard, description: 'x'.repeat(HELP_DESCRIPTION_MAX) }),
    ).toEqual([]);
  });

  it('callback checks only phone, consent and honeypot', () => {
    expect(validateHelpRequest({ ...callback, phone: '' })).toEqual(['phone']);
    expect(validateHelpRequest({ ...callback, website: 'x' })).toEqual(['website']);
  });

  it('has no field for sensitive documents', () => {
    const keys = Object.keys(wizard).join(' ');
    expect(keys).not.toMatch(/aadhaar|document|medical|income|photo|file|upload|pan\b/i);
  });
});

describe('reference format', () => {
  it.each(['HLP-7Q2K', 'HLP-ABCD1234'])('accepts %s', (ref) => {
    expect(HELP_REFERENCE_PATTERN.test(ref)).toBe(true);
  });
  it.each(['HLP-12', 'hlp-7q2k', 'HLP-IO01', 'DON-7Q2K', 'HLP-9876543210'])('rejects %s', (ref) => {
    expect(HELP_REFERENCE_PATTERN.test(ref)).toBe(false);
  });
});
