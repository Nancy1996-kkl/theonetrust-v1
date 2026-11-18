import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RAZORPAY_BUTTON_SCRIPT,
  buttonFallbackUrl,
  donateButtonConfig,
  isRazorpayCloseMessage,
  openRazorpayButton,
} from './razorpay-button.ts';

const config = { buttonId: 'pl_U1d9sqDS4jrF1E', amountField: 'donate_an_amount_of_your_choice' };

describe('donateButtonConfig', () => {
  it('accepts a Payment Button id and an optional snake_case amount field', () => {
    expect(donateButtonConfig(' pl_U1d9sqDS4jrF1E ', 'donate_an_amount_of_your_choice')).toEqual(
      config,
    );
    expect(donateButtonConfig('pl_U1d9sqDS4jrF1E', undefined)).toEqual({
      buttonId: 'pl_U1d9sqDS4jrF1E',
      amountField: null,
    });
    // A field name that could break out of the data-* attribute is dropped, not used.
    expect(donateButtonConfig('pl_U1d9sqDS4jrF1E', 'x" onload="alert(1)')?.amountField).toBeNull();
  });

  it.each([undefined, '', 'U1d9sqDS4jrF1E', 'pl_', 'pl_<script>', 'rzp_test_abc12345', 'pl_a b'])(
    'rejects %j as a button id',
    (raw) => {
      expect(donateButtonConfig(raw, 'amount')).toBeNull();
    },
  );
});

describe('isRazorpayCloseMessage', () => {
  it('is true only for close_modal from https://razorpay.com', () => {
    const data = { event_type: 'close_modal' };
    expect(isRazorpayCloseMessage({ origin: 'https://razorpay.com', data })).toBe(true);
    expect(isRazorpayCloseMessage({ origin: 'https://evil.example', data })).toBe(false);
    expect(isRazorpayCloseMessage({ origin: 'https://razorpay.com.evil.example', data })).toBe(
      false,
    );
    expect(
      isRazorpayCloseMessage({
        origin: 'https://razorpay.com',
        data: { event_type: 'payment_success' },
      }),
    ).toBe(false);
    expect(isRazorpayCloseMessage({ origin: 'https://razorpay.com', data: 'close_modal' })).toBe(
      false,
    );
    expect(isRazorpayCloseMessage({ origin: 'https://razorpay.com', data: null })).toBe(false);
  });
});

describe('buttonFallbackUrl', () => {
  it("points at Razorpay's own page for the button", () => {
    expect(buttonFallbackUrl('pl_U1d9sqDS4jrF1E')).toBe(
      'https://razorpay.com/payment-button/pl_U1d9sqDS4jrF1E/view',
    );
  });
});

/** Stands in for Razorpay's script: renders its <a> button into the form like the real one. */
function renderFakeButton(host: HTMLElement) {
  const form = host.querySelector('form')!;
  const span = document.createElement('span');
  span.className = 'razorpay-payment-button';
  const a = document.createElement('a');
  a.href = buttonFallbackUrl(config.buttonId);
  span.append(a);
  form.append(span);
  return a;
}

describe('openRazorpayButton', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('adds Razorpay’s script with the button id and rupee amount, then clicks its button', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const opening = openRazorpayButton(host, config, 500);

    const script = host.querySelector('script')!;
    expect(script.src).toBe(RAZORPAY_BUTTON_SCRIPT);
    expect(script.async).toBe(true);
    expect(script.getAttribute('data-payment_button_id')).toBe('pl_U1d9sqDS4jrF1E');
    expect(script.getAttribute('data-prefill.amount.donate_an_amount_of_your_choice')).toBe('500');
    expect(host.querySelector('form')!.hidden).toBe(true);
    // Lets the embed's regenerator-runtime assign its global without Function() (CSP).
    expect('regeneratorRuntime' in window).toBe(true);

    const a = renderFakeButton(host);
    const clicked = vi.fn((e: Event) => e.preventDefault());
    a.addEventListener('click', clicked);
    await expect(opening).resolves.toBe('opened');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('leaves the amount for the donor to type when no amount field is configured', () => {
    const host = document.createElement('div');
    void openRazorpayButton(host, { ...config, amountField: null }, 500, 10);
    const attrs = host.querySelector('script')!.getAttributeNames();
    expect(attrs.some((n) => n.startsWith('data-prefill'))).toBe(false);
  });

  it('removes an earlier (closed) Razorpay window and button before opening again', () => {
    const old = document.createElement('div');
    old.className = 'razorpay-payment-form-container';
    document.body.append(old);
    const host = document.createElement('div');
    host.append(document.createElement('form'));
    void openRazorpayButton(host, config, 200, 10);
    expect(document.querySelector('.razorpay-payment-form-container')).toBeNull();
    expect(host.querySelectorAll('form')).toHaveLength(1);
  });

  it('fails when the script cannot load', async () => {
    const host = document.createElement('div');
    const opening = openRazorpayButton(host, config, 500);
    host.querySelector('script')!.dispatchEvent(new Event('error'));
    await expect(opening).resolves.toBe('failed');
  });

  it('fails when the button never renders (blocked or slow network)', async () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const opening = openRazorpayButton(host, config, 500, 1000);
    vi.advanceTimersByTime(1000);
    await expect(opening).resolves.toBe('failed');
  });
});
