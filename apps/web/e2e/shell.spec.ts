import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/guard.ts';

/**
 * App shell (#11): header, mobile menu, language switch, footer.
 * The auto bug detector checks horizontal overflow, axe (incl. contrast), lang/title/h1/main after
 * every test — at all five viewports (360 → 1440).
 */
const isWide = (page: Page) => page.viewportSize()!.width >= 1280;

async function noHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
}

for (const path of ['/', '/ta/']) {
  test(`${path}: header, landmarks and footer fit the viewport`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeAttached();
    await expect(page.locator('html')).toHaveAttribute('lang', path === '/' ? 'en' : 'ta');
    // Donate is always visible in the header.
    const donate = page
      .getByRole('banner')
      .getByRole('link', { name: path === '/' ? 'Donate' : 'நன்கொடை' });
    await expect(donate).toBeVisible();
    await expect(donate).toBeInViewport();
    // Every header control fits inside the header bar (no clipping off the edge).
    const width = page.viewportSize()!.width;
    for (const box of await page
      .locator('.site-header__bar > *')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right))) {
      expect(box).toBeLessThanOrEqual(width);
    }
    await noHorizontalScroll(page);
  });
}

test('section links: in the header on wide screens, in the menu otherwise', async ({ page }) => {
  await page.goto('/');
  const headerNav = page.getByRole('navigation', { name: 'Sections' });
  const menuButton = page.getByRole('button', { name: 'Menu' });
  if (isWide(page)) {
    await expect(headerNav).toBeVisible();
    await expect(menuButton).toBeHidden();
    return;
  }
  await expect(headerNav).toBeHidden();
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  const menuNav = page.getByRole('navigation', { name: 'Menu' });
  await expect(menuNav.getByRole('link', { name: 'About' })).toBeFocused();
  await noHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toBeFocused();
});

test('Tamil menu opens and fits on narrow screens', async ({ page }) => {
  test.skip(isWide(page), 'menu button is only shown below 80em');
  await page.goto('/ta/');
  await page.getByRole('button', { name: 'பட்டியல்' }).click();
  await expect(page.getByRole('navigation', { name: 'பட்டியல்' })).toBeVisible();
  await noHorizontalScroll(page);
});

test('language switch goes to the same page in Tamil and keeps query and hash', async ({
  page,
}) => {
  await page.goto('/?programme=education#ways-we-help');
  const switchGroup = page.getByRole('contentinfo').getByRole('group', { name: 'Language' });
  await switchGroup.getByRole('button', { name: 'தமிழ்' }).click();
  await expect(page).toHaveURL(/\/ta\/\?programme=education#ways-we-help$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
  expect(await page.evaluate(() => localStorage.getItem('theonetrust:lang'))).toBe('ta');
  await page
    .getByRole('contentinfo')
    .getByRole('group', { name: 'மொழி' })
    .getByRole('button', { name: 'English' })
    .click();
  await expect(page).toHaveURL(/\/\?programme=education#ways-we-help$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // Switching language keeps the reader's place, so the page is still scrolled to the footer
  // with links under the sticky header; axe target-size would report that scroll position.
  await page.evaluate(() => window.scrollTo(0, 0));
});

test('Tamil not-found page', async ({ page }) => {
  await page.goto('/ta/does-not-exist');
  await expect(page.getByRole('heading', { level: 1, name: 'பக்கம் கிடைக்கவில்லை' })).toBeVisible();
  await page.getByRole('link', { name: 'முகப்புப் பக்கத்துக்குச் செல்ல' }).click();
  await expect(page).toHaveURL(/\/ta\/$/);
});
