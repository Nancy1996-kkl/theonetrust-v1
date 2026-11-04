import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminSessionResponse,
  AdminSubscriptionDetail,
  AdminSubscriptionList,
} from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { AdminLayout } from './AdminLayout.tsx';
import { AdminNav } from './AdminNav.tsx';
import { MonthlyGivingPage } from './MonthlyGivingPage.tsx';
import { RequireAdmin } from './RequireAdmin.tsx';
import { AdminApiError, createAdminApi, type AdminApi } from './api.ts';
import { LEDGER_STRINGS } from './ledger-strings.ts';
import { ADMIN_STRINGS } from './strings.ts';

const l = LEDGER_STRINGS.en;
const t = ADMIN_STRINGS.en;
const ACTIVE: AdminSessionResponse = {
  stage: 'ACTIVE',
  user: { email: 'o@example.org', role: 'OWNER', locale: 'en' },
  csrfToken: 'c',
};
const ITEM = {
  id: '44444444-4444-4444-8444-444444444444',
  reference: 'TOT-M-ABCDEFGHJKMN',
  amountPaise: 100_000,
  status: 'HALTED' as const,
  methodRoute: 'upi_autopay' as const,
  donorName: 'Synthetic Donor',
  createdAt: '2026-11-04T10:00:00Z',
  charges: 2,
  paidCharges: 1,
  lastChargeAt: '2026-11-04T10:00:00Z',
  openExceptions: 1,
};
const LIST: AdminSubscriptionList = {
  items: [
    ITEM,
    {
      ...ITEM,
      id: 'x2',
      reference: 'TOT-M-ZZZZZZZZZZZZ',
      status: 'ACTIVE',
      methodRoute: 'emandate_card',
      lastChargeAt: null,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 30,
};
const DETAIL: AdminSubscriptionDetail = {
  ...ITEM,
  history: [
    {
      from: 'ACTIVE',
      to: 'HALTED',
      source: 'webhook:subscription.halted',
      at: '2026-11-05T10:00:00Z',
    },
  ],
  chargeList: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      reference: 'TOT-D-CHARGE000001',
      createdAt: '2026-11-04T10:00:00Z',
      paidAt: '2026-11-04T10:00:00Z',
      amountPaise: 100_000,
      refundedPaise: 0,
      status: 'PAID',
      channel: 'CHECKOUT',
      method: 'upi',
      programme: null,
      donorName: 'Synthetic Donor',
      receipt: { number: 'TOT-R-2026-27-000009', state: 'VALID' },
    },
  ],
  exceptions: [
    { id: 'e1', kind: 'SUBSCRIPTION_HALTED', status: 'OPEN', createdAt: '2026-11-05T10:00:00Z' },
  ],
};

function api(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    session: vi.fn(async () => ACTIVE),
    subscriptions: vi.fn(async () => LIST),
    subscription: vi.fn(async () => DETAIL),
    logout: vi.fn(),
    updatePreferences: vi.fn(),
    ...overrides,
  } as unknown as AdminApi;
}

function renderPage(adminApi: AdminApi) {
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
                children: [{ path: 'monthly-giving', element: <MonthlyGivingPage /> }],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: ['/admin/monthly-giving'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('monthly giving page', () => {
  it('lists gifts with plain-language status, charges and problems; shows history and charges', async () => {
    const user = userEvent.setup();
    const adminApi = api();
    const { container } = renderPage(adminApi);
    const table = await screen.findByRole('table', { name: l.monthlyCaption });
    expect(table).toHaveTextContent(l.subStatuses.HALTED);
    expect(table).toHaveTextContent('1 / 2');
    expect(table).toHaveTextContent(l.routeMandate);
    expect(screen.getByRole('link', { name: l.navMonthly })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoA11yViolations(container);
    await user.click(within(table).getByRole('button', { name: new RegExp(ITEM.reference) }));
    const detail = await screen.findByRole('region', { name: `History of ${ITEM.reference}` });
    expect(detail).toHaveTextContent(`${l.subStatuses.ACTIVE} → ${l.subStatuses.HALTED}`);
    expect(detail).toHaveTextContent(l.kinds.SUBSCRIPTION_HALTED);
    expect(within(detail).getByRole('link', { name: 'TOT-D-CHARGE000001' })).toHaveAttribute(
      'href',
      '/admin/donations/55555555-5555-4555-8555-555555555555',
    );
    expect(detail).toHaveTextContent('TOT-R-2026-27-000009');
    await user.selectOptions(screen.getByLabelText(l.status), 'ACTIVE');
    await waitFor(() => expect(adminApi.subscriptions).toHaveBeenLastCalledWith('ACTIVE', 1));
    await user.click(screen.getByRole('button', { name: l.next }));
    await waitFor(() => expect(adminApi.subscriptions).toHaveBeenLastCalledWith('ACTIVE', 2));
    await user.click(screen.getByRole('button', { name: l.previous }));
    await waitFor(() => expect(adminApi.subscriptions).toHaveBeenLastCalledWith('ACTIVE', 1));
  });

  it('errors, empty list, a charge without receipt, failed detail', async () => {
    const user = userEvent.setup();
    const subscriptions = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue({ items: [ITEM], page: 1, pageSize: 25, total: 1 });
    const subscription = vi
      .fn()
      .mockResolvedValueOnce({
        ...DETAIL,
        chargeList: [{ ...DETAIL.chargeList[0]!, receipt: null }],
        exceptions: [{ id: 'e', kind: 'ODD', status: 'OPEN', createdAt: '2026-11-05T10:00:00Z' }],
      })
      .mockResolvedValueOnce({ ...DETAIL, chargeList: [] })
      .mockRejectedValueOnce(new AdminApiError('NOT_FOUND'));
    renderPage(api({ subscriptions, subscription }));
    expect(await screen.findByText(t.errorNetwork)).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.retry }));
    const table = await screen.findByRole('table', { name: l.monthlyCaption });
    await user.click(within(table).getByRole('button', { name: new RegExp(ITEM.reference) }));
    const detail = await screen.findByRole('region', { name: `History of ${ITEM.reference}` });
    expect(detail).toHaveTextContent(l.none);
    expect(detail).toHaveTextContent('ODD');
    await user.click(within(table).getByRole('button', { name: new RegExp(ITEM.reference) }));
    expect(await screen.findByText(l.nothing)).toBeVisible();
    await user.click(within(table).getByRole('button', { name: new RegExp(ITEM.reference) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorGeneric);
  });

  it('empty and loading; api client URLs', async () => {
    renderPage(
      api({ subscriptions: vi.fn(async () => ({ items: [], page: 1, pageSize: 25, total: 0 })) }),
    );
    expect(await screen.findByText(l.monthlyEmpty)).toBeVisible();
    const fetchImpl = vi.fn(
      async (_u: string | URL | Request, _i?: RequestInit) =>
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const client = createAdminApi('', fetchImpl);
    await client.subscriptions('ACTIVE', 2);
    await client.subscriptions();
    await client.subscription('id1');
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/v1/admin/subscriptions?status=ACTIVE&page=2',
      '/api/v1/admin/subscriptions?page=1',
      '/api/v1/admin/subscriptions/id1',
    ]);
  });
});
