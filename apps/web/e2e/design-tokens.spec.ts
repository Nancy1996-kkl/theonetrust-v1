import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/guard.ts';
import { TAMIL_SKIP_LABEL, TAMIL_SPECIMEN } from './fixtures/tamil-specimen.ts';

/** Expected px for a fluid token that is `min` at 360px and `max` at 1440px. */
function fluid(min: number, max: number, width: number): number {
  const t = Math.min(Math.max((width - 360) / 1080, 0), 1);
  return min + (max - min) * t;
}

async function computed(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        fontSize: parseFloat(s.fontSize),
        lineHeight: parseFloat(s.lineHeight),
        fontFamily: s.fontFamily,
        fontWeight: Number(s.fontWeight),
      };
    });
}

async function injectSpecimen(page: Page): Promise<void> {
  await page
    .locator('main')
    .evaluate((main, html) => main.insertAdjacentHTML('beforeend', html), TAMIL_SPECIMEN);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test.describe('type scale', () => {
  test('h1 and body match the fluid scale at this viewport', async ({ page }) => {
    const width = page.viewportSize()!.width;
    // A plain page h1 uses --text-h1 (the home page h1 is the hero, checked below).
    await page.goto('/missing');
    const h1 = await computed(page, 'h1');
    const body = await computed(page, 'main p');
    expect(h1.fontSize).toBeCloseTo(fluid(34, 48, width), 0);
    expect(body.fontSize).toBeCloseTo(fluid(16, 17, width), 0);
    expect(h1.fontWeight).toBeGreaterThanOrEqual(400);
  });

  test('the home hero headline uses the hero scale', async ({ page }) => {
    const width = page.viewportSize()!.width;
    await page.goto('/');
    expect((await computed(page, 'h1')).fontSize).toBeCloseTo(fluid(38, 64, width), 0);
  });

  test('the scale follows the user font-size setting (rem-based)', async ({ page }) => {
    await page.goto('/');
    const before = (await computed(page, 'h1')).fontSize;
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '20px';
    });
    expect((await computed(page, 'h1')).fontSize).toBeGreaterThan(before);
  });
});

test.describe('fonts', () => {
  test('Plus Jakarta Sans and Noto Sans Tamil load from our own origin', async ({
    page,
    baseURL,
  }) => {
    const fontRequests: string[] = [];
    page.on('request', (req) => {
      if (req.resourceType() === 'font') fontRequests.push(req.url());
    });
    await page.goto('/');
    await injectSpecimen(page);

    const loaded = await page.evaluate(async () => {
      const probes = {
        body: ['16px "Plus Jakarta Sans Variable"', 'Donate'],
        heading: ['600 34px "Plus Jakarta Sans Variable"', 'Theonetrust'],
        tamil: ['16px "Noto Sans Tamil Variable"', 'தமிழ் நன்கொடை'],
        tamilHeading: ['600 28px "Noto Sans Tamil Variable"', 'தமிழ் தலைப்பு'],
      } as const;
      const out: Record<string, boolean> = {};
      for (const [key, [font, text]] of Object.entries(probes)) {
        // fonts.check() is true even when NO face is registered, so require real loaded faces.
        const faces = await document.fonts.load(font, text);
        out[key] = faces.length > 0 && faces.every((face) => face.status === 'loaded');
      }
      return out;
    });
    expect(loaded).toEqual({ body: true, heading: true, tamil: true, tamilHeading: true });

    expect(fontRequests.length).toBeGreaterThan(0);
    const origin = new URL(baseURL!).origin;
    for (const url of fontRequests) expect(new URL(url).origin).toBe(origin);
  });

  test('Tamil headings, body and buttons all use Noto Sans Tamil (client, Nov 2026)', async ({
    page,
  }) => {
    await page.goto('/');
    await injectSpecimen(page);
    for (const selector of ['#tamil-specimen h2', '#tamil-specimen h3', '#inverse-band h3']) {
      expect((await computed(page, selector)).fontFamily, selector).toMatch(
        /^"?Noto Sans Tamil Variable/,
      );
    }
    for (const selector of [
      '#tamil-specimen p',
      '#tamil-specimen small',
      '[data-check="card"] button',
    ]) {
      expect((await computed(page, selector)).fontFamily, selector).toMatch(
        /^"?Noto Sans Tamil Variable/,
      );
    }
    // English headings are unaffected.
    expect((await computed(page, 'h1')).fontFamily).toMatch(/^"?Plus Jakarta Sans Variable/);
  });
});

test.describe('Tamil specimen at this viewport', () => {
  test('no clipping, overflow or cramped line height', async ({ page }, testInfo) => {
    await page.goto('/');
    await injectSpecimen(page);

    const problems = await page.evaluate(() => {
      const issues: string[] = [];
      const label = (el: Element) =>
        `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}…"`;

      for (const el of document.querySelectorAll<HTMLElement>('#tamil-specimen [data-check]')) {
        const s = getComputedStyle(el);
        const lineRatio = parseFloat(s.lineHeight) / parseFloat(s.fontSize);
        if (el.dataset.check === 'text' && lineRatio < 1.45) {
          issues.push(`${label(el)} line-height ratio ${lineRatio.toFixed(2)} < 1.45`);
        }
        if (el.scrollWidth > el.clientWidth + 1 && s.display !== 'inline') {
          issues.push(
            `${label(el)} overflows horizontally (${el.scrollWidth} > ${el.clientWidth})`,
          );
        }
        const parent = el.parentElement!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        if (box.right > parent.right + 1 && s.display !== 'inline') {
          issues.push(`${label(el)} extends past its container`);
        }
        if (el.dataset.check === 'button') {
          if (box.height < 44) issues.push(`${label(el)} is ${box.height}px tall (< 44px)`);
          if (el.scrollHeight > el.clientHeight + 1)
            issues.push(`${label(el)} clips its label vertically`);
        }
      }
      return issues;
    });

    await testInfo.attach(`tamil-specimen-${testInfo.project.name}.png`, {
      body: await page.locator('#tamil-specimen').screenshot(),
      contentType: 'image/png',
    });
    // The element screenshot scrolls to the specimen, which leaves footer links under the sticky
    // header; axe's target-size rule then reports that scroll position, not a real target problem.
    // Return to the top so the auto bug detector checks the page as a visitor first sees it.
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(problems).toEqual([]);
  });

  test('focus ring is visible on light and forest surfaces', async ({ page }) => {
    await page.goto('/');
    await injectSpecimen(page);

    const ringOf = async (selector: string) => {
      const target = page.locator(selector);
      // The new home page (Nov 2026) has more links before the specimen, so allow more Tab presses.
      for (let i = 0; i < 150; i += 1) {
        if (await target.evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(target).toBeFocused();
      return target.evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor };
      });
    };

    const light = await ringOf('[data-check="card"] button');
    expect(light.style).toBe('solid');
    expect(light.width).toBeGreaterThanOrEqual(2);
    expect(light.color).toBe('rgb(60, 118, 58)'); // --palette-green

    const dark = await ringOf('#inverse-button');
    expect(dark.color).toBe('rgb(212, 175, 55)'); // --palette-gold on forest
  });

  test('forest band turns headings, body text and links white (never forest on forest)', async ({
    page,
  }) => {
    await page.goto('/');
    await injectSpecimen(page);
    const band = page.locator('#inverse-band');
    const colours = await band.evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      heading: getComputedStyle(el.querySelector('h3')!).color,
      text: getComputedStyle(el.querySelector('p')!).color,
      link: getComputedStyle(el.querySelector('a')!).color,
    }));
    expect(colours).toEqual({
      background: 'rgb(15, 42, 29)', // --palette-forest
      heading: 'rgb(255, 255, 255)',
      text: 'rgb(255, 255, 255)',
      link: 'rgb(255, 255, 255)',
    });
  });

  test('forest band flips outline buttons and input borders; a nested .surface card flips back', async ({
    page,
  }) => {
    await page.goto('/');
    await injectSpecimen(page);
    const result = await page.locator('#inverse-band').evaluate((band) => {
      const css = (sel: string) => getComputedStyle(band.querySelector(sel)!);
      return {
        outlineText: css('#inverse-outline').color,
        outlineBorder: css('#inverse-outline').borderTopColor,
        inputBorder: css('#inverse-input').borderTopColor,
        cardBackground: css('#nested-card').backgroundColor,
        cardHeading: css('#nested-card h3').color,
        cardLink: css('#nested-card a').color,
      };
    });
    expect(result).toEqual({
      outlineText: 'rgb(255, 255, 255)',
      outlineBorder: 'rgb(255, 255, 255)',
      inputBorder: 'rgb(168, 213, 186)', // --palette-sage, 9.4:1 on forest
      cardBackground: 'rgb(255, 255, 255)',
      cardHeading: 'rgb(15, 42, 29)', // forest again on the light card
      cardLink: 'rgb(47, 94, 46)', // --palette-green-deep
    });
  });

  test('a whole page in Tamil (lang="ta" on <html>) switches body, headings and buttons', async ({
    page,
  }) => {
    await page.goto('/');
    await injectSpecimen(page);
    await page.evaluate(() => {
      document.documentElement.lang = 'ta';
    });
    for (const selector of ['body', '[data-check="card"] button']) {
      expect((await computed(page, selector)).fontFamily, selector).toMatch(
        /^"?Noto Sans Tamil Variable/,
      );
    }
    expect((await computed(page, 'h1')).fontFamily).toMatch(/^"?Noto Sans Tamil Variable/);
    const body = await computed(page, 'body');
    expect(body.lineHeight / body.fontSize).toBeGreaterThanOrEqual(1.75);
  });

  test('component classes that use heading tokens still get Tamil font and leading', async ({
    page,
  }) => {
    await page.goto('/');
    await injectSpecimen(page);
    const styled = await computed(page, '#class-styled');
    expect(styled.fontFamily).toMatch(/^"?Noto Sans Tamil Variable/);
    expect(styled.lineHeight / styled.fontSize).toBeGreaterThanOrEqual(1.45);
  });

  test('a long Tamil skip-link label stays fully hidden until focused', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('link', { name: /Skip to main content/ });
    await skip.evaluate((el, label) => {
      el.textContent = label;
      el.setAttribute('lang', 'ta');
    }, TAMIL_SKIP_LABEL);

    const hidden = await page.getByRole('link', { name: TAMIL_SKIP_LABEL }).boundingBox();
    expect(hidden!.y + hidden!.height, 'skip link must not peek into view').toBeLessThanOrEqual(0);

    await page.keyboard.press('Tab');
    const link = page.getByRole('link', { name: TAMIL_SKIP_LABEL });
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport({ ratio: 1 });
  });
});
