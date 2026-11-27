import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/guard.ts';

/**
 * Donate pop-up with Cashfree (Phase 5), driven by the mock adapter (never used live) through
 * window.__donateMock: 'cashfree' | 'cashfree-pending' | 'cashfree-fail' | 'cashfree-redirect'.
 * The auto bug detector runs after every test (overflow, axe incl. contrast, console, CSP) at all
 * five viewports.
 */
const T = {
  en: {
    home: '/',
    donate: 'Donate',
    cont: 'Continue',
    amount: '₹1,000',
    name: 'Full name',
    mobile: /^Mobile number/,
    hint: 'Our payment partner needs your mobile number',
    mobileError: 'Enter a 10-digit mobile number',
    consent: 'The trust may keep these details to record my donation.',
    pay: 'Pay ₹1,000 securely',
    thanks: 'Thank you — payment received',
    failed: "Payment didn't go through",
    confirming: 'Confirming your payment…',
    pending: "We're confirming your payment",
    confirmed: 'This donation is confirmed',
  },
  ta: {
    home: '/ta/',
    donate: 'நன்கொடை',
    cont: 'அடுத்த படிக்கு',
    amount: '₹1,000',
    name: 'முழுப் பெயர்',
    mobile: /^கைபேசி எண்/,
    hint: 'எங்கள் கட்டண நிறுவனத்துக்கு உங்கள் கைபேசி எண் தேவை',
    mobileError: 'தயவுசெய்து 10 இலக்க கைபேசி எண்ணை எழுதுங்கள்',
    consent: 'என் நன்கொடையைப் பதிவு செய்ய, அறக்கட்டளை இந்த விவரங்களை வைத்துக்கொள்ளலாம்.',
    pay: '₹1,000 பாதுகாப்பாகச் செலுத்து',
    thanks: 'நன்றி — உங்கள் பணம் வந்து சேர்ந்தது',
    failed: 'பணம் செலுத்த முடியவில்லை',
    confirming: 'உங்கள் பணம் வந்ததா என்று பார்க்கிறோம்…',
    pending: 'உங்கள் பணம் வந்ததா என்று இன்னும் பார்த்துக்கொண்டிருக்கிறோம்',
    confirmed: 'இந்த நன்கொடை உறுதியாகிவிட்டது',
  },
} as const;

type Lang = keyof typeof T;

async function setScenario(page: Page, scenario: string) {
  await page.addInitScript((s) => {
    (window as unknown as { __donateMock: string }).__donateMock = s;
  }, scenario);
}

async function toDetails(page: Page, lang: Lang, scenario: string) {
  const t = T[lang];
  await setScenario(page, scenario);
  await page.goto(t.home);
  await page.getByRole('banner').getByRole('link', { name: t.donate, exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: t.cont }).click();
  await panel.getByText(t.amount, { exact: true }).click();
  await panel.getByRole('button', { name: t.cont }).click();
  await panel.getByRole('textbox', { name: t.name }).fill('Synthetic Donor');
  await panel.getByText(t.consent).click();
  return panel;
}

for (const lang of ['en', 'ta'] as const) {
  const t = T[lang];

  test(`mobile number is required with Cashfree and says why (${lang})`, async ({ page }) => {
    const panel = await toDetails(page, lang, 'cashfree');
    const mobile = panel.getByRole('textbox', { name: t.mobile });
    await expect(mobile).toHaveAttribute('required', '');
    await expect(panel).toContainText(t.hint);
    await panel.getByRole('button', { name: t.cont }).click();
    await expect(mobile).toHaveAttribute('aria-invalid', 'true');
    await expect(panel).toContainText(t.mobileError);
    await mobile.fill('98765 43210');
    await panel.getByRole('button', { name: t.cont }).click();
    await expect(panel.getByRole('button', { name: t.pay })).toBeVisible();
  });

  test(`pays with Cashfree: thanks only after the server says PAID, URL unchanged (${lang})`, async ({
    page,
  }) => {
    const panel = await toDetails(page, lang, 'cashfree');
    await panel.getByRole('textbox', { name: t.mobile }).fill('9876543210');
    await panel.getByRole('button', { name: t.cont }).click();
    const url = page.url();
    await panel.getByRole('button', { name: t.pay }).click();
    await expect(panel.getByRole('heading', { name: t.thanks })).toBeVisible();
    await expect(panel).toContainText('TOT-D-');
    expect(page.url()).toBe(url);
    expect(page.url()).not.toContain('98765');
  });

  test(`the server says FAILED → failed, never thanks (${lang})`, async ({ page }) => {
    const panel = await toDetails(page, lang, 'cashfree-fail');
    await panel.getByRole('textbox', { name: t.mobile }).fill('9876543210');
    await panel.getByRole('button', { name: t.cont }).click();
    await panel.getByRole('button', { name: t.pay }).click();
    await expect(panel.getByRole('heading', { name: t.failed })).toBeVisible();
    await expect(panel.getByRole('heading', { name: t.thanks })).toHaveCount(0);
  });

  test(`back from Cashfree's page (?cf_order=): checks, then thanks; link removed (${lang})`, async ({
    page,
  }) => {
    await setScenario(page, 'cashfree');
    // Started in this tab (the reference is already kept): full thanks.
    await page.addInitScript(() =>
      sessionStorage.setItem('theonetrust:donation-pending', 'TOT-D-ABCDEFGHJKMN'),
    );
    await page.goto(`${t.home}?cf_order=TOT-D-ABCDEFGHJKMN`);
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('heading', { name: t.thanks })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${t.home.replace('/', '\\/')}#donate$`));
    expect(page.url()).not.toContain('cf_order');
  });
}

test('not confirmed at first: closable "pending", checked in the background, then thanks', async ({
  page,
}) => {
  const panel = await toDetails(page, 'en', 'cashfree-pending');
  await panel.getByRole('textbox', { name: T.en.mobile }).fill('9876543210');
  await panel.getByRole('button', { name: T.en.cont }).click();
  await panel.getByRole('button', { name: T.en.pay }).click();
  await expect(panel.getByRole('heading', { name: T.en.pending })).toBeVisible();
  await expect(panel.getByRole('heading', { name: T.en.thanks })).toBeVisible({ timeout: 10_000 });
});

test('a shared return link shows only a neutral "confirmed": no thanks, no receipt link', async ({
  page,
}) => {
  await setScenario(page, 'cashfree');
  await page.goto('/?cf_order=TOT-D-ABCDEFGHJKMN');
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('heading', { name: T.en.confirmed })).toBeVisible();
  await expect(panel.getByRole('link', { name: /acknowledgement/i })).toHaveCount(0);
  await expect(panel).not.toContainText('₹0');
});

test('pop-up could not open: never stuck — closable "pending" with Check again', async ({
  page,
}) => {
  const panel = await toDetails(page, 'en', 'cashfree-redirect');
  await panel.getByRole('textbox', { name: T.en.mobile }).fill('9876543210');
  await panel.getByRole('button', { name: T.en.cont }).click();
  await panel.getByRole('button', { name: T.en.pay }).click();
  await expect(panel.getByRole('heading', { name: T.en.pending })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Check again' })).toBeEnabled();
  const kept = await page.evaluate(() => sessionStorage.getItem('theonetrust:donation-pending'));
  expect(kept).toBe('TOT-D-MOCK00000000');
});

test('a malformed cf_order is dropped without opening anything', async ({ page }) => {
  await setScenario(page, 'cashfree');
  await page.goto('/?cf_order=%3Cscript%3E');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('storage blocked (in-app browser): the return link still checks and can be closed', async ({
  page,
}) => {
  await setScenario(page, 'cashfree');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  await page.goto('/?cf_order=TOT-D-ABCDEFGHJKMN');
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('heading', { name: T.en.confirmed })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
