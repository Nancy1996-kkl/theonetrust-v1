import type { UiLang } from '../components/ui/ui-strings.ts';
import type { TrustFacts } from '../config/trust-facts.ts';
import { POLICIES } from '../content/policies.ts';
import { localizedPath } from '../i18n/lang.ts';

/**
 * Search and sharing metadata (issue #16). One list drives page titles, descriptions, canonical
 * URLs, hreflang alternates, Open Graph, sitemap.xml, robots.txt and the static prerender.
 * Only indexable public pages are listed (docs/design/sitemap.md "Search engines").
 */
export const SITE_ORIGIN = 'https://theonetrust.in';

export type Bilingual = Record<UiLang, string>;

export interface IndexablePage {
  /** English path; the Tamil mirror is /ta + path (ADR 0004). */
  path: '/' | '/terms' | '/privacy' | '/refund-policy';
  title: Bilingual;
  description: Bilingual;
}

const SITE = 'Theonetrust.in';

export const INDEXABLE_PAGES: IndexablePage[] = [
  {
    path: '/',
    title: {
      en: `${SITE} — donate or ask for help`,
      ta: `${SITE} — நன்கொடை கொடுக்க, உதவி கேட்க`,
    },
    description: {
      en: 'Donate online to the trust or ask for help — in Tamil or English. Kanchipuram, Tamil Nadu.',
      ta: 'அறக்கட்டளைக்கு இணையத்தில் நன்கொடை கொடுங்கள், அல்லது உதவி கேளுங்கள் — தமிழிலும் ஆங்கிலத்திலும். காஞ்சிபுரம், தமிழ்நாடு.',
    },
  },
  ...(['terms', 'privacy', 'refund'] as const).map((id) => ({
    path: POLICIES[id].path,
    title: {
      en: `${POLICIES[id].title.en} · ${SITE}`,
      ta: `${POLICIES[id].title.ta} · ${SITE}`,
    },
    description: POLICIES[id].intro,
  })),
];

export const HREFLANG: Record<UiLang, string> = { en: 'en-IN', ta: 'ta-IN' };

export function absoluteUrl(path: string, origin = SITE_ORIGIN): string {
  return `${origin}${path}`;
}

export interface HeadTag {
  tag: 'title' | 'meta' | 'link';
  attrs: Record<string, string>;
  text?: string;
}

/** Every head tag for one page in one language. Pure — used by React and the prerender. */
export function headTags(page: IndexablePage, lang: UiLang, origin = SITE_ORIGIN): HeadTag[] {
  const url = absoluteUrl(localizedPath(page.path, lang), origin);
  const other: UiLang = lang === 'en' ? 'ta' : 'en';
  return [
    { tag: 'title', attrs: {}, text: page.title[lang] },
    { tag: 'meta', attrs: { name: 'description', content: page.description[lang] } },
    { tag: 'link', attrs: { rel: 'canonical', href: url } },
    {
      tag: 'link',
      attrs: {
        rel: 'alternate',
        hreflang: HREFLANG.en,
        href: absoluteUrl(localizedPath(page.path, 'en'), origin),
      },
    },
    {
      tag: 'link',
      attrs: {
        rel: 'alternate',
        hreflang: HREFLANG.ta,
        href: absoluteUrl(localizedPath(page.path, 'ta'), origin),
      },
    },
    {
      tag: 'link',
      attrs: {
        rel: 'alternate',
        hreflang: 'x-default',
        href: absoluteUrl(localizedPath(page.path, 'en'), origin),
      },
    },
    { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    { tag: 'meta', attrs: { property: 'og:site_name', content: SITE } },
    { tag: 'meta', attrs: { property: 'og:title', content: page.title[lang] } },
    { tag: 'meta', attrs: { property: 'og:description', content: page.description[lang] } },
    { tag: 'meta', attrs: { property: 'og:url', content: url } },
    { tag: 'meta', attrs: { property: 'og:locale', content: HREFLANG[lang].replace('-', '_') } },
    {
      tag: 'meta',
      attrs: { property: 'og:locale:alternate', content: HREFLANG[other].replace('-', '_') },
    },
  ];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function headTagsToHtml(tags: HeadTag[]): string {
  return tags
    .map(({ tag, attrs, text }) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
        .join('');
      return tag === 'title' ? `<title>${escapeHtml(text ?? '')}</title>` : `<${tag}${a} />`;
    })
    .join('\n    ');
}

/**
 * schema.org NGO with verified fields only — anything null in trust-facts is left out, never
 * guessed (no legal name, registration or tax status until #1 confirms them).
 */
export function ngoJsonLd(
  facts: TrustFacts,
  lang: UiLang,
  origin = SITE_ORIGIN,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: facts.legalName ?? facts.siteName,
    url: absoluteUrl(localizedPath('/', lang), origin),
    inLanguage: [HREFLANG.ta, HREFLANG.en],
  };
  if (facts.email) data.email = facts.email;
  if (facts.phone) data.telephone = facts.phone.tel;
  if (facts.area) data.areaServed = facts.area.en;
  if (facts.address) {
    data.address = {
      '@type': 'PostalAddress',
      streetAddress: facts.address.en,
      addressCountry: 'IN',
    };
  }
  return data;
}

/** JSON for a <script type="application/ld+json">, safe against </script> injection. */
export function jsonLdText(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** sitemap.xml with hreflang alternates for every indexable page in both languages. */
export function buildSitemapXml(origin = SITE_ORIGIN, pages = INDEXABLE_PAGES): string {
  const urls = pages.flatMap((page) =>
    (['en', 'ta'] as const).map((lang) => {
      const alternates = (['en', 'ta'] as const)
        .map(
          (alt) =>
            `    <xhtml:link rel="alternate" hreflang="${HREFLANG[alt]}" href="${absoluteUrl(localizedPath(page.path, alt), origin)}"/>`,
        )
        .concat(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(localizedPath(page.path, 'en'), origin)}"/>`,
        )
        .join('\n');
      return `  <url>\n    <loc>${absoluteUrl(localizedPath(page.path, lang), origin)}</loc>\n${alternates}\n  </url>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

/** Private routes are never crawled (receipt and manage links carry tokens; admin is owner-only). */
export const DISALLOWED_PATHS = ['/admin', '/receipt/', '/manage/', '/ta/receipt/', '/ta/manage/'];

export function buildRobotsTxt(origin = SITE_ORIGIN): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}
