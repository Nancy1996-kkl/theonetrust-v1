import type { Page } from '@playwright/test';
import { signedInOwner } from './fixtures/admin-mock.ts';
import { expect, test } from './fixtures/guard.ts';
import { TAMIL_SPECIMEN } from './fixtures/tamil-specimen.ts';

/**
 * Visual baselines (#37): key screens and states in English and Tamil at all five viewports
 * (360, 390, 768, 1366, 1440). The auto bug detector still runs after every screenshot, so each
 * state is also checked by axe (WCAG 2.2 AA), for overflow and for console errors.
 */
const MOCK_RECEIPT = 'M'.repeat(43);
const UNKNOWN_RECEIPT = 'U'.repeat(43);
const LONG_TA =
  'உறுதிப்படுத்தப்பட்டுக்கொண்டிருக்கின்றனவாகியிருக்கின்றன — கல்வி, உணவு மற்றும் அத்தியாவசியப் பொருட்கள்';

async function settle(page: Page) {
  // Load every declared face, not only those already used: a heading just below the fold
  // otherwise switches font mid-screenshot (seen with Noto Serif Tamil).
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => undefined)));
    await document.fonts.ready;
  });
  // Two frames so late layout (fonts, sticky header) has finished.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

const prefix = (lang: 'en' | 'ta') => (lang === 'ta' ? '/ta' : '');

for (const lang of ['en', 'ta'] as const) {
  test.describe(`public screens (${lang})`, () => {
    test(`home, top of page (${lang})`, async ({ page }) => {
      await page.goto(`${prefix(lang)}/`);
      await settle(page);
      await expect(page).toHaveScreenshot(`home-${lang}.png`);
    });

    test(`privacy policy (${lang})`, async ({ page }) => {
      await page.goto(`${prefix(lang)}/privacy`);
      await settle(page);
      await expect(page).toHaveScreenshot(`privacy-${lang}.png`);
    });

    test(`not found (${lang})`, async ({ page }) => {
      await page.goto(`${prefix(lang)}/missing-page`);
      await settle(page);
      await expect(page).toHaveScreenshot(`not-found-${lang}.png`);
    });

    test(`donate panel, first step (${lang})`, async ({ page }) => {
      await page.goto(`${prefix(lang)}/#donate`);
      await expect(page.getByRole('dialog')).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`donate-${lang}.png`);
    });

    test(`acknowledgement (${lang})`, async ({ page }) => {
      await page.goto(`${prefix(lang)}/receipt/${MOCK_RECEIPT}`);
      await expect(page.locator('article.receipt')).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`receipt-${lang}.png`);
    });

    test(`acknowledgement not found — error state (${lang})`, async ({ page }) => {
      await page.goto(`${prefix(lang)}/receipt/${UNKNOWN_RECEIPT}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`receipt-not-found-${lang}.png`);
    });
  });
}

test('long Tamil text specimen (ta)', async ({ page }) => {
  await page.goto('/ta/missing-page');
  await page
    .locator('main')
    .evaluate((main, html) => main.insertAdjacentHTML('beforeend', html), TAMIL_SPECIMEN);
  // An element screenshot taller than the viewport is stitched while scrolling; the sticky
  // header would land in a different place each time, so it is unstuck for this shot only.
  await page.addStyleTag({ content: '.site-header { position: static !important; }' });
  await settle(page);
  await expect(page.locator('#tamil-specimen')).toHaveScreenshot('tamil-specimen-ta.png');
});

for (const lang of ['en', 'ta'] as const) {
  test.describe(`owner dashboard (${lang})`, () => {
    test(`sign in (${lang})`, async ({ page }) => {
      await page.route('**/api/v1/auth/session', (route) =>
        route.fulfill({ json: { stage: 'SIGNED_OUT' } }),
      );
      await page.addInitScript((l) => window.localStorage.setItem('theonetrust:lang', l), lang);
      await page.goto('/admin/login');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`admin-login-${lang}.png`);
    });

    test(`programmes with long Tamil titles (${lang})`, async ({ page }) => {
      await signedInOwner(page, lang, {
        '/programmes': {
          items: [
            {
              id: 'p1',
              slug: 'education-support',
              titleTa: LONG_TA,
              titleEn: 'Education support for school children',
              descriptionTa: null,
              descriptionEn: null,
              designation: 'RESTRICTED',
              active: true,
              sortOrder: 0,
              donations: 3,
            },
            {
              id: 'p2',
              slug: 'food',
              titleTa: 'உணவு',
              titleEn: 'Food and essentials',
              descriptionTa: null,
              descriptionEn: null,
              designation: 'GENERAL',
              active: false,
              sortOrder: 1,
              donations: 0,
            },
          ],
        },
      });
      await page.goto('/admin/programmes');
      await expect(page.getByRole('table')).toBeVisible();
      await settle(page);
      await expect(page.locator('main')).toHaveScreenshot(`admin-programmes-${lang}.png`);
    });

    test(`empty state (${lang})`, async ({ page }) => {
      await signedInOwner(page, lang, { '/metrics': { items: [] } });
      await page.goto('/admin/metrics');
      await expect(page.getByRole('table')).toBeVisible();
      await settle(page);
      await expect(page.locator('main')).toHaveScreenshot(`admin-empty-${lang}.png`);
    });

    test(`loading state (${lang})`, async ({ page }) => {
      await signedInOwner(page, lang, { '/settings': 'hang' });
      await page.goto('/admin/settings');
      await expect(page.getByRole('status').first()).toBeVisible();
      await settle(page);
      await expect(page.locator('main')).toHaveScreenshot(`admin-loading-${lang}.png`);
    });
  });

  test.describe(`owner dashboard error (${lang})`, () => {
    test.use({
      guard: {
        allowConsole: [/Failed to load resource: the server responded with a status of 500/],
        allowFailedRequests: [/\/api\/v1\/admin\/settings$/],
        skipAxe: false,
        skipOverflow: false,
        skipDocumentChecks: false,
      },
    });
    test(`error state (${lang})`, async ({ page }) => {
      // The 500 is the point of this test (reason for the guard exception above).
      await signedInOwner(page, lang, { '/settings': { status: 500 } });
      await page.goto('/admin/settings');
      await expect(
        page.getByRole('button', { name: lang === 'ta' ? 'மீண்டும் முயற்சிக்கவும்' : 'Try again' }),
      ).toBeVisible();
      await settle(page);
      await expect(page.locator('main')).toHaveScreenshot(`admin-error-${lang}.png`);
    });
  });
}
