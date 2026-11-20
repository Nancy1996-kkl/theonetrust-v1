import { createContext, useContext } from 'react';
import type {
  BankTransferIntentResponse,
  DonationEstimateResponse,
  DonationIntentRequest,
  DonationIntentResponse,
  DonationQrResponse,
  DonationStatusResponse,
} from '@theonetrust/contracts';
import { isCashfreeCheckout, isRazorpayCheckout } from '@theonetrust/contracts';
import { apiUrl } from '../lib/api-url.ts';
import { MOCK_RECEIPT_TOKEN } from '../receipt/receipt-client.ts';

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
  /**
   * Cashfree's window closed (paid, failed or simply closed — its result is never proof): the
   * server is asked by reference and decides.
   */
  | { kind: 'returned' }
  /** Cashfree could not open its pop-up (e.g. in-app browsers) and moved the page to its own. */
  | { kind: 'redirecting' }
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
  /**
   * Asks the server; anything other than a verified answer is UNKNOWN (shown as pending).
   * Razorpay sends its callback values; Cashfree only the reference (the server re-fetches).
   */
  verify(
    intent: DonationIntentResponse,
    outcome: { paymentId: string; signature: string } | { kind: 'returned' },
  ): Promise<VerifiedStatus>;
  status(publicReference: string): Promise<VerifiedStatus>;
  /** Acknowledgement link token for a PAID donation, when one was issued (#29). */
  receipt(publicReference: string): Promise<string | null>;
  /** Bank transfer (#25): no Razorpay order; returns the trust account and a reference. */
  startBankTransfer(
    request: DonationIntentRequest,
    idempotencyKey: string,
  ): Promise<
    { ok: true; intent: BankTransferIntentResponse } | { ok: false; reason: StartFailure }
  >;
  /** "I've made the transfer" + optional UTR. Never confirms the payment. */
  claimBankTransfer(publicReference: string, utr: string | null): Promise<boolean>;
  /**
   * One-time UPI QR for exactly this amount (client, Nov 2026). Scanning proves nothing: the
   * panel shows "paid" only when `status` says PAID. `imageUrl` is ready for an <img>.
   */
  startQr?(
    request: DonationIntentRequest,
    idempotencyKey: string,
  ): Promise<
    { ok: true; intent: DonationQrResponse; imageUrl: string } | { ok: false; reason: StartFailure }
  >;
}

type StartFailure = 'invalid' | 'rate_limited' | 'unavailable' | 'network';

function failureFor(status: number): StartFailure {
  if (status === 400 || status === 409) return 'invalid';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  return 'network';
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

export const CASHFREE_SDK = 'https://sdk.cashfree.com/js/v3/cashfree.js';
/** How long the donor waits for Cashfree's script before "could not open" is shown. */
export const CASHFREE_SDK_TIMEOUT_MS = 15_000;

/** The part of cashfree.js v3 this site uses. Its result is never proof of payment. */
interface CashfreeResult {
  error?: unknown;
  redirect?: unknown;
  paymentDetails?: unknown;
}
interface CashfreeInstance {
  checkout(options: {
    paymentSessionId: string;
    redirectTarget: '_modal';
  }): Promise<CashfreeResult | undefined>;
}
export type CashfreeFactory = (options: { mode: 'sandbox' | 'production' }) => CashfreeInstance;

/** Loads Cashfree's script once, only when the donor is about to pay, with a timeout. */
export function loadCashfree(
  doc: Document = document,
  timeoutMs = CASHFREE_SDK_TIMEOUT_MS,
): Promise<CashfreeFactory> {
  const w = doc.defaultView as (Window & { Cashfree?: CashfreeFactory }) | null;
  if (w?.Cashfree) return Promise.resolve(w.Cashfree);
  return new Promise((resolve, reject) => {
    const existing = doc.querySelector<HTMLScriptElement>(`script[src="${CASHFREE_SDK}"]`);
    const script = existing ?? doc.createElement('script');
    const timer = setTimeout(() => reject(new Error('Cashfree timed out')), timeoutMs);
    script.addEventListener('load', () => {
      clearTimeout(timer);
      if (w?.Cashfree) resolve(w.Cashfree);
      else reject(new Error('Cashfree missing'));
    });
    script.addEventListener('error', () => {
      clearTimeout(timer);
      // A failed script is removed so a retry can load it again.
      script.remove();
      reject(new Error('Cashfree failed to load'));
    });
    if (!existing) {
      script.src = CASHFREE_SDK;
      script.async = true;
      doc.head.append(script);
    }
  });
}

/** Gaps between status checks after Cashfree's window closes: about 90 seconds in all. */
export const POLL_DELAYS_MS = [2_000, 3_000, 5_000, 8_000, 12_000, 15_000, 20_000, 25_000];

/**
 * Asks the server again until it says PAID or FAILED, or the delays run out (then the last answer,
 * usually PENDING, is returned). While the tab is hidden no request is made.
 */
export async function pollUntilSettled(
  check: () => Promise<VerifiedStatus>,
  first: VerifiedStatus,
  opts: {
    delays?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
    hidden?: () => boolean;
  } = {},
): Promise<VerifiedStatus> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const hidden = opts.hidden ?? (() => typeof document !== 'undefined' && document.hidden);
  let status = first;
  for (const delay of opts.delays ?? POLL_DELAYS_MS) {
    if (status === 'PAID' || status === 'FAILED') return status;
    await sleep(delay);
    if (hidden()) continue;
    status = await check();
  }
  return status;
}

/** A failure reason that points at a bank or UPI limit, so the panel can suggest card/netbanking. */
export function isLimitFailure(reason: string | undefined): boolean {
  return /limit|exceed|amount/i.test(reason ?? '');
}

export function createApiDonateClient(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  load: () => Promise<RazorpayConstructor> = () => loadCheckout(),
  loadCf: () => Promise<CashfreeFactory> = () => loadCashfree(),
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
          (isRazorpayCheckout(intent?.checkout) || isCashfreeCheckout(intent?.checkout)) &&
          intent.amountPaise === request.giftPaise + intent.feePaise
        ) {
          return { ok: true, intent };
        }
        return { ok: false, reason: 'network' };
      }
      return { ok: false, reason: failureFor(res.status) };
    },
    async startBankTransfer(request, idempotencyKey) {
      let res: Response;
      try {
        res = await fetchImpl(apiUrl(baseUrl, '/donation-intents'), {
          method: 'POST',
          credentials: 'omit',
          headers: { ...json, 'idempotency-key': idempotencyKey },
          body: JSON.stringify({ ...request, channel: 'bank_transfer', coverFee: false }),
        });
      } catch {
        return { ok: false, reason: 'network' };
      }
      if (res.status === 201 || res.status === 200) {
        const intent = (await res.json().catch(() => null)) as BankTransferIntentResponse | null;
        if (intent?.bankTransfer?.accountNumber && intent.amountPaise === request.giftPaise) {
          return { ok: true, intent };
        }
        return { ok: false, reason: 'network' };
      }
      return { ok: false, reason: failureFor(res.status) };
    },
    async startQr(request, idempotencyKey) {
      let res: Response;
      try {
        res = await fetchImpl(apiUrl(baseUrl, '/donation-intents'), {
          method: 'POST',
          credentials: 'omit',
          headers: { ...json, 'idempotency-key': idempotencyKey },
          // The QR is for the exact amount on the button: no fee cover on top.
          body: JSON.stringify({ ...request, channel: 'qr', coverFee: false }),
        });
      } catch {
        return { ok: false, reason: 'network' };
      }
      if (res.status === 201 || res.status === 200) {
        const intent = (await res.json().catch(() => null)) as DonationQrResponse | null;
        const path = intent?.qr?.imagePath;
        if (
          typeof path === 'string' &&
          /^\/donation-intents\/[A-Z0-9-]+\/qr\.png$/.test(path) &&
          intent?.amountPaise === request.giftPaise
        ) {
          return { ok: true, intent, imageUrl: apiUrl(baseUrl, path) };
        }
        return { ok: false, reason: 'network' };
      }
      return { ok: false, reason: failureFor(res.status) };
    },
    async claimBankTransfer(publicReference, utr) {
      try {
        const res = await fetchImpl(
          apiUrl(
            baseUrl,
            `/donation-intents/${encodeURIComponent(publicReference)}/bank-transfer-claim`,
          ),
          { method: 'POST', credentials: 'omit', headers: json, body: JSON.stringify({ utr }) },
        );
        return res.status === 202;
      } catch {
        return false;
      }
    },
    async checkout(intent, prefill) {
      const gateway = intent.checkout;
      if (isCashfreeCheckout(gateway)) {
        // Only the one-time session goes to Cashfree's window; the donor's details were sent to
        // our server, never through the browser to Cashfree.
        let factory: CashfreeFactory;
        try {
          factory = await loadCf();
        } catch {
          return { kind: 'failed', reason: 'other' };
        }
        try {
          const result = await factory({ mode: gateway.mode }).checkout({
            paymentSessionId: gateway.paymentSessionId,
            redirectTarget: '_modal',
          });
          return result?.redirect ? { kind: 'redirecting' } : { kind: 'returned' };
        } catch {
          // The window may have taken the payment before failing: the server decides.
          return { kind: 'returned' };
        }
      }
      // This window is Razorpay's; another gateway's descriptor is never opened with it.
      if (!isRazorpayCheckout(gateway)) return { kind: 'failed', reason: 'other' };
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
          key: gateway.keyId,
          order_id: gateway.orderId,
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
      const body =
        'paymentId' in outcome
          ? {
              publicReference: intent.publicReference,
              orderId: intent.checkout.orderId,
              paymentId: outcome.paymentId,
              signature: outcome.signature,
            }
          : { publicReference: intent.publicReference };
      try {
        const res = await fetchImpl(apiUrl(baseUrl, '/payments/verify'), {
          method: 'POST',
          credentials: 'omit',
          headers: json,
          body: JSON.stringify(body),
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
    async receipt(publicReference) {
      try {
        const res = await fetchImpl(
          apiUrl(baseUrl, `/donations/status/${encodeURIComponent(publicReference)}`),
          { credentials: 'omit' },
        );
        if (!res.ok) return null;
        const body = (await res.json().catch(() => null)) as DonationStatusResponse | null;
        return body?.status === 'PAID' && typeof body.receiptToken === 'string'
          ? body.receiptToken
          : null;
      } catch {
        return null;
      }
    },
  };
}

/** A visibly fake placeholder: the mock is never used on the live site. */
export const MOCK_QR_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><rect x="5" y="5" width="90" height="90" fill="none" stroke="black" stroke-width="4"/><text x="50" y="55" font-size="14" text-anchor="middle" font-family="sans-serif">TEST QR</text></svg>',
)}`;

/**
 * Dev/e2e simulation. Tests choose the outcome with `window.__donateMock`
 * ('success' | 'cancel' | 'fail' | 'limit' | 'pending' | 'stuck' | 'start-fail' | 'no-receipt'); default success.
 * Cashfree (Phase 5): 'cashfree' (paid), 'cashfree-pending' (confirmed by the re-check),
 * 'cashfree-fail' (the server says FAILED), 'cashfree-redirect' (pop-up could not open).
 */
export function createMockDonateClient(delayMs = 200): DonateClient {
  const scenario = () => (globalThis as { __donateMock?: string }).__donateMock ?? 'success';
  const wait = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), delayMs));
  const cashfree = () => scenario().startsWith('cashfree');
  return {
    acceptsDonations: true,
    estimate: () =>
      wait({
        minPaise: 100,
        maxPaise: 50_000_000,
        receiptMinPaise: 50_000,
        feeCoverOffered: false,
        bankTransferOffered: true,
        monthlyOffered: true,
        qrOffered: !cashfree(),
        qrMaxPaise: 200_000,
        phoneRequired: cashfree(),
      }),
    startBankTransfer: (request) =>
      wait({
        ok: true as const,
        intent: {
          publicReference: 'TOT-D-MOCK00000000',
          giftPaise: request.giftPaise,
          feePaise: 0 as const,
          amountPaise: request.giftPaise,
          currency: 'INR' as const,
          // Visibly fake details: the mock is never used on the live site.
          bankTransfer: {
            accountName: 'MOCK ACCOUNT (test only)',
            accountNumber: '000000000000',
            ifsc: 'TEST0000000',
            bankName: 'Mock Bank',
          },
        },
      }),
    claimBankTransfer: () => wait(true),
    startQr: (request) =>
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
              qr: {
                imagePath: '/donation-intents/TOT-D-MOCK00000000/qr.png',
                expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
              },
            },
            imageUrl: MOCK_QR_IMAGE,
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
              checkout: cashfree()
                ? {
                    provider: 'CASHFREE' as const,
                    paymentSessionId: 'session_MOCK',
                    mode: 'sandbox' as const,
                    orderId: 'TOT-D-MOCK00000000',
                  }
                : {
                    provider: 'RAZORPAY' as const,
                    keyId: 'rzp_test_mock',
                    orderId: 'order_MOCK000000',
                  },
            },
          }),
    checkout: () => {
      const s = scenario();
      if (s === 'cashfree-redirect') return wait({ kind: 'redirecting' as const });
      if (s.startsWith('cashfree')) return wait({ kind: 'returned' as const });
      if (s === 'cancel') return wait({ kind: 'dismissed' as const });
      if (s === 'fail') return wait({ kind: 'failed' as const, reason: 'other' as const });
      if (s === 'limit') return wait({ kind: 'failed' as const, reason: 'upi_limit' as const });
      return wait({ kind: 'completed' as const, paymentId: 'pay_MOCK', signature: 'sig' });
    },
    verify: () => {
      const s = scenario();
      if (s === 'cashfree-fail') return wait('FAILED' as const);
      return wait(
        ['pending', 'stuck', 'cashfree-pending'].includes(s)
          ? ('PENDING' as const)
          : ('PAID' as const),
      );
    },
    // "pending": verify answers PENDING and the re-check finds it PAID; "stuck" stays pending.
    status: () =>
      wait(
        scenario() === 'stuck'
          ? ('PENDING' as const)
          : scenario() === 'cashfree-fail'
            ? ('FAILED' as const)
            : ('PAID' as const),
      ),
    // "no-receipt": paid, but the donor declined or the amount is below the threshold.
    receipt: () => wait(scenario() === 'no-receipt' ? null : MOCK_RECEIPT_TOKEN),
  };
}

export const unavailableDonateClient: DonateClient = {
  acceptsDonations: false,
  estimate: () => Promise.resolve(null),
  start: () => Promise.resolve({ ok: false, reason: 'unavailable' }),
  checkout: () => Promise.resolve({ kind: 'dismissed' }),
  verify: () => Promise.resolve('UNKNOWN'),
  status: () => Promise.resolve('UNKNOWN'),
  receipt: () => Promise.resolve(null),
  startBankTransfer: () => Promise.resolve({ ok: false, reason: 'unavailable' }),
  claimBankTransfer: () => Promise.resolve(false),
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
