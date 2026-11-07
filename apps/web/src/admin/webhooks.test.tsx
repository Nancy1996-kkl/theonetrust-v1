import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AdminSessionResponse, AdminWebhookList } from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { AdminLayout } from './AdminLayout.tsx';
import { AdminNav } from './AdminNav.tsx';
import { RequireAdmin } from './RequireAdmin.tsx';
import { WebhooksPage } from './WebhooksPage.tsx';
import { AdminApiError, createAdminApi, type AdminApi } from './api.ts';
import { LEDGER_STRINGS } from './ledger-strings.ts';
import { ADMIN_STRINGS } from './strings.ts';

const l = LEDGER_STRINGS.en;
const ACTIVE: AdminSessionResponse = {
  stage: 'ACTIVE',
  user: { email: 'o@example.org', role: 'OWNER', locale: 'en' },
  csrfToken: 'c',
};
const LIST: AdminWebhookList = {
  items: [
    {
      id: 'w1',
      eventType: 'payment.captured',
      status: 'FAILED',
      note: 'processing_failed',
      attempts: 3,
      receivedAt: '2026-11-05T05:00:00Z',
      processedAt: null,
      needsAttention: true,
      donation: null,
    },
    {
      id: 'w2',
      eventType: 'order.paid',
      status: 'PROCESSED',
      note: null,
      attempts: 1,
      receivedAt: '2026-11-05T04:00:00Z',
      processedAt: '2026-11-05T04:00:01Z',
      needsAttention: false,
      donation: { id: 'd1', reference: 'TOT-D-1' },
    },
  ],
  counts: { RECEIVED: 0, PROCESSED: 1, IGNORED: 0, FAILED: 1 },
  staleAfterMinutes: 30,
};

function renderPage(webhooks: AdminApi['webhooks']) {
  const api = {
    session: vi.fn(async () => ACTIVE),
    logout: vi.fn(),
    updatePreferences: vi.fn(),
    webhooks,
  } as unknown as AdminApi;
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout api={api} />,
        children: [
          {
            element: <RequireAdmin />,
            children: [
              {
                element: <AdminNav />,
                children: [{ path: 'webhooks', element: <WebhooksPage /> }],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: ['/admin/webhooks'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('webhook delivery view (#39)', () => {
  it('shows each delivery with words (not colour only), attempts and the donation link', async () => {
    const user = userEvent.setup();
    const webhooks = vi.fn(async () => LIST);
    const { container } = renderPage(webhooks);
    expect(await screen.findByRole('rowheader', { name: 'payment.captured' })).toBeVisible();
    // Status in words inside the table (the filter offers the same words as options).
    const table = screen.getByRole('table', { name: l.whCaption });
    expect(within(table).getByText(l.whStatuses.FAILED)).toBeVisible();
    expect(within(table).getByText(l.whNeedsLook)).toBeVisible();
    expect(screen.getByRole('link', { name: 'TOT-D-1' })).toHaveAttribute(
      'href',
      '/admin/donations/d1',
    );
    expect(screen.getByText(/after 30 minutes/)).toBeVisible();
    await expectNoA11yViolations(container);
    await user.selectOptions(screen.getByLabelText(l.whFilter), 'attention');
    expect(webhooks).toHaveBeenLastCalledWith({ attention: true });
    await user.selectOptions(screen.getByLabelText(l.whFilter), 'FAILED');
    expect(webhooks).toHaveBeenLastCalledWith({ status: 'FAILED' });
    await user.selectOptions(screen.getByLabelText(l.whFilter), '');
    expect(webhooks).toHaveBeenLastCalledWith(undefined);
  });

  it('empty list, load error with retry', async () => {
    const user = userEvent.setup();
    const webhooks = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue({ ...LIST, items: [] });
    renderPage(webhooks);
    expect(await screen.findByText(ADMIN_STRINGS.en.errorNetwork)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ADMIN_STRINGS.en.retry }));
    expect(await screen.findByText(l.nothing)).toBeVisible();
  });

  it('the client builds the query and the Tamil strings exist', async () => {
    const fetchImpl = vi.fn(
      async (_u: string | URL | Request, _i?: RequestInit) =>
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const api = createAdminApi('', fetchImpl);
    await api.webhooks();
    await api.webhooks({ status: 'FAILED' });
    await api.webhooks({ attention: true });
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/v1/admin/webhooks?',
      '/api/v1/admin/webhooks?status=FAILED',
      '/api/v1/admin/webhooks?attention=1',
    ]);
    for (const s of Object.values(LEDGER_STRINGS.ta.whStatuses)) expect(s.trim()).not.toBe('');
  });
});

describe('owner page error title (#39)', () => {
  it('pages other than help requests no longer say "Could not load help requests"', () => {
    expect(ADMIN_STRINGS.en.loadErrorTitle).toBe('Could not load this page');
    expect(ADMIN_STRINGS.ta.loadErrorTitle).toBe('இந்தப் பக்கத்தை ஏற்ற முடியவில்லை');
  });
});
