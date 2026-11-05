import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../config/env.ts';
import {
  EmailSendError,
  brevoProvider,
  parseSender,
  resendProvider,
  selectEmailProvider,
} from './provider.ts';
import {
  EMAIL_STRINGS,
  escapeHtml,
  renderDonorDonationPaid,
  renderOwnerDonationPaid,
  renderOwnerHelpRequest,
  type DonationPaidContext,
} from './templates.ts';
import { startOutboxWorker } from './schedule.ts';
import { BACKOFF_MS, MAX_ATTEMPTS, backoffFor } from './worker.ts';

const MESSAGE = {
  to: 'owner@example.org',
  subject: 'Subject',
  text: 'Text',
  html: '<p>Text</p>',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('email providers', () => {
  it('Resend: bearer key, idempotency key, from/to/subject/text/html', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => json({ id: 'msg_1' }));
    const p = resendProvider({
      apiKey: 're_test_0123456789abcdef',
      from: 'Theonetrust.in <no-reply@example.org>',
      fetch: fetchImpl,
    });
    expect(await p.send(MESSAGE)).toEqual({ id: 'msg_1' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer re_test_0123456789abcdef',
      'idempotency-key': MESSAGE.idempotencyKey,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'Theonetrust.in <no-reply@example.org>',
      to: ['owner@example.org'],
      subject: 'Subject',
      text: 'Text',
      html: '<p>Text</p>',
    });
  });

  it('Brevo: api-key header, sender split into name and email', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      json({ messageId: '<m@b>' }),
    );
    const p = brevoProvider({
      apiKey: 'xkeysib-0123456789abcdef',
      from: 'Theonetrust.in <no-reply@example.org>',
      fetch: fetchImpl,
    });
    expect(await p.send(MESSAGE)).toEqual({ id: '<m@b>' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({ 'api-key': 'xkeysib-0123456789abcdef' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      sender: { name: 'Theonetrust.in', email: 'no-reply@example.org' },
      to: [{ email: 'owner@example.org' }],
      textContent: 'Text',
      htmlContent: '<p>Text</p>',
    });
    const bare = brevoProvider({
      apiKey: 'k'.repeat(16),
      from: 'a@example.org',
      fetch: async () => json({}),
    });
    expect(await bare.send(MESSAGE)).toEqual({ id: null });
  });

  it.each([
    [429, false],
    [500, false],
    [503, false],
    [400, true],
    [401, true],
    [422, true],
  ])('HTTP %i → retry? %s', async (status, permanent) => {
    const p = resendProvider({
      apiKey: 'k'.repeat(16),
      from: 'a@example.org',
      fetch: async () => json({ message: 'secret detail' }, status),
    });
    const error = await p.send(MESSAGE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ code: `http_${status}`, permanent });
    expect(String((error as Error).message)).not.toContain('secret detail');
  });

  it('a network failure or timeout is retryable; an odd success body is tolerated', async () => {
    const down = resendProvider({
      apiKey: 'k'.repeat(16),
      from: 'a@example.org',
      fetch: async () => Promise.reject(new TypeError('fetch failed')),
    });
    expect(await down.send(MESSAGE).catch((e: unknown) => e)).toMatchObject({
      code: 'network',
      permanent: false,
    });
    const odd = resendProvider({
      apiKey: 'k'.repeat(16),
      from: 'a@example.org',
      fetch: async () => new Response('not json', { status: 200 }),
    });
    expect(await odd.send(MESSAGE)).toEqual({ id: null });
  });

  it('parses senders and selects the provider from the environment', () => {
    expect(parseSender('Trust <a@example.org>')).toEqual({ name: 'Trust', email: 'a@example.org' });
    expect(parseSender('a@example.org')).toEqual({ name: null, email: 'a@example.org' });
    expect(selectEmailProvider({ EMAIL_PROVIDER: 'none' })).toBeUndefined();
    expect(
      selectEmailProvider({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'a@example.org' }),
    ).toBeUndefined();
    const key = 'k'.repeat(16);
    expect(
      selectEmailProvider({
        EMAIL_PROVIDER: 'resend',
        EMAIL_API_KEY: key,
        EMAIL_FROM: 'a@example.org',
      })?.name,
    ).toBe('resend');
    expect(
      selectEmailProvider({
        EMAIL_PROVIDER: 'brevo',
        EMAIL_API_KEY: key,
        EMAIL_FROM: 'a@example.org',
      })?.name,
    ).toBe('brevo');
  });
});

describe('env', () => {
  it('defaults to no provider; a provider needs a key and a sender', () => {
    const env = loadEnv({});
    expect(env.EMAIL_PROVIDER).toBe('none');
    expect(loadEnv({ EMAIL_PROVIDER: '' }).EMAIL_PROVIDER).toBe('none');
    expect(env.EMAIL_WORKER_INTERVAL_MS).toBe(30_000);
    expect(() => loadEnv({ EMAIL_PROVIDER: 'resend' })).toThrow(
      expect.objectContaining({ invalidKeys: ['EMAIL_API_KEY', 'EMAIL_FROM'] }),
    );
    expect(() => loadEnv({ EMAIL_PROVIDER: 'smtp' })).toThrow();
    expect(() =>
      loadEnv({
        EMAIL_PROVIDER: 'brevo',
        EMAIL_API_KEY: 'k'.repeat(16),
        EMAIL_FROM: 'not an address',
      }),
    ).toThrow(expect.objectContaining({ invalidKeys: ['EMAIL_FROM'] }));
    expect(
      loadEnv({
        EMAIL_PROVIDER: 'brevo',
        EMAIL_API_KEY: 'k'.repeat(16),
        EMAIL_FROM: 'Trust <a@example.org>',
      }).EMAIL_FROM,
    ).toBe('Trust <a@example.org>');
  });

  it('never echoes the API key in the error', () => {
    expect(() =>
      loadEnv({
        EMAIL_PROVIDER: 'resend',
        EMAIL_API_KEY: 'short-key-xyz',
        EMAIL_FROM: 'a@example.org',
      }),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining('short-key-xyz') }));
  });
});

const CTX: DonationPaidContext = {
  reference: 'TOT-D-ABCDEFGHJKMN',
  amountPaise: 150_000,
  programme: null,
  method: 'upi',
  paymentReference: 'pay_TEST000001',
  receiptNumber: 'TOT-R-2026-27-000001',
  receiptUrl: `https://theonetrust.example/receipt/${'T'.repeat(43)}`,
  donorName: 'Synthetic <Donor>',
  trustName: 'Theonetrust.in',
  dashboardUrl: 'https://theonetrust.example/admin',
};
const PII = /\b\d{12,19}\b|[A-Z]{5}\d{4}[A-Z]|\+91|@example\.org/;

describe('templates', () => {
  it('owner email: both languages, reference, amount, receipt link, payment reference', () => {
    const email = renderOwnerDonationPaid(CTX);
    expect(email.subject).toBe(
      'Donation received: ₹1,500 (TOT-D-ABCDEFGHJKMN) / நன்கொடை வந்தது: ₹1,500 (TOT-D-ABCDEFGHJKMN)',
    );
    for (const part of [
      EMAIL_STRINGS.en.ownerPaidLead,
      EMAIL_STRINGS.ta.ownerPaidLead,
      'pay_TEST000001',
      'TOT-R-2026-27-000001',
      CTX.receiptUrl!,
      'General fund',
      'பொது நிதி',
    ]) {
      expect(email.text).toContain(part);
    }
    expect(email.html).toContain('&lt;Donor&gt;'); // escaped
    expect(email.html).not.toContain('<Donor>');
    expect(`${email.text}${email.html}`).not.toMatch(PII);
    const noReceipt = renderOwnerDonationPaid({
      ...CTX,
      receiptNumber: null,
      receiptUrl: null,
      paymentReference: null,
      programme: { en: 'Food', ta: 'உணவு' },
      method: 'bank_transfer',
    });
    expect(noReceipt.text).toContain(EMAIL_STRINGS.en.noReceipt);
    expect(noReceipt.text).toContain('உணவு');
    expect(noReceipt.text).not.toContain('Payment reference');
  });

  it('donor email in the donor language, with the acknowledgement link and no tax claims', () => {
    for (const lang of ['en', 'ta'] as const) {
      const email = renderDonorDonationPaid(CTX, lang);
      expect(email.subject).toBe(
        lang === 'en'
          ? 'Thank you — your donation to Theonetrust.in was received'
          : 'நன்றி — Theonetrust.in-க்கு உங்கள் நன்கொடை வந்து சேர்ந்தது',
      );
      expect(email.text).toContain(CTX.receiptUrl);
      expect(email.html).toContain(`<a href="${CTX.receiptUrl}">`);
      expect(email.html).toContain(`lang="${lang}"`);
      expect(`${email.text}${email.html}`).not.toMatch(PII);
    }
    const without = renderDonorDonationPaid(
      { ...CTX, receiptUrl: null, receiptNumber: null },
      'en',
    );
    expect(without.text).not.toContain('acknowledgement (');
  });

  it('help request email: reference and type only — no details about the person', () => {
    const email = renderOwnerHelpRequest({
      reference: 'HLP-7K2M9Q',
      kind: 'CALLBACK',
      dashboardUrl: 'https://x.test/admin/help-requests/1',
    });
    expect(email.subject).toBe('New help request HLP-7K2M9Q / புதிய உதவிக் கோரிக்கை HLP-7K2M9Q');
    expect(email.text).toContain('Call-back request');
    expect(email.text).toContain('https://x.test/admin/help-requests/1');
    expect(
      renderOwnerHelpRequest({ reference: 'HLP-1', kind: 'FULL', dashboardUrl: 'u' }).text,
    ).toContain('Full request');
  });

  it('English and Tamil have the same strings; none names a tax form, GST or a benefit', () => {
    expect(Object.keys(EMAIL_STRINGS.ta).sort()).toEqual(Object.keys(EMAIL_STRINGS.en).sort());
    expect(JSON.stringify(EMAIL_STRINGS)).not.toMatch(
      /form\s*1\d\d|80G|GST|deduct|exempt|tax benefit/i,
    );
  });

  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('worker timing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('backs off 1 min → 5 min → 30 min → 2 h → 12 h, and gives up after 6 attempts', () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffFor)).toEqual([...BACKOFF_MS, BACKOFF_MS.at(-1)]);
    expect(backoffFor(0)).toBe(BACKOFF_MS[0]);
    expect(MAX_ATTEMPTS).toBe(6);
  });

  it('runs one pass at a time on its timer and stops cleanly', async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    const findMany = vi.fn(() => new Promise<never[]>((r) => (release = () => r([]))));
    const log = { error: vi.fn() };
    const stop = startOutboxWorker(
      {
        db: { notificationOutbox: { findMany } } as never,
        provider: { name: 'resend', send: vi.fn() },
        siteUrl: 'https://x.test',
        now: () => new Date(),
      },
      1_000,
      log,
    );
    await vi.advanceTimersByTimeAsync(3_000);
    expect(findMany).toHaveBeenCalledTimes(1); // still running: no overlap
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(findMany).toHaveBeenCalledTimes(2);
    findMany.mockImplementationOnce(() => Promise.reject(new Error('db down')));
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log.error).toHaveBeenCalledWith(expect.any(Object), 'Notification worker pass failed');
    stop();
    const calls = findMany.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(findMany.mock.calls.length).toBe(calls);
  });
});
