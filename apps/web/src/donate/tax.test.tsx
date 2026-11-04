import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionResponse, TaxSettings } from '@theonetrust/contracts';
import { routes } from '../app/routes.tsx';
import { AdminLayout } from '../admin/AdminLayout.tsx';
import { AdminNav } from '../admin/AdminNav.tsx';
import { RequireAdmin } from '../admin/RequireAdmin.tsx';
import { TaxSettingsPage } from '../admin/TaxSettingsPage.tsx';
import { AdminApiError, createAdminApi, type AdminApi } from '../admin/api.ts';
import { LEDGER_STRINGS } from '../admin/ledger-strings.ts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { DonateClientContext, createMockDonateClient, type DonateClient } from './donate-client.ts';
import { DONATE_MESSAGES } from './donate-messages.ts';

const t = DONATE_MESSAGES.en;
const l = LEDGER_STRINGS.en;

function donate(
  taxOptInOffered: boolean,
  start = vi.fn(createMockDonateClient(0).start),
): DonateClient {
  const base = createMockDonateClient(0);
  return {
    ...base,
    start,
    estimate: async () => ({
      minPaise: 100,
      maxPaise: 5_000_000,
      receiptMinPaise: 50_000,
      feeCoverOffered: false,
      bankTransferOffered: false,
      taxOptInOffered,
    }),
  };
}

function renderAt(d: DonateClient) {
  const router = createMemoryRouter(routes, { initialEntries: ['/#donate'] });
  render(
    <DonateClientContext.Provider value={d}>
      <RouterProvider router={router} />
    </DonateClientContext.Provider>,
  );
}

async function toDetails(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.click(await within(dialog).findByRole('radio', { name: '₹1,000' }));
  await user.click(within(dialog).getByRole('button', { name: t.continue }));
  await user.type(
    within(dialog).getByRole('textbox', { name: new RegExp(t.fullName) }),
    'Synthetic Donor',
  );
  await user.type(within(dialog).getByRole('textbox', { name: t.email }), 'donor@example.org');
  await user.click(within(dialog).getByLabelText(t.consent));
  return dialog;
}

afterEach(() => sessionStorage.clear());

describe('tax opt-in in the donate panel', () => {
  it('with the flag off there is no PAN field at all', async () => {
    const user = userEvent.setup();
    renderAt(donate(false));
    const dialog = await toDetails(user);
    expect(within(dialog).queryByLabelText(t.taxOpt)).toBeNull();
    expect(within(dialog).queryByRole('textbox', { name: /PAN/ })).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/PAN/);
  });

  it('when offered: explains, validates PAN/address/ack, and sends the opt-in', async () => {
    const user = userEvent.setup();
    const start = vi.fn(createMockDonateClient(0).start);
    renderAt(donate(true, start));
    const dialog = await toDetails(user);
    expect(within(dialog).getByText(t.taxExplain)).toBeVisible();
    expect(within(dialog).queryByRole('textbox', { name: /PAN/ })).toBeNull(); // only after ticking
    await user.click(within(dialog).getByLabelText(t.taxOpt));
    await expectNoA11yViolations(dialog);
    await user.type(within(dialog).getByRole('textbox', { name: /PAN/ }), 'ABCD1234F');
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(t.address) }), 'short');
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    expect(within(dialog).getByText(t.panError)).toBeVisible();
    expect(within(dialog).getByText(t.addressError)).toBeVisible();
    expect(within(dialog).getByText(t.taxAckError)).toBeVisible();
    const pan = within(dialog).getByRole('textbox', { name: /PAN/ });
    await user.clear(pan);
    await user.type(pan, 'abcde 1234 f');
    await user.type(
      within(dialog).getByRole('textbox', { name: new RegExp(t.address) }),
      ' street, Chennai 600001',
    );
    await user.click(within(dialog).getByLabelText(t.taxAck));
    await user.click(within(dialog).getByRole('button', { name: t.continue }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₹1,000 securely' }));
    await within(dialog).findByRole('heading', { name: t.thanks });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        taxOptIn: {
          pan: 'ABCDE1234F',
          address: 'short street, Chennai 600001',
          oldRegimeAck: true,
        },
      }),
      expect.any(String),
    );
    // The PAN is never kept in the browser's storage.
    expect(JSON.stringify(sessionStorage)).not.toContain('ABCDE');
  });

  it('strings exist in both languages', () => {
    for (const key of [
      'taxOpt',
      'taxExplain',
      'pan',
      'panError',
      'address',
      'addressError',
      'taxAck',
      'taxAckError',
    ] as const) {
      expect(DONATE_MESSAGES.ta[key].trim()).not.toBe('');
    }
  });
});

const ACTIVE: AdminSessionResponse = {
  stage: 'ACTIVE',
  user: { email: 'o@example.org', role: 'OWNER', locale: 'en' },
  csrfToken: 'c',
};
const OFF: TaxSettings = {
  taxBenefitEnabled: false,
  rnpoReference: null,
  section354Approval: null,
  approvalValidUntil: null,
  offeredNow: false,
};

function renderTax(api: Partial<AdminApi>) {
  const adminApi = {
    session: vi.fn(async () => ACTIVE),
    logout: vi.fn(),
    updatePreferences: vi.fn(),
    ...api,
  } as unknown as AdminApi;
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout api={adminApi} />,
        children: [
          {
            element: <RequireAdmin />,
            children: [
              { element: <AdminNav />, children: [{ path: 'tax', element: <TaxSettingsPage /> }] },
            ],
          },
        ],
      },
    ],
    { initialEntries: ['/admin/tax'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('admin tax settings', () => {
  it('shows "off" by default; saving needs a reason; switching on sends everything', async () => {
    const user = userEvent.setup();
    const updateTaxSettings = vi.fn(async () => ({
      taxBenefitEnabled: true,
      rnpoReference: 'R',
      section354Approval: 'A',
      approvalValidUntil: '2099-03-31',
      offeredNow: true,
    }));
    const { container } = renderTax({ taxSettings: vi.fn(async () => OFF), updateTaxSettings });
    expect(await screen.findByText(l.taxStateOff)).toBeVisible();
    await expectNoA11yViolations(container);
    await user.type(screen.getByLabelText(l.taxRnpo), 'RNPO-1');
    await user.type(screen.getByLabelText(l.taxApproval), 'APP-1');
    await user.type(screen.getByLabelText(l.taxValidUntil), '2099-03-31');
    await user.click(screen.getByLabelText(l.taxEnable));
    await user.click(screen.getByRole('button', { name: l.taxSave }));
    expect(screen.getByText(l.reasonError)).toBeVisible();
    await user.type(screen.getByLabelText(l.reason), 'CA confirmed in writing');
    await user.click(screen.getByRole('button', { name: l.taxSave }));
    expect(updateTaxSettings).toHaveBeenCalledWith({
      rnpoReference: 'RNPO-1',
      section354Approval: 'APP-1',
      approvalValidUntil: '2099-03-31',
      taxBenefitEnabled: true,
      reason: 'CA confirmed in writing',
    });
    expect(await screen.findByText(l.taxStateOn)).toBeVisible();
  });

  it('incomplete approval → clear message; other errors; load error → try again; client URLs', async () => {
    const user = userEvent.setup();
    const update = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('VALIDATION_ERROR'))
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'));
    const taxSettings = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue({ ...OFF, rnpoReference: 'R', approvalValidUntil: '2020-01-01' });
    renderTax({ taxSettings, updateTaxSettings: update });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await user.type(await screen.findByLabelText(l.reason), 'Trying to switch on');
    await user.click(screen.getByRole('button', { name: l.taxSave }));
    expect(await screen.findByText(l.taxIncomplete)).toBeVisible();
    await user.click(screen.getByRole('button', { name: l.taxSave }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent(l.taxIncomplete);
    const fetchImpl = vi.fn(
      async (_u: string | URL | Request, _i?: RequestInit) =>
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const client = createAdminApi('', fetchImpl);
    await client.taxSettings();
    await client.updateTaxSettings({ reason: 'x' });
    expect(fetchImpl.mock.calls.map((c) => [String(c[0]), c[1]?.method])).toEqual([
      ['/api/v1/admin/tax-settings', 'GET'],
      ['/api/v1/admin/tax-settings', 'PATCH'],
    ]);
  });
});
