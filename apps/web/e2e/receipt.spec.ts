import { expect, test } from './fixtures/guard.ts';

/**
 * Donation acknowledgement page (#29) with the mock adapter. The auto bug detector runs after
 * every test (overflow, axe incl. contrast, console) at all five viewports.
 */
const MOCK = 'M'.repeat(43);
const REPLACED = 'R'.repeat(43);

test('after a verified payment the panel links to the acknowledgement', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Donate', exact: true }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByText('₹1,000', { exact: true }).click();
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByRole('textbox', { name: 'Full name' }).fill('Synthetic Donor');
  await panel.getByRole('textbox', { name: 'Mobile number' }).fill('98765 43210');
  await panel.getByText('The trust may keep these details to record my donation.').click();
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByRole('button', { name: 'Pay ₹1,000 securely' }).click();
  await panel.getByRole('link', { name: 'View or download your donation acknowledgement' }).click();
  await expect(page).toHaveURL(new RegExp(`/receipt/${MOCK}$`));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Donation acknowledgement' }),
  ).toBeVisible();
  // No personal data in the URL: only the random token.
  expect(page.url()).not.toMatch(/9876|Synthetic|donor/i);
});

test('acknowledgement page: minimal fields, PDF links, never indexed (English)', async ({
  page,
}) => {
  await page.goto(`/receipt/${MOCK}`);
  await expect(page.getByText('Verified by the trust')).toBeVisible();
  for (const text of ['TOT-R-2026-27-000000', 'TOT-D-MOCK00000000', 'Synthetic Donor', '₹1,000']) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Download PDF', exact: true })).toHaveAttribute(
    'href',
    /\/receipts\/M{43}\/pdf\?lang=en$/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  await expect(page.locator('article.receipt')).not.toContainText(/@|\+91|\b\d{10}\b/);
});

test('acknowledgement page in Tamil', async ({ page }) => {
  await page.goto(`/ta/receipt/${MOCK}`);
  await expect(page.getByRole('heading', { level: 1, name: 'நன்கொடை ஒப்புகை' })).toBeVisible();
  await expect(page.getByText('அறக்கட்டளையால் சரிபார்க்கப்பட்டது')).toBeVisible();
  await expect(page.getByRole('link', { name: 'PDF பதிவிறக்கு', exact: true })).toHaveAttribute(
    'href',
    /lang=ta$/,
  );
});

test('a replaced acknowledgement says so and links to the current one', async ({ page }) => {
  await page.goto(`/receipt/${REPLACED}`);
  await expect(page.getByText('Replaced by a corrected acknowledgement')).toBeVisible();
  await page.getByRole('link', { name: 'Open the current acknowledgement' }).click();
  await expect(page).toHaveURL(new RegExp(`/receipt/${MOCK}$`));
  await expect(page.getByText('Verified by the trust')).toBeVisible();
});

test('an unknown or malformed link shows "not found" with a way home', async ({ page }) => {
  for (const token of ['A'.repeat(43), 'too-short']) {
    await page.goto(`/receipt/${token}`);
    await expect(page.getByRole('heading', { name: 'Acknowledgement not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the home page' })).toBeVisible();
  }
});
