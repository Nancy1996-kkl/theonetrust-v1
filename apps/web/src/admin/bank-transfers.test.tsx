import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AdminSessionResponse, BankTransfersResponse } from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { AdminLayout } from './AdminLayout.tsx';
import { AdminNav } from './AdminNav.tsx';
import { BankTransfersPage } from './BankTransfersPage.tsx';
import { RequireAdmin } from './RequireAdmin.tsx';
import { rupeesToPaiseInput } from './admin-context.ts';
import { AdminApiError, createAdminApi, type AdminApi } from './api.ts';
import { ADMIN_STRINGS } from './strings.ts';

const t = ADMIN_STRINGS.en;
const ACTIVE: AdminSessionResponse = {
  stage: 'ACTIVE',
  user: { email: 'o@example.org', role: 'OWNER', locale: 'en' },
  csrfToken: 'c',
};
const DATA: BankTransfersResponse = {
  credits: [
    {
      id: 'c1',
      bankReference: 'UTR111111',
      amountPaise: 5_000_000,
      receivedOn: '2026-11-01',
      evidence: 'line 1',
      status: 'REPORTED',
      donationReference: 'TOT-D-ABCDEFGHJKMN',
      createdAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'c2',
      bankReference: 'UTR222222',
      amountPaise: 100_000,
      receivedOn: '2026-11-01',
      evidence: 'line 2',
      status: 'REPORTED',
      donationReference: null,
      createdAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'c3',
      bankReference: 'UTR333333',
      amountPaise: 100_000,
      receivedOn: '2026-11-01',
      evidence: 'line 3',
      status: 'MATCHED',
      donationReference: 'TOT-D-ZZZZZZZZZZZZ',
      createdAt: '2026-11-01T10:00:00Z',
    },
  ],
  awaiting: [
    {
      publicReference: 'TOT-D-WAITWAITWAIT',
      amountPaise: 2_000_000,
      status: 'PENDING',
      donorUtr: 'UTR999999',
      createdAt: '2026-11-01T10:00:00Z',
    },
  ],
  exceptions: [
    {
      id: 'x1',
      kind: 'UNMATCHED_CREDIT',
      bankTransferRecordId: 'c2',
      createdAt: '2026-11-01T10:00:00Z',
    },
  ],
};

function api(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    session: vi.fn(async () => ACTIVE),
    bankTransfers: vi.fn(async () => DATA),
    recordBankCredit: vi.fn(async () => ({
      id: 'n',
      matched: true,
      awaitingConfirmation: true,
      exception: null,
    })),
    confirmBankCredit: vi.fn(async () => ({ status: 'MATCHED' })),
    rejectBankCredit: vi.fn(async () => ({ status: 'REJECTED' })),
    resolveException: vi.fn(async () => ({ status: 'RESOLVED' })),
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
                children: [{ path: 'bank-transfers', element: <BankTransfersPage /> }],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: ['/admin/bank-transfers'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('bank transfers page', () => {
  it('lists credits, awaiting donors (UTR marked not proof) and exceptions', async () => {
    const { container } = renderPage(api());
    expect(await screen.findByRole('heading', { level: 1, name: t.bankTitle })).toBeVisible();
    const credits = await screen.findByRole('table', { name: t.bankCreditsCaption });
    expect(credits).toHaveTextContent('UTR111111');
    expect(credits).toHaveTextContent(t.bankStatusMATCHED);
    expect(screen.getByRole('table', { name: t.bankAwaitingCaption })).toHaveTextContent(
      'UTR999999',
    );
    expect(screen.getByText(t.kindUNMATCHED_CREDIT)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('records a credit (validates the amount) and reports matched / exception', async () => {
    const user = userEvent.setup();
    const recordBankCredit = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'n',
        matched: true,
        awaitingConfirmation: true,
        exception: null,
      })
      .mockResolvedValueOnce({
        id: 'n2',
        matched: false,
        awaitingConfirmation: false,
        exception: { id: 'x', kind: 'UNMATCHED_CREDIT' },
      });
    renderPage(api({ recordBankCredit }));
    await user.type(await screen.findByLabelText(t.bankUtr, { exact: false }), 'UTR444444');
    await user.type(screen.getByLabelText(t.bankAmount, { exact: false }), 'abc');
    await user.type(screen.getByLabelText(t.bankReceivedOn, { exact: false }), '2026-11-02');
    await user.type(
      screen.getByLabelText(t.bankEvidence, { exact: false }),
      'SBI statement line 4',
    );
    await user.type(
      screen.getByLabelText(t.bankDonationRef, { exact: false }),
      'tot-d-abcdefghjkmn',
    );
    await user.click(screen.getByRole('button', { name: t.bankRecord }));
    expect(screen.getByText(t.bankAmountError)).toBeVisible();
    await user.clear(screen.getByLabelText(t.bankAmount, { exact: false }));
    await user.type(screen.getByLabelText(t.bankAmount, { exact: false }), '50,000.50');
    await user.click(screen.getByRole('button', { name: t.bankRecord }));
    expect(recordBankCredit).toHaveBeenCalledWith({
      bankReference: 'UTR444444',
      amountPaise: 5_000_050,
      receivedOn: '2026-11-02',
      evidence: 'SBI statement line 4',
      donationReference: 'TOT-D-ABCDEFGHJKMN',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(t.bankRecordedMatched);
    await user.type(screen.getByLabelText(t.bankUtr, { exact: false }), 'UTR555555');
    await user.type(screen.getByLabelText(t.bankAmount, { exact: false }), '1000');
    await user.type(screen.getByLabelText(t.bankReceivedOn, { exact: false }), '2026-11-02');
    await user.type(screen.getByLabelText(t.bankEvidence, { exact: false }), 'line 5');
    await user.click(screen.getByRole('button', { name: t.bankRecord }));
    expect(await screen.findByText(t.bankRecordedException)).toBeVisible();
  });

  it('confirm needs a reason and the retyped reference; reject needs a reason', async () => {
    const user = userEvent.setup();
    const adminApi = api();
    renderPage(adminApi);
    const credits = await screen.findByRole('table', { name: t.bankCreditsCaption });
    await user.click(within(credits).getByRole('button', { name: /UTR111111/ }));
    const decision = screen.getByRole('form', { name: /UTR111111/ });
    await user.click(within(decision).getByRole('button', { name: t.bankConfirm }));
    expect(within(decision).getByText(t.bankReasonError)).toBeVisible();
    await user.type(within(decision).getByLabelText(t.bankConfirmReason), 'Seen on statement');
    await user.type(within(decision).getByLabelText(t.bankConfirmType), 'tot-d-abcdefghjkmn');
    await user.click(within(decision).getByRole('button', { name: t.bankConfirm }));
    expect(adminApi.confirmBankCredit).toHaveBeenCalledWith(
      'c1',
      'Seen on statement',
      'TOT-D-ABCDEFGHJKMN',
    );
    await waitFor(() => expect(adminApi.bankTransfers).toHaveBeenCalledTimes(2));

    await user.click(
      within(screen.getByRole('table', { name: t.bankCreditsCaption })).getByRole('button', {
        name: /UTR222222/,
      }),
    );
    const second = screen.getByRole('form', { name: /UTR222222/ });
    expect(within(second).queryByRole('button', { name: t.bankConfirm })).toBeNull();
    await user.type(within(second).getByLabelText(t.bankConfirmReason), 'Bank reversed it');
    await user.click(within(second).getByRole('button', { name: t.bankReject }));
    expect(adminApi.rejectBankCredit).toHaveBeenCalledWith('c2', 'Bank reversed it');
  });

  it('resolves an exception with a reason, and shows API errors', async () => {
    const user = userEvent.setup();
    const adminApi = api({
      resolveException: vi.fn(async () => Promise.reject(new AdminApiError('CONFLICT'))),
    });
    renderPage(adminApi);
    await user.click(await screen.findByRole('button', { name: t.bankResolve }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.bankReasonError);
    await user.type(screen.getByLabelText(t.bankResolveReason), 'Refunded to sender');
    await user.click(screen.getByRole('button', { name: t.bankResolve }));
    expect(adminApi.resolveException).toHaveBeenCalledWith('x1', 'Refunded to sender');
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorExpired);
  });

  it('shows an empty state and a load error with retry', async () => {
    const user = userEvent.setup();
    const bankTransfers = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue({ credits: [], awaiting: [], exceptions: [] });
    renderPage(api({ bankTransfers }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorNetwork);
    await user.click(screen.getByRole('button', { name: t.retry }));
    expect((await screen.findAllByText(t.bankNone)).length).toBe(3);
  });
});

describe('bank helpers', () => {
  it('parses rupee input to paise', () => {
    expect(rupeesToPaiseInput('50,000.5')).toBe(5_000_050);
    expect(rupeesToPaiseInput('₹ 1')).toBe(100);
    expect(rupeesToPaiseInput('0.50')).toBeNull();
    expect(rupeesToPaiseInput('1.234')).toBeNull();
  });

  it('api client calls the bank endpoints', async () => {
    const fetchImpl = vi.fn(
      async (_u: string | URL | Request, _i?: RequestInit) => new Response('{}', { status: 200 }),
    );
    const a = createAdminApi('', fetchImpl);
    await a.bankTransfers();
    await a.recordBankCredit({
      bankReference: 'U',
      amountPaise: 100,
      receivedOn: '2026-11-01',
      evidence: 'e',
    });
    await a.confirmBankCredit('c 1', 'r', 'TOT');
    await a.rejectBankCredit('c1', 'r');
    await a.resolveException('x1', 'r');
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/v1/admin/bank-transfers',
      '/api/v1/admin/bank-transfers/credits',
      '/api/v1/admin/bank-transfers/credits/c%201/confirm',
      '/api/v1/admin/bank-transfers/credits/c1/reject',
      '/api/v1/admin/payment-exceptions/x1/resolve',
    ]);
  });
});
