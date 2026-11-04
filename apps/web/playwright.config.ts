import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);

/**
 * Test viewports from PROJECT_SPEC §5 and the UX brief. Every spec runs at
 * every width, so a layout bug at one breakpoint cannot slip through.
 */
const viewports = [
  { name: 'mobile-360', width: 360, height: 800, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'desktop-1366', width: 1366, height: 768, mobile: false },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
] as const;

export default defineConfig({
  testDir: './e2e',
  // Visual baselines run on their own (playwright.visual.config.ts, #37).
  testIgnore: '**/*.visual.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry captures a trace; a test that only passes on retry still fails the run.
  retries: isCI ? 1 : 0,
  failOnFlakyTests: isCI,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  projects: viewports.map((vp) => ({
    name: vp.name,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    },
  })),
  // Set E2E_BASE_URL to test an already-running or deployed site instead of a local build.
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: `pnpm run build && pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
          url: BASE_URL,
          reuseExistingServer: !isCI,
          // The Get Help panel uses the mock adapter in e2e; the live default is "unavailable" (#15, #22).
          env: { VITE_HELP_ADAPTER: 'mock', VITE_DONATE_ADAPTER: 'mock' },
          timeout: 120_000,
        },
      }),
});
