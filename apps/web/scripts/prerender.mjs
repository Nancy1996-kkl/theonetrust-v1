#!/usr/bin/env node
/**
 * Static prerender (issue #16). Runs after `vite build` and `vite build --ssr src/entry-server.ts`.
 * For every indexable page in both languages it writes dist/<path>/index.html with:
 *   - the real page HTML inside #root (search engines and slow phones see content before JS),
 *   - <html lang>, title, description, canonical, hreflang and Open Graph in <head>,
 *   - preload links for the fonts that page needs first.
 * Also writes 404.html (not-found, noindex), sitemap.xml, robots.txt, llms.txt and _headers (#38).
 */
import { readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { headersFile, webSecurityHeaders } from './security-headers.mjs';

const webRoot = resolve(import.meta.dirname, '..');
const dist = join(webRoot, 'dist');
const serverDir = join(webRoot, 'dist-server');

const server = await import(pathToFileURL(join(serverDir, 'entry-server.js')).href);
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const fonts = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.woff2'));

/** Head tags React hoists to the start of the SSR output; they are written into <head> instead. */
const HOISTED =
  /<title>[\s\S]*?<\/title>|<meta [^>]*\/>|<link rel="(?:canonical|alternate)"[^>]*\/>/g;

function fontPreloads(lang) {
  const wanted =
    lang === 'ta'
      ? [/^noto-sans-tamil-tamil-wght-normal-/, /^plus-jakarta-sans-latin-wght-normal-/]
      : [/^plus-jakarta-sans-latin-wght-normal-/];
  return wanted
    .map((re) => fonts.find((f) => re.test(f)))
    .filter(Boolean)
    .map(
      (f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`,
    );
}

/**
 * The stylesheet (~7 kB gzipped) is inlined so the first paint does not wait for a second request
 * (it was the main LCP delay on mobile). Its font URLs are absolute (/assets/…), so they still resolve.
 */
const cssLink = /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/;
const cssHref = cssLink.exec(template)?.[1];
const inlineCss = cssHref ? readFileSync(join(dist, cssHref), 'utf8') : null;

export function fillTemplate(html, { lang, head, body }) {
  const styled = inlineCss ? html.replace(cssLink, () => `<style>${inlineCss}</style>`) : html;
  return styled
    .replace(/<html lang="[^"]*">/, `<html lang="${lang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

async function page(url, lang, headHtml) {
  const body = (await server.render(url)).replace(HOISTED, '');
  return fillTemplate(template, {
    lang,
    head: [headHtml, ...fontPreloads(lang)].join('\n    '),
    body,
  });
}

function write(path, contents) {
  const file = join(dist, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
  console.log(`prerendered ${path}`);
}

for (const indexable of server.INDEXABLE_PAGES) {
  for (const lang of ['en', 'ta']) {
    const url = server.localizedPath(indexable.path, lang);
    const head = server.headTagsToHtml(server.headTags(indexable, lang));
    const file = url === '/' ? 'index.html' : join(url.replace(/^\//, ''), 'index.html');
    write(file, await page(url, lang, head));
  }
}

write(
  '404.html',
  await page(
    '/__not-found__',
    'en',
    '<title>Page not found · Theonetrust.in</title>\n    <meta name="robots" content="noindex" />',
  ),
);
write('sitemap.xml', server.buildSitemapXml());
write('robots.txt', server.buildRobotsTxt());
write('llms.txt', server.buildLlmsTxt());
// Security headers for the static host (#38), with the API origin this build talks to.
const { VITE_API_BASE_URL } = loadEnv('production', webRoot, 'VITE_');
write(
  '_headers',
  headersFile(
    webSecurityHeaders({
      apiBaseUrl: process.env.VITE_API_BASE_URL ?? VITE_API_BASE_URL,
      production: true,
    }),
  ),
);

rmSync(serverDir, { recursive: true, force: true });
