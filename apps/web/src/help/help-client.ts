import { createContext, useContext } from 'react';
import {
  HELP_REFERENCE_PATTERN,
  type HelpRequest,
  type HelpRequestAccepted,
} from '@theonetrust/contracts';
import { apiUrl } from '../lib/api-url.ts';

/**
 * How the Get Help panel sends a request.
 *
 * - `mock`: pretends to accept (dev, tests, e2e). Never used on the live site, because a fake
 *   "we will call you" would leave a real person waiting for a call that never comes.
 * - `api` (#22): sends to the trust's API. The live site uses this once the API is deployed.
 * - `unavailable`: tells the person online requests are not open yet and offers phone and
 *   WhatsApp instead (live default until the API is configured).
 */
export type HelpSubmitResult =
  | ({ ok: true } & HelpRequestAccepted)
  | { ok: false; reason: 'network' | 'rate_limited' | 'invalid' | 'unavailable' };

export interface HelpClient {
  /** True when requests really reach the trust. The panel hides the form when false. */
  acceptsRequests: boolean;
  submit(request: HelpRequest): Promise<HelpSubmitResult>;
}

const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** HLP-XXXX with an unambiguous alphabet (no I or O). */
export function mockReference(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)];
  }
  return `HLP-${code}`;
}

export function createMockHelpClient(delayMs = 300): HelpClient {
  return {
    acceptsRequests: true,
    submit: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ ok: true, reference: mockReference() }), delayMs);
      }),
  };
}

export const unavailableHelpClient: HelpClient = {
  acceptsRequests: false,
  submit: () => Promise.resolve({ ok: false, reason: 'unavailable' }),
};

/** Sends to `POST /api/v1/help-requests` (wizard) or `/help-requests/callback`. */
export function createApiHelpClient(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): HelpClient {
  return {
    acceptsRequests: true,
    async submit(request) {
      let res: Response;
      try {
        res = await fetchImpl(
          apiUrl(
            baseUrl,
            request.mode === 'callback' ? '/help-requests/callback' : '/help-requests',
          ),
          {
            method: 'POST',
            credentials: 'omit',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(request),
          },
        );
      } catch {
        return { ok: false, reason: 'network' };
      }
      if (res.status === 201) {
        const body = (await res.json().catch(() => null)) as { reference?: unknown } | null;
        if (typeof body?.reference === 'string' && HELP_REFERENCE_PATTERN.test(body.reference)) {
          return { ok: true, reference: body.reference };
        }
        return { ok: false, reason: 'network' };
      }
      if (res.status === 429) return { ok: false, reason: 'rate_limited' };
      if (res.status === 400) return { ok: false, reason: 'invalid' };
      if (res.status === 503) return { ok: false, reason: 'unavailable' };
      return { ok: false, reason: 'network' };
    },
  };
}

/** Picks the adapter from VITE_HELP_ADAPTER (`mock` only for dev/e2e builds). */
export function selectHelpClient(
  env: { VITE_HELP_ADAPTER?: string; VITE_API_BASE_URL?: string; DEV?: boolean } = import.meta.env,
): HelpClient {
  if (env.VITE_HELP_ADAPTER === 'api') return createApiHelpClient(env.VITE_API_BASE_URL);
  if (env.VITE_HELP_ADAPTER === 'mock') return createMockHelpClient();
  if (env.VITE_HELP_ADAPTER === undefined && env.DEV === true) return createMockHelpClient();
  return unavailableHelpClient;
}

export const HelpClientContext = createContext<HelpClient | null>(null);

export function useHelpClient(): HelpClient {
  return useContext(HelpClientContext) ?? selectHelpClient();
}
