import { createContext, useContext } from 'react';
import type {
  DonationEstimateResponse,
  DonationIntentRequest,
  DonationIntentResponse,
  DonationStatusResponse,
} from '@theonetrust/contracts';
import { apiUrl } from '../lib/api-url.ts';

/**
 * How the donate panel talks to the trust and to Razorpay (#24).
 *
 * - `api` (live once payments are switched on): server-created intent and order (#23),
 *   Razorpay Checkout, then server verification (#26). The panel shows "paid" ONLY when the
 *   server says PAID — never because Checkout said so.
 * - `mock` (dev, tests, e2e only): simulates Checkout outcomes. Never used on the live site.
 * - `unavailable` (live default until payments are on): the panel says online payments are not
 *   open yet and points to the trust's contact details.
 */
export type StartResult =
  | { ok: true; intent: DonationIntentResponse }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'unavailable' | 'network' };

export type CheckoutOutcome =
  | { kind: 'completed'; paymentId: string; signature: string }
  | { kind: 'dismissed' }
  | { kind: 'failed'; reason: 'upi_limit' | 'other' };

export type VerifiedStatus = DonationStatusResponse['status'] | 'UNKNOWN';

export interface CheckoutPrefill {
  name: string;
  email?: string;
  contact?: string;
  lang: 'ta' | 'en';
}

export interface DonateClient {
  acceptsDonations: boolean;
  estimate(giftPaise?: number): Promise<DonationEstimateResponse | null>;
  start(request: DonationIntentRequest, idempotencyKey: string): Promise<StartResult>;
  checkout(intent: DonationIntentResponse, prefill: CheckoutPrefill): Promise<CheckoutOutcome>;
  /** Asks the server; anything other than a verified answer is UNKNOWN (shown as pending). */
  verify(
    intent: DonationIntentResponse,
    outcome: { paymentId: string; signature: string },
  ): Promise<VerifiedStatus>;
  status(publicReference: string): Promise<VerifiedStatus>;
}

const STATUSES = new Set(['PAID', 'PENDING', 'FAILED']);

function readStatus(body: unknown): VerifiedStatus {
  const status = (body as { status?: unknown } | null)?.status;
  return typeof status === 'string' && STATUSES.has(status)
    ? (status as VerifiedStatus)
    : 'UNKNOWN';
}

/** A random key per payment attempt: a double click or a retry never creates a second order. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: 'INR';
  name: string;
  description: string;
  prefill: { name: string; email?: string; contact?: string };
  handler: (response: { razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void; escape: boolean; confirm_close: boolean };
  retry: { enabled: boolean };
}
interface RazorpayInstance {
  open(): void;
  on(
    event: 'payment.failed',
    cb: (response: { error?: { reason?: string; code?: string } }) => void,
  ): void;
}
type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

export const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

/** Loads Razorpay's Checkout script once, only when the donor is about to pay. */
export function loadCheckout(doc: Document = document): Promise<RazorpayConstructor> {
  const w = doc.defaultView as (Window & { Razorpay?: RazorpayConstructor }) | null;
  if (w?.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () =>
      w?.Razorpay ? resolve(w.Razorpay) : reject(new Error('Checkout missing'));
    script.onerror = () => reject(new Error('Checkout failed to load'));
    doc.head.append(script);
  });
}

/** A failure reason that points at a bank or UPI limit, so the panel can suggest card/netbanking. */
export function isLimitFailure(reason: string | undefined): boolean {
  return /limit|exceed|amount/i.test(reason ?? '');
}

export function createApiDonateClient(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  load: () => Promise<RazorpayConstructor> = () => loadCheckout(),
): DonateClient {
  const json = { 'content-type': 'application/json', accept: 'application/json' };
  return {
    acceptsDonations: true,
    async estimate(giftPaise) {
      try {
        const query = giftPaise ? `?giftPaise=${giftPaise}` : '';
        const res = await fetchImpl(apiUrl(baseUrl, `/donation-intents/estimate${query}`), {
          credentials: 'omit',
        });
        return res.ok ? ((await res.json()) as DonationEstimateResponse) : null;
      } catch {
        return null;
      }
    },
    async start(request, idempotencyKey) {
      let res: Response;
      try {
        res = await fetchImpl(apiUrl(baseUrl, '/donation-intents'), {
          method: 'POST',
          credentials: 'omit',
          headers: { ...json, 'idempotency-key': idempotencyKey },
          body: JSON.stringify(request),
        });
      } catch {
        return { ok: false, reason: 'network' };
      }
      if (res.status === 201 || res.status === 200) {
        const intent = (await res.json().catch(() => null)) as DonationIntentResponse | null;
        if (
          intent?.checkout?.orderId &&
          intent.amountPaise === request.giftPaise + intent.feePaise
        ) {
          return { ok: true, intent };
        }
        return { ok: false, reason: 'network' };
      }
      if (res.status === 400 || res.status === 409) return { ok: false, reason: 'invalid' };
      if (res.status === 429) return { ok: false, reason: 'rate_limited' };
      if (res.status === 503) return { ok: false, reason: 'unavailable' };
      return { ok: false, reason: 'network' };
    },
    async checkout(intent, prefill) {
      let Razorpay: RazorpayConstructor;
      try {
        Razorpay = await load();
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
        const instance = new Razorpay({
          key: intent.checkout.keyId,
          order_id: intent.checkout.orderId,
          amount: intent.amountPaise,
          currency: 'INR',
          name: 'Theonetrust.in',
          description: intent.publicReference,
          prefill: {
            name: prefill.name,
            ...(prefill.email && { email: prefill.email }),
            ...(prefill.contact && { contact: prefill.contact }),
          },
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
          retry: { enabled: false },
        });
        instance.on('payment.failed', (r) =>
          done({
            kind: 'failed',
            reason: isLimitFailure(r.error?.reason ?? r.error?.code) ? 'upi_limit' : 'other',
          }),
        );
        instance.open();
      });
    },
    async verify(intent, outcome) {
      try {
        const res = await fetchImpl(apiUrl(baseUrl, '/payments/verify'), {
          method: 'POST',
          credentials: 'omit',
          headers: json,
          body: JSON.stringify({
            publicReference: intent.publicReference,
            orderId: intent.checkout.orderId,
            paymentId: outcome.paymentId,
            signature: outcome.signature,
          }),
        });
        return res.ok ? readStatus(await res.json().catch(() => null)) : 'UNKNOWN';
      } catch {
        return 'UNKNOWN';
      }
    },
    async status(publicReference) {
      try {
        const res = await fetchImpl(
          apiUrl(baseUrl, `/donations/status/${encodeURIComponent(publicReference)}`),
          {
            credentials: 'omit',
          },
        );
        return res.ok ? readStatus(await res.json().catch(() => null)) : 'UNKNOWN';
      } catch {
        return 'UNKNOWN';
      }
    },
  };
}

/**
 * Dev/e2e simulation. Tests choose the outcome with `window.__donateMock`
 * ('success' | 'cancel' | 'fail' | 'limit' | 'pending' | 'stuck' | 'start-fail'); default success.
 */
export function createMockDonateClient(delayMs = 200): DonateClient {
  const scenario = () => (globalThis as { __donateMock?: string }).__donateMock ?? 'success';
  const wait = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), delayMs));
  return {
    acceptsDonations: true,
    estimate: () =>
      wait({
        minPaise: 100,
        maxPaise: 50_000_000,
        receiptMinPaise: 50_000,
        feeCoverOffered: false,
      }),
    start: (request) =>
      scenario() === 'start-fail'
        ? wait({ ok: false as const, reason: 'network' as const })
        : wait({
            ok: true as const,
            intent: {
              publicReference: 'TOT-D-MOCK00000000',
              giftPaise: request.giftPaise,
              feePaise: 0,
              amountPaise: request.giftPaise,
              currency: 'INR' as const,
              checkout: {
                provider: 'RAZORPAY' as const,
                keyId: 'rzp_test_mock',
                orderId: 'order_MOCK000000',
              },
            },
          }),
    checkout: () => {
      const s = scenario();
      if (s === 'cancel') return wait({ kind: 'dismissed' as const });
      if (s === 'fail') return wait({ kind: 'failed' as const, reason: 'other' as const });
      if (s === 'limit') return wait({ kind: 'failed' as const, reason: 'upi_limit' as const });
      return wait({ kind: 'completed' as const, paymentId: 'pay_MOCK', signature: 'sig' });
    },
    verify: () =>
      wait(['pending', 'stuck'].includes(scenario()) ? ('PENDING' as const) : ('PAID' as const)),
    // "pending": verify answers PENDING and the re-check finds it PAID; "stuck" stays pending.
    status: () => wait(scenario() === 'stuck' ? ('PENDING' as const) : ('PAID' as const)),
  };
}

export const unavailableDonateClient: DonateClient = {
  acceptsDonations: false,
  estimate: () => Promise.resolve(null),
  start: () => Promise.resolve({ ok: false, reason: 'unavailable' }),
  checkout: () => Promise.resolve({ kind: 'dismissed' }),
  verify: () => Promise.resolve('UNKNOWN'),
  status: () => Promise.resolve('UNKNOWN'),
};

/** VITE_DONATE_ADAPTER: `api` (live), `mock` (dev/e2e), anything else → unavailable. */
export function selectDonateClient(
  env: { VITE_DONATE_ADAPTER?: string; VITE_API_BASE_URL?: string; DEV?: boolean } = import.meta
    .env,
): DonateClient {
  if (env.VITE_DONATE_ADAPTER === 'api') return createApiDonateClient(env.VITE_API_BASE_URL);
  if (env.VITE_DONATE_ADAPTER === 'mock') return createMockDonateClient();
  if (env.VITE_DONATE_ADAPTER === undefined && env.DEV === true) return createMockDonateClient();
  return unavailableDonateClient;
}

export const DonateClientContext = createContext<DonateClient | null>(null);

let defaultClient: DonateClient | undefined;
export function useDonateClient(): DonateClient {
  const injected = useContext(DonateClientContext);
  defaultClient ??= selectDonateClient();
  return injected ?? defaultClient;
}
