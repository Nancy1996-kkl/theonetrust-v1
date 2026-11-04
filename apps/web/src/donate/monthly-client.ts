import { createContext, useContext } from 'react';
import type {
  ManageView,
  MonthlyMethod,
  SubscriptionRequest,
  SubscriptionResponse,
  SubscriptionVerifyResponse,
} from '@theonetrust/contracts';
import { apiUrl } from '../lib/api-url.ts';
import { loadCheckout, type CheckoutOutcome, type CheckoutPrefill } from './donate-client.ts';

/**
 * Monthly giving (#32): server-created Razorpay subscription → Checkout (UPI AutoPay, eMandate
 * or card, by amount) → server verification. Same adapters as the donate panel: `api` live,
 * `mock` in dev/e2e (window.__monthlyMock = 'success' | 'cancel' | 'pending'), else unavailable.
 */
export type MonthlyStart =
  | { ok: true; subscription: SubscriptionResponse }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'unavailable' | 'network' };

export interface MonthlyClient {
  start(request: SubscriptionRequest, idempotencyKey: string): Promise<MonthlyStart>;
  checkout(subscription: SubscriptionResponse, prefill: CheckoutPrefill): Promise<CheckoutOutcome>;
  verify(
    subscription: SubscriptionResponse,
    outcome: { paymentId: string; signature: string },
  ): Promise<SubscriptionVerifyResponse | null>;
  manage(
    token: string,
  ): Promise<{ kind: 'found'; view: ManageView } | { kind: 'not-found' | 'unavailable' }>;
  cancel(
    token: string,
  ): Promise<{ kind: 'cancelled'; view: ManageView } | { kind: 'not-found' | 'unavailable' }>;
}

interface SubscriptionCheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { name: string; email?: string; contact?: string };
  config?: { display: { hide: Array<{ method: string }> } };
  handler: (r: { razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void; escape: boolean; confirm_close: boolean };
}
type SubscriptionCheckout = new (options: SubscriptionCheckoutOptions) => {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { reason?: string } }) => void): void;
};

const ALL_METHODS: MonthlyMethod[] = ['upi', 'emandate', 'card'];

/** Razorpay Checkout `config.display.hide` for the methods this amount may not use. */
export function hiddenMethods(allowed: MonthlyMethod[]): Array<{ method: string }> {
  return ALL_METHODS.filter((m) => !allowed.includes(m)).map((method) => ({ method }));
}

function failure(status: number): 'invalid' | 'rate_limited' | 'unavailable' | 'network' {
  if (status === 400 || status === 409) return 'invalid';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  return 'network';
}

export function createApiMonthlyClient(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  load: () => Promise<unknown> = () => loadCheckout(),
): MonthlyClient {
  const json = { 'content-type': 'application/json', accept: 'application/json' };
  const manageCall = async (token: string, cancel: boolean) => {
    try {
      const res = await fetchImpl(
        apiUrl(
          baseUrl,
          `/subscriptions/manage/${encodeURIComponent(token)}${cancel ? '/cancel' : ''}`,
        ),
        {
          method: cancel ? 'POST' : 'GET',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          headers: json,
          ...(cancel && { body: JSON.stringify({ confirm: true }) }),
        },
      );
      if (res.status === 404 || res.status === 400) return { kind: 'not-found' as const };
      if (!res.ok) return { kind: 'unavailable' as const };
      const view = (await res.json().catch(() => null)) as ManageView | null;
      return view?.publicReference ? { view } : { kind: 'unavailable' as const };
    } catch {
      return { kind: 'unavailable' as const };
    }
  };
  return {
    async start(request, idempotencyKey) {
      let res: Response;
      try {
        res = await fetchImpl(apiUrl(baseUrl, '/subscriptions'), {
          method: 'POST',
          credentials: 'omit',
          headers: { ...json, 'idempotency-key': idempotencyKey },
          body: JSON.stringify(request),
        });
      } catch {
        return { ok: false, reason: 'network' };
      }
      if (res.status === 201 || res.status === 200) {
        const subscription = (await res.json().catch(() => null)) as SubscriptionResponse | null;
        // Trust nothing: the subscription must be for exactly the amount the donor agreed to.
        if (
          subscription?.checkout?.subscriptionId &&
          subscription.amountPaise === request.amountPaise
        ) {
          return { ok: true, subscription };
        }
        return { ok: false, reason: 'network' };
      }
      return { ok: false, reason: failure(res.status) };
    },
    async checkout(subscription, prefill) {
      let Razorpay: SubscriptionCheckout;
      try {
        Razorpay = (await load()) as SubscriptionCheckout;
      } catch {
        return { kind: 'failed', reason: 'other' };
      }
      return new Promise((resolve) => {
        let settled = false;
        const done = (outcome: CheckoutOutcome) => {
          if (!settled) {
            settled = true;
            resolve(outcome);
          }
        };
        const hide = hiddenMethods(subscription.allowedMethods);
        const instance = new Razorpay({
          key: subscription.checkout.keyId,
          subscription_id: subscription.checkout.subscriptionId,
          name: 'Theonetrust.in',
          description: subscription.publicReference,
          prefill: {
            name: prefill.name,
            ...(prefill.email && { email: prefill.email }),
            ...(prefill.contact && { contact: prefill.contact }),
          },
          ...(hide.length > 0 && { config: { display: { hide } } }),
          handler: (r) =>
            done({
              kind: 'completed',
              paymentId: r.razorpay_payment_id,
              signature: r.razorpay_signature,
            }),
          modal: {
            ondismiss: () => done({ kind: 'dismissed' }),
            escape: true,
            confirm_close: true,
          },
        });
        instance.on('payment.failed', () => done({ kind: 'failed', reason: 'other' }));
        instance.open();
      });
    },
    async verify(subscription, outcome) {
      try {
        const res = await fetchImpl(apiUrl(baseUrl, '/subscriptions/verify'), {
          method: 'POST',
          credentials: 'omit',
          headers: json,
          body: JSON.stringify({
            publicReference: subscription.publicReference,
            subscriptionId: subscription.checkout.subscriptionId,
            paymentId: outcome.paymentId,
            signature: outcome.signature,
          }),
        });
        if (!res.ok) return null;
        const body = (await res.json().catch(() => null)) as SubscriptionVerifyResponse | null;
        return body?.status ? body : null;
      } catch {
        return null;
      }
    },
    async manage(token) {
      const r = await manageCall(token, false);
      return 'view' in r ? { kind: 'found', view: r.view } : r;
    },
    async cancel(token) {
      const r = await manageCall(token, true);
      return 'view' in r ? { kind: 'cancelled', view: r.view } : r;
    },
  };
}

/** Token the mock hands out; the mock manage page knows it. */
export const MOCK_MANAGE_TOKEN = 'Q'.repeat(43);

export function createMockMonthlyClient(delayMs = 150): MonthlyClient {
  const scenario = () => (globalThis as { __monthlyMock?: string }).__monthlyMock ?? 'success';
  const wait = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), delayMs));
  let cancelled = false;
  const view = (): ManageView => ({
    publicReference: 'TOT-M-MOCK00000000',
    amountPaise: 100_000,
    status: cancelled ? 'CANCELLED' : 'ACTIVE',
    methodRoute: 'upi_autopay',
    startDate: '2026-11-04',
    programme: null,
    createdAt: '2026-11-04T10:00:00Z',
  });
  return {
    start: (request) =>
      wait({
        ok: true as const,
        subscription: {
          publicReference: 'TOT-M-MOCK00000000',
          amountPaise: request.amountPaise,
          currency: 'INR' as const,
          methodRoute:
            request.amountPaise <= 1_500_000
              ? ('upi_autopay' as const)
              : ('emandate_card' as const),
          allowedMethods:
            request.amountPaise <= 1_500_000
              ? (['upi', 'emandate', 'card'] as MonthlyMethod[])
              : (['emandate', 'card'] as MonthlyMethod[]),
          warning: request.amountPaise > 1_500_000 ? ('psp_limit' as const) : null,
          startDate: null,
          checkout: {
            provider: 'RAZORPAY' as const,
            keyId: 'rzp_test_mock',
            subscriptionId: 'sub_MOCK00000000',
          },
        },
      }),
    checkout: () =>
      wait(
        scenario() === 'cancel'
          ? { kind: 'dismissed' as const }
          : { kind: 'completed' as const, paymentId: 'pay_MOCK', signature: 'sig' },
      ),
    verify: () =>
      wait(
        scenario() === 'pending'
          ? { publicReference: 'TOT-M-MOCK00000000', status: 'PENDING' as const }
          : {
              publicReference: 'TOT-M-MOCK00000000',
              status: 'ACTIVE' as const,
              manageToken: MOCK_MANAGE_TOKEN,
            },
      ),
    manage: (token) =>
      wait(
        token === MOCK_MANAGE_TOKEN
          ? { kind: 'found' as const, view: view() }
          : { kind: 'not-found' as const },
      ),
    cancel: (token) => {
      if (token !== MOCK_MANAGE_TOKEN) return wait({ kind: 'not-found' as const });
      cancelled = true;
      return wait({ kind: 'cancelled' as const, view: view() });
    },
  };
}

export const unavailableMonthlyClient: MonthlyClient = {
  start: async () => ({ ok: false, reason: 'unavailable' }),
  checkout: async () => ({ kind: 'dismissed' }),
  verify: async () => null,
  manage: async () => ({ kind: 'unavailable' }),
  cancel: async () => ({ kind: 'unavailable' }),
};

export function selectMonthlyClient(
  env: { VITE_DONATE_ADAPTER?: string; VITE_API_BASE_URL?: string; DEV?: boolean } = import.meta
    .env,
): MonthlyClient {
  if (env.VITE_DONATE_ADAPTER === 'api') return createApiMonthlyClient(env.VITE_API_BASE_URL);
  if (env.VITE_DONATE_ADAPTER === 'mock') return createMockMonthlyClient();
  if (env.VITE_DONATE_ADAPTER === undefined && env.DEV === true) return createMockMonthlyClient();
  return unavailableMonthlyClient;
}

export const MonthlyClientContext = createContext<MonthlyClient | null>(null);

let defaultClient: MonthlyClient | undefined;
export function useMonthlyClient(): MonthlyClient {
  const injected = useContext(MonthlyClientContext);
  defaultClient ??= selectMonthlyClient();
  return injected ?? defaultClient;
}
