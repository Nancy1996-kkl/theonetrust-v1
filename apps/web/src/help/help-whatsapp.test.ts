import { describe, expect, it } from 'vitest';
import { HELP_KIND_LABELS, HELP_MESSAGES } from './help-messages.ts';
import {
  buildWhatsAppText,
  isTrustWhatsAppUrl,
  parseAge,
  whatsAppSendUrl,
  type WhatsAppHelpInput,
} from './help-whatsapp.ts';

const base: WhatsAppHelpInput = {
  helpFor: 'self',
  age: 34,
  kinds: ['education'],
  otherNeed: '',
  cert: 'have',
  contactWay: 'whatsapp',
  description: 'School fees',
  callLanguage: 'ta',
  bestTime: 'evening',
};

describe('parseAge', () => {
  it.each([
    ['1', 1],
    ['34', 34],
    [' 70 ', 70],
    ['120', 120],
  ])('accepts %j', (raw, age) => expect(parseAge(raw)).toBe(age));

  it.each(['', '0', '121', '999', '3.5', '-4', 'abc', '1e2', '1234'])('rejects %j', (raw) =>
    expect(parseAge(raw)).toBeNull(),
  );
});

describe('isTrustWhatsAppUrl', () => {
  it('accepts only https://wa.me/<8-15 digits>', () => {
    expect(isTrustWhatsAppUrl('https://wa.me/919600516999')).toBe(true);
    for (const bad of [
      null,
      '',
      'http://wa.me/919600516999',
      'https://wa.me/91960051699x',
      'https://wa.me/919600516999?text=x',
      'https://evil.example/wa.me/919600516999',
      'https://wa.me/1234567',
      'javascript:alert(1)',
    ]) {
      expect(isTrustWhatsAppUrl(bad), String(bad)).toBe(false);
    }
  });
});

describe('buildWhatsAppText', () => {
  it('lists who, age, need, certificate, details, language and time in English', () => {
    const text = buildWhatsAppText(base, 'en');
    const en = HELP_MESSAGES.en;
    expect(text.split('\n')[0]).toBe(`*${en.waHeader}*`);
    expect(text).toContain(`${en.waAge}: 34`);
    expect(text).toContain(`${en.waCert}: ${en.waCertHave}`);
    expect(text).toContain(`${en.waDetails}: School fees`);
    expect(text).toContain(`${en.waLanguage}: தமிழ்`);
  });

  it('fills {way} when the certificate is missing', () => {
    const en = HELP_MESSAGES.en;
    const phone = buildWhatsAppText({ ...base, cert: 'none', contactWay: 'phone' }, 'en');
    expect(phone).toContain(en.waCertNone.replace('{way}', en.contactWayPhone));
    expect(phone).not.toContain('{way}');
    const wa = buildWhatsAppText({ ...base, cert: 'none', contactWay: 'whatsapp' }, 'ta');
    expect(wa).toContain(HELP_MESSAGES.ta.contactWayWhatsapp);
    expect(wa).not.toContain('{way}');
  });

  it('has no certificate line unless education is chosen', () => {
    const text = buildWhatsAppText({ ...base, kinds: ['food'], cert: 'have' }, 'en');
    expect(text).not.toContain(HELP_MESSAGES.en.waCert);
  });

  it('writes the custom need for "other" and drops an empty description', () => {
    const text = buildWhatsAppText(
      { ...base, kinds: ['food', 'other'], otherNeed: '  Rent support ', description: '  ' },
      'en',
    );
    expect(text).toContain(
      `${HELP_KIND_LABELS.food.en}, ${HELP_KIND_LABELS.other.en}: Rent support`,
    );
    expect(text).not.toContain(HELP_MESSAGES.en.waDetails);
  });

  it('never carries a phone number, name or village', () => {
    const text = buildWhatsAppText({ ...base, helpFor: 'someone' }, 'ta');
    expect(text).not.toMatch(/\d{6,}/);
    expect(text).not.toMatch(/mobile|village|கிராம/i);
  });
});

describe('whatsAppSendUrl', () => {
  it('URL-encodes the text, including Tamil and new lines', () => {
    const url = whatsAppSendUrl('https://wa.me/919600516999', 'வணக்கம்\nA & B?');
    expect(url).toBe(`https://wa.me/919600516999?text=${encodeURIComponent('வணக்கம்\nA & B?')}`);
    expect(decodeURIComponent(url.split('?text=')[1]!)).toBe('வணக்கம்\nA & B?');
  });
});
