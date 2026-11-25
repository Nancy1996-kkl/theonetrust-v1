import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/guard.ts';

/**
 * Donate panel (#24) with the mock adapter (playwright.config.ts). The mock is told what Cashfree's
 * payment window and the server answer through window.__donateMock; the live site never uses it. The auto bug detector runs
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
    payAgain: 'Open the payment window again',
    failed: "Payment didn't go through",
    tryAgain: 'Try again',
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
    consent: 'என் நன்கொடையைப் பதிவு செய்ய, அறக்கட்டளை இந்த விவரங்களை வைத்துக்கொள்ளலாம்.',
    pay: '₹1,000 பாதுகாப்பாகச் செலுத்து',
    thanks: 'நன்றி — உங்கள் பணம் வந்து சேர்ந்தது',
    payAgain: 'கட்டணச் சாளரத்தை மீண்டும் திறக்கவும்',
    failed: 'பணம் செலுத்த முடியவில்லை',
    tryAgain: 'மீண்டும் முயற்சி செய்',
    pending: 'உங்கள் பணம் வந்ததா என்று இன்னும் பார்த்துக்கொண்டிருக்கிறோம்',
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

  test(`window closed without paying: pending, then the same order can be reopened (${lang})`, async ({
    page,
  }) => {
    const panel = await toReview(page, lang, 'stuck');
    await panel.getByRole('button', { name: t.pay }).click();
    await expect(panel.getByRole('heading', { name: t.pending })).toBeVisible();
    await expect(panel.getByRole('heading', { name: t.thanks })).toHaveCount(0);
    await panel.getByRole('button', { name: t.payAgain }).click();
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

test('a payment window that cannot open says so and offers try again', async ({ page }) => {
  const panel = await toReview(page, 'en', 'window-fail');
  await panel.getByRole('button', { name: T.en.pay }).click();
  await expect(panel.getByRole('heading', { name: T.en.failed })).toBeVisible();
  await panel.getByRole('button', { name: T.en.tryAgain }).click();
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
  await page.goto('/?amount=1000#donate');
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Continue' }).click();
  await expect(panel.getByRole('radio', { name: '₹1,000' })).toBeChecked();
  await page.keyboard.press('Escape');
  await page
    .getByRole('contentinfo')
    .getByRole('group', { name: 'Language' })
    .getByRole('button', { name: 'தமிழ்' })
    .click();
  await page.getByRole('banner').getByRole('link', { name: 'நன்கொடை', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'தொடரவும்' }).click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: '₹1,000' })).toBeChecked();
});

test('bank transfer: account details + reference; "not confirmed yet" until the trust confirms', async ({
  page,
}) => {
  const panel = await toReview(page, 'en', 'success');
  await panel.getByRole('button', { name: 'Giving a large amount? Pay by bank transfer' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Pay by bank transfer (NEFT / RTGS / IMPS)' }),
  ).toBeVisible();
  await expect(panel).toContainText('TOT-D-');
  await panel.getByRole('textbox', { name: /UTR/ }).fill('SBIN12345678');
  await panel.getByRole('button', { name: "I've made the transfer" }).click();
  await expect(panel.getByRole('heading', { name: 'Not confirmed yet' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: T.en.thanks })).toHaveCount(0);
});

// ── Payment test suite (#28): ₹1, limits, refresh and back button ──────────────────────────

async function toAmount(page: Page, scenario = 'success') {
  await page.addInitScript((s) => {
    (window as unknown as { __donateMock: string }).__donateMock = s;
  }, scenario);
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Donate', exact: true }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByText('Other amount (₹)', { exact: true }).click();
  return panel;
}

test('a ₹1 donation can be made and is confirmed only after verification', async ({ page }) => {
  const panel = await toAmount(page);
  await panel.getByRole('textbox', { name: 'Other amount (₹)' }).fill('1');
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByRole('textbox', { name: 'Full name' }).fill('Synthetic Donor');
  await panel.getByRole('textbox', { name: 'Mobile number' }).fill('98765 43210');
  await panel.getByText(T.en.consent).click();
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByRole('button', { name: 'Pay ₹1 securely' }).click();
  await expect(panel.getByRole('heading', { name: T.en.thanks })).toBeVisible();
});

test('amount limits: empty, zero and above the online maximum are stopped with a message', async ({
  page,
}) => {
  const panel = await toAmount(page);
  const field = panel.getByRole('textbox', { name: 'Other amount (₹)' });
  await panel.getByRole('button', { name: 'Continue' }).click();
  await expect(panel.getByText('Any amount from ₹1').first()).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Full name' })).toHaveCount(0);

  await field.fill('0');
  await field.blur();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await panel.getByRole('button', { name: 'Continue' }).click();
  await expect(panel.getByRole('textbox', { name: 'Full name' })).toHaveCount(0);

  await field.fill('500001');
  await field.blur();
  await expect(panel.getByText(/please pay by bank transfer/).first()).toBeVisible();
  await panel.getByRole('button', { name: 'Continue' }).click();
  await expect(panel.getByRole('textbox', { name: 'Full name' })).toHaveCount(0);
});

test('refresh while a payment is being confirmed re-checks it — never shows Pay again', async ({
  page,
}) => {
  const panel = await toReview(page, 'en', 'stuck');
  await panel.getByRole('button', { name: T.en.pay }).click();
  await expect(panel.getByRole('heading', { name: T.en.pending })).toBeVisible();

  await page.reload();
  const again = page.getByRole('dialog');
  await expect(again.getByRole('heading', { name: T.en.pending })).toBeVisible();
  await expect(again.getByRole('button', { name: T.en.pay })).toHaveCount(0);
  await expect(again.getByRole('heading', { name: T.en.thanks })).toHaveCount(0);

  // The gateway now reports it captured: the re-check, not the browser, decides.
  await page.evaluate(() => {
    (window as unknown as { __donateMock: string }).__donateMock = 'pending';
  });
  await again.getByRole('button', { name: T.en.checkAgain }).click();
  await expect(again.getByRole('heading', { name: T.en.thanks })).toBeVisible();
});

test('back button after a payment closes the panel; reopening never repeats the payment', async ({
  page,
}) => {
  const panel = await toReview(page, 'en', 'success');
  await panel.getByRole('button', { name: T.en.pay }).click();
  await expect(panel.getByRole('heading', { name: T.en.thanks })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goForward();
  const reopened = page.getByRole('dialog');
  await expect(reopened).toBeVisible();
  await expect(reopened.getByRole('button', { name: T.en.pay })).toHaveCount(0);
  await expect(reopened.getByRole('heading', { name: T.en.pending })).toHaveCount(0);
});
