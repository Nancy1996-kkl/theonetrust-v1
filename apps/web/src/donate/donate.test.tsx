import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DonationIntentResponse } from '@theonetrust/contracts';
import { routes } from '../app/routes.tsx';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { DRAFT_STORAGE_KEY, initialDraft, saveDraft } from '../state/donation-draft.ts';
import { PENDING_KEY } from './DonatePanel.tsx';
import {
  DonateClientContext,
  createApiDonateClient,
  createMockDonateClient,
  newIdempotencyKey,
  selectDonateClient,
  unavailableDonateClient,
  type DonateClient,
} from './donate-client.ts';
import { DONATE_MESSAGES } from './donate-messages.ts';

const t = DONATE_MESSAGES.en;
const INTENT: DonationIntentResponse = {
  publicReference: 'TOT-D-ABCDEFGHJKMN',
  giftPaise: 100_000,
  feePaise: 0,
  amountPaise: 100_000,
  currency: 'INR',
  checkout: {
    provider: 'CASHFREE',
    paymentSessionId: 'session_ABC',
    mode: 'sandbox',
    orderId: 'TOT-D-ABCDEFGHJKMN',
  },
};

const BANK_INTENT = {
  publicReference: 'TOT-D-BANKBANKBANK',
  giftPaise: 100_000,
  feePaise: 0 as const,
  amountPaise: 100_000,
  currency: 'INR' as const,
  bankTransfer: {
    accountName: 'Synthetic Trust',
    accountNumber: '000011112222',
    ifsc: 'SBIN0000000',
    bankName: 'Synthetic Bank',
  },
};

function client(overrides: Partial<DonateClient> = {}): DonateClient {
  return {
    acceptsDonations: true,
    estimate: vi.fn(async () => ({
      minPaise: 100,
      maxPaise: 500_000,
      receiptMinPaise: 50_000,
      feeCoverOffered: false,
      bankTransferOffered: true,
    })),
    start: vi.fn(async () => ({ ok: true as const, intent: INTENT })),
    startBankTransfer: vi.fn(async () => ({ ok: true as const, intent: BANK_INTENT })),
    claimBankTransfer: vi.fn(async () => true),
    checkout: vi.fn(async () => ({ kind: 'returned' as const })),
    verify: vi.fn(async () => 'PAID' as const),
    status: vi.fn(async () => 'PAID' as const),
    receipt: vi.fn(async () => null),
    ...overrides,
  };
}

function renderAt(path: string, donate: DonateClient) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <DonateClientContext.Provider value={donate}>
      <RouterProvider router={router} />
    </DonateClientContext.Provider>,
  );
  return router;
}

afterEach(() => {
  sessionStorage.clear();
});

async function toReview(user: ReturnType<typeof userEvent.setup>, opts: { email?: boolean } = {}) {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.click(within(dialog).getByRole('radio', { name: '₹1,000' }));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.type(
    within(dialog).getByRole('textbox', { name: new RegExp(t.fullName) }),
    'Synthetic Donor',
  );
  if (opts.email)
    await user.type(within(dialog).getByRole('textbox', { name: t.email }), 'donor@example.org');
  else await user.type(within(dialog).getByRole('textbox', { name: t.mobile }), '98765 43210');
  await user.click(within(dialog).getByLabelText(t.consent));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  return dialog;
}

describe('donate messages', () => {
  it('have every key in Tamil and English', () => {
    expect(Object.keys(DONATE_MESSAGES.ta).sort()).toEqual(Object.keys(DONATE_MESSAGES.en).sort());
    for (const lang of ['en', 'ta'] as const) {
      for (const value of Object.values(DONATE_MESSAGES[lang])) expect(value.trim()).not.toBe('');
    }
  });
});

describe('donate panel', () => {
  it('opens as a centred pop-up (client, Nov 2026)', async () => {
    renderAt('/#donate', client());
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveClass('ui-dialog--modal');
    expect(dialog).not.toHaveClass('ui-dialog--panel');
    // The terms line is at the bottom of the pop-up from the first step.
    const terms = within(dialog).getByRole('link', { name: 'Terms of use' });
    expect(terms.closest('.ui-dialog__footer')).not.toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Privacy policy' })).toBeVisible();
    expect(
      within(dialog).getByRole('link', { name: /Refund, cancellation and correction policy/ }),
    ).toBeVisible();
  });

  it('walks need → amount → details → pay and shows success only after the server says PAID', async () => {
    const user = userEvent.setup();
    const donate = client();
    renderAt('/#donate', donate);
    const dialog = await toReview(user);
    expect(within(dialog).getByText('₹1,000', { selector: 'strong' })).toBeVisible();
    await expectNoA11yViolations(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.thanks })).toBeVisible();
    expect(dialog).toHaveTextContent('TOT-D-ABCDEFGHJKMN');
    expect(donate.start).toHaveBeenCalledWith(
      expect.objectContaining({
        giftPaise: 100_000,
        currency: 'INR',
        programme: 'general',
        donorName: 'Synthetic Donor',
        donorPhone: '+919876543210',
        donorEmail: null,
        hideNamePublicly: true,
        coverFee: false,
        consent: true,
        locale: 'en',
      }),
      expect.stringMatching(/^[0-9a-f]{32}$/),
    );
    // Only the reference goes back: the server re-fetches the order from the gateway.
    expect(donate.verify).toHaveBeenCalledWith(INTENT.publicReference);
    expect(donate.checkout).toHaveBeenCalledWith(INTENT);
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    // No acknowledgement issued (declined / below the threshold): no link.
    expect(within(dialog).queryByRole('link', { name: t.viewReceipt })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: t.backToPage }));
  });

  it('after PAID, links to the acknowledgement when the server issued one (#29)', async () => {
    const user = userEvent.setup();
    const token = 'T'.repeat(43);
    const receipt = vi.fn(async () => token);
    renderAt('/#donate', client({ receipt }));
    const dialog = await toReview(user);
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    const link = await within(dialog).findByRole('link', { name: t.viewReceipt });
    expect(link).toHaveAttribute('href', `/receipt/${token}`);
    expect(receipt).toHaveBeenCalledWith(INTENT.publicReference);
  });

  it('never asks for an acknowledgement before the server says PAID', async () => {
    const user = userEvent.setup();
    const receipt = vi.fn(async () => 'T'.repeat(43));
    renderAt(
      '/#donate',
      client({
        verify: vi.fn(async () => 'UNKNOWN' as const),
        status: vi.fn(async () => 'PENDING' as const),
        receipt,
      }),
    );
    const dialog = await toReview(user);
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.pending })).toBeVisible();
    expect(receipt).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('link', { name: t.viewReceipt })).toBeNull();
  });

  it('never shows success when verification is not PAID (pending → check again)', async () => {
    const user = userEvent.setup();
    const status = vi.fn().mockResolvedValueOnce('UNKNOWN').mockResolvedValueOnce('PAID');
    renderAt('/#donate', client({ verify: vi.fn(async () => 'UNKNOWN' as const), status }));
    const dialog = await toReview(user);
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.pending })).toBeVisible();
    expect(within(dialog).queryByRole('heading', { name: t.thanks })).toBeNull();
    expect(sessionStorage.getItem(PENDING_KEY)).toBe(INTENT.publicReference);
    await user.click(within(dialog).getByRole('button', { name: t.checkAgain }));
    expect(await within(dialog).findByRole('heading', { name: t.pending })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t.checkAgain }));
    expect(await within(dialog).findByRole('heading', { name: t.thanks })).toBeVisible();
  });

  it('a failed verification shows failed and try again returns to review', async () => {
    const user = userEvent.setup();
    renderAt('/#donate', client({ verify: vi.fn(async () => 'FAILED' as const) }));
    const dialog = await toReview(user);
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.failed })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t.tryAgain }));
    expect(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' })).toBeVisible();
  });

  it('closing the window without paying keeps choices and reuses the same order (one key)', async () => {
    const user = userEvent.setup();
    const verify = vi
      .fn()
      .mockResolvedValueOnce('PENDING' as const)
      .mockResolvedValueOnce('PAID' as const);
    const donate = client({ verify, status: vi.fn(async () => 'PENDING' as const) });
    renderAt('/#donate', donate);
    const dialog = await toReview(user);
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.pending })).toBeVisible();
    expect(dialog).toHaveTextContent(t.noDoubleCharge);
    await user.click(within(dialog).getByRole('button', { name: t.payAgainSameOrder }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.thanks })).toBeVisible();
    expect(donate.start).toHaveBeenCalledTimes(1);
    expect(donate.checkout).toHaveBeenCalledTimes(2);
  });

  it('a payment window that cannot open shows failed; trying again starts a new order', async () => {
    const user = userEvent.setup();
    const checkout = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockResolvedValueOnce({ kind: 'returned' });
    const donate = client({ checkout });
    renderAt('/#donate', donate);
    const dialog = await toReview(user);
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.failed })).toBeVisible();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: t.tryAgain }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.thanks })).toBeVisible();
    expect(donate.start).toHaveBeenCalledTimes(2);
    expect(vi.mocked(donate.start).mock.calls[0]?.[1]).not.toBe(
      vi.mocked(donate.start).mock.calls[1]?.[1],
    );
  });

  it.each([
    ['invalid', t.invalidTitle],
    ['rate_limited', t.waitTitle],
    ['network', t.netTitle],
  ] as const)(
    'a start failure (%s) explains and lets the donor try again',
    async (reason, title) => {
      const user = userEvent.setup();
      renderAt('/#donate', client({ start: vi.fn(async () => ({ ok: false as const, reason })) }));
      const dialog = await toReview(user);
      await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
      expect(await within(dialog).findByRole('heading', { name: title })).toBeVisible();
      await user.click(within(dialog).getByRole('button', { name: t.tryAgain }));
    },
  );

  it('validates the details step', async () => {
    const user = userEvent.setup();
    renderAt('/#donate', client());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    expect(within(dialog).getByRole('heading', { name: t.howMuch })).toBeVisible(); // no amount yet
    await user.click(within(dialog).getByRole('radio', { name: '₹1,000' }));
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    expect(within(dialog).getByText(t.nameError)).toBeVisible();
    expect(within(dialog).getByText(t.contactError)).toBeVisible();
    expect(within(dialog).getByText(t.consentError)).toBeVisible();
    await user.type(within(dialog).getByRole('textbox', { name: t.mobile }), '123');
    await user.type(within(dialog).getByRole('textbox', { name: t.email }), 'nope');
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    expect(within(dialog).getByText(t.mobileError)).toBeVisible();
    expect(within(dialog).getByText(t.emailError)).toBeVisible();
    // ₹1,000 meets the ₹500 receipt threshold: the acknowledgement option appears.
    expect(within(dialog).getByLabelText(t.ackOpt)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: t.back }));
    expect(within(dialog).getByRole('heading', { name: t.howMuch })).toBeVisible();
  });

  it('offers the fee cover only when the server does, and shows it in the summary', async () => {
    const user = userEvent.setup();
    const donate = client({
      estimate: vi.fn(async (gift?: number) => ({
        minPaise: 100,
        maxPaise: 500_000,
        receiptMinPaise: 50_000,
        feeCoverOffered: true,
        bankTransferOffered: false,
        ...(gift ? { feePaise: 2_418, amountPaise: gift + 2_418 } : {}),
      })),
      start: vi.fn(async () => ({
        ok: true as const,
        intent: { ...INTENT, feePaise: 2_418, amountPaise: 102_418 },
      })),
    });
    renderAt('/#donate', donate);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('radio', { name: '₹1,000' }));
    await user.click(await within(dialog).findByLabelText(/Add ₹24.18 to cover the payment fee/));
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(t.fullName) }), 'A');
    await user.type(within(dialog).getByRole('textbox', { name: t.email }), 'a@b.co');
    await user.click(within(dialog).getByLabelText(t.consent));
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    expect(within(dialog).getByText(t.sumFee)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,024.18 securely' }));
    expect(donate.start).toHaveBeenCalledWith(
      expect.objectContaining({ coverFee: true, donorEmail: 'a@b.co' }),
      expect.any(String),
    );
    await within(dialog).findByRole('heading', { name: t.thanks });
  });

  it('refuses an amount above the maximum', async () => {
    const user = userEvent.setup();
    renderAt('/?amount=9000#donate', client());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await waitFor(() =>
      expect(within(dialog).getByRole('heading', { name: t.howMuch })).toBeVisible(),
    );
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await waitFor(() =>
      expect(within(dialog).getByText(/please pay by bank transfer/)).toBeVisible(),
    );
  });

  it('re-checks a payment still pending in this tab when the panel opens', async () => {
    sessionStorage.setItem(PENDING_KEY, 'TOT-D-ZZZZZZZZZZZZ');
    const donate = client({ status: vi.fn(async () => 'PAID' as const) });
    renderAt('/#donate', donate);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: t.thanks })).toBeVisible();
    expect(donate.status).toHaveBeenCalledWith('TOT-D-ZZZZZZZZZZZZ');
  });

  it('says online donations are not open yet when payments are off', async () => {
    renderAt('/ta/#donate', unavailableDonateClient);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: DONATE_MESSAGES.ta.closedTitle }),
    ).toBeVisible();
  });
});

describe('donation draft storage', () => {
  it('restores programme and amount, URL wins, invalid data ignored', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveDraft(
      { programme: 'education', amountPaise: 200_000 as never, frequency: 'once' },
      storage,
    );
    expect(initialDraft('', storage)).toMatchObject({
      programme: 'education',
      amountPaise: 200_000,
    });
    expect(initialDraft('?amount=500', storage)).toMatchObject({
      programme: null,
      amountPaise: 50_000,
    });
    store.set(DRAFT_STORAGE_KEY, '{bad');
    expect(initialDraft('', storage)).toMatchObject({ programme: null, amountPaise: null });
    store.set(DRAFT_STORAGE_KEY, JSON.stringify({ programme: '<script>', amountPaise: 1.5 }));
    expect(initialDraft('', storage)).toMatchObject({ programme: null, amountPaise: null });
    expect(initialDraft('', undefined)).toMatchObject({ amountPaise: null });
    expect(() =>
      saveDraft(
        { programme: null, amountPaise: null, frequency: 'once' },
        {
          setItem: () => {
            throw new Error('blocked');
          },
        },
      ),
    ).not.toThrow();
  });
});

describe('createApiDonateClient', () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const REQ = {
    giftPaise: 100_000,
    currency: 'INR' as const,
    programme: null,
    donorName: 'A',
    hideNamePublicly: true,
    wantsReceipt: false,
    coverFee: false,
    consent: true as const,
    locale: 'en' as const,
  };

  it('estimate, start (with idempotency key), verify and status', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes('estimate'))
        return ok({ minPaise: 100, maxPaise: 1, receiptMinPaise: 1, feeCoverOffered: false });
      if (u.endsWith('/donation-intents')) return ok(INTENT, 201);
      if (u.includes('verify')) return ok({ status: 'PAID' });
      return ok({ status: 'PENDING' });
    });
    const api = createApiDonateClient('http://localhost:4000/api/v1', fetchImpl);
    expect(await api.estimate(100)).toMatchObject({ minPaise: 100 });
    expect(await api.start(REQ, 'k'.repeat(32))).toEqual({ ok: true, intent: INTENT });
    expect(await api.verify(INTENT.publicReference)).toBe('PAID');
    expect(await api.status('TOT-D-X')).toBe('PENDING');
    const calls = fetchImpl.mock.calls.map((c) => [String(c[0]), c[1]?.method ?? 'GET']);
    expect(calls).toEqual([
      ['http://localhost:4000/api/v1/donation-intents/estimate?giftPaise=100', 'GET'],
      ['http://localhost:4000/api/v1/donation-intents', 'POST'],
      ['http://localhost:4000/api/v1/payments/verify', 'POST'],
      ['http://localhost:4000/api/v1/donations/status/TOT-D-X', 'GET'],
    ]);
    expect(
      (fetchImpl.mock.calls[1]![1]?.headers as Record<string, string>)['idempotency-key'],
    ).toBe('k'.repeat(32));
    // The browser sends only the reference: nothing it says can mark a donation paid.
    expect(JSON.parse(String(fetchImpl.mock.calls[2]![1]?.body))).toEqual({
      publicReference: INTENT.publicReference,
    });
  });

  it('accepts only a well-formed Cashfree descriptor; a retired Razorpay one is refused', async () => {
    const start = (checkout: unknown) =>
      createApiDonateClient(
        '',
        vi.fn(async () => ok({ ...INTENT, checkout }, 201)),
      ).start(REQ, 'k'.repeat(32));
    expect(await start({ provider: 'RAZORPAY', keyId: 'rzp_test_x', orderId: 'order_1' })).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(await start({ provider: 'STRIPE', orderId: 'order_1' })).toEqual({
      ok: false,
      reason: 'network',
    });
    const cashfree = {
      provider: 'CASHFREE',
      paymentSessionId: 'session_abc',
      mode: 'sandbox',
      orderId: 'TOT-D-ABCDEFGHJKMN',
    };
    const started = await start(cashfree);
    expect(started).toMatchObject({ ok: true });
    // Cashfree's script fails to load: the donor sees "failed" (nothing was paid).
    const loadCf = vi.fn(async () => Promise.reject(new Error('blocked')));
    const api = createApiDonateClient('', vi.fn(), loadCf);
    expect(await api.checkout({ ...INTENT, checkout: cashfree } as DonationIntentResponse)).toEqual(
      { kind: 'failed' },
    );
    expect(loadCf).toHaveBeenCalledOnce();
    // A malformed descriptor is never opened at all.
    const never = vi.fn();
    expect(
      await createApiDonateClient('', vi.fn(), never).checkout({
        ...INTENT,
        checkout: { provider: 'RAZORPAY' },
      } as unknown as DonationIntentResponse),
    ).toEqual({ kind: 'failed' });
    expect(never).not.toHaveBeenCalled();
  });

  it('receipt(): the token only for a PAID donation that has one; null otherwise', async () => {
    const token = 'T'.repeat(43);
    const reply = (body: unknown, status = 200) =>
      createApiDonateClient(
        '',
        vi.fn(async () => ok(body, status)),
      ).receipt('TOT-D-X');
    expect(await reply({ status: 'PAID', receiptToken: token })).toBe(token);
    expect(await reply({ status: 'PAID' })).toBeNull();
    expect(await reply({ status: 'PENDING', receiptToken: token })).toBeNull();
    expect(await reply({}, 404)).toBeNull();
    expect(
      await createApiDonateClient(
        '',
        vi.fn(async () => Promise.reject(new TypeError('x'))),
      ).receipt('r'),
    ).toBeNull();
  });

  it.each([
    [400, 'invalid'],
    [409, 'invalid'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
    [500, 'network'],
  ] as const)('start maps HTTP %i to %s', async (status, reason) => {
    const api = createApiDonateClient(
      '',
      vi.fn(async () => ok({}, status)),
    );
    expect(await api.start(REQ, 'k')).toEqual({ ok: false, reason });
  });

  it('never trusts a malformed or mismatched order, and survives network failures', async () => {
    expect(
      await createApiDonateClient(
        '',
        vi.fn(async () => ok({ ...INTENT, amountPaise: 1 }, 201)),
      ).start(REQ, 'k'),
    ).toEqual({
      ok: false,
      reason: 'network',
    });
    const down = createApiDonateClient(
      '',
      vi.fn(async () => Promise.reject(new TypeError('x'))),
    );
    expect(await down.start(REQ, 'k')).toEqual({ ok: false, reason: 'network' });
    expect(await down.estimate()).toBeNull();
    expect(await down.verify(INTENT.publicReference)).toBe('UNKNOWN');
    expect(await down.status('r')).toBe('UNKNOWN');
    const odd = createApiDonateClient(
      '',
      vi.fn(async () => ok({ status: 'MAYBE' })),
    );
    expect(await odd.verify(INTENT.publicReference)).toBe('UNKNOWN');
    const notFound = createApiDonateClient(
      '',
      vi.fn(async () => ok({}, 404)),
    );
    expect(await notFound.verify(INTENT.publicReference)).toBe('UNKNOWN');
    expect(await notFound.status('r')).toBe('UNKNOWN');
    expect(await notFound.estimate()).toBeNull();
  });
});

describe('helpers and adapters', () => {
  it('idempotency keys are random hex', () => {
    expect(newIdempotencyKey()).toMatch(/^[0-9a-f]{32}$/);
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it('selects the adapter from VITE_DONATE_ADAPTER', () => {
    expect(selectDonateClient({ VITE_DONATE_ADAPTER: 'api' }).acceptsDonations).toBe(true);
    expect(selectDonateClient({ VITE_DONATE_ADAPTER: 'mock' }).acceptsDonations).toBe(true);
    expect(selectDonateClient({ DEV: true }).acceptsDonations).toBe(true);
    expect(selectDonateClient({ VITE_DONATE_ADAPTER: 'unavailable' })).toBe(
      unavailableDonateClient,
    );
  });

  it('the mock covers every scenario', async () => {
    const mock = createMockDonateClient(0);
    const g = globalThis as { __donateMock?: string };
    for (const [scenario, kind] of [
      ['success', 'returned'],
      ['fail', 'returned'],
      ['redirect', 'redirecting'],
      ['cashfree-redirect', 'redirecting'],
      ['window-fail', 'failed'],
    ] as const) {
      g.__donateMock = scenario;
      expect((await mock.checkout(INTENT)).kind).toBe(kind);
    }
    g.__donateMock = 'fail';
    expect(await mock.verify('r')).toBe('FAILED');
    expect(await mock.status('r')).toBe('FAILED');
    g.__donateMock = 'cashfree-pending';
    expect(await mock.verify('r')).toBe('PENDING');
    expect(await mock.status('r')).toBe('PAID');
    g.__donateMock = 'start-fail';
    expect((await mock.start({} as never, 'k')).ok).toBe(false);
    g.__donateMock = 'stuck';
    expect(await mock.verify('r')).toBe('PENDING');
    expect(await mock.status('r')).toBe('PENDING');
    delete g.__donateMock;
    expect((await mock.start({ giftPaise: 500 } as never, 'k')).ok).toBe(true);
    expect(await mock.status('r')).toBe('PAID');
    expect(await mock.receipt('r')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    g.__donateMock = 'no-receipt';
    expect(await mock.receipt('r')).toBeNull();
    delete g.__donateMock;
    expect(await unavailableDonateClient.receipt('r')).toBeNull();
    expect(await mock.estimate()).toMatchObject({ feeCoverOffered: false, phoneRequired: true });
    expect(await unavailableDonateClient.checkout(INTENT)).toEqual({ kind: 'failed' });
    expect(await unavailableDonateClient.estimate()).toBeNull();
    expect(await unavailableDonateClient.verify('r')).toBe('UNKNOWN');
    expect(await unavailableDonateClient.status('r')).toBe('UNKNOWN');
    expect(await unavailableDonateClient.start({} as never, 'k')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});
