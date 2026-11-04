import { createContext, useContext } from 'react';
import type { HelpRequest, HelpRequestAccepted } from '@theonetrust/contracts';

/**
 * How the Get Help panel sends a request. The real API adapter arrives with #22.
 *
 * - `mock`: pretends to accept (dev, tests, e2e). Never used on the live site, because a fake
 *   "we will call you" would leave a real person waiting for a call that never comes.
 * - `unavailable` (live default until #22): tells the person online requests are not open yet
 *   and offers phone and WhatsApp instead.
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

/** Picks the adapter from VITE_HELP_ADAPTER (`mock` only for dev/e2e builds). */
export function selectHelpClient(
  env: { VITE_HELP_ADAPTER?: string; DEV?: boolean } = import.meta.env,
): HelpClient {
  if (env.VITE_HELP_ADAPTER === 'mock') return createMockHelpClient();
  if (env.VITE_HELP_ADAPTER === undefined && env.DEV === true) return createMockHelpClient();
  return unavailableHelpClient;
}

export const HelpClientContext = createContext<HelpClient | null>(null);

export function useHelpClient(): HelpClient {
  return useContext(HelpClientContext) ?? selectHelpClient();
}
