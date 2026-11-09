import { expect, test } from './fixtures/guard.ts';

/**
 * Hero (forest & gold redesign): runs at all five viewports, in English and Tamil.
 * The auto bug detector also checks axe (incl. contrast of text over the banner), overflow,
 * console errors and failed requests after every test.
 */
const HEADLINE = { en: 'Build a Better Tomorrow', ta: 'சிறந்த நாளையை ஒன்றாக உருவாக்குவோம்' };
const DONATE = { en: 'Donate now', ta: 'இப்போதே நன்கொடை கொடுங்கள்' };

for (const lang of ['en', 'ta'] as const) {
  const home = lang === 'ta' ? '/ta/' : '/';

  test.describe(`hero (${lang})`, () => {
    test('headline and Donate are visible above the fold', async ({ page }) => {
      await page.goto(home);
      const hero = page.locator('#top');
      await expect(hero.getByRole('heading', { level: 1, name: HEADLINE[lang] })).toBeVisible();
      const donate = hero.getByRole('link', { name: DONATE[lang] });
      await expect(donate).toBeInViewport({ ratio: 1 });
      const box = (await donate.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    });

    test('the first still paints first, then the first clip plays', async ({ page }) => {
      await page.goto(home);
      const still = page.locator('[data-slide="smile"] .landing-hero__poster');
      await expect(still).toBeVisible();
      expect(await still.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(page.locator('[data-slide="smile"]')).toHaveAttribute('data-painting', 'true');
      const video = page.locator('[data-slide="smile"] video');
      expect(await video.evaluate((v: HTMLVideoElement) => v.muted && !v.paused)).toBe(true);
    });

    test('slide buttons switch clips; each clip plays and shows progress', async ({ page }) => {
      await page.goto(home);
      const dots = page.locator('.hero-carousel__dot');
      await expect(dots).toHaveCount(4);
      for (const [i, id] of ['notebook', 'supplies', 'wheelchair'].entries()) {
        await dots.nth(i + 1).click();
        await expect(dots.nth(i + 1)).toHaveAttribute('aria-current', 'true');
        const slide = page.locator(`[data-slide="${id}"]`);
        await expect(slide).toHaveAttribute('data-active', 'true');
        await expect(slide).toHaveAttribute('data-painting', 'true');
        await expect
          .poll(() =>
            page
              .locator('.hero-carousel__fill')
              .nth(i + 1)
              .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--progress') || 0)),
          )
          .toBeGreaterThan(0);
      }
    });

    test('a clip advances to the next one when it ends', async ({ page }) => {
      await page.goto(home);
      await page.locator('.hero-carousel__dot').nth(3).click();
      await expect(page.locator('[data-slide="wheelchair"]')).toHaveAttribute(
        'data-painting',
        'true',
      );
      // Jump to the end of the last clip: the carousel wraps to the first.
      await page
        .locator('[data-slide="wheelchair"] video')
        .evaluate((v: HTMLVideoElement) => (v.currentTime = v.duration - 0.2));
      await expect(page.locator('.hero-carousel__dot').nth(0)).toHaveAttribute(
        'aria-current',
        'true',
        { timeout: 5000 },
      );
    });

    test('the pause button stops and restarts the carousel (WCAG 2.2.2)', async ({ page }) => {
      await page.goto(home);
      const video = page.locator('[data-slide="smile"] video');
      await expect(page.locator('[data-slide="smile"]')).toHaveAttribute('data-painting', 'true');
      const pause = page.locator('.landing-hero__motion');
      await pause.click();
      expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
      await pause.click();
      await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    });

    test('headline text never sits on the uncovered photo on wide screens', async ({ page }) => {
      await page.goto(home);
      const width = page.viewportSize()!.width;
      test.skip(width < 1024, 'stacked layout below 64em: text is below the banner');
      const text = (await page.locator('.landing-hero__text').boundingBox())!;
      const media = (await page.locator('.landing-hero__media').boundingBox())!;
      // The scrim is solid-to-92% forest over the first third of the banner.
      // --gradient-hero-scrim stays at least 92% forest over the first 35% of the banner.
      expect(text.x + text.width).toBeLessThan(media.x + media.width * 0.35);
    });
  });
}

test.describe('hero preferences', () => {
  test('reduced motion shows only the still frame, with no pause button', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-slide="smile"] .landing-hero__poster')).toBeVisible();
    await expect(page.locator('.landing-hero__video')).toHaveCount(0);
    await expect(page.locator('.landing-hero__motion')).toHaveCount(0);
    // The stills can still be browsed by hand.
    await page.locator('.hero-carousel__dot').nth(2).click();
    await expect(page.locator('[data-slide="supplies"]')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-slide="supplies"] .landing-hero__poster')).toBeVisible();
  });

  test('Donate glows gold on hover', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover only applies to pointer devices');
    await page.goto('/');
    const donate = page.locator('#top').getByRole('link', { name: DONATE.en });
    await donate.hover();
    await expect
      .poll(() => donate.evaluate((el) => getComputedStyle(el).boxShadow))
      .not.toBe('none');
  });

  test('Learn more goes to About on the same page', async ({ page }) => {
    await page.goto('/');
    await page.locator('#top').getByRole('link', { name: 'Learn more' }).click();
    await expect(page).toHaveURL(/\/#about$/);
    await expect(page.locator('#about')).toBeInViewport();
  });
});
