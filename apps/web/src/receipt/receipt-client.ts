import { createContext, useContext } from 'react';
import { isReceiptToken, type ReceiptView } from '@theonetrust/contracts';
import { apiUrl } from '../lib/api-url.ts';

/**
 * Donation acknowledgement data (#29). Follows the donate adapter (VITE_DONATE_ADAPTER): `api`
 * on the live site, `mock` in dev/e2e (a visibly synthetic acknowledgement), else unavailable.
 */
export type ReceiptLookup =
  { kind: 'found'; view: ReceiptView } | { kind: 'not-found' } | { kind: 'unavailable' };

export interface ReceiptClient {
  get(token: string): Promise<ReceiptLookup>;
}

export function createApiReceiptClient(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ReceiptClient {
  return {
    async get(token) {
      if (!isReceiptToken(token)) return { kind: 'not-found' };
      try {
        const res = await fetchImpl(apiUrl(baseUrl, `/receipts/${token}`), {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        if (res.status === 404 || res.status === 400) return { kind: 'not-found' };
        if (!res.ok) return { kind: 'unavailable' };
        const view = (await res.json().catch(() => null)) as ReceiptView | null;
        return view && typeof view.receiptNumber === 'string'
          ? { kind: 'found', view }
          : { kind: 'unavailable' };
      } catch {
        return { kind: 'unavailable' };
      }
    },
  };
}

/** The token the mock donate client hands out after a mock payment. */
export const MOCK_RECEIPT_TOKEN = 'M'.repeat(43);
export const MOCK_REPLACED_TOKEN = 'R'.repeat(43);

const MOCK_VIEW: ReceiptView = {
  receiptNumber: 'TOT-R-2026-27-000000',
  donationReference: 'TOT-D-MOCK00000000',
  issuedAt: '2026-11-04T10:00:00.000Z',
  amountPaise: 100_000,
  currency: 'INR',
  method: 'upi',
  purpose: null,
  donorName: 'Synthetic Donor',
  trust: { legalName: null, registration: null },
  approval: null,
  state: 'VALID',
  replacementToken: null,
  templateVersion: 'ack-v1',
};

export function createMockReceiptClient(): ReceiptClient {
  return {
    get: async (token) => {
      if (token === MOCK_RECEIPT_TOKEN) return { kind: 'found', view: MOCK_VIEW };
      if (token === MOCK_REPLACED_TOKEN) {
        return {
          kind: 'found',
          view: { ...MOCK_VIEW, state: 'REPLACED', replacementToken: MOCK_RECEIPT_TOKEN },
        };
      }
      return { kind: 'not-found' };
    },
  };
}

export const unavailableReceiptClient: ReceiptClient = {
  get: async () => ({ kind: 'unavailable' }),
};

export function selectReceiptClient(
  env: { VITE_DONATE_ADAPTER?: string; VITE_API_BASE_URL?: string; DEV?: boolean } = import.meta
    .env,
): ReceiptClient {
  if (env.VITE_DONATE_ADAPTER === 'api') return createApiReceiptClient(env.VITE_API_BASE_URL);
  if (env.VITE_DONATE_ADAPTER === 'mock') return createMockReceiptClient();
  if (env.VITE_DONATE_ADAPTER === undefined && env.DEV === true) return createMockReceiptClient();
  return unavailableReceiptClient;
}

export const ReceiptClientContext = createContext<ReceiptClient | null>(null);

let defaultClient: ReceiptClient | undefined;
export function useReceiptClient(): ReceiptClient {
  const injected = useContext(ReceiptClientContext);
  defaultClient ??= selectReceiptClient();
  return injected ?? defaultClient;
}
