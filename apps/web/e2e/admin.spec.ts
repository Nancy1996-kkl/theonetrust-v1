import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/guard.ts';

/**
 * Owner sign-in screens (#19) at all five viewports, with the API mocked in the browser
 * (the API's own access control is tested in apps/api). The auto bug detector checks overflow,
 * axe (incl. contrast), console and lang/title/h1/main after every test.
 */
const USER = { email: 'owner@example.org', role: 'OWNER', locale: 'en' };

async function mockApi(page: Page, firstStage: 'MFA_SETUP' | 'MFA_VERIFY') {
  let stage = 'SIGNED_OUT';
  await page.route('**/api/v1/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/auth', '');
    const reply = (body: unknown) => route.fulfill({ json: body });
    switch (path) {
      case '/session':
        return reply(stage === 'SIGNED_OUT' ? { stage } : { stage, user: USER, csrfToken: 'c' });
      case '/login':
        stage = firstStage;
        return reply({ stage, user: USER, csrfToken: 'c' });
      case '/mfa/setup':
        return reply({
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/Theonetrust.in:owner@example.org?secret=JBSWY3DPEHPK3PXP',
        });
      case '/mfa/enable':
        stage = 'ACTIVE';
        return reply({
          stage,
          user: USER,
          csrfToken: 'c',
          recoveryCodes: Array.from({ length: 10 }, (_, i) => `ABCDE-2345${i}`.slice(0, 11)),
        });
      case '/mfa/verify':
        stage = 'ACTIVE';
        return reply({ stage, user: USER, csrfToken: 'c' });
      case '/logout':
        stage = 'SIGNED_OUT';
        return route.fulfill({ status: 204 });
      default:
        return route.fulfill({ json: { stage: 'SIGNED_OUT' } });
    }
  });
}

async function mockAdminApi(page: Page) {
  await page.route('**/api/v1/admin/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/admin/audit-log') {
      return route.fulfill({
        json: {
          items: Array.from({ length: 3 }, (_, i) => ({
            id: `0000000${i}-0000-4000-8000-000000000000`,
            createdAt: `2026-11-0${i + 1}T10:30:00.000Z`,
            actorEmail: i === 2 ? null : 'owner@example.org',
            action: ['auth.mfa.verified', 'admin.preferences.update', 'auth.login.unknown_account'][
              i
            ],
            entityType: 'admin_user',
            entityId: i === 2 ? null : '22222222-2222-4222-8222-222222222222',
            reason: null,
            changedFields: i === 1 ? ['locale'] : [],
            correlationId: 'req',
          })),
          nextCursor: null,
        },
      });
    }
    if (path === '/api/v1/admin/bank-transfers') {
      return route.fulfill({
        json: {
          credits: [
            {
              id: 'c1',
              bankReference: 'UTR111111',
              amountPaise: 5_000_000,
              receivedOn: '2026-11-01',
              evidence: 'Synthetic statement line 1',
              status: 'REPORTED',
              donationReference: 'TOT-D-ABCDEFGHJKMN',
              createdAt: '2026-11-01T10:00:00Z',
            },
          ],
          awaiting: [],
          exceptions: [
            {
              id: 'x1',
              kind: 'UNMATCHED_CREDIT',
              bankTransferRecordId: null,
              createdAt: '2026-11-01T10:00:00Z',
            },
          ],
        },
      });
    }
    if (path.endsWith('/confirm')) return route.fulfill({ json: { status: 'MATCHED' } });
    if (path === '/api/v1/admin/team') {
      return route.fulfill({
        json: {
          users: [{ id: '22222222-2222-4222-8222-222222222222', email: 'owner@example.org' }],
        },
      });
    }
    const helpItem = {
      id: '11111111-1111-4111-8111-111111111111',
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
    if (path === '/api/v1/admin/help-requests') {
      return route.fulfill({ json: { items: [helpItem], nextCursor: null } });
    }
    if (path.startsWith('/api/v1/admin/help-requests/')) {
      if (route.request().method() === 'PATCH')
        return route.fulfill({ json: { ...helpItem, status: 'CONTACTED' } });
      return route.fulfill({
        json: {
          ...helpItem,
          forWhom: 'someone',
          description: 'Needs school books',
          phone: '+919876543210',
          personNameOrVillage: 'Thiruvallur',
          pageLanguage: 'en',
          notes: [],
          history: [
            {
              action: 'help_request.created',
              actorEmail: null,
              changedFields: [],
              reason: null,
              createdAt: helpItem.createdAt,
            },
          ],
        },
      });
    }
    return route.fulfill({ json: USER });
  });
}

async function signIn(page: Page) {
  await page.getByLabel('Email').fill('owner@example.org');
  await page.getByLabel('Password').fill('river mango lamp seventeen');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('/admin redirects a signed-out visitor to the sign-in page (noindex)', async ({ page }) => {
  await mockApi(page, 'MFA_VERIFY');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Owner sign in' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('first sign-in: authenticator setup and recovery codes, then the dashboard', async ({
  page,
}) => {
  await mockApi(page, 'MFA_SETUP');
  await page.goto('/admin/login');
  await signIn(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Set up your authenticator app' }),
  ).toBeVisible();
  await expect(page.getByLabel('Setup key')).toContainText('JBSW Y3DP');
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Save your recovery codes' }),
  ).toBeVisible();
  await page.getByLabel('I have saved these codes somewhere safe').check();
  await page.getByRole('button', { name: 'Go to the dashboard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('later sign-in with a code, then sign out', async ({ page }) => {
  await mockApi(page, 'MFA_VERIFY');
  await page.goto('/admin/login');
  await signIn(page);
  await page.getByLabel('6-digit code').fill('654321');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('Tamil sign-in page fits the viewport', async ({ page }) => {
  await mockApi(page, 'MFA_VERIFY');
  await page.goto('/admin/login');
  await page.getByRole('button', { name: 'தமிழ்' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'உரிமையாளர் உள்நுழைவு' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
});

test('audit log: read-only table with filters, fits every viewport', async ({ page }) => {
  await mockApi(page, 'MFA_VERIFY');
  await mockAdminApi(page);
  await page.goto('/admin/login');
  await signIn(page);
  await page.getByLabel('6-digit code').fill('654321');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Audit entries, newest first' });
  await expect(table).toContainText('Dashboard language changed');
  await expect(table).toContainText('System / unknown');
  await page.getByLabel('Type of event').selectOption('auth');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(table).toBeVisible();
});

test('help inbox: masked list, case detail and status update', async ({ page }) => {
  await mockApi(page, 'MFA_VERIFY');
  await mockAdminApi(page);
  await page.goto('/admin/login');
  await signIn(page);
  await page.getByLabel('6-digit code').fill('654321');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'Help requests' }).click();
  const table = page.getByRole('table', { name: 'Help requests, newest first' });
  await expect(table).toContainText('••••••3210');
  await expect(table).not.toContainText('9876543210');
  await page.getByRole('link', { name: /HLP-7K2M9Q/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'HLP-7K2M9Q' })).toBeVisible();
  await page.getByLabel('Status').selectOption('CONTACTED');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
});

test('bank transfers: confirm a credit with a reason and the retyped reference', async ({
  page,
}) => {
  await mockApi(page, 'MFA_VERIFY');
  await mockAdminApi(page);
  await page.goto('/admin/login');
  await signIn(page);
  await page.getByLabel('6-digit code').fill('654321');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'Bank transfers' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bank transfers' })).toBeVisible();
  await page.getByRole('button', { name: /Open UTR111111/ }).click();
  await page.getByLabel('Reason (kept in the audit log)').fill('Seen on the statement');
  await page.getByLabel('Type the donation reference again to confirm').fill('TOT-D-ABCDEFGHJKMN');
  await page.getByRole('button', { name: 'Confirm: mark donation paid' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
});
