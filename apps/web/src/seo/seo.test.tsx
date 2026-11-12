import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render.tsx';
import { TRUST_FACTS } from '../config/trust-facts.ts';
import {
  DISALLOWED_PATHS,
  INDEXABLE_PAGES,
  SITE_ORIGIN,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  headTags,
  headTagsToHtml,
  jsonLdText,
  ngoJsonLd,
} from './seo.ts';

afterEach(() => {
  document.documentElement.lang = 'en';
});

const home = INDEXABLE_PAGES[0]!;

describe('indexable pages match docs/design/sitemap.md', () => {
  const md = readFileSync(
    resolve(import.meta.dirname, '../../../../docs/design/sitemap.md'),
    'utf8',
  );
  const indexed = md
    .split('\n')
    .filter((l) => /^\| `\/[^`]*` \|.*\| Index \|/.test(l))
    .map((l) => /^\| `([^`]+)`/.exec(l)![1]);

  it('lists exactly the pages the sitemap marks as Index', () => {
    expect(INDEXABLE_PAGES.map((p) => p.path).sort()).toEqual([...indexed].sort());
  });

  it('every page has a title and description in both languages (Tamil in Tamil script)', () => {
    for (const page of INDEXABLE_PAGES) {
      for (const text of [page.title, page.description]) {
        expect(text.en.trim()).not.toBe('');
        expect(text.ta).toMatch(/[஀-௿]/);
      }
    }
  });

  it('titles are unique per language', () => {
    for (const lang of ['en', 'ta'] as const) {
      const titles = INDEXABLE_PAGES.map((p) => p.title[lang]);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });
});

describe('head tags', () => {
  it('Tamil home: canonical /ta/, hreflang en-IN / ta-IN / x-default, Open Graph ta_IN', () => {
    const tags = headTags(home, 'ta');
    const find = (k: string, v: string) => tags.find((t) => t.attrs[k] === v);
    expect(tags[0]).toEqual({ tag: 'title', attrs: {}, text: home.title.ta });
    expect(find('rel', 'canonical')?.attrs.href).toBe(`${SITE_ORIGIN}/ta/`);
    expect(find('hreflang', 'en-IN')?.attrs.href).toBe(`${SITE_ORIGIN}/`);
    expect(find('hreflang', 'ta-IN')?.attrs.href).toBe(`${SITE_ORIGIN}/ta/`);
    expect(find('hreflang', 'x-default')?.attrs.href).toBe(`${SITE_ORIGIN}/`);
    expect(find('property', 'og:locale')?.attrs.content).toBe('ta_IN');
    expect(find('property', 'og:locale:alternate')?.attrs.content).toBe('en_IN');
    expect(find('property', 'og:url')?.attrs.content).toBe(`${SITE_ORIGIN}/ta/`);
  });

  it('policy page canonical follows the language', () => {
    const terms = INDEXABLE_PAGES.find((p) => p.path === '/terms')!;
    expect(headTags(terms, 'en').find((t) => t.attrs.rel === 'canonical')?.attrs.href).toBe(
      `${SITE_ORIGIN}/terms`,
    );
  });

  it('serialises to HTML with escaping', () => {
    const html = headTagsToHtml([
      { tag: 'title', attrs: {}, text: 'A & <B>' },
      { tag: 'meta', attrs: { name: 'description', content: 'say "hi"' } },
    ]);
    expect(html).toBe(
      '<title>A &amp; &lt;B&gt;</title>\n    <meta name="description" content="say &quot;hi&quot;" />',
    );
    expect(headTagsToHtml([{ tag: 'title', attrs: {} }])).toBe('<title></title>');
  });

  it('React writes the tags into the document head on the live page', () => {
    renderRoute('/ta/privacy');
    expect(document.title).toBe(INDEXABLE_PAGES.find((p) => p.path === '/privacy')!.title.ta);
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_ORIGIN}/ta/privacy`,
    );
    expect(document.head.querySelector('link[hreflang="x-default"]')).toHaveAttribute(
      'href',
      `${SITE_ORIGIN}/privacy`,
    );
  });
});

describe('NGO structured data', () => {
  it('uses only verified facts', () => {
    expect(ngoJsonLd(TRUST_FACTS, 'en')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'NGO',
      name: 'Theonetrust.in',
      url: `${SITE_ORIGIN}/`,
      inLanguage: ['ta-IN', 'en-IN'],
      email: 'info.theonetrust@gmail.com',
      telephone: '+919600516999',
      areaServed: 'Kanchipuram, Tamil Nadu',
    });
  });

  it('leaves out every unknown fact and adds them once confirmed', () => {
    const bare = ngoJsonLd(
      { ...TRUST_FACTS, email: null, phone: null, area: null, address: null },
      'ta',
    );
    expect(Object.keys(bare).sort()).toEqual(['@context', '@type', 'inLanguage', 'name', 'url']);
    expect(bare.url).toBe(`${SITE_ORIGIN}/ta/`);
    const full = ngoJsonLd(
      { ...TRUST_FACTS, legalName: 'Example Trust', address: { en: '1 Street', ta: '1 தெரு' } },
      'en',
    );
    expect(full.name).toBe('Example Trust');
    expect(full.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '1 Street',
      addressCountry: 'IN',
    });
  });

  it('escapes < so the JSON cannot close its script tag', () => {
    expect(jsonLdText({ name: '</script><script>alert(1)</script>' })).not.toContain('<');
  });

  it('is on the home page only', () => {
    const { unmount } = renderRoute('/');
    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    unmount();
    renderRoute('/terms');
    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

describe('sitemap.xml and robots.txt', () => {
  const xml = buildSitemapXml();

  it('lists every indexable page in both languages with hreflang alternates', () => {
    expect(xml.match(/<url>/g)).toHaveLength(INDEXABLE_PAGES.length * 2);
    for (const loc of [
      '/',
      '/ta/',
      '/terms',
      '/ta/terms',
      '/privacy',
      '/ta/privacy',
      '/refund-policy',
      '/ta/refund-policy',
    ]) {
      expect(xml).toContain(`<loc>${SITE_ORIGIN}${loc}</loc>`);
    }
    expect(xml.match(/hreflang="x-default"/g)).toHaveLength(INDEXABLE_PAGES.length * 2);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /);
  });

  it('never lists private or not-found pages', () => {
    expect(xml).not.toMatch(/admin|receipt|manage|not-found/);
  });

  it('robots.txt blocks private routes and points to the sitemap', () => {
    const robots = buildRobotsTxt();
    for (const path of DISALLOWED_PATHS) expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(robots).not.toMatch(/Disallow: \/\n/);
  });
});

describe('llms.txt (client, Nov 2026)', () => {
  it('lists every public page in both languages and the confirmed contact details', () => {
    const txt = buildLlmsTxt();
    expect(txt).toMatch(/^# Theonetrust\.in\n/);
    for (const page of INDEXABLE_PAGES) {
      expect(txt).toContain(`(${SITE_ORIGIN}${page.path})`);
      expect(txt).toContain(`(${SITE_ORIGIN}/ta${page.path === '/' ? '/' : page.path})`);
    }
    expect(txt).toContain('Phone / WhatsApp: +91 96005 16999');
    expect(txt).toContain('Email: info.theonetrust@gmail.com');
    for (const path of DISALLOWED_PATHS) expect(txt).not.toContain(`${SITE_ORIGIN}${path}`);
  });

  it('never invents facts: unconfirmed details are left out', () => {
    const txt = buildLlmsTxt(SITE_ORIGIN, {
      ...TRUST_FACTS,
      phone: null,
      email: null,
      area: null,
    });
    expect(txt).not.toContain('## Contact');
    expect(txt).not.toMatch(/\[CONFIRM\]|null|undefined/);
    expect(txt).toContain('not a tax certificate');
  });
});
