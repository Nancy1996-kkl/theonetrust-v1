import type { Page, Route } from '@playwright/test';

/**
 * Mocks the owner API in the browser for screens that need a signed-in owner (#37). Synthetic
 * data only. `routes` maps an admin path (after /api/v1/admin) to a JSON body, a status code,
 * or 'hang' (a request that never answers — the loading state).
 */
export type AdminReply = unknown | { status: number } | 'hang';

const ZERO = { grossPaise: 0, refundedPaise: 0, netPaise: 0, count: 0 };
const OVERVIEW = {
  today: ZERO,
  month: ZERO,
  lifetime: ZERO,
  pending: { count: 0, amountPaise: 0 },
  failed: { count: 0 },
  refunds: { count: 0, amountPaise: 0 },
  openExceptions: 0,
  stalePending: 0,
  manualReview: 0,
};

export async function signedInOwner(
  page: Page,
  locale: 'ta' | 'en',
  routes: Record<string, AdminReply> = {},
): Promise<void> {
  const user = { email: 'owner@example.org', role: 'OWNER', locale };
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({ json: { stage: 'ACTIVE', user, csrfToken: 'c' } }),
  );
  await page.route('**/api/v1/admin/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/admin', '');
    const reply = path in routes ? routes[path] : path === '/overview' ? OVERVIEW : undefined;
    if (reply === 'hang') return; // never answers: the loading state stays on screen
    if (reply && typeof reply === 'object' && 'status' in reply) {
      return route.fulfill({
        status: (reply as { status: number }).status,
        json: { error: { code: 'INTERNAL_ERROR', message: 'Synthetic', correlationId: 'x' } },
      });
    }
    return route.fulfill({ json: reply ?? {} });
  });
}
