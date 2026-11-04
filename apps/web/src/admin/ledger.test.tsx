import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminOverview,
  AdminReceiptItem,
  AdminSessionResponse,
  DonationDetail,
  ExceptionQueue,
  LedgerList,
} from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { AdminHomePage } from './AdminHomePage.tsx';
import { AdminLayout } from './AdminLayout.tsx';
import { AdminNav } from './AdminNav.tsx';
import { DonationDetailPage } from './DonationDetailPage.tsx';
import { DonationsPage } from './DonationsPage.tsx';
import { filtersFrom } from './ledger-format.ts';
import { ExceptionsPage } from './ExceptionsPage.tsx';
import { ReceiptsPage } from './ReceiptsPage.tsx';
import { RequireAdmin } from './RequireAdmin.tsx';
import { AdminApiError, createAdminApi, type AdminApi } from './api.ts';
import { LEDGER_STRINGS } from './ledger-strings.ts';
import { ADMIN_STRINGS } from './strings.ts';

const l = LEDGER_STRINGS.en;
/** A detail section, found by its heading (its table is a second region with the same name). */
const sec = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section')!;
const t = ADMIN_STRINGS.en;
const ACTIVE: AdminSessionResponse = {
  stage: 'ACTIVE',
  user: { email: 'o@example.org', role: 'OWNER', locale: 'en' },
  csrfToken: 'c',
};
const TOKEN = 'T'.repeat(43);
const OVERVIEW: AdminOverview = {
  today: { grossPaise: 200_000, refundedPaise: 50_000, netPaise: 150_000, count: 1 },
  month: { grossPaise: 1_200_000, refundedPaise: 50_000, netPaise: 1_150_000, count: 7 },
  lifetime: { grossPaise: 9_900_000, refundedPaise: 100_000, netPaise: 9_800_000, count: 40 },
  pending: { count: 2, amountPaise: 30_000 },
  failed: { count: 3 },
  refunds: { count: 1, amountPaise: 100_000 },
  openExceptions: 4,
  stalePending: 1,
  manualReview: 1,
};
const ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  reference: 'TOT-D-ABCDEFGHJKMN',
  createdAt: '2026-11-04T10:00:00Z',
  paidAt: '2026-11-04T10:01:00Z',
  amountPaise: 150_000,
  refundedPaise: 0,
  status: 'PAID' as const,
  channel: 'CHECKOUT' as const,
  method: 'upi' as const,
  programme: null,
  donorName: 'Synthetic Donor',
  receipt: { number: 'TOT-R-2026-27-000001', state: 'VALID' as const },
};
const LIST: LedgerList = { items: [ITEM], page: 1, pageSize: 25, total: 26 };
const RECEIPT: AdminReceiptItem = {
  id: '22222222-2222-4222-8222-222222222222',
  receiptNumber: 'TOT-R-2026-27-000001',
  donationId: ITEM.id,
  reference: ITEM.reference,
  amountPaise: 150_000,
  issuedAt: '2026-11-04T10:01:00Z',
  state: 'VALID',
  token: TOKEN,
  canResend: true,
  lastEmail: { status: 'SENT', sentAt: '2026-11-04T10:02:00Z' },
};
const DETAIL: DonationDetail = {
  ...ITEM,
  giftPaise: 150_000,
  feePaise: 0,
  locale: 'ta',
  donorEmailMasked: 'd•••@example.org',
  donorPhoneMasked: '••••••3210',
  wantsReceipt: true,
  hideNamePublicly: true,
  attempts: [
    {
      providerOrderId: 'order_ABC123',
      providerPaymentId: 'pay_ABC123',
      providerStatus: 'captured',
      amountPaise: 150_000,
      capturedPaise: 150_000,
      refundedPaise: 0,
      method: 'upi',
      signatureVerified: true,
      createdAt: '2026-11-04T10:00:00Z',
    },
  ],
  statusHistory: [
    { from: 'CREATED', to: 'PAID', source: 'gateway_verified', at: '2026-11-04T10:01:00Z' },
  ],
  webhooks: [
    {
      eventType: 'payment.captured',
      processingStatus: 'PROCESSED',
      processingError: null,
      attempts: 1,
      receivedAt: '2026-11-04T10:01:10Z',
    },
  ],
  bankTransfers: [],
  receipts: [RECEIPT],
  notifications: [
    {
      id: 'n1',
      template: 'owner_donation_paid',
      status: 'SENT',
      lastError: null,
      attempts: 1,
      sentAt: '2026-11-04T10:02:00Z',
    },
  ],
  exceptions: [],
};
const QUEUE: ExceptionQueue = {
  staleAfterMinutes: 30,
  items: [
    {
      key: `STALE_PENDING:${ITEM.id}`,
      kind: 'STALE_PENDING',
      exceptionId: null,
      donationId: ITEM.id,
      reference: ITEM.reference,
      amountPaise: 60_000,
      providerPaymentId: null,
      createdAt: '2026-11-04T08:00:00Z',
      actions: ['recheck'],
    },
    {
      key: 'exception:x1',
      kind: 'UNMATCHED_CREDIT',
      exceptionId: 'x1',
      donationId: null,
      reference: null,
      amountPaise: 250_000,
      providerPaymentId: 'pay_VA0001',
      createdAt: '2026-11-04T09:00:00Z',
      actions: ['resolve'],
    },
  ],
};

function api(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    session: vi.fn(async () => ACTIVE),
    overview: vi.fn(async () => OVERVIEW),
    donations: vi.fn(async () => LIST),
    donation: vi.fn(async () => DETAIL),
    recheckDonation: vi.fn(async () => ({
      id: ITEM.id,
      status: 'PAID' as const,
      outcome: 'provider_captured',
    })),
    donationsExportUrl: vi.fn(() => '/api/v1/admin/donations/export.csv?status=PAID'),
    exceptionQueue: vi.fn(async () => QUEUE),
    resolveException: vi.fn(async () => ({ status: 'RESOLVED' })),
    receipts: vi.fn(async () => ({ items: [RECEIPT], page: 1, pageSize: 25, total: 1 })),
    resendReceipt: vi.fn(async () => ({ id: RECEIPT.id, queued: true })),
    receiptPdfUrl: vi.fn(
      (token: string, lang: string) => `/api/v1/receipts/${token}/pdf?lang=${lang}`,
    ),
    logout: vi.fn(),
    updatePreferences: vi.fn(),
    ...overrides,
  } as unknown as AdminApi;
}

function renderAt(path: string, adminApi: AdminApi) {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout api={adminApi} />,
        children: [
          {
            element: <RequireAdmin />,
            children: [
              {
                element: <AdminNav />,
                children: [
                  { index: true, element: <AdminHomePage /> },
                  { path: 'donations', element: <DonationsPage /> },
                  { path: 'donations/:id', element: <DonationDetailPage /> },
                  { path: 'exceptions', element: <ExceptionsPage /> },
                  { path: 'receipts', element: <ReceiptsPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('overview', () => {
  it('shows verified gross, refunds and net per period, and what needs attention', async () => {
    const { container } = renderAt('/admin', api());
    expect(await screen.findByRole('heading', { level: 2, name: l.periodToday })).toBeVisible();
    const today = screen.getByRole('region', { name: l.periodToday });
    expect(today).toHaveTextContent('₹2,000');
    expect(today).toHaveTextContent('₹500');
    expect(today).toHaveTextContent('₹1,500');
    expect(screen.getByRole('region', { name: l.periodLifetime })).toHaveTextContent(
      '40 donations',
    );
    const attention = screen.getByRole('region', { name: l.attentionTitle });
    expect(attention).toHaveTextContent(`${l.exceptionsCard}4`);
    expect(attention).toHaveTextContent(`${l.pendingCard}2 · ₹300`);
    expect(screen.getByRole('link', { name: l.openExceptions })).toHaveAttribute(
      'href',
      '/admin/exceptions',
    );
    await expectNoA11yViolations(container);
  });

  it('error → try again', async () => {
    const user = userEvent.setup();
    const overview = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue(OVERVIEW);
    renderAt('/admin', api({ overview }));
    expect(await screen.findByText(t.errorNetwork)).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.retry }));
    expect(await screen.findByRole('heading', { level: 2, name: l.periodToday })).toBeVisible();
  });
});

describe('donations ledger', () => {
  it('lists donations; filters go into the URL and the API; pagination; CSV link', async () => {
    const user = userEvent.setup();
    const adminApi = api();
    const { router, container } = renderAt('/admin/donations', adminApi);
    const table = await screen.findByRole('table', { name: l.caption });
    expect(table).toHaveTextContent(ITEM.reference);
    expect(table).toHaveTextContent(l.statuses.PAID);
    expect(table).toHaveTextContent('TOT-R-2026-27-000001 · Valid');
    expect(screen.getByText('Page 1 of 2 · 26 donations')).toBeVisible();
    expect(screen.getByRole('link', { name: l.exportCsv })).toHaveAttribute(
      'href',
      '/api/v1/admin/donations/export.csv?status=PAID',
    );
    await expectNoA11yViolations(container);

    await user.type(screen.getByLabelText(l.search), 'pay_ABC123');
    await user.selectOptions(screen.getByLabelText(l.status), 'PAID');
    await user.selectOptions(screen.getByLabelText(l.sort), 'amount_desc');
    await user.click(screen.getByRole('button', { name: l.apply }));
    await waitFor(() =>
      expect(adminApi.donations).toHaveBeenLastCalledWith({
        q: 'pay_ABC123',
        status: 'PAID',
        sort: 'amount_desc',
      }),
    );
    expect(router.state.location.search).toContain('q=pay_ABC123');

    await user.click(screen.getByRole('button', { name: l.next }));
    await waitFor(() =>
      expect(adminApi.donations).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    await user.click(screen.getByRole('button', { name: l.clear }));
    await waitFor(() => expect(adminApi.donations).toHaveBeenLastCalledWith({}));
    await user.click(
      within(await screen.findByRole('table', { name: l.caption })).getByRole('link', {
        name: ITEM.reference,
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/donations/${ITEM.id}`));
    expect(router.state.location.pathname).toBe(`/admin/donations/${ITEM.id}`);
  });

  it('empty result and errors', async () => {
    const user = userEvent.setup();
    const donations = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('INTERNAL_ERROR'))
      .mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderAt('/admin/donations', api({ donations }));
    expect(await screen.findByText(t.errorGeneric)).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.retry }));
    expect(await screen.findByText(l.noResults)).toBeVisible();
  });

  it('reads filters from the URL safely', () => {
    expect(filtersFrom(new URLSearchParams('q=x&page=abc&status=PAID&unknown=1'))).toEqual({
      q: 'x',
      page: 1,
      status: 'PAID',
    });
  });
});

describe('donation detail', () => {
  it('shows summary (masked contact), attempts, history, webhooks, receipts and emails — no edit controls', async () => {
    const { container } = renderAt(`/admin/donations/${ITEM.id}`, api());
    expect(
      await screen.findByRole('heading', { level: 1, name: `Donation ${ITEM.reference}` }),
    ).toBeVisible();
    const summary = sec(l.summary);
    expect(summary).toHaveTextContent('d•••@example.org · ••••••3210');
    expect(summary).toHaveTextContent('தமிழ்');
    expect(sec(l.attempts)).toHaveTextContent('pay_ABC123');
    expect(sec(l.history)).toHaveTextContent(`${l.statuses.CREATED} → ${l.statuses.PAID}`);
    expect(sec(l.webhooks)).toHaveTextContent('payment.captured');
    expect(sec(l.receipts)).toHaveTextContent('TOT-R-2026-27-000001');
    expect(sec(l.emails)).toHaveTextContent(t.emailTplowner_donation_paid);
    expect(sec(l.exceptions)).toHaveTextContent(l.nothing);
    // Read-only: no amount or status field anywhere.
    // The only input on the page is the re-check reason.
    expect(screen.getAllByRole('textbox')).toEqual([screen.getByLabelText(l.reason)]);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('re-check needs a reason, then shows the status the server decided', async () => {
    const user = userEvent.setup();
    const adminApi = api();
    renderAt(`/admin/donations/${ITEM.id}`, adminApi);
    const form = await screen.findByRole('form', { name: l.recheck });
    await user.click(within(form).getByRole('button', { name: l.recheck }));
    expect(within(form).getByText(l.reasonError)).toBeVisible();
    expect(adminApi.recheckDonation).not.toHaveBeenCalled();
    await user.type(within(form).getByLabelText(l.reason), 'Donor called about it');
    await user.click(within(form).getByRole('button', { name: l.recheck }));
    expect(adminApi.recheckDonation).toHaveBeenCalledWith(ITEM.id, 'Donor called about it');
    expect(await screen.findByText(`Re-checked. Status: ${l.statuses.PAID}.`)).toBeVisible();
  });

  it('bank transfer: no re-check, bank table shown; unknown donation → error; failed re-check shows error', async () => {
    const user = userEvent.setup();
    renderAt(
      `/admin/donations/${ITEM.id}`,
      api({
        donation: vi.fn(async () => ({
          ...DETAIL,
          channel: 'BANK_TRANSFER' as const,
          method: 'bank_transfer' as const,
          bankTransfers: [
            {
              bankReference: 'UTR111',
              amountPaise: 150_000,
              receivedOn: '2026-11-04',
              status: 'MATCHED',
            },
          ],
          exceptions: [
            {
              id: 'x',
              kind: 'AMOUNT_MISMATCH',
              status: 'RESOLVED' as const,
              createdAt: '2026-11-04T10:00:00Z',
              resolution: 'ok',
            },
          ],
        })),
      }),
    );
    expect(await screen.findByRole('heading', { level: 2, name: l.bankTransfers })).toBeVisible();
    expect(sec(l.bankTransfers)).toHaveTextContent('UTR111');
    expect(sec(l.exceptions)).toHaveTextContent(l.kinds.AMOUNT_MISMATCH);
    expect(screen.queryByRole('form', { name: l.recheck })).toBeNull();
    document.body.innerHTML = '';

    renderAt(
      `/admin/donations/${ITEM.id}`,
      api({ donation: vi.fn(async () => Promise.reject(new AdminApiError('NOT_FOUND'))) }),
    );
    expect(await screen.findByText(t.errorGeneric)).toBeVisible();
    document.body.innerHTML = '';

    renderAt(
      `/admin/donations/${ITEM.id}`,
      api({
        recheckDonation: vi.fn(async () =>
          Promise.reject(new AdminApiError('SERVICE_UNAVAILABLE')),
        ),
      }),
    );
    const form = await screen.findByRole('form', { name: l.recheck });
    await user.type(within(form).getByLabelText(l.reason), 'Checking again');
    await user.click(within(form).getByRole('button', { name: l.recheck }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorUnavailable);
  });
});

describe('exceptions queue', () => {
  it('re-check and resolve both need a reason and call the API', async () => {
    const user = userEvent.setup();
    const adminApi = api();
    const { container } = renderAt('/admin/exceptions', adminApi);
    const table = await screen.findByRole('table', { name: l.exceptionsCaption });
    expect(table).toHaveTextContent(l.kinds.STALE_PENDING);
    expect(table).toHaveTextContent('pay_VA0001');
    expect(
      screen.getByText('Pending too long means: still unconfirmed after 30 minutes.'),
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(within(table).getByRole('button', { name: new RegExp(l.recheck) }));
    const form = screen.getByRole('form');
    await user.click(within(form).getByRole('button', { name: l.recheck }));
    expect(within(form).getByText(l.reasonError)).toBeVisible();
    await user.type(within(form).getByLabelText(l.reason), 'Donor says it was paid');
    await user.click(within(form).getByRole('button', { name: l.recheck }));
    expect(adminApi.recheckDonation).toHaveBeenCalledWith(ITEM.id, 'Donor says it was paid');
    expect(await screen.findByText(`Re-checked. Status: ${l.statuses.PAID}.`)).toBeVisible();

    await user.click(
      within(screen.getByRole('table', { name: l.exceptionsCaption })).getByRole('button', {
        name: new RegExp(l.resolve),
      }),
    );
    await user.type(
      within(screen.getByRole('form')).getByLabelText(l.reason),
      'Matched to the bank statement',
    );
    await user.click(within(screen.getByRole('form')).getByRole('button', { name: l.resolve }));
    expect(adminApi.resolveException).toHaveBeenCalledWith('x1', 'Matched to the bank statement');
    expect(await screen.findByText(l.resolved)).toBeVisible();
  });

  it('cancel closes the form; empty queue; errors', async () => {
    const user = userEvent.setup();
    renderAt('/admin/exceptions', api());
    const table = await screen.findByRole('table', { name: l.exceptionsCaption });
    await user.click(within(table).getByRole('button', { name: new RegExp(l.resolve) }));
    await user.click(screen.getByRole('button', { name: l.cancel }));
    expect(screen.queryByRole('form')).toBeNull();
    document.body.innerHTML = '';
    const exceptionQueue = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue({ items: [], staleAfterMinutes: 30 });
    renderAt('/admin/exceptions', api({ exceptionQueue }));
    expect(await screen.findByText(t.errorNetwork)).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.retry }));
    expect(await screen.findByText(l.queueEmpty)).toBeVisible();
    document.body.innerHTML = '';
    renderAt(
      '/admin/exceptions',
      api({ resolveException: vi.fn(async () => Promise.reject(new AdminApiError('CONFLICT'))) }),
    );
    const t2 = await screen.findByRole('table', { name: l.exceptionsCaption });
    await user.click(within(t2).getByRole('button', { name: new RegExp(l.resolve) }));
    await user.type(
      within(screen.getByRole('form')).getByLabelText(l.reason),
      'Matched to statement',
    );
    await user.click(within(screen.getByRole('form')).getByRole('button', { name: l.resolve }));
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

describe('receipts', () => {
  it('copy link, download PDF, resend with a reason', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const adminApi = api();
    const { container } = renderAt('/admin/receipts', adminApi);
    const table = await screen.findByRole('table', { name: l.receiptsCaption });
    expect(table).toHaveTextContent(t.emailStatusSENT);
    expect(within(table).getByRole('link', { name: new RegExp(l.download) })).toHaveAttribute(
      'href',
      `/api/v1/receipts/${TOKEN}/pdf?lang=en`,
    );
    await expectNoA11yViolations(container);

    await user.click(within(table).getByRole('button', { name: new RegExp(l.copyLink) }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/receipt/${TOKEN}`);
    expect(await screen.findByText(l.copied)).toBeVisible();

    await user.click(within(table).getByRole('button', { name: new RegExp(l.resend) }));
    await user.click(within(table).getByRole('button', { name: l.resend }));
    expect(within(table).getByText(l.reasonError)).toBeVisible();
    await user.type(within(table).getByLabelText(l.reason), 'Donor asked again');
    await user.click(within(table).getByRole('button', { name: l.resend }));
    expect(adminApi.resendReceipt).toHaveBeenCalledWith(RECEIPT.id, 'Donor asked again');
    expect(await screen.findByText(l.resent)).toBeVisible();
  });

  it('copy failure shows the link; no token / no consent hides actions; errors and paging', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    const receipts = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue({
        items: [
          RECEIPT,
          {
            ...RECEIPT,
            id: 'r2',
            receiptNumber: 'TOT-R-2026-27-000002',
            token: null,
            canResend: false,
            lastEmail: null,
            state: 'REFUNDED',
          },
        ],
        page: 1,
        pageSize: 25,
        total: 30,
      });
    const resendReceipt = vi.fn(async () => Promise.reject(new AdminApiError('CONFLICT')));
    renderAt('/admin/receipts', api({ receipts, resendReceipt }));
    expect(await screen.findByText(t.errorNetwork)).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.retry }));
    const table = await screen.findByRole('table', { name: l.receiptsCaption });
    expect(table).toHaveTextContent(l.noEmail);
    expect(within(table).getAllByRole('button', { name: new RegExp(l.copyLink) })).toHaveLength(1);
    await user.click(within(table).getByRole('button', { name: new RegExp(l.copyLink) }));
    expect(await screen.findByText(new RegExp(l.copyFailed))).toBeVisible();
    await user.click(within(table).getByRole('button', { name: new RegExp(l.resend) }));
    await user.type(within(table).getByLabelText(l.reason), 'Donor asked again');
    await user.click(within(table).getByRole('button', { name: l.resend }));
    expect(await within(table).findByText(t.errorExpired)).toBeVisible();
    await user.click(screen.getByRole('button', { name: l.next }));
    await waitFor(() => expect(receipts).toHaveBeenLastCalledWith(2));
    await user.click(screen.getByRole('button', { name: l.previous }));
    await waitFor(() => expect(receipts).toHaveBeenLastCalledWith(1));
  });
});

describe('strings and api client', () => {
  it('English and Tamil have the same keys', () => {
    const shape = (o: object): unknown =>
      Object.fromEntries(
        Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? shape(v as object) : true]),
      );
    expect(shape(LEDGER_STRINGS.ta)).toEqual(shape(LEDGER_STRINGS.en));
  });

  it('builds the ledger URLs', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const client = createAdminApi('', fetchImpl);
    await client.overview();
    await client.donations({ q: 'TOT-D-X', page: 2 });
    await client.donation('id1');
    await client.recheckDonation('id1', 'reason here');
    await client.exceptionQueue();
    await client.receipts();
    await client.resendReceipt('r1', 'reason here');
    expect(fetchImpl.mock.calls.map((c) => [String(c[0]), c[1]?.method])).toEqual([
      ['/api/v1/admin/overview', 'GET'],
      ['/api/v1/admin/donations?q=TOT-D-X&page=2', 'GET'],
      ['/api/v1/admin/donations/id1', 'GET'],
      ['/api/v1/admin/donations/id1/recheck', 'POST'],
      ['/api/v1/admin/exceptions', 'GET'],
      ['/api/v1/admin/receipts?page=1', 'GET'],
      ['/api/v1/admin/receipts/r1/resend', 'POST'],
    ]);
    expect(client.donationsExportUrl({ status: 'PAID', page: 3 })).toBe(
      '/api/v1/admin/donations/export.csv?status=PAID',
    );
    expect(client.receiptPdfUrl('tok', 'ta')).toBe('/api/v1/receipts/tok/pdf?lang=ta');
  });
});
