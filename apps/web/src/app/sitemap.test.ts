// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './routes.tsx';

/**
 * Keeps docs/design/sitemap.md and the real route table in step, and enforces the URL rules
 * from ADR 0004 (Tamil under /ta/) and the plan (no personal data in URLs, private pages noindex).
 */

interface SitemapRow {
  route: string;
  tamil: string;
  access: string;
  index: string;
  builtIn: string;
  status: string;
}

const sitemapPath = resolve(import.meta.dirname, '../../../../docs/design/sitemap.md');

export function parseSitemap(markdown: string): SitemapRow[] {
  return markdown
    .split('\n')
    .filter((line) => /^\| `[^`]+` \|/.test(line))
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split(' | ')
        .map((cell) => cell.trim().replace(/^`|`$/g, ''));
      const [route = '', tamil = '', , , access = '', index = '', builtIn = '', status = ''] =
        cells;
      return { route, tamil, access, index, builtIn, status };
    });
}

/** Flattens a React Router table into full paths ('/' parent + 'donate' child → '/donate'). */
export function flattenRoutes(table: RouteObject[], parent = ''): string[] {
  return table.flatMap((route) => {
    const own = route.index
      ? parent || '/'
      : route.path === '*'
        ? '*'
        : `${parent.replace(/\/$/, '')}/${(route.path ?? '').replace(/^\//, '')}`.replace(
            /\/$/,
            '',
          ) || '/';
    const children = route.children
      ? flattenRoutes(route.children, route.path === '*' ? parent : own)
      : [];
    // A layout route with only children is represented by its index/children, not itself.
    return route.children ? children : [own];
  });
}

const sitemapMarkdown = readFileSync(sitemapPath, 'utf8');
const rows = parseSitemap(sitemapMarkdown);
const appRoutes = [...new Set(flattenRoutes(routes))];
const isAdmin = (route: string) => route.startsWith('/admin');
const isPrivateLink = (route: string) => /:token\b/.test(route);

/** ADR 0005: the only public browsing pages are the single page and Razorpay's policy pages. */
const ALLOWED_PUBLIC_PAGES = ['/', '/privacy', '/terms', '/refund-policy', '*'];
const expectedTamil = (route: string) =>
  route === '/' ? '/ta/' : route === '*' ? '/ta/*' : `/ta${route}`;

describe('helpers', () => {
  it('flattens nested and index routes into full paths', () => {
    const table: RouteObject[] = [
      {
        path: '/',
        children: [
          { index: true },
          { path: 'donate', children: [{ index: true }, { path: 'status/:token' }] },
          { path: '*' },
        ],
      },
    ];
    expect(flattenRoutes(table)).toEqual(['/', '/donate', '/donate/status/:token', '*']);
  });

  it('parses table rows and ignores other lines', () => {
    const md = 'text\n| `/a` | `/ta/a` | p | w | Public | Index | #1 | Built |\n| Route | x |';
    expect(parseSitemap(md)).toEqual([
      {
        route: '/a',
        tamil: '/ta/a',
        access: 'Public',
        index: 'Index',
        builtIn: '#1',
        status: 'Built',
      },
    ]);
  });
});

describe('docs/design/sitemap.md matches the app', () => {
  it('has rows to check', () => {
    expect(rows.length).toBeGreaterThan(10);
    expect(new Set(rows.map((r) => r.route)).size).toBe(rows.length);
  });

  it.each(appRoutes)('app route %s is documented as Built', (route) => {
    // Routes under /ta/ (added in #11) are checked against the documented Tamil column.
    // React Router flattens the Tamil home to "/ta"; the table writes it as "/ta/".
    const same = (a: string, b: string) => a.replace(/(.)\/$/, '$1') === b.replace(/(.)\/$/, '$1');
    const row = rows.find((r) => r.route === route || same(r.tamil, route));
    expect(row, `${route} is missing from sitemap.md`).toBeDefined();
    expect(row!.status).toMatch(/^Built/);
  });

  it('marks nothing as Built that the app does not have', () => {
    const claimed = rows.filter((r) => r.status.startsWith('Built')).map((r) => r.route);
    expect(claimed.filter((route) => !appRoutes.includes(route))).toEqual([]);
  });
});

describe('single public page (ADR 0005)', () => {
  it('has no public browsing pages beyond the single page and the policy pages', () => {
    const publicPages = rows
      .map((r) => r.route)
      .filter((route) => !isAdmin(route) && !isPrivateLink(route));
    expect(publicPages.filter((route) => !ALLOWED_PUBLIC_PAGES.includes(route))).toEqual([]);
  });

  it('documents every allowed public page', () => {
    for (const route of ALLOWED_PUBLIC_PAGES) {
      expect(
        rows.some((r) => r.route === route),
        route,
      ).toBe(true);
    }
  });
});

describe('URL rules', () => {
  it.each(rows.filter((r) => !isAdmin(r.route)).map((r) => [r.route, r]))(
    'public route %s has its Tamil mirror under /ta/',
    (route, row) => {
      expect(row.tamil).toBe(expectedTamil(route));
    },
  );

  it.each(rows.filter((r) => isAdmin(r.route)).map((r) => [r.route, r]))(
    'admin route %s is not mirrored and not indexed',
    (_route, row) => {
      expect(row.tamil).toBe('—');
      expect(row.index).toBe('No index');
    },
  );

  it.each(rows.filter((r) => /:(token|reference)\b/.test(r.route)).map((r) => [r.route, r]))(
    'private link %s is never indexed',
    (_route, row) => {
      expect(row.index).toBe('No index');
    },
  );

  it.each(rows.map((r) => [r.route, r]))('%s names the issue that builds it', (_route, row) => {
    expect(row.builtIn).toMatch(/#\d+/);
  });

  // Any route parameter or query key whose name contains a personal-data word.
  const PII = /(name|phone|mobile|email|mail|pan|aadhaar|address|upi|vpa|dob)/i;
  const paramNames = (route: string) => [...route.matchAll(/:(\w+)/g)].map(([, name = '']) => name);

  it('detects personal data in parameter names it is meant to block', () => {
    for (const bad of [
      '/r/:phone',
      '/r/:phoneNumber',
      '/r/:donorEmail',
      '/r/:mobile_no',
      '/r/:panNo',
    ]) {
      expect(
        paramNames(bad).some((name) => PII.test(name)),
        bad,
      ).toBe(true);
    }
    expect(paramNames('/receipt/:token').some((name) => PII.test(name))).toBe(false);
  });

  it('never puts personal data in a URL path parameter', () => {
    const offenders = [...rows.flatMap((r) => [r.route, r.tamil]), ...appRoutes].filter((route) =>
      paramNames(route).some((name) => PII.test(name)),
    );
    expect(offenders).toEqual([]);
  });

  it('limits /donate pre-fill to the approved, non-personal query keys', () => {
    const line = sitemapMarkdown.split('\n').find((l) => l.includes('safe pre-fill parameters'));
    expect(line, 'URL rules must document the /donate pre-fill parameters').toBeDefined();
    const query = /`\?([^`]+)`/.exec(line!)?.[1] ?? '';
    const keys = query.split('&').map((pair) => pair.split('=')[0]);
    expect(keys).toEqual(['programme', 'amount', 'frequency']);
    for (const key of keys) expect(PII.test(key ?? ''), key).toBe(false);
  });
});
