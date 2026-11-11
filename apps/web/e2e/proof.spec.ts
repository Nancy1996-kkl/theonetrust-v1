import { expect, test } from './fixtures/guard.ts';

/**
 * Proof sections (#13) in a real browser at all five viewports. The auto bug detector checks
 * overflow, axe (incl. contrast) and console errors after each test.
 */
test('FAQ opens and closes with the keyboard', async ({ page }) => {
  await page.goto('/#faq');
  const question = page.locator('#faq summary', { hasText: 'Can I claim a tax deduction?' });
  const details = page.locator('#faq-tax');
  await question.focus();
  await expect(details).not.toHaveAttribute('open');
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open');
  await expect(details.getByText(/Not at the moment/)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(details).not.toHaveAttribute('open');
  await page.evaluate(() => window.scrollTo(0, 0));
});

for (const path of ['/', '/ta/']) {
  test(`${path}: impact, FAQ, contact and donation render; empty transparency is hidden`, async ({
    page,
  }) => {
    await page.goto(path);
    for (const id of ['impact', 'faq', 'contact', 'give']) {
      await expect(page.locator(`#${id} h2`)).toBeVisible();
    }
    // Empty states are factual, never zeros or fake documents.
    await expect(page.locator('#impact')).not.toContainText(/\b0\b/);
    await expect(page.locator('#transparency')).toHaveCount(0);
  });
}

test('donation section: an amount chip opens the pop-up pre-filled', async ({ page }) => {
  await page.goto('/');
  const give = page.locator('#give');
  const chip = give.getByRole('link', { name: '₹1,000' });
  await expect(chip).toHaveAttribute('href', '/?amount=1000#donate');
  await chip.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/amount=1000/);
});
