import { TRUST_FACTS } from '../config/trust-facts.ts';
import { useLang } from '../i18n/use-lang.ts';
import { INDEXABLE_PAGES, headTags, jsonLdText, ngoJsonLd, type IndexablePage } from './seo.ts';

/**
 * Title, description, canonical, hreflang and Open Graph for an indexable page (React 19 hoists
 * these into <head>). The prerender writes the same tags into the static HTML.
 */
export function PageMeta({
  path,
  organisation = false,
}: {
  path: IndexablePage['path'];
  organisation?: boolean;
}) {
  const lang = useLang();
  const page = INDEXABLE_PAGES.find((p) => p.path === path);
  if (!page) return null;
  return (
    <>
      {headTags(page, lang).map(({ tag, attrs, text }) => {
        const key = `${tag}-${attrs.name ?? attrs.property ?? attrs.rel ?? ''}-${attrs.hreflang ?? ''}`;
        if (tag === 'title') return <title key={key}>{text}</title>;
        if (tag === 'meta') return <meta key={key} {...attrs} />;
        const { hreflang, ...rest } = attrs;
        return <link key={key} {...rest} {...(hreflang ? { hrefLang: hreflang } : {})} />;
      })}
      {organisation && (
        <script
          type="application/ld+json"
          // Static JSON built from verified facts only; '<' is escaped in jsonLdText.
          dangerouslySetInnerHTML={{ __html: jsonLdText(ngoJsonLd(TRUST_FACTS, lang)) }}
        />
      )}
    </>
  );
}
