import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DonationIntentResponse } from '@theonetrust/contracts';
import { routes } from '../app/routes.tsx';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { PENDING_KEY } from './DonatePanel.tsx';
import {
  CASHFREE_SDK,
  DonateClientContext,
  createApiDonateClient,
  createMockDonateClient,
  loadCashfree,
  pollUntilSettled,
  type CashfreeFactory,
  type DonateClient,
  type VerifiedStatus,
} from './donate-client.ts';
import { DONATE_MESSAGES } from './donate-messages.ts';

const REF = 'TOT-D-ABCDEFGHJKMN';
const CASHFREE_INTENT: DonationIntentResponse = {
  publicReference: REF,
  giftPaise: 100_000,
  feePaise: 0,
  amountPaise: 100_000,
  currency: 'INR',
  checkout: {
    provider: 'CASHFREE',
    paymentSessionId: 'session_abc',
    mode: 'sandbox',
    orderId: REF,
  },
};

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
  delete (window as { Cashfree?: unknown }).Cashfree;
  document.head.querySelectorAll(`script[src="${CASHFREE_SDK}"]`).forEach((s) => s.remove());
});

describe('loadCashfree', () => {
  const factory: CashfreeFactory = () => ({ checkout: async () => ({}) });

  it('uses an already loaded SDK without adding a script', async () => {
    (window as { Cashfree?: CashfreeFactory }).Cashfree = factory;
    expect(await loadCashfree()).toBe(factory);
    expect(document.querySelector(`script[src="${CASHFREE_SDK}"]`)).toBeNull();
  });

  it('adds the script once; a second call waits for the same script', async () => {
    const first = loadCashfree();
    const second = loadCashfree();
    const scripts = document.querySelectorAll<HTMLScriptElement>(`script[src="${CASHFREE_SDK}"]`);
    expect(scripts).toHaveLength(1);
    (window as { Cashfree?: CashfreeFactory }).Cashfree = factory;
    scripts[0]?.dispatchEvent(new Event('load'));
    expect(await first).toBe(factory);
    expect(await second).toBe(factory);
  });

  it('rejects (and removes the script for a retry) when it fails to load or is missing', async () => {
    const failing = loadCashfree();
    document.querySelector(`script[src="${CASHFREE_SDK}"]`)?.dispatchEvent(new Event('error'));
    await expect(failing).rejects.toThrow('failed to load');
    expect(document.querySelector(`script[src="${CASHFREE_SDK}"]`)).toBeNull();
    const empty = loadCashfree();
    document.querySelector(`script[src="${CASHFREE_SDK}"]`)?.dispatchEvent(new Event('load'));
    await expect(empty).rejects.toThrow('missing');
  });

  it('times out when the script never answers', async () => {
    vi.useFakeTimers();
    const slow = loadCashfree(document, 1_000);
    vi.advanceTimersByTime(1_001);
    await expect(slow).rejects.toThrow('timed out');
  });
});

describe('API client with Cashfree', () => {
  const ok = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  function withCashfree(result: unknown | Error) {
    const calls: unknown[] = [];
    const factory: CashfreeFactory = (options) => {
      calls.push(options);
      return {
        checkout: async (opts) => {
          calls.push(opts);
          if (result instanceof Error) throw result;
          return result as never;
        },
      };
    };
    const api = createApiDonateClient('', vi.fn(), async () => factory);
    return { api, calls };
  }

  it.each([
    ['payment details', { paymentDetails: { paymentMessage: 'ok' } }, 'returned'],
    ['an error (closed or failed)', { error: { message: 'closed' } }, 'returned'],
    ['nothing at all', undefined, 'returned'],
    ['a thrown error', new Error('boom'), 'returned'],
    ['a redirect (pop-up could not open)', { redirect: true }, 'redirecting'],
  ])('%s → %s (Cashfree’s answer is never proof: the server decides)', async (_n, result, kind) => {
    const { api, calls } = withCashfree(result);
    expect(await api.checkout(CASHFREE_INTENT)).toEqual({ kind });
    // Only the one-time session goes to Cashfree: no name, phone or email.
    expect(calls).toEqual([
      { mode: 'sandbox' },
      { paymentSessionId: 'session_abc', redirectTarget: '_modal' },
    ]);
  });

  it('verify sends ONLY the public reference', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ publicReference: REF, status: 'PAID', amountPaise: 1 }),
    );
    const api = createApiDonateClient('https://api.example/api/v1', fetchImpl);
    expect(await api.verify(REF)).toBe('PAID');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example/api/v1/payments/verify');
    expect(JSON.parse(String(init.body))).toEqual({ publicReference: REF });
  });
});

describe('pollUntilSettled', () => {
  const sleep = vi.fn(async () => undefined);

  it('stops at once on PAID or FAILED', async () => {
    const check = vi.fn(async (): Promise<VerifiedStatus> => 'PENDING');
    expect(await pollUntilSettled(check, 'PAID', { sleep })).toBe('PAID');
    expect(await pollUntilSettled(check, 'FAILED', { sleep })).toBe('FAILED');
    expect(check).not.toHaveBeenCalled();
  });

  it('keeps asking until settled, then stops', async () => {
    const answers: VerifiedStatus[] = ['PENDING', 'UNKNOWN', 'PAID', 'PENDING'];
    const check = vi.fn(async () => answers.shift() ?? 'PENDING');
    expect(await pollUntilSettled(check, 'PENDING', { sleep, delays: [1, 1, 1, 1, 1] })).toBe(
      'PAID',
    );
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last delay with the last answer (shown as pending)', async () => {
    const check = vi.fn(async (): Promise<VerifiedStatus> => 'PENDING');
    expect(await pollUntilSettled(check, 'PENDING', { sleep, delays: [1, 2, 3] })).toBe('PENDING');
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('asks nothing while the tab is hidden', async () => {
    const check = vi.fn(async (): Promise<VerifiedStatus> => 'PAID');
    expect(
      await pollUntilSettled(check, 'PENDING', { sleep, delays: [1, 1], hidden: () => true }),
    ).toBe('PENDING');
    expect(check).not.toHaveBeenCalled();
  });

  it('the default delays add up to about 90 seconds', async () => {
    const waits: number[] = [];
    await pollUntilSettled(async () => 'PENDING', 'PENDING', {
      sleep: async (ms) => {
        waits.push(ms);
      },
      hidden: () => false,
    });
    const total = waits.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(85_000);
    expect(total).toBeLessThanOrEqual(95_000);
  });
});

const t = DONATE_MESSAGES.en;

function cashfreeClient(overrides: Partial<DonateClient> = {}): DonateClient {
  return {
    acceptsDonations: true,
    estimate: vi.fn(async () => ({
      minPaise: 100,
      maxPaise: 500_000,
      receiptMinPaise: 50_000,
      feeCoverOffered: false,
      bankTransferOffered: false,
      phoneRequired: true,
    })),
    start: vi.fn(async () => ({ ok: true as const, intent: CASHFREE_INTENT })),
    startBankTransfer: vi.fn(async () => ({ ok: false as const, reason: 'unavailable' as const })),
    claimBankTransfer: vi.fn(async () => false),
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

async function toDetails(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.click(within(dialog).getByRole('radio', { name: '₹1,000' }));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.type(
    within(dialog).getByRole('textbox', { name: new RegExp(t.fullName) }),
    'Synthetic Donor',
  );
  await user.click(within(dialog).getByLabelText(t.consent));
  return dialog;
}

describe('donate pop-up with Cashfree', () => {
  it('asks for the mobile number up front, says why, and refuses to go on without it', async () => {
    const user = userEvent.setup();
    renderAt('/#donate', cashfreeClient());
    const dialog = await toDetails(user);
    await user.type(within(dialog).getByRole('textbox', { name: t.email }), 'donor@example.org');
    const mobile = within(dialog).getByRole('textbox', { name: new RegExp(t.mobile) });
    expect(mobile).toBeRequired();
    expect(mobile).toHaveAccessibleDescription(expect.stringContaining(t.mobileHint));
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    expect(mobile).toHaveAccessibleDescription(expect.stringContaining(t.mobileError));
    expect(mobile).toHaveAttribute('aria-invalid', 'true');
    await expectNoA11yViolations(dialog);
  });

  it('no phoneRequired from the server (online giving off): the mobile stays optional, no hint', async () => {
    const user = userEvent.setup();
    renderAt(
      '/#donate',
      cashfreeClient({
        estimate: vi.fn(async () => ({
          minPaise: 100,
          maxPaise: 500_000,
          receiptMinPaise: 50_000,
          feeCoverOffered: false,
          bankTransferOffered: false,
        })),
      }),
    );
    const dialog = await toDetails(user);
    const mobile = within(dialog).getByRole('textbox', { name: t.mobile });
    expect(mobile).not.toBeRequired();
    expect(dialog).not.toHaveTextContent(t.mobileHint);
  });

  it('pays: window closes → server asked by reference → thanks only when PAID', async () => {
    const user = userEvent.setup();
    const donate = cashfreeClient();
    renderAt('/#donate', donate);
    const dialog = await toDetails(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: new RegExp(t.mobile) }),
      '9876543210',
    );
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.thanks })).toBeVisible();
    expect(donate.start).toHaveBeenCalledWith(
      expect.objectContaining({ donorPhone: '+919876543210', locale: 'en' }),
      expect.stringMatching(/^[0-9a-f]{32}$/),
    );
    expect(donate.verify).toHaveBeenCalledWith(REF);
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('the server says FAILED → failed screen, never thanks', async () => {
    const user = userEvent.setup();
    const donate = cashfreeClient({ verify: vi.fn(async () => 'FAILED' as const) });
    renderAt('/#donate', donate);
    const dialog = await toDetails(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: new RegExp(t.mobile) }),
      '9876543210',
    );
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.failed })).toBeVisible();
    expect(within(dialog).queryByRole('heading', { name: t.thanks })).toBeNull();
  });

  it('pop-up could not open → keeps the reference; never stuck: closable "pending" with Check again', async () => {
    const user = userEvent.setup();
    const donate = cashfreeClient({
      checkout: vi.fn(async () => ({ kind: 'redirecting' as const })),
    });
    renderAt('/#donate', donate);
    const dialog = await toDetails(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: new RegExp(t.mobile) }),
      '9876543210',
    );
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.pending })).toBeVisible();
    expect(sessionStorage.getItem(PENDING_KEY)).toBe(REF);
    expect(donate.verify).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: t.checkAgain })).toBeEnabled();
    // Closable: Escape closes the pop-up (it is locked only while "confirming").
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('not confirmed yet → closable "pending" at once, then thanks when the background check says PAID', async () => {
    const user = userEvent.setup();
    let answer: 'PENDING' | 'PAID' = 'PENDING';
    const donate = cashfreeClient({
      verify: vi.fn(async () => 'PENDING' as const),
      status: vi.fn(async () => answer),
    });
    renderAt('/#donate', donate);
    const dialog = await toDetails(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: new RegExp(t.mobile) }),
      '9876543210',
    );
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.pending })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: t.payAgainSameOrder })).toBeVisible();
    // No contradiction: "never charged twice" instead of "don't pay again" next to the button.
    expect(dialog).toHaveTextContent(t.noDoubleCharge);
    expect(dialog).not.toHaveTextContent(t.dontPayAgain);
    expect(dialog).toHaveTextContent(t.payAgainHint);
    answer = 'PAID';
    expect(
      await within(dialog).findByRole('heading', { name: t.thanks }, { timeout: 4_000 }),
    ).toBeVisible();
  });

  it('"Open it again" reopens the SAME order: one intent, never a second payment order', async () => {
    const user = userEvent.setup();
    const donate = cashfreeClient({
      verify: vi.fn(async () => 'PENDING' as const),
      status: vi.fn(async () => 'PENDING' as const),
    });
    renderAt('/#donate', donate);
    const dialog = await toDetails(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: new RegExp(t.mobile) }),
      '9876543210',
    );
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    await user.click(await within(dialog).findByRole('button', { name: t.payAgainSameOrder }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    await within(dialog).findByRole('heading', { name: t.pending });
    expect(donate.start).toHaveBeenCalledTimes(1);
    expect(donate.checkout).toHaveBeenCalledTimes(2);
    expect(vi.mocked(donate.checkout).mock.calls.map((c) => c[0])).toEqual([
      CASHFREE_INTENT,
      CASHFREE_INTENT,
    ]);
  });

  it('no "mobile or email" message when the mobile is required (no contradiction)', async () => {
    const user = userEvent.setup();
    renderAt('/#donate', cashfreeClient());
    const dialog = await toDetails(user);
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    expect(dialog).not.toHaveTextContent(t.contactError);
    expect(dialog).toHaveTextContent(t.mobileError);
  });

  it('Cashfree’s script blocked → failed and the reference is not kept', async () => {
    const user = userEvent.setup();
    const donate = cashfreeClient({
      checkout: vi.fn(async () => ({ kind: 'failed' as const, reason: 'other' as const })),
    });
    renderAt('/#donate', donate);
    const dialog = await toDetails(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: new RegExp(t.mobile) }),
      '9876543210',
    );
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    expect(await within(dialog).findByRole('heading', { name: t.failed })).toBeVisible();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe('return from Cashfree’s page (?cf_order=)', () => {
  it.each(['/', '/ta/'])(
    '%s?cf_order=<ref> started in this tab: opens the pop-up, checks, thanks; parameter removed',
    async (path) => {
      sessionStorage.setItem(PENDING_KEY, REF);
      const donate = cashfreeClient();
      const router = renderAt(`${path}?cf_order=${REF}&utm=x`, donate);
      const dialog = await screen.findByRole('dialog');
      expect(
        await within(dialog).findByRole('heading', {
          name: DONATE_MESSAGES[path === '/' ? 'en' : 'ta'].thanks,
        }),
      ).toBeVisible();
      expect(donate.status).toHaveBeenCalledWith(REF);
      expect(router.state.location.search).toBe('?utm=x');
      expect(router.state.location.hash).toBe('#donate');
      expect(router.state.location.pathname).toBe(path);
    },
  );

  it('a return link this tab did not start: neutral "confirmed", no amount, no receipt link', async () => {
    const donate = cashfreeClient({ receipt: vi.fn(async () => 'x'.repeat(43)) });
    renderAt(`/?cf_order=${REF}`, donate);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: t.confirmedTitle })).toBeVisible();
    expect(dialog).toHaveTextContent(t.confirmedText);
    expect(dialog).not.toHaveTextContent('₹0');
    expect(within(dialog).queryByRole('heading', { name: t.thanks })).toBeNull();
    expect(within(dialog).queryByRole('link', { name: t.viewReceipt })).toBeNull();
    expect(donate.receipt).not.toHaveBeenCalled();
  });

  it('storage blocked (in-app browser): the return link still checks — never a locked screen', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const donate = cashfreeClient();
      renderAt(`/?cf_order=${REF}`, donate);
      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByRole('heading', { name: t.confirmedTitle })).toBeVisible();
      expect(dialog).toHaveTextContent(t.confirmedHelp);
      expect(donate.status).toHaveBeenCalledWith(REF);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('never shows the first step while checking a return (starts on "confirming")', async () => {
    let release: (v: 'PAID') => void = () => undefined;
    const donate = cashfreeClient({
      status: vi.fn(() => new Promise<'PAID'>((r) => (release = r))),
    });
    renderAt(`/?cf_order=${REF}`, donate);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: t.confirming })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: t.continue })).toBeNull();
    release('PAID');
    expect(await within(dialog).findByRole('heading', { name: t.confirmedTitle })).toBeVisible();
  });

  it('a malformed or foreign value is dropped without asking anything', async () => {
    for (const value of ['TOT-D-123', 'HLP-ABCDEFGHJKMN', `${REF}x`, '<script>']) {
      const donate = cashfreeClient();
      const router = renderAt(`/?cf_order=${encodeURIComponent(value)}`, donate);
      await waitFor(() => expect(router.state.location.search).toBe(''));
      expect(router.state.location.hash).toBe('');
      expect(donate.status).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
      router.dispose();
    }
  });
});

describe('mock client (dev / e2e only) Cashfree scenarios', () => {
  it('cover paid, pending, failed and redirect', async () => {
    const mock = createMockDonateClient(0);
    const g = globalThis as { __donateMock?: string };
    try {
      g.__donateMock = 'cashfree';
      expect(await mock.estimate()).toMatchObject({ phoneRequired: true });
      const started = await mock.start(
        {
          giftPaise: 100,
          currency: 'INR',
          programme: null,
          donorName: 'A',
          donorEmail: null,
          donorPhone: '+919876543210',
          hideNamePublicly: true,
          wantsReceipt: false,
          coverFee: false,
          consent: true,
          locale: 'en',
        },
        'k',
      );
      expect(started.ok && started.intent.checkout.provider).toBe('CASHFREE');
      expect(await mock.checkout(CASHFREE_INTENT)).toEqual({
        kind: 'returned',
      });
      expect(await mock.verify(REF)).toBe('PAID');
      g.__donateMock = 'cashfree-pending';
      expect(await mock.verify(REF)).toBe('PENDING');
      expect(await mock.status(REF)).toBe('PAID');
      g.__donateMock = 'cashfree-fail';
      expect(await mock.verify(REF)).toBe('FAILED');
      expect(await mock.status(REF)).toBe('FAILED');
      g.__donateMock = 'cashfree-redirect';
      expect(await mock.checkout(CASHFREE_INTENT)).toEqual({
        kind: 'redirecting',
      });
      g.__donateMock = 'success';
      const estimate = await mock.estimate();
      expect(estimate).toMatchObject({ phoneRequired: true });
      expect(estimate).not.toHaveProperty('qrOffered');
    } finally {
      delete g.__donateMock;
    }
  });
});
