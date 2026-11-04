/// <reference types="vitest/config" />
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
  plugins: [react(), prerenderedPages()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: true },
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
