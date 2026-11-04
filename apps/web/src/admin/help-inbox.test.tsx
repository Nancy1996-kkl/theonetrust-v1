import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminSessionResponse,
  HelpCaseDetail,
  HelpCaseListItem,
} from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { AdminLayout } from './AdminLayout.tsx';
import { AdminNav } from './AdminNav.tsx';
import { HelpInboxPage } from './HelpInboxPage.tsx';
import { HelpRequestPage } from './HelpRequestPage.tsx';
import { RequireAdmin } from './RequireAdmin.tsx';
import { AdminApiError, type AdminApi } from './api.ts';
import { ADMIN_STRINGS } from './strings.ts';

const t = ADMIN_STRINGS.en;
const USER = { email: 'owner@example.org', role: 'OWNER' as const, locale: 'en' as const };
const ACTIVE: AdminSessionResponse = { stage: 'ACTIVE', user: USER, csrfToken: 'c' };
const ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';

const ITEM: HelpCaseListItem = {
  id: ID,
  reference: 'HLP-7K2M9Q',
  createdAt: '2026-11-03T05:00:00.000Z',
  kind: 'FULL',
  status: 'NEW',
  helpTypes: ['education', 'food'],
  callLanguage: 'ta',
  bestTime: 'evening',
  phoneMasked: '••••••3210',
  assigneeEmail: null,
  remindOn: null,
};

const DETAIL: HelpCaseDetail = {
  ...ITEM,
  forWhom: 'someone',
  description: 'Needs school books',
  phone: '+919876543210',
  personNameOrVillage: 'Thiruvallur',
  pageLanguage: 'en',
  notes: [
    {
      id: 'n1',
      body: 'Called once',
      authorEmail: USER.email,
      createdAt: '2026-11-03T06:00:00.000Z',
    },
  ],
  history: [
    {
      action: 'help_request.created',
      actorEmail: null,
      changedFields: [],
      reason: null,
      createdAt: ITEM.createdAt,
    },
    {
      action: 'help_request.status_changed',
      actorEmail: USER.email,
      changedFields: ['status'],
      reason: 'Called',
      createdAt: '2026-11-03T06:00:00.000Z',
    },
  ],
};

function api(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    session: vi.fn(async () => ACTIVE),
    login: vi.fn(),
    mfaSetup: vi.fn(),
    mfaEnable: vi.fn(),
    mfaVerify: vi.fn(),
    logout: vi.fn(async () => undefined),
    updatePreferences: vi.fn(async () => USER),
    auditLog: vi.fn(async () => ({ items: [], nextCursor: null })),
    helpCases: vi.fn(async () => ({ items: [ITEM], nextCursor: null })),
    helpCase: vi.fn(async () => DETAIL),
    updateHelpCase: vi.fn(async () => ITEM),
    addHelpNote: vi.fn(async () => ({ id: 'n2' })),
    team: vi.fn(async () => ({ users: [{ id: OWNER_ID, email: USER.email }] })),
    helpExportUrl: vi.fn(
      (f) =>
        `/api/v1/admin/help-requests/export.csv?${new URLSearchParams(f as Record<string, string>)}`,
    ),
    bankTransfers: vi.fn(async () => ({ credits: [], awaiting: [], exceptions: [] })),
    recordBankCredit: vi.fn(),
    confirmBankCredit: vi.fn(),
    rejectBankCredit: vi.fn(),
    resolveException: vi.fn(),
    ...overrides,
  } as AdminApi;
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
                  { path: 'help-requests', element: <HelpInboxPage /> },
                  { path: 'help-requests/:id', element: <HelpRequestPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

describe('help inbox', () => {
  it('lists cases with masked phones, labels and a masked CSV link', async () => {
    const { container } = renderAt('/admin/help-requests', api());
    const table = await screen.findByRole('table', { name: t.helpCaption });
    expect(table).toHaveTextContent('HLP-7K2M9Q');
    expect(table).toHaveTextContent('••••••3210');
    expect(table).not.toHaveTextContent('9876543210');
    expect(table).toHaveTextContent('Education, Food');
    expect(within(table).getByText('New')).toBeVisible();
    expect(screen.getByRole('link', { name: t.helpExport })).toHaveAttribute('download');
    expect(screen.getByRole('link', { name: t.navHelp })).toHaveAttribute('aria-current', 'page');
    await expectNoA11yViolations(container);
  });

  it('filters and pages', async () => {
    const user = userEvent.setup();
    const helpCases = vi
      .fn()
      .mockResolvedValueOnce({ items: [ITEM], nextCursor: 'c1' })
      .mockResolvedValueOnce({
        items: [{ ...ITEM, id: 'x2', reference: 'HLP-OLD1', kind: 'CALLBACK', helpTypes: [] }],
        nextCursor: null,
      })
      .mockResolvedValue({ items: [], nextCursor: null });
    const adminApi = api({ helpCases });
    renderAt('/admin/help-requests', adminApi);
    await user.click(await screen.findByRole('button', { name: t.auditLoadMore }));
    expect(helpCases).toHaveBeenLastCalledWith({}, 'c1');
    expect(await screen.findByText('HLP-OLD1')).toBeVisible();
    expect(screen.getByRole('table')).toHaveTextContent(t.helpKindCallback);

    await user.selectOptions(screen.getByLabelText(t.helpStatus), 'CONTACTED');
    await user.selectOptions(screen.getByLabelText(t.helpType), 'health');
    await user.selectOptions(screen.getByLabelText(t.helpLanguage), 'ta');
    await user.selectOptions(screen.getByLabelText(t.helpKind), 'FULL');
    await user.selectOptions(screen.getByLabelText(t.helpKind), '');
    await user.click(screen.getByRole('button', { name: t.auditApply }));
    expect(helpCases).toHaveBeenLastCalledWith({
      status: 'CONTACTED',
      helpType: 'health',
      language: 'ta',
    });
    expect(await screen.findByText(t.helpEmpty)).toBeVisible();
    expect(screen.getByRole('link', { name: t.helpExport }).getAttribute('href')).toContain(
      'status=CONTACTED',
    );
  });

  it('shows an error with retry, and a failed "show older"', async () => {
    const user = userEvent.setup();
    const helpCases = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValueOnce({ items: [ITEM], nextCursor: 'c1' })
      .mockRejectedValueOnce(new Error('boom'));
    renderAt('/admin/help-requests', api({ helpCases }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorNetwork);
    await user.click(screen.getByRole('button', { name: t.retry }));
    await user.click(await screen.findByRole('button', { name: t.auditLoadMore }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorGeneric);
  });
});

describe('one help request', () => {
  it('shows the full details, notes and history, and a call link', async () => {
    const { container } = renderAt(`/admin/help-requests/${ID}`, api());
    expect(await screen.findByRole('heading', { level: 1, name: 'HLP-7K2M9Q' })).toBeVisible();
    expect(screen.getByText(/\+919876543210/)).toBeVisible();
    expect(screen.getByRole('link', { name: t.helpCallNow })).toHaveAttribute(
      'href',
      'tel:+919876543210',
    );
    expect(screen.getByText('Needs school books')).toBeVisible();
    expect(screen.getByText('Thiruvallur')).toBeVisible();
    expect(screen.getByText('Called once')).toBeVisible();
    expect(screen.getByText(/Help request status changed \(status\) — Called/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('saves status, assignee, reminder and reason, then reloads', async () => {
    const user = userEvent.setup();
    const adminApi = api();
    renderAt(`/admin/help-requests/${ID}`, adminApi);
    await user.selectOptions(await screen.findByLabelText(t.helpStatus), 'CONTACTED');
    await user.selectOptions(screen.getByLabelText(t.helpAssignee), OWNER_ID);
    await user.type(screen.getByLabelText(t.helpRemind), '2026-11-10');
    await user.type(screen.getByLabelText(t.helpReason), '  Will visit  ');
    await user.click(screen.getByRole('button', { name: t.helpSave }));
    expect(adminApi.updateHelpCase).toHaveBeenCalledWith(ID, {
      status: 'CONTACTED',
      assigneeId: OWNER_ID,
      remindOn: '2026-11-10',
      reason: 'Will visit',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(t.helpSaved);
    await waitFor(() => expect(adminApi.helpCase).toHaveBeenCalledTimes(2));
  });

  it('can unassign and clear the reminder', async () => {
    const user = userEvent.setup();
    const adminApi = api({
      helpCase: vi.fn(async () => ({
        ...DETAIL,
        assigneeEmail: USER.email,
        remindOn: '2026-11-10',
      })),
    });
    renderAt(`/admin/help-requests/${ID}`, adminApi);
    await user.selectOptions(await screen.findByLabelText(t.helpAssignee), 'none');
    await user.clear(screen.getByLabelText(t.helpRemind));
    await user.click(screen.getByRole('button', { name: t.helpSave }));
    expect(adminApi.updateHelpCase).toHaveBeenCalledWith(ID, {
      status: 'NEW',
      assigneeId: null,
      remindOn: null,
    });
  });

  it('adds a private note (ignores an empty one)', async () => {
    const user = userEvent.setup();
    const adminApi = api();
    renderAt(`/admin/help-requests/${ID}`, adminApi);
    await user.click(await screen.findByRole('button', { name: t.helpAddNote }));
    expect(adminApi.addHelpNote).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(t.helpNoteLabel), 'Visited today');
    await user.click(screen.getByRole('button', { name: t.helpAddNote }));
    expect(adminApi.addHelpNote).toHaveBeenCalledWith(ID, 'Visited today');
    await waitFor(() => expect(screen.getByLabelText(t.helpNoteLabel)).toHaveValue(''));
  });

  it('shows a save error', async () => {
    const user = userEvent.setup();
    const adminApi = api({
      updateHelpCase: vi.fn(async () => Promise.reject(new AdminApiError('CSRF_FAILED'))),
    });
    renderAt(`/admin/help-requests/${ID}`, adminApi);
    await user.click(await screen.findByRole('button', { name: t.helpSave }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorGeneric);
  });

  it('a call-back case shows only what it has; load failure offers retry', async () => {
    const user = userEvent.setup();
    const helpCase = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue({
        ...DETAIL,
        kind: 'CALLBACK',
        helpTypes: [],
        forWhom: null,
        description: null,
        personNameOrVillage: null,
        bestTime: null,
        notes: [],
        callLanguage: 'en',
        pageLanguage: 'ta',
      });
    renderAt(`/admin/help-requests/${ID}`, api({ helpCase }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorGeneric);
    await user.click(screen.getByRole('button', { name: t.retry }));
    expect(await screen.findByText(t.helpNotesEmpty)).toBeVisible();
    expect(screen.getAllByText(t.helpKindCallback).length).toBeGreaterThan(0);
    expect(screen.queryByText(t.helpDescription)).toBeNull();
  });
});
