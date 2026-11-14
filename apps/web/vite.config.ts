/// <reference types="vitest/config" />
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error -- plain ESM helper shared with the prerender script (tested with node --test)
import { webSecurityHeaders } from './scripts/security-headers.mjs';

/**
 * `vite preview` serves `/terms/` from dist/terms/index.html but answers `/terms` with the
 * SPA fallback. Static hosts serve the prerendered page for both, so preview (and e2e) does
 * the same: `/path` → `/path/index.html` when that prerendered file exists.
 */
function prerenderedPages(): Plugin {
  return {
    name: 'theonetrust:prerendered-pages',
    configurePreviewServer(server) {
      const dist = resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((req, _res, next) => {
        const [path = '', query] = (req.url ?? '').split('?');
        if (/^\/[a-z0-9/-]+$/.test(path) && !path.endsWith('/')) {
          if (existsSync(join(dist, path, 'index.html'))) {
            req.url = `${path}/index.html${query ? `?${query}` : ''}`;
          }
        }
        next();
      });
    },
  };
}

/**
 * `vite preview` sends the production security headers (#38), so every e2e test runs under the
 * real Content-Security-Policy and a violation fails it (the auto bug detector reads the console).
 * HSTS and upgrade-insecure-requests are left out: preview is plain http on 127.0.0.1.
 */
function securityHeaders(): Plugin {
  return {
    name: 'theonetrust:security-headers',
    configurePreviewServer(server) {
      const headers = webSecurityHeaders({
        apiBaseUrl: process.env.VITE_API_BASE_URL,
        production: false,
      }) as Record<string, string>;
      server.middlewares.use((_req, res, next) => {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), prerenderedPages(), securityHeaders()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    sourcemap: true,
    // Never inline fonts as data: URIs — the CSP only allows fonts from our own origin, and some
    // font subsets are small enough that Vite would otherwise inline them.
    assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? false : undefined),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // A test that never asserts is a test that never fails.
    expect: { requireAssertions: true },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Entry points: main.tsx (browser) and entry-server.ts (build-time prerender, covered by e2e).
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/entry-server.ts',
        'src/vite-env.d.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
