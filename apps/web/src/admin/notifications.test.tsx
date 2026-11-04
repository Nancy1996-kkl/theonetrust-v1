import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AdminSessionResponse, NotificationListResponse } from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { AdminLayout } from './AdminLayout.tsx';
import { AdminNav } from './AdminNav.tsx';
import { NotificationsPage } from './NotificationsPage.tsx';
import { RequireAdmin } from './RequireAdmin.tsx';
import { AdminApiError, createAdminApi, type AdminApi } from './api.ts';
import { ADMIN_STRINGS } from './strings.ts';

const t = ADMIN_STRINGS.en;
const ACTIVE: AdminSessionResponse = {
  stage: 'ACTIVE',
  user: { email: 'o@example.org', role: 'OWNER', locale: 'en' },
  csrfToken: 'c',
};
const DATA: NotificationListResponse = {
  items: [
    {
      id: 'n1',
      template: 'owner_donation_paid',
      audience: 'owner',
      status: 'SENT',
      reference: 'TOT-D-ABCDEFGHJKMN',
      attempts: 1,
      lastError: null,
      createdAt: '2026-11-04T10:00:00Z',
      nextAttemptAt: null,
      sentAt: '2026-11-04T10:00:30Z',
    },
    {
      id: 'n2',
      template: 'donor_donation_paid',
      audience: 'donor',
      status: 'FAILED',
      reference: 'TOT-D-ABCDEFGHJKMN',
      attempts: 6,
      lastError: 'http_503',
      createdAt: '2026-11-04T10:00:00Z',
      nextAttemptAt: null,
      sentAt: null,
    },
    {
      id: 'n3',
      template: 'owner_help_request_new',
      audience: 'owner',
      status: 'PENDING',
      reference: 'HLP-7K2M9Q',
      attempts: 1,
      lastError: 'network',
      createdAt: '2026-11-04T09:00:00Z',
      nextAttemptAt: '2026-11-04T09:05:00Z',
      sentAt: null,
    },
  ],
  counts: { PENDING: 1, SENT: 1, FAILED: 1, CANCELLED: 0 },
  sendingEnabled: true,
};

function api(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    session: vi.fn(async () => ACTIVE),
    notifications: vi.fn(async () => DATA),
    retryNotification: vi.fn(async () => ({ id: 'n2', status: 'PENDING' })),
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
                children: [{ path: 'notifications', element: <NotificationsPage /> }],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: ['/admin/notifications'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('email delivery page', () => {
  it('lists emails with plain-language status, audience, reference and reason', async () => {
    const { container } = renderPage(api());
    expect(await screen.findByRole('heading', { level: 1, name: t.emailTitle })).toBeVisible();
    const table = screen.getByRole('table', { name: t.emailCaption });
    for (const text of [
      t.emailTplowner_donation_paid,
      t.emailTpldonor_donation_paid,
      t.emailTplowner_help_request_new,
      t.emailStatusSENT,
      t.emailStatusFAILED,
      t.emailStatusPENDING,
      t.emailDonor,
      'HLP-7K2M9Q',
      'http_503',
    ]) {
      expect(table).toHaveTextContent(text);
    }
    expect(screen.getByRole('link', { name: t.navEmail })).toHaveAttribute('aria-current', 'page');
    // Only the failed one offers "send again".
    expect(within(table).getAllByRole('button', { name: new RegExp(t.emailRetry) })).toHaveLength(
      1,
    );
    expect(screen.queryByText(t.emailDisabled)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('send again queues the email and reloads; filter by status', async () => {
    const user = userEvent.setup();
    const adminApi = api();
    renderPage(adminApi);
    const table = await screen.findByRole('table', { name: t.emailCaption });
    await user.click(within(table).getByRole('button', { name: new RegExp(t.emailRetry) }));
    expect(adminApi.retryNotification).toHaveBeenCalledWith('n2');
    expect(await screen.findByText(t.emailRetried)).toBeVisible();
    await user.selectOptions(screen.getByLabelText(t.emailState), 'FAILED');
    await waitFor(() => expect(adminApi.notifications).toHaveBeenLastCalledWith('FAILED'));
  });

  it('says when sending is switched off; shows errors with try again', async () => {
    const user = userEvent.setup();
    const notifications = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue({ ...DATA, items: [], sendingEnabled: false });
    renderPage(api({ notifications }));
    expect(await screen.findByText(t.errorNetwork)).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.retry }));
    expect(await screen.findByText(t.emailDisabled)).toBeVisible();
    expect(screen.getByText(t.emailNone)).toBeVisible();
  });

  it('a failed retry shows the error', async () => {
    const user = userEvent.setup();
    renderPage(
      api({ retryNotification: vi.fn(async () => Promise.reject(new AdminApiError('CONFLICT'))) }),
    );
    const table = await screen.findByRole('table', { name: t.emailCaption });
    await user.click(within(table).getByRole('button', { name: new RegExp(t.emailRetry) }));
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('api client: list with an optional status filter; retry with CSRF', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(DATA), { headers: { 'content-type': 'application/json' } }),
    );
    const client = createAdminApi('', fetchImpl);
    await client.notifications();
    await client.notifications('FAILED');
    await client.retryNotification('n2');
    expect(fetchImpl.mock.calls.map((c) => [String(c[0]), c[1]?.method])).toEqual([
      ['/api/v1/admin/notifications', 'GET'],
      ['/api/v1/admin/notifications?status=FAILED', 'GET'],
      ['/api/v1/admin/notifications/n2/retry', 'POST'],
    ]);
  });
});
