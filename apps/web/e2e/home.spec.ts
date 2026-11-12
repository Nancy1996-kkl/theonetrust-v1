import { expect, test } from './fixtures/guard.ts';

/**
 * Home page design (client, Nov 2026). The auto bug detector checks overflow, axe (incl.
 * contrast) and console errors at every viewport.
 */
for (const [path, h1, donate] of [
  ['/', 'Together, we can make a difference.', 'Donate now'],
  ['/ta/', 'ஒன்றாகச் சேர்ந்தால், மாற்றம் கொண்டுவர முடியும்.', 'இப்போதே நன்கொடை கொடுங்கள்'],
] as const) {
  test(`all sections render (${path})`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    await expect(page.locator('.hp-section')).toHaveCount(9);
    // Transparency stays hidden until the trust publishes its first document.
    await expect(page.locator('#transparency')).toHaveCount(0);
    await expect(page.locator('footer')).toHaveCount(1);
    await expect(page.getByRole('tab')).toHaveCount(4);
    // Donate opens the centred pop-up without leaving the page.
    await page.getByRole('link', { name: donate }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

test('explore tabs change the panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Healthcare' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Treatment on time');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Elderly' })).toHaveAttribute('aria-selected', 'true');
  // Let the scroll-reveal fades finish, so the bug detector's contrast check reads final colours
  // (it measured a services card halfway through its fade-in). Looping decorations are ignored.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .every((a) => a.playState !== 'running'),
  );
});
