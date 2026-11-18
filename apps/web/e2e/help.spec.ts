import { expect, test } from './fixtures/guard.ts';

/**
 * Get Help journey (#15). Acceptance: passes in Tamil and English at 360px. It runs at every
 * viewport; the auto bug detector checks overflow, axe and console after each test.
 * e2e builds use the mock adapter (playwright.config.ts); the live default never pretends.
 */
const text = {
  en: {
    open: 'Get Help',
    fill: 'Tell us what you need (5 short steps)',
    me: 'Me',
    age: /^Your age/,
    cont: 'Continue',
    food: 'Food & essentials',
    desc: 'What is needed',
    mobile: /Your mobile or WhatsApp number/,
    consent: 'The trust may call or WhatsApp this number about this request.',
    send: 'Send request',
    sent: 'Your request is sent',
  },
  ta: {
    open: 'உதவி பெற',
    fill: 'என்ன தேவை என்று சொல்லுங்கள் (5 சிறிய படிகள்)',
    me: 'எனக்கு',
    age: /^உங்கள் வயது/,
    cont: 'தொடரவும்',
    food: 'உணவு, அன்றாடத் தேவைகள்',
    desc: 'என்ன தேவை',
    mobile: /உங்கள் கைபேசி அல்லது WhatsApp எண்/,
    consent:
      'இந்தக் கோரிக்கை பற்றிப் பேச, அறக்கட்டளை இந்த எண்ணுக்கு அழைக்கலாம் அல்லது WhatsApp செய்யலாம்.',
    send: 'கோரிக்கையை அனுப்பு',
    sent: 'உங்கள் கோரிக்கை அனுப்பப்பட்டது',
  },
} as const;

for (const lang of ['en', 'ta'] as const) {
  test(`Get Help wizard journey (${lang})`, async ({ page }) => {
    const t = text[lang];
    await page.goto(lang === 'en' ? '/' : '/ta/');
    await page.locator('#top').getByRole('link', { name: t.open }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: t.fill }).click();
    await dialog.getByText(t.me, { exact: true }).click();
    await dialog.getByRole('textbox', { name: t.age }).fill('34');
    await dialog.getByRole('button', { name: t.cont }).click();
    await dialog.getByText(t.food).click();
    await dialog.getByRole('button', { name: t.cont }).click();
    await dialog.getByRole('textbox', { name: t.desc }).fill('Rice and oil');
    await dialog.getByRole('button', { name: t.cont }).click();
    await dialog.getByRole('textbox', { name: t.mobile }).fill('98765 43210');
    await dialog.getByRole('button', { name: t.cont }).click();
    await dialog.getByText(t.consent).click();
    await dialog.getByRole('button', { name: t.send }).click();
    await expect(dialog.getByRole('heading', { name: t.sent })).toBeVisible();
    await expect(dialog).toContainText(/HLP-[0-9A-HJ-NP-Z]{4}/);
  });
}

test('keyboard only: open, Esc closes and focus returns to the opener', async ({ page }) => {
  await page.goto('/');
  const opener = page.locator('#top').getByRole('link', { name: 'Get Help' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(opener).toBeFocused();
});

test('education asks for the income certificate and offers WhatsApp or a phone call without it', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#top').getByRole('link', { name: 'Get Help' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: text.en.fill }).click();
  await dialog.getByText('Me', { exact: true }).click();
  await dialog.getByRole('textbox', { name: /^Your age/ }).fill('17');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByText('Education').first().click();
  await expect(dialog.getByRole('group', { name: 'Government income certificate' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByText('Choose one option.')).toBeVisible();
  await dialog.getByText('I don’t have it now — please contact me').click();
  await expect(dialog.getByRole('group', { name: 'How should we contact you?' })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});
