import { StrictMode, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import { routes } from './app/routes.tsx';

/**
 * Static prerender entry (issue #16). Built with `vite build --ssr` and called by
 * scripts/prerender.mjs for each indexable page, so search engines and slow phones get real
 * HTML before JavaScript runs. Never used at runtime in the browser.
 */
export async function render(url: string): Promise<string> {
  const { query, dataRoutes } = createStaticHandler(routes);
  const context = await query(new Request(`https://prerender.local${url}`));
  if (context instanceof Response) throw new Error(`Unexpected redirect while prerendering ${url}`);
  const router = createStaticRouter(dataRoutes, context);
  return renderToString(
    createElement(
      StrictMode,
      null,
      createElement(StaticRouterProvider, { router, context, hydrate: false }),
    ),
  );
}

export {
  INDEXABLE_PAGES,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  headTags,
  headTagsToHtml,
} from './seo/seo.ts';
export { localizedPath } from './i18n/lang.ts';
