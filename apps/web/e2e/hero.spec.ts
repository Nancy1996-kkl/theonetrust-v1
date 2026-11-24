import { expect, test } from './fixtures/guard.ts';

/**
 * Hero (forest & gold redesign): runs at all five viewports, in English and Tamil.
 * The auto bug detector also checks axe (incl. contrast of text over the banner), overflow,
 * console errors and failed requests after every test.
 */
const HEADLINE = {
  en: 'Together, we can make a difference.',
  ta: 'ஒன்றாகச் சேர்ந்தால், மாற்றம் கொண்டுவர முடியும்.',
};
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

    test('every hero text stays AA even over a pure-white video frame (review 24 Nov 2026)', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(home);
      // Worst case: model the fade's actual stops at each text's farthest point over a WHITE
      // frame, and compare with the text's real colour. Wide screens fade left→right, phones
      // and tablets top→bottom (the text may overlap the bottom of the banner).
      const results = await page.evaluate(() => {
        const media = document.querySelector('.landing-hero__media')!.getBoundingClientRect();
        const stacked = matchMedia('(max-width: 63.99em)').matches;
        const scrim = getComputedStyle(document.documentElement)
          .getPropertyValue('--color-hero-band')
          .trim();
        const probe = document.createElement('i');
        probe.style.color = scrim;
        document.body.append(probe);
        const band = getComputedStyle(probe).color.match(/\d+/g)!.map(Number);
        probe.remove();
        const lerp = (stops: [number, number][], t: number) => {
          if (t <= stops[0]![0]) return stops[0]![1];
          for (let i = 1; i < stops.length; i++) {
            const [t1, a1] = stops[i]!;
            const [t0, a0] = stops[i - 1]!;
            if (t <= t1) return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
          }
          return stops[stops.length - 1]![1];
        };
        const lum = (rgb: number[]) => {
          const [r, g, b] = rgb.map((c) => {
            const v = c / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        const ratio = (a: number[], b: number[]) => {
          const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
          return (l1! + 0.05) / (l2! + 0.05);
        };
        const out: { what: string; ratio: number; minimum: number }[] = [];
        const selectors = [
          '.landing-hero__eyebrow',
          '.landing-hero__title',
          '.landing-hero__lead',
          '.landing-hero__help',
        ];
        for (const sel of selectors) {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) continue;
          const box = el.getBoundingClientRect();
          let alpha: number;
          if (stacked) {
            // Text below the banner sits on the solid band; over it, use its highest point.
            const t = (box.top - media.top) / media.height;
            alpha =
              t >= 1
                ? 1
                : lerp(
                    [
                      [0.4, 0],
                      [0.75, 0.7],
                      [1, 1],
                    ],
                    t,
                  );
          } else {
            const t = (box.right - media.left) / media.width;
            alpha =
              t <= 0
                ? 1
                : lerp(
                    [
                      [0, 1],
                      [0.35, 0.92],
                      [0.47, 0.5],
                      [0.62, 0],
                    ],
                    t,
                  );
          }
          const behind = band.map((c) => c * alpha + 255 * (1 - alpha));
          const text = getComputedStyle(el).color.match(/\d+/g)!.map(Number);
          const size = parseFloat(getComputedStyle(el).fontSize);
          out.push({ what: sel, ratio: ratio(text, behind), minimum: size >= 24 ? 3 : 4.5 });
        }
        return out;
      });
      expect(results.length).toBeGreaterThanOrEqual(3);
      for (const r of results) {
        expect(r.ratio, `${r.what} over a white frame`).toBeGreaterThanOrEqual(r.minimum);
      }
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

  test('Donate glows orange on hover', async ({ page, isMobile }) => {
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
