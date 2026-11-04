import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubscriptionResponse } from '@theonetrust/contracts';
import { routes } from '../app/routes.tsx';
import { MANAGE_MESSAGES } from '../manage/manage-messages.ts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { DonateClientContext, createMockDonateClient, type DonateClient } from './donate-client.ts';
import { DONATE_MESSAGES } from './donate-messages.ts';
import { MonthlyConsent } from './MonthlyConsent.tsx';
import {
  MOCK_MANAGE_TOKEN,
  MonthlyClientContext,
  createApiMonthlyClient,
  createMockMonthlyClient,
  hiddenMethods,
  selectMonthlyClient,
  unavailableMonthlyClient,
  type MonthlyClient,
} from './monthly-client.ts';

const t = DONATE_MESSAGES.en;
const m = MANAGE_MESSAGES.en;
const TOKEN = 'K'.repeat(43);
const SUB: SubscriptionResponse = {
  publicReference: 'TOT-M-ABCDEFGHJKMN',
  amountPaise: 100_000,
  currency: 'INR',
  methodRoute: 'upi_autopay',
  allowedMethods: ['upi', 'emandate', 'card'],
  warning: null,
  startDate: null,
  checkout: { provider: 'RAZORPAY', keyId: 'rzp_test_k', subscriptionId: 'sub_ABC123456' },
};

function donate(monthlyOffered: boolean): DonateClient {
  const base = createMockDonateClient(0);
  return {
    ...base,
    estimate: async () => ({
      minPaise: 100,
      maxPaise: 5_000_000,
      receiptMinPaise: 50_000,
      feeCoverOffered: false,
      bankTransferOffered: true,
      monthlyOffered,
    }),
  };
}

function monthly(overrides: Partial<MonthlyClient> = {}): MonthlyClient {
  return {
    start: vi.fn(async () => ({ ok: true as const, subscription: SUB })),
    checkout: vi.fn(async () => ({
      kind: 'completed' as const,
      paymentId: 'pay_1',
      signature: 'sig',
    })),
    verify: vi.fn(async () => ({
      publicReference: SUB.publicReference,
      status: 'ACTIVE' as const,
      manageToken: TOKEN,
    })),
    manage: vi.fn(async () => ({
      kind: 'found' as const,
      view: {
        publicReference: SUB.publicReference,
        amountPaise: 100_000,
        status: 'ACTIVE' as const,
        methodRoute: 'upi_autopay' as const,
        startDate: '2026-11-04',
        programme: null,
        createdAt: '2026-11-04T10:00:00Z',
      },
    })),
    cancel: vi.fn(),
    ...overrides,
  };
}

function renderAt(path: string, d: DonateClient, mc: MonthlyClient) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <DonateClientContext.Provider value={d}>
      <MonthlyClientContext.Provider value={mc}>
        <RouterProvider router={router} />
      </MonthlyClientContext.Provider>
    </DonateClientContext.Provider>,
  );
  return router;
}

afterEach(() => {
  sessionStorage.clear();
});

async function toMonthlyReview(user: ReturnType<typeof userEvent.setup>, rupees = '₹1,000') {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.click(await within(dialog).findByRole('radio', { name: new RegExp(t.monthly) }));
  await user.click(within(dialog).getByRole('radio', { name: rupees }));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.type(
    within(dialog).getByRole('textbox', { name: new RegExp(t.fullName) }),
    'Synthetic Donor',
  );
  await user.type(within(dialog).getByRole('textbox', { name: t.email }), 'donor@example.org');
  await user.click(within(dialog).getByLabelText(t.consent));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  return dialog;
}

describe('monthly giving in the donate panel', () => {
  it('is not offered until the server switches it on', async () => {
    const user = userEvent.setup();
    renderAt('/#donate', donate(false), monthly());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await within(dialog).findByRole('radio', { name: '₹1,000' });
    expect(within(dialog).queryByRole('radio', { name: new RegExp(t.monthly) })).toBeNull();
  });

  it('consent shows amount, start, methods and how to cancel; must be ticked; then manage link', async () => {
    const user = userEvent.setup();
    const mc = monthly();
    const router = renderAt('/#donate', donate(true), mc);
    const dialog = await toMonthlyReview(user);
    const consent = within(dialog).getByRole('region', { name: t.consentTitle });
    expect(consent).toHaveTextContent('Amount: ₹1,000 every month, until you cancel.');
    expect(consent).toHaveTextContent(t.consentCancel);
    expect(consent).toHaveTextContent(t.consentMethodUpi);
    expect(within(dialog).queryByRole('button', { name: t.bankTransferLink })).toBeNull();
    await expectNoA11yViolations(dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Set up ₹1,000 every month' }));
    expect(within(dialog).getByText(t.mandateError)).toBeVisible();
    expect(mc.start).not.toHaveBeenCalled();
    await user.click(within(dialog).getByLabelText(t.consentAgree.replace('{amount}', '₹1,000')));
    await user.click(within(dialog).getByRole('button', { name: 'Set up ₹1,000 every month' }));
    expect(await within(dialog).findByRole('heading', { name: t.monthlyDone })).toBeVisible();
    expect(mc.start).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaise: 100_000,
        mandateConsent: true,
        consentVersion: 'monthly-v1',
        donorEmail: 'donor@example.org',
      }),
      expect.stringMatching(/^[0-9a-f]{32}$/),
    );
    expect(mc.verify).toHaveBeenCalledWith(SUB, expect.objectContaining({ paymentId: 'pay_1' }));
    const link = within(dialog).getByRole('link', { name: t.manageLink });
    expect(link).toHaveAttribute('href', `/manage/${TOKEN}`);
    await user.click(within(dialog).getByRole('button', { name: t.backToPage }));
    expect(router.state.location.hash).toBe('');
  });

  it('above ₹15,000: no UPI AutoPay, PhonePe/BHIM warning', async () => {
    render(
      <MonthlyConsent
        amountPaise={2_000_000}
        checked={false}
        error={false}
        onChange={() => {}}
        now={new Date('2026-11-29T05:00:00Z')}
      />,
    );
    expect(screen.getByText(t.consentMethodMandate)).toBeVisible();
    expect(screen.getByText(t.consentPsp)).toBeVisible();
    expect(
      screen.getByText('First donation: 1 December 2026. Then on the same day each month.'),
    ).toBeVisible();
  });

  it('dismissed checkout → back on review; pending → no false success; start failure → error', async () => {
    const user = userEvent.setup();
    const checkout = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'dismissed' })
      .mockResolvedValue({ kind: 'completed', paymentId: 'pay_1', signature: 's' });
    const verify = vi.fn(async () => ({
      publicReference: SUB.publicReference,
      status: 'PENDING' as const,
    }));
    renderAt('/#donate', donate(true), monthly({ checkout, verify }));
    const dialog = await toMonthlyReview(user);
    await user.click(within(dialog).getByLabelText(t.consentAgree.replace('{amount}', '₹1,000')));
    await user.click(within(dialog).getByRole('button', { name: 'Set up ₹1,000 every month' }));
    expect(await within(dialog).findByText(new RegExp(t.cancelled))).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Set up ₹1,000 every month' }));
    expect(await within(dialog).findByRole('heading', { name: t.monthlyPending })).toBeVisible();
    expect(within(dialog).queryByRole('link', { name: t.manageLink })).toBeNull();
  });

  it('a failed mandate or an unavailable server shows the error screens', async () => {
    const user = userEvent.setup();
    renderAt(
      '/#donate',
      donate(true),
      monthly({
        checkout: vi.fn(async () => ({ kind: 'failed' as const, reason: 'other' as const })),
      }),
    );
    let dialog = await toMonthlyReview(user);
    await user.click(within(dialog).getByLabelText(t.consentAgree.replace('{amount}', '₹1,000')));
    await user.click(within(dialog).getByRole('button', { name: 'Set up ₹1,000 every month' }));
    expect(await within(dialog).findByRole('heading', { name: t.failed })).toBeVisible();
    cleanup();
    sessionStorage.clear();
    for (const reason of ['invalid', 'rate_limited', 'network'] as const) {
      renderAt(
        '/#donate',
        donate(true),
        monthly({ start: vi.fn(async () => ({ ok: false as const, reason })) }),
      );
      dialog = await toMonthlyReview(user);
      await user.click(within(dialog).getByLabelText(t.consentAgree.replace('{amount}', '₹1,000')));
      await user.click(within(dialog).getByRole('button', { name: 'Set up ₹1,000 every month' }));
      await waitFor(() =>
        expect(
          within(dialog).queryByRole('button', { name: 'Set up ₹1,000 every month' }),
        ).toBeNull(),
      );
      cleanup();
      sessionStorage.clear();
    }
  });
});

describe('manage page', () => {
  it('shows the monthly gift and cancels after confirming', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn(async () => ({
      kind: 'cancelled' as const,
      view: {
        publicReference: SUB.publicReference,
        amountPaise: 100_000,
        status: 'CANCELLED' as const,
        methodRoute: 'upi_autopay' as const,
        startDate: '2026-11-04',
        programme: null,
        createdAt: '2026-11-04T10:00:00Z',
      },
    }));
    renderAt(`/manage/${TOKEN}`, donate(true), monthly({ cancel }));
    expect(await screen.findByText(m.statuses.ACTIVE)).toBeVisible();
    expect(screen.getByText('₹1,000 every month')).toBeVisible();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await user.click(screen.getByRole('button', { name: m.cancel }));
    await user.click(screen.getByRole('button', { name: m.keep }));
    expect(cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: m.cancel }));
    await user.click(screen.getByRole('button', { name: m.confirm }));
    expect(cancel).toHaveBeenCalledWith(TOKEN);
    expect(await screen.findByText(m.cancelled)).toBeVisible();
    expect(screen.getByText(m.statuses.CANCELLED)).toBeVisible();
    expect(screen.queryByRole('button', { name: m.cancel })).toBeNull();
  });

  it('a failed cancel says nothing changed; Tamil page; not found; unavailable → try again', async () => {
    const user = userEvent.setup();
    renderAt(
      `/ta/manage/${TOKEN}`,
      donate(true),
      monthly({ cancel: vi.fn(async () => ({ kind: 'unavailable' as const })) }),
    );
    const ta = MANAGE_MESSAGES.ta;
    expect(await screen.findByText(ta.statuses.ACTIVE)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ta.cancel }));
    await user.click(screen.getByRole('button', { name: ta.confirm }));
    expect(await screen.findByText(ta.cancelFailed)).toBeVisible();
    cleanup();
    renderAt('/manage/short', donate(true), monthly());
    expect(await screen.findByText(m.notFoundTitle)).toBeVisible();
    cleanup();
    const manage = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValue({ kind: 'not-found' });
    renderAt(`/manage/${TOKEN}`, donate(true), monthly({ manage }));
    expect(await screen.findByText(m.unavailableTitle)).toBeVisible();
    await user.click(screen.getByRole('button', { name: m.tryAgain }));
    expect(await screen.findByText(m.notFoundTitle)).toBeVisible();
  });

  it('strings have the same keys in both languages', () => {
    const shape = (o: object): unknown =>
      Object.fromEntries(
        Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? shape(v as object) : true]),
      );
    expect(shape(MANAGE_MESSAGES.ta)).toEqual(shape(MANAGE_MESSAGES.en));
  });
});

describe('monthly clients', () => {
  const ok = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('api: start (amount must match), verify, manage, cancel', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/subscriptions')) return ok(SUB, 201);
      if (u.endsWith('/verify'))
        return ok({ publicReference: SUB.publicReference, status: 'ACTIVE', manageToken: TOKEN });
      return ok({
        publicReference: SUB.publicReference,
        status: u.endsWith('/cancel') ? 'CANCELLED' : 'ACTIVE',
      });
    });
    const api = createApiMonthlyClient('http://localhost:4000/api/v1', fetchImpl);
    const req = {
      amountPaise: 100_000,
      currency: 'INR',
      programme: null,
      donorName: 'A',
      consent: true,
      mandateConsent: true,
      consentVersion: 'monthly-v1',
      locale: 'en',
    } as const;
    expect(await api.start(req, 'k'.repeat(32))).toEqual({ ok: true, subscription: SUB });
    expect(await api.start({ ...req, amountPaise: 1 }, 'k')).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(await api.verify(SUB, { paymentId: 'pay_1', signature: 's' })).toMatchObject({
      manageToken: TOKEN,
    });
    expect((await api.manage(TOKEN)).kind).toBe('found');
    expect((await api.cancel(TOKEN)).kind).toBe('cancelled');
    const urls = fetchImpl.mock.calls.map((c) => [String(c[0]), c[1]?.method]);
    expect(urls).toContainEqual([
      'http://localhost:4000/api/v1/subscriptions/manage/' + TOKEN + '/cancel',
      'POST',
    ]);
    expect(
      (fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>)['idempotency-key'],
    ).toBe('k'.repeat(32));
  });

  it('api: maps errors', async () => {
    const make = (res: () => Promise<Response>) => createApiMonthlyClient('', res);
    const req = { amountPaise: 100_000 } as never;
    for (const [status, reason] of [
      [400, 'invalid'],
      [409, 'invalid'],
      [429, 'rate_limited'],
      [503, 'unavailable'],
      [500, 'network'],
    ] as const) {
      expect(await make(async () => ok({}, status)).start(req, 'k')).toEqual({ ok: false, reason });
    }
    const down = make(async () => Promise.reject(new TypeError('x')));
    expect(await down.start(req, 'k')).toEqual({ ok: false, reason: 'network' });
    expect(await down.verify(SUB, { paymentId: 'p', signature: 's' })).toBeNull();
    expect((await down.manage(TOKEN)).kind).toBe('unavailable');
    expect(
      await make(async () => ok({}, 400)).verify(SUB, { paymentId: 'p', signature: 's' }),
    ).toBeNull();
    expect(
      await make(async () => ok({})).verify(SUB, { paymentId: 'p', signature: 's' }),
    ).toBeNull();
    expect((await make(async () => ok({}, 404)).manage(TOKEN)).kind).toBe('not-found');
    expect((await make(async () => ok({}, 503)).cancel(TOKEN)).kind).toBe('unavailable');
    expect((await make(async () => ok({ odd: 1 })).manage(TOKEN)).kind).toBe('unavailable');
  });

  it('api checkout: opens Razorpay with the subscription and hides methods this amount may not use', async () => {
    let options: Record<string, unknown> = {};
    let handlers: Record<string, () => void> = {};
    const Razorpay = vi.fn(function (this: unknown, o: Record<string, unknown>) {
      options = o;
      return { open: () => {}, on: (e: string, cb: () => void) => (handlers[e] = cb) };
    });
    const api = createApiMonthlyClient('', vi.fn(), async () => Razorpay);
    const big = { ...SUB, allowedMethods: ['emandate', 'card'] as const };
    const pending = api.checkout(
      { ...big, allowedMethods: [...big.allowedMethods] },
      { name: 'A', email: 'a@example.org', contact: '+919876543210', lang: 'en' },
    );
    await waitFor(() => expect(options.subscription_id).toBe('sub_ABC123456'));
    expect(options.config).toEqual({ display: { hide: [{ method: 'upi' }] } });
    (options.handler as (r: unknown) => void)({
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 's',
    });
    expect(await pending).toEqual({ kind: 'completed', paymentId: 'pay_1', signature: 's' });
    const dismissed = api.checkout(SUB, { name: 'A', lang: 'en' });
    await waitFor(() => expect(options.config).toBeUndefined());
    (options.modal as { ondismiss: () => void }).ondismiss();
    expect(await dismissed).toEqual({ kind: 'dismissed' });
    const failed = api.checkout(SUB, { name: 'A', lang: 'en' });
    await waitFor(() => expect(handlers['payment.failed']).toBeDefined());
    handlers['payment.failed']!();
    expect(await failed).toEqual({ kind: 'failed', reason: 'other' });
    handlers = {};
    expect(
      await createApiMonthlyClient('', vi.fn(), async () =>
        Promise.reject(new Error('x')),
      ).checkout(SUB, { name: 'A', lang: 'en' }),
    ).toEqual({ kind: 'failed', reason: 'other' });
    expect(hiddenMethods(['upi', 'emandate', 'card'])).toEqual([]);
  });

  it('mock + unavailable clients; adapter selection', async () => {
    const mock = createMockMonthlyClient(0);
    const g = globalThis as { __monthlyMock?: string };
    const started = await mock.start({ amountPaise: 2_000_000 } as never, 'k');
    expect(started.ok && started.subscription.warning).toBe('psp_limit');
    expect((await mock.checkout(SUB, { name: 'A', lang: 'en' })).kind).toBe('completed');
    g.__monthlyMock = 'cancel';
    expect((await mock.checkout(SUB, { name: 'A', lang: 'en' })).kind).toBe('dismissed');
    g.__monthlyMock = 'pending';
    expect((await mock.verify(SUB, { paymentId: 'p', signature: 's' }))?.status).toBe('PENDING');
    delete g.__monthlyMock;
    expect((await mock.verify(SUB, { paymentId: 'p', signature: 's' }))?.manageToken).toBe(
      MOCK_MANAGE_TOKEN,
    );
    expect((await mock.manage('x')).kind).toBe('not-found');
    expect((await mock.cancel('x')).kind).toBe('not-found');
    const c = await mock.cancel(MOCK_MANAGE_TOKEN);
    expect(c.kind === 'cancelled' && c.view.status).toBe('CANCELLED');
    expect(await unavailableMonthlyClient.start({} as never, 'k')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect((await unavailableMonthlyClient.checkout(SUB, { name: 'A', lang: 'en' })).kind).toBe(
      'dismissed',
    );
    expect(
      await unavailableMonthlyClient.verify(SUB, { paymentId: 'p', signature: 's' }),
    ).toBeNull();
    expect((await unavailableMonthlyClient.manage('x')).kind).toBe('unavailable');
    expect((await unavailableMonthlyClient.cancel('x')).kind).toBe('unavailable');
    expect(selectMonthlyClient({ VITE_DONATE_ADAPTER: 'unavailable' })).toBe(
      unavailableMonthlyClient,
    );
    expect(selectMonthlyClient({ VITE_DONATE_ADAPTER: 'api' })).not.toBe(unavailableMonthlyClient);
    expect(selectMonthlyClient({ VITE_DONATE_ADAPTER: 'mock' })).not.toBe(unavailableMonthlyClient);
    expect(selectMonthlyClient({ DEV: true })).not.toBe(unavailableMonthlyClient);
  });
});
