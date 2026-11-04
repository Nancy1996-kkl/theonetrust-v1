import { expect, test } from './fixtures/guard.ts';

/**
 * Policy pages (#14) at all five viewports, English and Tamil. The auto bug detector checks
 * overflow, axe (incl. contrast), title, lang, one h1 and main after each test.
 */
const pages = [
  ['/terms', 'Terms of use'],
  ['/privacy', 'Privacy policy'],
  ['/refund-policy', 'Refund, cancellation and correction policy'],
] as const;

for (const [path, title] of pages) {
  test(`${path} loads with its title`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(title));
  });

  test(`/ta${path} loads in Tamil`, async ({ page }) => {
    await page.goto(`/ta${path}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}

test('footer policy link opens the page (client-side navigation)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Refund & cancellation' }).click();
  await expect(page).toHaveURL(/\/refund-policy$/);
  // A new page opens at the top, not where the footer was (ScrollRestoration).
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('heading', { name: 'Shipping' })).toBeVisible();
});
