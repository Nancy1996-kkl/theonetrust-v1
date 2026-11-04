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
  // The dashboard home loads the overview (#31); an empty one unless a test mocks more.
  await page.route('**/api/v1/admin/overview', (route) => {
    const zero = { grossPaise: 0, refundedPaise: 0, netPaise: 0, count: 0 };
    return route.fulfill({
      json: {
        today: zero,
        month: zero,
        lifetime: zero,
        pending: { count: 0, amountPaise: 0 },
        failed: { count: 0 },
        refunds: { count: 0, amountPaise: 0 },
        openExceptions: 0,
        stalePending: 0,
        manualReview: 0,
      },
    });
  });
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
    if (path === '/api/v1/admin/notifications') {
      return route.fulfill({
        json: {
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
          ],
          counts: { PENDING: 0, SENT: 1, FAILED: 1, CANCELLED: 0 },
          sendingEnabled: true,
        },
      });
    }
    if (path.endsWith('/retry')) return route.fulfill({ json: { id: 'n2', status: 'PENDING' } });
    // Owner ledger (#31)
    const zero = { grossPaise: 0, refundedPaise: 0, netPaise: 0, count: 0 };
    const item = {
      id: '33333333-3333-4333-8333-333333333333',
      reference: 'TOT-D-ABCDEFGHJKMN',
      createdAt: '2026-11-04T10:00:00Z',
      paidAt: null,
      amountPaise: 60_000,
      refundedPaise: 0,
      status: 'PENDING',
      channel: 'CHECKOUT',
      method: 'upi',
      programme: null,
      donorName: 'Synthetic Donor',
      receipt: null,
    };
    if (path === '/api/v1/admin/overview') {
      return route.fulfill({
        json: {
          today: { grossPaise: 200_000, refundedPaise: 50_000, netPaise: 150_000, count: 1 },
          month: zero,
          lifetime: zero,
          pending: { count: 1, amountPaise: 60_000 },
          failed: { count: 0 },
          refunds: { count: 0, amountPaise: 0 },
          openExceptions: 0,
          stalePending: 1,
          manualReview: 0,
        },
      });
    }
    if (path === '/api/v1/admin/donations') {
      return route.fulfill({ json: { items: [item], page: 1, pageSize: 25, total: 1 } });
    }
    if (path === `/api/v1/admin/donations/${item.id}/recheck`) {
      return route.fulfill({ json: { id: item.id, status: 'PAID', outcome: 'provider_captured' } });
    }
    if (path === `/api/v1/admin/donations/${item.id}`) {
      return route.fulfill({
        json: {
          ...item,
          giftPaise: 60_000,
          feePaise: 0,
          locale: 'en',
          donorEmailMasked: 'd•••@example.org',
          donorPhoneMasked: '••••••3210',
          wantsReceipt: false,
          hideNamePublicly: true,
          attempts: [],
          statusHistory: [],
          webhooks: [],
          bankTransfers: [],
          receipts: [],
          notifications: [],
          exceptions: [],
        },
      });
    }
    if (path === '/api/v1/admin/exceptions') {
      return route.fulfill({
        json: {
          staleAfterMinutes: 30,
          items: [
            {
              key: `STALE_PENDING:${item.id}`,
              kind: 'STALE_PENDING',
              exceptionId: null,
              donationId: item.id,
              reference: item.reference,
              amountPaise: 60_000,
              providerPaymentId: null,
              createdAt: '2026-11-04T08:00:00Z',
              actions: ['recheck'],
            },
          ],
        },
      });
    }
    if (path === '/api/v1/admin/subscriptions') {
      return route.fulfill({
        json: {
          items: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              reference: 'TOT-M-ABCDEFGHJKMN',
              amountPaise: 100_000,
              status: 'HALTED',
              methodRoute: 'upi_autopay',
              donorName: 'Synthetic Donor',
              createdAt: '2026-11-04T10:00:00Z',
              charges: 2,
              paidCharges: 1,
              lastChargeAt: '2026-11-04T10:00:00Z',
              openExceptions: 1,
            },
          ],
          page: 1,
          pageSize: 25,
          total: 1,
        },
      });
    }
    if (path === '/api/v1/admin/receipts') {
      return route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } });
    }
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

test('email delivery: sent and failed emails, send a failed one again', async ({ page }) => {
  await mockApi(page, 'MFA_VERIFY');
  await mockAdminApi(page);
  await page.goto('/admin/login');
  await signIn(page);
  await page.getByLabel('6-digit code').fill('654321');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'Email delivery' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Email delivery' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Emails, newest first' });
  await expect(table).toContainText('Donation verified');
  await expect(table).toContainText('http_503');
  await table.getByRole('button', { name: /Send again/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Queued again' })).toBeVisible();
});

test('owner ledger: overview → find a donation → re-check it with a reason; exceptions; receipts', async ({
  page,
}) => {
  await mockApi(page, 'MFA_VERIFY');
  await mockAdminApi(page);
  await page.goto('/admin/login');
  await signIn(page);
  await page.getByLabel('6-digit code').fill('654321');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Today' })).toBeVisible();
  await expect(page.getByText('₹1,500', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Donations', exact: true }).click();
  await page
    .getByLabel('Receipt number, reference, Razorpay ID or bank reference')
    .fill('TOT-D-ABCDEFGHJKMN');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page).toHaveURL(/q=TOT-D-ABCDEFGHJKMN/);
  await page.getByRole('link', { name: 'TOT-D-ABCDEFGHJKMN' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Donation TOT-D-ABCDEFGHJKMN' }),
  ).toBeVisible();
  await expect(page.getByText('d•••@example.org · ••••••3210')).toBeVisible();
  await page.getByLabel('Reason (kept in the audit log)').fill('Donor says it was paid');
  await page.getByRole('button', { name: 'Re-check with Razorpay' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Re-checked' })).toBeVisible();
  await page.getByRole('link', { name: 'Exceptions', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Open items, oldest problems first' }),
  ).toContainText('Pending too long');
  await page.getByRole('link', { name: 'Receipts', exact: true }).click();
  await expect(page.getByText('No acknowledgements yet.')).toBeVisible();
});

test('monthly giving: owner sees status from Razorpay, charges and problems', async ({ page }) => {
  await mockApi(page, 'MFA_VERIFY');
  await mockAdminApi(page);
  await page.goto('/admin/login');
  await signIn(page);
  await page.getByLabel('6-digit code').fill('654321');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'Monthly giving', exact: true }).click();
  const table = page.getByRole('table', { name: 'Monthly gifts, newest first' });
  await expect(table).toContainText('Halted (charges failed)');
  await expect(table).toContainText('1 / 2');
});
