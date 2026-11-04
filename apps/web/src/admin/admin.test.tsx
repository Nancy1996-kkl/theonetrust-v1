import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AdminSessionResponse } from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { AdminHomePage } from './AdminHomePage.tsx';
import { AdminLayout } from './AdminLayout.tsx';
import { AdminLoginPage } from './AdminLoginPage.tsx';
import { AdminNav } from './AdminNav.tsx';
import { AuditLogPage } from './AuditLogPage.tsx';
import { groupKey } from './admin-context.ts';
import { RequireAdmin } from './RequireAdmin.tsx';
import { AdminApiError, createAdminApi, type AdminApi } from './api.ts';
import { ADMIN_STRINGS } from './strings.ts';

const USER = { email: 'owner@example.org', role: 'OWNER' as const, locale: 'en' as const };
const ACTIVE: AdminSessionResponse = { stage: 'ACTIVE', user: USER, csrfToken: 't' };

const ZERO = { grossPaise: 0, refundedPaise: 0, netPaise: 0, count: 0 };
const OVERVIEW = {
  today: ZERO,
  month: ZERO,
  lifetime: ZERO,
  pending: { count: 0, amountPaise: 0 },
  failed: { count: 0 },
  refunds: { count: 0, amountPaise: 0 },
  openExceptions: 0,
  stalePending: 0,
  manualReview: 0,
};

function fakeApi(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    session: vi.fn(async () => ({ stage: 'SIGNED_OUT' }) as AdminSessionResponse),
    login: vi.fn(
      async () => ({ stage: 'MFA_VERIFY', user: USER, csrfToken: 't' }) as AdminSessionResponse,
    ),
    mfaSetup: vi.fn(async () => ({
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
    })),
    mfaEnable: vi.fn(async () => ({ ...ACTIVE, recoveryCodes: ['ABCDE-23456', 'FGHJK-78923'] })),
    mfaVerify: vi.fn(async () => ACTIVE),
    logout: vi.fn(async () => undefined),
    updatePreferences: vi.fn(async (locale: 'ta' | 'en') => ({ ...USER, locale })),
    auditLog: vi.fn(async () => ({ items: [], nextCursor: null })),
    helpCases: vi.fn(async () => ({ items: [], nextCursor: null })),
    helpCase: vi.fn(async () => Promise.reject(new AdminApiError('NOT_FOUND'))),
    updateHelpCase: vi.fn(async () => Promise.reject(new AdminApiError('NOT_FOUND'))),
    addHelpNote: vi.fn(async () => ({ id: 'n' })),
    team: vi.fn(async () => ({ users: [] })),
    helpExportUrl: vi.fn(() => '/api/v1/admin/help-requests/export.csv'),
    bankTransfers: vi.fn(async () => ({ credits: [], awaiting: [], exceptions: [] })),
    recordBankCredit: vi.fn(),
    confirmBankCredit: vi.fn(),
    rejectBankCredit: vi.fn(),
    resolveException: vi.fn(),
    notifications: vi.fn(async () => ({
      items: [],
      counts: { PENDING: 0, SENT: 0, FAILED: 0, CANCELLED: 0 },
      sendingEnabled: true,
    })),
    retryNotification: vi.fn(),
    overview: vi.fn(async () => OVERVIEW),
    donations: vi.fn(async () => ({ items: [], page: 1, pageSize: 25, total: 0 })),
    donation: vi.fn(async () => Promise.reject(new AdminApiError('NOT_FOUND'))),
    recheckDonation: vi.fn(),
    donationsExportUrl: vi.fn(() => '/api/v1/admin/donations/export.csv'),
    exceptionQueue: vi.fn(async () => ({ items: [], staleAfterMinutes: 30 })),
    receipts: vi.fn(async () => ({ items: [], page: 1, pageSize: 25, total: 0 })),
    resendReceipt: vi.fn(),
    receiptPdfUrl: vi.fn(() => '#'),
    ...overrides,
  };
}

function renderAdmin(path: string, api: AdminApi) {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout api={api} />,
        children: [
          { path: 'login', element: <AdminLoginPage /> },
          {
            element: <RequireAdmin />,
            children: [
              {
                element: <AdminNav />,
                children: [
                  { index: true, element: <AdminHomePage /> },
                  { path: 'audit-log', element: <AuditLogPage /> },
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

const t = ADMIN_STRINGS.en;

describe('admin strings', () => {
  it('have every key in Tamil and English, non-empty', () => {
    const en = Object.keys(ADMIN_STRINGS.en).sort();
    expect(Object.keys(ADMIN_STRINGS.ta).sort()).toEqual(en);
    for (const lang of ['en', 'ta'] as const) {
      for (const value of Object.values(ADMIN_STRINGS[lang])) expect(value.trim()).not.toBe('');
    }
  });
});

describe('route guard', () => {
  it('sends a signed-out visitor from /admin to the login page', async () => {
    const { router } = renderAdmin('/admin', fakeApi());
    expect(await screen.findByRole('heading', { level: 1, name: t.signInTitle })).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/login');
  });

  it('does not show the dashboard to a password-only session (MFA pending)', async () => {
    const api = fakeApi({
      session: vi.fn(
        async () => ({ stage: 'MFA_VERIFY', user: USER, csrfToken: 't' }) as AdminSessionResponse,
      ),
    });
    const { router } = renderAdmin('/admin', api);
    expect(await screen.findByRole('heading', { level: 1, name: t.verifyTitle })).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/login');
  });

  it('treats a failed session check as signed out', async () => {
    const api = fakeApi({
      session: vi.fn(async () => Promise.reject(new AdminApiError('NETWORK_ERROR'))),
    });
    renderAdmin('/admin', api);
    expect(await screen.findByRole('heading', { name: t.signInTitle })).toBeVisible();
  });

  it('shows the dashboard to a fully signed-in owner, marked noindex', async () => {
    renderAdmin('/admin', fakeApi({ session: vi.fn(async () => ACTIVE) }));
    expect(await screen.findByRole('heading', { level: 1, name: t.overviewTitle })).toBeVisible();
    expect(screen.getByText(USER.email)).toBeVisible();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    );
  });

  it('sends an active owner away from the login page', async () => {
    const { router } = renderAdmin('/admin/login', fakeApi({ session: vi.fn(async () => ACTIVE) }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
  });
});

describe('first sign-in: enrol the authenticator (cannot be skipped)', () => {
  it('password → setup key → code → recovery codes → dashboard', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      login: vi.fn(
        async () =>
          ({ stage: 'MFA_SETUP', user, csrfToken: 't' }) as unknown as AdminSessionResponse,
      ),
    });
    const { router, container } = renderAdmin('/admin/login', api);
    await user.type(await screen.findByLabelText(t.email, { exact: false }), ' owner@example.org ');
    await user.type(
      screen.getByLabelText(t.password, { exact: false }),
      'river mango lamp seventeen',
    );
    await user.click(screen.getByRole('button', { name: t.signIn }));
    expect(api.login).toHaveBeenCalledWith('owner@example.org', 'river mango lamp seventeen');

    expect(await screen.findByRole('heading', { level: 1, name: t.setupTitle })).toHaveFocus();
    expect(await screen.findByLabelText(t.setupKeyLabel)).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    expect(screen.getByRole('link', { name: t.setupOpenApp })).toHaveAttribute(
      'href',
      expect.stringMatching(/^otpauth:/),
    );
    await expectNoA11yViolations(container);

    await user.type(screen.getByLabelText(t.code, { exact: false }), '12a');
    await user.click(screen.getByRole('button', { name: t.continue }));
    expect(screen.getByText(t.errorCodeFormat)).toBeVisible();
    expect(api.mfaEnable).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(t.code, { exact: false }));
    await user.type(screen.getByLabelText(t.code, { exact: false }), '123456');
    await user.click(screen.getByRole('button', { name: t.continue }));
    expect(api.mfaEnable).toHaveBeenCalledWith('123456');

    expect(await screen.findByRole('heading', { level: 1, name: t.recoveryTitle })).toBeVisible();
    expect(screen.getByRole('list', { name: t.recoveryListLabel })).toHaveTextContent(
      'ABCDE-23456',
    );
    await user.click(screen.getByRole('button', { name: t.goToDashboard }));
    expect(screen.getByText(t.errorRequired)).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/login');
    await user.click(screen.getByLabelText(t.recoverySaved));
    await user.click(screen.getByRole('button', { name: t.goToDashboard }));
    expect(await screen.findByRole('heading', { level: 1, name: t.overviewTitle })).toBeVisible();
  });

  it('a wrong setup code shows the error and stays on the step', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      session: vi.fn(
        async () => ({ stage: 'MFA_SETUP', user: USER, csrfToken: 't' }) as AdminSessionResponse,
      ),
      mfaEnable: vi.fn(async () => Promise.reject(new AdminApiError('INVALID_CODE'))),
    });
    renderAdmin('/admin/login', api);
    await user.type(await screen.findByLabelText(t.code, { exact: false }), '000000');
    await user.click(screen.getByRole('button', { name: t.continue }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorInvalidCode);
    expect(screen.getByRole('heading', { level: 1, name: t.setupTitle })).toBeVisible();
  });
});

describe('later sign-ins', () => {
  it('password → authenticator code → dashboard', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    renderAdmin('/admin/login', api);
    await user.type(await screen.findByLabelText(t.email, { exact: false }), 'owner@example.org');
    await user.type(screen.getByLabelText(t.password, { exact: false }), 'pw');
    await user.click(screen.getByRole('button', { name: t.signIn }));
    await user.type(await screen.findByLabelText(t.code, { exact: false }), '654321');
    await user.click(screen.getByRole('button', { name: t.continue }));
    expect(api.mfaVerify).toHaveBeenCalledWith('654321');
    expect(await screen.findByRole('heading', { level: 1, name: t.overviewTitle })).toBeVisible();
  });

  it('can switch to a recovery code and back', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      session: vi.fn(
        async () => ({ stage: 'MFA_VERIFY', user: USER, csrfToken: 't' }) as AdminSessionResponse,
      ),
    });
    renderAdmin('/admin/login', api);
    await user.click(await screen.findByRole('button', { name: t.useRecovery }));
    const field = screen.getByLabelText(t.recoveryCode, { exact: false });
    await user.type(field, 'short');
    await user.click(screen.getByRole('button', { name: t.continue }));
    expect(screen.getByText(t.errorRequired)).toBeVisible();
    await user.clear(field);
    await user.type(field, 'abcde-23456');
    await user.click(screen.getByRole('button', { name: t.continue }));
    expect(api.mfaVerify).toHaveBeenCalledWith('abcde-23456');
    await screen.findByRole('heading', { name: t.overviewTitle });
  });

  it('the recovery toggle can go back to the app code', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      session: vi.fn(
        async () => ({ stage: 'MFA_VERIFY', user: USER, csrfToken: 't' }) as AdminSessionResponse,
      ),
    });
    renderAdmin('/admin/login', api);
    await user.click(await screen.findByRole('button', { name: t.useRecovery }));
    await user.click(screen.getByRole('button', { name: t.useApp }));
    expect(screen.getByLabelText(t.code, { exact: false })).toBeVisible();
  });

  it.each([
    ['INVALID_CREDENTIALS', t.errorInvalidCredentials],
    ['RATE_LIMITED', t.errorRateLimited],
    ['SERVICE_UNAVAILABLE', t.errorUnavailable],
    ['NETWORK_ERROR', t.errorNetwork],
    ['INTERNAL_ERROR', t.errorGeneric],
  ] as const)('shows %s as a plain-language alert', async (code, message) => {
    const user = userEvent.setup();
    const api = fakeApi({ login: vi.fn(async () => Promise.reject(new AdminApiError(code))) });
    renderAdmin('/admin/login', api);
    await user.type(await screen.findByLabelText(t.email, { exact: false }), 'a@b.co');
    await user.type(screen.getByLabelText(t.password, { exact: false }), 'pw');
    await user.click(screen.getByRole('button', { name: t.signIn }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('asks for both fields before calling the API', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    renderAdmin('/admin/login', api);
    await user.click(await screen.findByRole('button', { name: t.signIn }));
    expect(screen.getAllByText(t.errorRequired)).toHaveLength(2);
    expect(api.login).not.toHaveBeenCalled();
  });

  it('an expired half-session goes back to the password step', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      session: vi.fn(
        async () => ({ stage: 'MFA_VERIFY', user: USER, csrfToken: 't' }) as AdminSessionResponse,
      ),
      mfaVerify: vi.fn(async () => Promise.reject(new AdminApiError('UNAUTHORIZED'))),
    });
    renderAdmin('/admin/login', api);
    await user.type(await screen.findByLabelText(t.code, { exact: false }), '111111');
    await user.click(screen.getByRole('button', { name: t.continue }));
    expect(await screen.findByRole('heading', { level: 1, name: t.signInTitle })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(t.errorExpired);
  });

  it('a non-API failure during setup still shows a safe message', async () => {
    const api = fakeApi({
      session: vi.fn(
        async () => ({ stage: 'MFA_SETUP', user: USER, csrfToken: 't' }) as AdminSessionResponse,
      ),
      mfaSetup: vi.fn(async () => Promise.reject(new Error('boom'))),
    });
    renderAdmin('/admin/login', api);
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorGeneric);
  });
});

describe('dashboard shell', () => {
  it('signs out (even if the request fails) and returns to the login page', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      session: vi.fn(async () => ACTIVE),
      logout: vi.fn(async () => Promise.reject(new AdminApiError('NETWORK_ERROR'))),
    });
    const { router } = renderAdmin('/admin', api);
    await user.click(await screen.findByRole('button', { name: t.signOut }));
    expect(api.logout).toHaveBeenCalled();
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'));
  });

  it('switches the dashboard to Tamil', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/login', fakeApi());
    await user.click(await screen.findByRole('button', { name: 'தமிழ்' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: ADMIN_STRINGS.ta.signInTitle }),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe('ta');
    await user.click(screen.getByRole('button', { name: 'English' }));
  });
});

describe('groupKey', () => {
  it('groups in fours', () => {
    expect(groupKey('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
    expect(groupKey('ABCD')).toBe('ABCD');
  });
});

describe('createAdminApi', () => {
  it('builds audit-log and preference requests', async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    );
    const api = createAdminApi('', fetchImpl);
    await api.auditLog({ action: 'auth', from: '' }, 'c1');
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      '/api/v1/admin/audit-log?action=auth&cursor=c1&limit=50',
    );
    await api.updatePreferences('ta');
    expect(fetchImpl.mock.calls[1]![1]).toMatchObject({ method: 'PATCH', body: '{"locale":"ta"}' });
  });

  function json(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('sends cookies, and the CSRF token it was given on later POSTs', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json(200, { stage: 'MFA_VERIFY', csrfToken: 'csrf-1' }),
    );
    const api = createAdminApi('https://api.example', fetchImpl);
    await api.login('a@b.co', 'pw');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example/api/v1/auth/login');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(new Headers(init?.headers).get('x-csrf-token')).toBeNull();
    await api.mfaVerify('123456');
    expect(new Headers(fetchImpl.mock.calls[1]![1]?.headers).get('x-csrf-token')).toBe('csrf-1');
    await api.session();
    expect(new Headers(fetchImpl.mock.calls[2]![1]?.headers).get('x-csrf-token')).toBeNull();
  });

  it('maps API errors to their code, unknown ones to INTERNAL_ERROR', async () => {
    const api = createAdminApi(
      '',
      vi.fn(async () => json(401, { error: { code: 'INVALID_CODE' } })),
    );
    await expect(api.mfaVerify('1')).rejects.toMatchObject({ code: 'INVALID_CODE' });
    const odd = createAdminApi(
      '',
      vi.fn(async () => new Response('<html>', { status: 502 })),
    );
    await expect(odd.session()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('reports network failures as NETWORK_ERROR and handles 204 logout', async () => {
    const down = createAdminApi(
      '',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(down.session()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    const ok = createAdminApi(
      '',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(ok.logout()).resolves.toBeUndefined();
  });

  it('calls the other endpoints', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { secret: 'S', otpauthUri: 'otpauth://x', recoveryCodes: [] }),
    );
    const api = createAdminApi('', fetchImpl);
    await api.mfaSetup();
    await api.mfaEnable('123456');
    expect(fetchImpl.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      '/api/v1/auth/mfa/setup',
      '/api/v1/auth/mfa/enable',
    ]);
  });
});

const ENTRY = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-11-03T10:30:00.000Z',
  actorEmail: USER.email,
  action: 'admin.preferences.update',
  entityType: 'admin_user',
  entityId: '22222222-2222-4222-8222-222222222222',
  reason: null,
  changedFields: ['locale'],
  correlationId: 'req-1',
};

describe('audit log page', () => {
  it('lists entries with plain-language actions, IST time and field names', async () => {
    const api = fakeApi({
      session: vi.fn(async () => ACTIVE),
      auditLog: vi.fn(async () => ({
        items: [
          ENTRY,
          {
            ...ENTRY,
            id: 'e2',
            actorEmail: null,
            action: 'custom.thing',
            entityId: null,
            changedFields: [],
            reason: 'checked',
          },
        ],
        nextCursor: null,
      })),
    });
    const { container } = renderAdmin('/admin/audit-log', api);
    expect(await screen.findByRole('heading', { level: 1, name: t.auditTitle })).toBeVisible();
    const table = await screen.findByRole('table', { name: t.auditCaption });
    expect(table).toHaveTextContent('Dashboard language changed');
    expect(table).toHaveTextContent('3 Nov 2026');
    expect(table).toHaveTextContent('locale');
    expect(table).toHaveTextContent(t.auditSystem);
    expect(table).toHaveTextContent('custom.thing');
    expect(table).toHaveTextContent('checked');
    expect(screen.getByRole('link', { name: t.navAuditLog })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoA11yViolations(container);
  });

  it('applies filters (IST day range, inclusive end date) and pages with "show older"', async () => {
    const user = userEvent.setup();
    const auditLog = vi
      .fn()
      .mockResolvedValueOnce({ items: [ENTRY], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [{ ...ENTRY, id: 'old' }], nextCursor: null })
      .mockResolvedValue({ items: [], nextCursor: null });
    renderAdmin('/admin/audit-log', fakeApi({ session: vi.fn(async () => ACTIVE), auditLog }));
    await user.click(await screen.findByRole('button', { name: t.auditLoadMore }));
    expect(auditLog).toHaveBeenLastCalledWith({}, 'c1');
    expect(await screen.findAllByRole('row')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: t.auditLoadMore })).toBeNull();

    await user.selectOptions(screen.getByLabelText(t.auditAction), 'auth');
    await user.type(screen.getByLabelText(t.auditFrom), '2026-11-01');
    await user.type(screen.getByLabelText(t.auditTo), '2026-11-03');
    await user.click(screen.getByRole('button', { name: t.auditApply }));
    expect(auditLog).toHaveBeenLastCalledWith({
      action: 'auth',
      from: '2026-10-31T18:30:00.000Z',
      to: '2026-11-03T18:30:00.000Z',
    });
    expect(await screen.findByText(t.auditEmpty)).toBeVisible();
  });

  it('shows an error with retry', async () => {
    const user = userEvent.setup();
    const auditLog = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValue({ items: [ENTRY], nextCursor: null });
    renderAdmin('/admin/audit-log', fakeApi({ session: vi.fn(async () => ACTIVE), auditLog }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorNetwork);
    await user.click(screen.getByRole('button', { name: t.retry }));
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('a failed "show older" shows the error', async () => {
    const user = userEvent.setup();
    const auditLog = vi
      .fn()
      .mockResolvedValueOnce({ items: [ENTRY], nextCursor: 'c1' })
      .mockRejectedValueOnce(new Error('boom'));
    renderAdmin('/admin/audit-log', fakeApi({ session: vi.fn(async () => ACTIVE), auditLog }));
    await user.click(await screen.findByRole('button', { name: t.auditLoadMore }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errorGeneric);
  });
});

describe('dashboard language is saved to the account', () => {
  it('uses the account language on load and saves a change', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      session: vi.fn(async () => ({ ...ACTIVE, user: { ...USER, locale: 'ta' as const } })),
    });
    renderAdmin('/admin', api);
    expect(
      await screen.findByRole('heading', { level: 1, name: ADMIN_STRINGS.ta.overviewTitle }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(api.updatePreferences).toHaveBeenCalledWith('en');
  });

  it('does not call the API when signed out, and ignores a failed save', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    renderAdmin('/admin/login', api);
    await user.click(await screen.findByRole('button', { name: 'தமிழ்' }));
    expect(api.updatePreferences).not.toHaveBeenCalled();
    const failing = fakeApi({
      session: vi.fn(async () => ACTIVE),
      updatePreferences: vi.fn(async () => Promise.reject(new AdminApiError('NETWORK_ERROR'))),
    });
    renderAdmin('/admin', failing);
    await user.click((await screen.findAllByRole('button', { name: 'தமிழ்' })).at(-1)!);
    expect(failing.updatePreferences).toHaveBeenCalled();
  });
});

describe('audit helpers', () => {
  it('converts dates to IST day boundaries and rejects bad input', async () => {
    const { istDayStart, auditActionLabel } = await import('./audit-labels.ts');
    expect(istDayStart('2026-04-01')).toBe('2026-03-31T18:30:00.000Z');
    expect(istDayStart('2026-04-01', 1)).toBe('2026-04-01T18:30:00.000Z');
    expect(istDayStart('')).toBeUndefined();
    expect(auditActionLabel('auth.logout', 'ta')).toBe('வெளியேறினார்');
    expect(auditActionLabel('x.y', 'en')).toBe('x.y');
  });
});

describe('help inbox API client', () => {
  it('builds inbox requests and the export link', async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ items: [], nextCursor: null, users: [], id: 'n' }), {
          status: 200,
        }),
    );
    const api = createAdminApi('https://api.example/api/v1', fetchImpl);
    await api.helpCases({ status: 'NEW' }, 'c1');
    await api.helpCase('a b');
    await api.updateHelpCase('id1', { status: 'CLOSED' });
    await api.addHelpNote('id1', 'note');
    await api.team();
    expect(fetchImpl.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ['https://api.example/api/v1/admin/help-requests?status=NEW&cursor=c1', 'GET'],
      ['https://api.example/api/v1/admin/help-requests/a%20b', 'GET'],
      ['https://api.example/api/v1/admin/help-requests/id1', 'PATCH'],
      ['https://api.example/api/v1/admin/help-requests/id1/notes', 'POST'],
      ['https://api.example/api/v1/admin/team', 'GET'],
    ]);
    expect(api.helpExportUrl({ language: 'ta' })).toBe(
      'https://api.example/api/v1/admin/help-requests/export.csv?language=ta',
    );
  });
});
