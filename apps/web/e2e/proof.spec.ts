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
  test(`${path}: impact, transparency, FAQ, contact and final CTA render`, async ({ page }) => {
    await page.goto(path);
    for (const id of ['impact', 'transparency', 'faq', 'contact', 'give']) {
      await expect(page.locator(`#${id} h2`)).toBeVisible();
    }
    // Empty states are factual, never zeros or fake documents.
    await expect(page.locator('#impact')).not.toContainText(/\b0\b/);
    await expect(page.locator('#transparency a[download]')).toHaveCount(0);
  });
}

test('final CTA: choosing an amount pre-fills the donate link', async ({ page }) => {
  await page.goto('/');
  const give = page.locator('#give');
  await give.getByText('₹1,000').click();
  await expect(give.getByRole('link', { name: 'Donate now' })).toHaveAttribute(
    'href',
    '/?amount=1000#donate',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
});
