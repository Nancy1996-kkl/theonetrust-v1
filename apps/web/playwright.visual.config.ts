import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

/**
 * Visual baselines (#37): the same five viewports as the main suite, run separately with
 * `pnpm test:visual` (update: `pnpm test:visual:update`). Baselines are rendered on Linux
 * Chromium (the CI runner); the file names carry no platform, so they are compared there.
 * Screenshots wait for fonts, freeze animations and hide the caret; a tiny pixel tolerance
 * absorbs anti-aliasing only — a real layout change still fails.
 */
export default defineConfig({
  ...base,
  testMatch: '**/*.visual.ts',
  // Reduced motion: the landing page's entrance motion would otherwise race the screenshot.
  use: { ...base.use, reducedMotion: 'reduce' },
  testIgnore: [],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' },
  },
});
