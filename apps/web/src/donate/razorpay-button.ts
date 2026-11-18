/**
 * Razorpay Payment Button mode (client, Nov 2026): the donor pays inside a Razorpay window that
 * opens over our Donate pop-up — no redirect, and still no API or database on our side.
 *
 * How it works (checked against Razorpay's live payment-button.js with a test-mode button):
 * - Razorpay's embed script reads its options from its own <script> tag's data-* attributes and
 *   renders an <a class="razorpay-payment-button …"> button. Clicking it opens Razorpay's form in
 *   an iframe overlay on this page (amount → donor details → Razorpay Checkout).
 * - `data-prefill.amount.<field>` pre-fills the amount field, where <field> is the amount
 *   field's label in snake_case (e.g. "Donate an Amount of your Choice" →
 *   donate_an_amount_of_your_choice) and the value is in whole rupees.
 * - When the donor closes that window, the iframe posts {event_type: "close_modal"} from
 *   https://razorpay.com. That only says the window closed — never that a payment succeeded.
 *
 * A closed window, a redirect or a screenshot is never proof of payment: Razorpay's receipt email
 * and dashboard are. The site never sees card, UPI or bank details.
 */

export const RAZORPAY_BUTTON_SCRIPT = 'https://checkout.razorpay.com/v1/payment-button.js';
/** Origin of the payment form iframe that posts close_modal. */
export const RAZORPAY_FORM_ORIGIN = 'https://razorpay.com';
/** How long to wait for Razorpay's button to render before showing the fallback link. */
export const RAZORPAY_OPEN_TIMEOUT_MS = 12_000;

export interface DonateButtonConfig {
  buttonId: string;
  /** snake_case amount field label for pre-fill, or null to let the donor type it there. */
  amountField: string | null;
}

const BUTTON_ID = /^pl_[A-Za-z0-9]{8,32}$/;
const FIELD = /^[a-z0-9_]{1,80}$/;

/** Validates the public button id (and optional amount field) from VITE_* config. */
export function donateButtonConfig(
  rawId: string | undefined,
  rawField: string | undefined,
): DonateButtonConfig | null {
  const buttonId = rawId?.trim() ?? '';
  if (!BUTTON_ID.test(buttonId)) return null;
  const field = rawField?.trim() ?? '';
  return { buttonId, amountField: FIELD.test(field) ? field : null };
}

export const DONATE_BUTTON = donateButtonConfig(
  import.meta.env.VITE_DONATE_BUTTON_ID,
  import.meta.env.VITE_DONATE_AMOUNT_FIELD,
);

/** Razorpay's own page for the button — the no-script fallback the embed itself links to. */
export function buttonFallbackUrl(buttonId: string): string {
  return `https://razorpay.com/payment-button/${encodeURIComponent(buttonId)}/view`;
}

/** True only for Razorpay's form telling us its window was closed. */
export function isRazorpayCloseMessage(event: Pick<MessageEvent, 'origin' | 'data'>): boolean {
  if (event.origin !== RAZORPAY_FORM_ORIGIN) return false;
  const data: unknown = event.data;
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { event_type?: unknown }).event_type === 'close_modal'
  );
}

/**
 * Renders Razorpay's button (hidden) inside `host` with the amount pre-filled, then clicks it so
 * Razorpay's window opens over the page. Resolves 'opened', or 'failed' if the script could not
 * load or render in time (blocked network, ad blocker) — the caller then offers the fallback link.
 */
export function openRazorpayButton(
  host: HTMLElement,
  config: DonateButtonConfig,
  amountRupees: number,
  timeoutMs: number = RAZORPAY_OPEN_TIMEOUT_MS,
): Promise<'opened' | 'failed'> {
  // A window from an earlier attempt has already been closed by the donor; remove it so overlays
  // do not pile up in the page.
  for (const old of document.querySelectorAll('.razorpay-payment-form-container')) old.remove();
  host.replaceChildren();
  // The embed bundles regenerator-runtime, which assigns the global `regeneratorRuntime` and,
  // when that global does not exist yet, falls back to Function(...) — blocked by our CSP
  // (no 'unsafe-eval'). Declaring the global first lets the plain assignment succeed.
  if (!('regeneratorRuntime' in window)) {
    (window as unknown as Record<string, unknown>).regeneratorRuntime = undefined;
  }

  const form = document.createElement('form');
  form.hidden = true;
  const script = document.createElement('script');
  script.src = RAZORPAY_BUTTON_SCRIPT;
  script.async = true;
  script.setAttribute('data-payment_button_id', config.buttonId);
  if (config.amountField && Number.isInteger(amountRupees) && amountRupees > 0) {
    script.setAttribute(`data-prefill.amount.${config.amountField}`, String(amountRupees));
  }
  form.append(script);
  host.append(form);

  return new Promise((resolve) => {
    let done = false;
    const finish = (result: 'opened' | 'failed') => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };
    const tryOpen = () => {
      const button = form.querySelector<HTMLElement>('.razorpay-payment-button a');
      if (!button) return;
      button.click();
      finish('opened');
    };
    const observer = new MutationObserver(tryOpen);
    observer.observe(form, { childList: true, subtree: true });
    const timer = setTimeout(() => finish('failed'), timeoutMs);
    script.addEventListener('error', () => finish('failed'));
    tryOpen();
  });
}
