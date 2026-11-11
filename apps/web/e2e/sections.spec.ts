import { expect, test } from './fixtures/guard.ts';

/**
 * Section rhythm (Forest & Gold brief): forest hero → ivory/white → forest impact → champagne →
 * forest final call to action. Runs at all five viewports; the auto bug detector adds axe
 * (incl. text contrast on every band), overflow, console and network checks.
 */
const FOREST = 'rgb(15, 42, 29)';
const CHAMPAGNE = 'rgb(247, 231, 206)';
const WHITE = 'rgb(255, 255, 255)';
const IVORY_PAGE = 'rgba(0, 0, 0, 0)'; // transparent over the ivory body
const GOLD = 'rgb(212, 175, 55)';

for (const home of ['/', '/ta/']) {
  test(`bands alternate dark and light (${home})`, async ({ page }) => {
    await page.goto(home);
    const bands = await page.evaluate(() =>
      [...document.querySelectorAll('main section')].map((s) => [
        s.id,
        getComputedStyle(s).backgroundColor,
      ]),
    );
    expect(Object.fromEntries(bands)).toEqual({
      top: FOREST,
      about: IVORY_PAGE,
      'ways-we-help': WHITE,
      'how-it-works': IVORY_PAGE,
      impact: FOREST,
      transparency: IVORY_PAGE,
      faq: CHAMPAGNE,
      contact: WHITE,
      give: FOREST,
    });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      'rgb(255, 253, 248)',
    );
  });

  test(`every forest band offers a gold Donate button (${home})`, async ({ page }) => {
    await page.goto(home);
    for (const id of ['top', 'impact', 'give']) {
      const donate = page.locator(`#${id} .ui-button--donate`).first();
      await donate.scrollIntoViewIfNeeded();
      await expect(donate).toBeVisible();
      expect(await donate.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(GOLD);
      expect(await donate.evaluate((el) => getComputedStyle(el).color)).toBe(FOREST);
    }
  });
}

test('section titles carry a thin gold rule; gold is never used for paragraphs', async ({
  page,
}) => {
  await page.goto('/');
  const rule = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('#about h2')!, '::before');
    return { color: s.borderTopColor, width: s.borderTopWidth };
  });
  expect(rule).toEqual({ color: GOLD, width: '1px' });
  const goldParagraphs = await page.evaluate(
    (gold) =>
      [...document.querySelectorAll('main p')].filter((p) => getComputedStyle(p).color === gold)
        .length,
    GOLD,
  );
  expect(goldParagraphs).toBe(0);
});

test('no consented stories yet: no empty Stories band; impact says figures come later', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#stories')).toHaveCount(0);
  await expect(page.locator('#impact')).toContainText('Figures will be published here');
  await expect(page.locator('#impact')).not.toContainText(/\b0\b/);
});
