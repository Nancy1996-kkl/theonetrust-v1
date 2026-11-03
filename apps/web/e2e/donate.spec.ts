import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/guard.ts';

/**
 * Donate panel (#24) with the mock adapter (playwright.config.ts). The mock is told the Checkout
 * outcome through window.__donateMock; the live site never uses it. The auto bug detector runs
 * after every test (overflow, axe incl. contrast, console) at all five viewports.
 */
const T = {
  en: {
    home: '/',
    donate: 'Donate',
    cont: 'Continue',
    amount: '₹1,000',
    name: 'Full name',
    mobile: 'Mobile number',
    consent: 'The trust may keep these details to record my donation.',
    pay: 'Pay ₹1,000 securely',
    thanks: 'Thank you — payment received',
    cancelled: 'Payment cancelled',
    failed: "Payment didn't go through",
    tryAgain: 'Try again',
    limit: "Your UPI app or bank didn't allow this amount",
    payCard: 'Pay by card or netbanking',
    pending: "We're confirming your payment",
    checkAgain: 'Check again',
  },
  ta: {
    home: '/ta/',
    donate: 'நன்கொடை',
    cont: 'தொடரவும்',
    amount: '₹1,000',
    name: 'முழுப் பெயர்',
    mobile: 'கைபேசி எண்',
    consent: 'என் நன்கொடையைப் பதிவுசெய்ய அறக்கட்டளை இந்த விவரங்களை வைத்திருக்கலாம்.',
    pay: '₹1,000 பாதுகாப்பாகச் செலுத்து',
    thanks: 'நன்றி — கட்டணம் பெறப்பட்டது',
    cancelled: 'கட்டணம் ரத்து செய்யப்பட்டது',
    failed: 'கட்டணம் நிறைவேறவில்லை',
    tryAgain: 'மீண்டும் முயற்சி செய்',
    limit: 'உங்கள் UPI செயலி அல்லது வங்கி இந்தத் தொகையை அனுமதிக்கவில்லை',
    payCard: 'கார்டு அல்லது நெட்பேங்கிங் மூலம் செலுத்து',
    pending: 'உங்கள் கட்டணத்தை உறுதிப்படுத்திக்கொண்டிருக்கிறோம்',
    checkAgain: 'மீண்டும் சரிபார்',
  },
} as const;

type Lang = keyof typeof T;

async function toReview(page: Page, lang: Lang, scenario: string) {
  const t = T[lang];
  await page.addInitScript((s) => {
    (window as unknown as { __donateMock: string }).__donateMock = s;
  }, scenario);
  await page.goto(t.home);
  await page.getByRole('banner').getByRole('link', { name: t.donate, exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: t.cont }).click(); // general fund preselected
  await panel.getByText(t.amount, { exact: true }).click();
  await panel.getByRole('button', { name: t.cont }).click();
  await panel.getByRole('textbox', { name: t.name }).fill('Synthetic Donor');
  await panel.getByRole('textbox', { name: t.mobile }).fill('98765 43210');
  await panel.getByText(t.consent).click();
  await panel.getByRole('button', { name: t.cont }).click();
  return panel;
}

for (const lang of ['en', 'ta'] as const) {
  const t = T[lang];

  test(`success only after verification, URL unchanged (${lang})`, async ({ page }) => {
    const panel = await toReview(page, lang, 'success');
    const url = page.url();
    await panel.getByRole('button', { name: t.pay }).click();
    await expect(panel.getByRole('heading', { name: t.thanks })).toBeVisible();
    await expect(panel).toContainText('TOT-D-');
    expect(page.url()).toBe(url);
  });

  test(`cancelled checkout keeps need and amount (${lang})`, async ({ page }) => {
    const panel = await toReview(page, lang, 'cancel');
    await panel.getByRole('button', { name: t.pay }).click();
    await expect(panel).toContainText(t.cancelled);
    await expect(panel.getByRole('button', { name: t.pay })).toBeVisible();
  });

  test(`failed payment offers try again (${lang})`, async ({ page }) => {
    const panel = await toReview(page, lang, 'fail');
    await panel.getByRole('button', { name: t.pay }).click();
    await expect(panel.getByRole('heading', { name: t.failed })).toBeVisible();
    await panel.getByRole('button', { name: t.tryAgain }).click();
    await expect(panel.getByRole('button', { name: t.pay })).toBeVisible();
  });
}

test('UPI limit suggests card or netbanking', async ({ page }) => {
  const panel = await toReview(page, 'en', 'limit');
  await panel.getByRole('button', { name: T.en.pay }).click();
  await expect(panel.getByRole('heading', { name: T.en.limit })).toBeVisible();
  await panel.getByRole('button', { name: T.en.payCard }).click();
  await expect(panel.getByRole('button', { name: T.en.pay })).toBeVisible();
});

test('pending verification never shows success until checked again', async ({ page }) => {
  const panel = await toReview(page, 'ta', 'pending');
  await panel.getByRole('button', { name: T.ta.pay }).click();
  await expect(panel.getByRole('heading', { name: T.ta.pending })).toBeVisible();
  await expect(panel.getByRole('heading', { name: T.ta.thanks })).toHaveCount(0);
  await panel.getByRole('button', { name: T.ta.checkAgain }).click();
  await expect(panel.getByRole('heading', { name: T.ta.thanks })).toBeVisible();
});

test('the chosen amount survives a language switch', async ({ page }) => {
  await page.goto('/?amount=2000#donate');
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Continue' }).click();
  await expect(panel.getByRole('radio', { name: '₹2,000' })).toBeChecked();
  await page.keyboard.press('Escape');
  await page
    .getByRole('contentinfo')
    .getByRole('group', { name: 'Language' })
    .getByRole('button', { name: 'தமிழ்' })
    .click();
  await page.getByRole('banner').getByRole('link', { name: 'நன்கொடை', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'தொடரவும்' }).click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: '₹2,000' })).toBeChecked();
});
