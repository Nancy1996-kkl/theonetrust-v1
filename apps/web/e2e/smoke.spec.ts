import { expect, test } from './fixtures/guard.ts';

test.describe('public smoke', () => {
  test('home page loads with title, heading and Tamil text', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/^Theonetrust\.in/);
    await expect(page.getByRole('heading', { level: 1, name: 'Theonetrust.in' })).toBeVisible();
    // The bilingual placeholder was replaced by real sections in #12; Tamil lives under /ta/.
    await page.goto('/ta/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
    await expect(
      page.getByRole('heading', { level: 2, name: 'நாங்கள் உதவும் வழிகள்' }),
    ).toBeVisible();
  });

  test('unknown route shows the not-found page and recovers to home', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveTitle(/Page not found/);
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Theonetrust.in' })).toBeVisible();
  });

  test('browser back and forward keep the right page', async ({ page }) => {
    await page.goto('/');
    await page.goto('/missing');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Theonetrust.in' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});

test.describe('keyboard', () => {
  test('first Tab reveals the skip link and Enter moves focus to main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });
});

test.describe('user preferences', () => {
  test.use({ colorScheme: 'dark' });

  test('respects reduced motion without breaking layout', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // The real transition on an animated element must collapse to (near) zero.
    const seconds = await page
      .getByRole('link', { name: 'Skip to main content' })
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(seconds).toBeLessThanOrEqual(0.001);
  });

  test('stays readable at 200% text zoom', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Overflow at 200% zoom is checked by the auto bug detector after this test.
  });
});
