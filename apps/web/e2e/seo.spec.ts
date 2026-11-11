import { expect, test } from './fixtures/guard.ts';

/**
 * Static prerender and SEO files (#16). Reads the raw HTML the way a search engine does (no JavaScript).
 */
test.describe('prerendered HTML (no JavaScript)', () => {
  test('Tamil home: content, lang, canonical, hreflang, JSON-LD and font preload', async ({
    request,
  }) => {
    const html = await (await request.get('/ta/')).text();
    expect(html).toMatch(/<html lang="ta">/);
    expect(html).toContain('<h1 id="hp-hero-title"');
    expect(html).toContain('எங்கே உதவி தேவை');
    expect(html).toContain('<link rel="canonical" href="https://theonetrust.in/ta/" />');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain('application/ld+json');
    expect(html).toMatch(
      /rel="preload" href="\/assets\/noto-sans-tamil-tamil-[^"]+\.woff2" as="font"/,
    );
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  for (const path of ['/terms', '/ta/privacy', '/refund-policy']) {
    test(`${path} is prerendered`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      expect(html).toContain('<h1 id="policy-title">');
      expect(html).toContain(`<link rel="canonical" href="https://theonetrust.in${path}" />`);
    });
  }

  test('sitemap.xml and robots.txt are served', async ({ request }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain('<loc>https://theonetrust.in/ta/refund-policy</loc>');
    expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /admin');
  });
});

test('the app takes over the prerendered page without console errors', async ({ page }) => {
  await page.goto('/ta/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
  await page.locator('#top').getByRole('link', { name: 'உதவி பெற' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
});
