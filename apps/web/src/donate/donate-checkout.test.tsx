import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paise } from '@theonetrust/contracts';
import { UiLangContext } from '../components/ui/ui-strings.ts';
import { DonationDraftContext, EMPTY_DRAFT } from '../state/donation-draft.ts';
import { DonateCheckoutPanel } from './DonateCheckoutPanel.tsx';
import { DONATE_MESSAGES } from './donate-messages.ts';
import type * as RazorpayButton from './razorpay-button.ts';

const openRazorpayButton = vi.fn<(...args: unknown[]) => Promise<'opened' | 'failed'>>();
vi.mock('./razorpay-button.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof RazorpayButton>()),
  openRazorpayButton: (...args: unknown[]) => openRazorpayButton(...args),
}));

const config = { buttonId: 'pl_U1d9sqDS4jrF1E', amountField: 'donate_an_amount_of_your_choice' };
const en = DONATE_MESSAGES.en;

function renderPanel({
  path = '/#donate',
  lang = 'en' as 'en' | 'ta',
  amountPaise = null as Paise | null,
} = {}) {
  const updateDraft = vi.fn();
  const utils = render(
    <UiLangContext.Provider value={lang}>
      <DonationDraftContext.Provider
        value={{ draft: { ...EMPTY_DRAFT, amountPaise }, updateDraft }}
      >
        <MemoryRouter initialEntries={[path]}>
          <DonateCheckoutPanel config={config} />
        </MemoryRouter>
      </DonationDraftContext.Provider>
    </UiLangContext.Provider>,
  );
  return { ...utils, updateDraft };
}

function closeMessage(origin = 'https://razorpay.com') {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { origin, data: { event_type: 'close_modal' } }),
    );
  });
}

beforeEach(() => openRazorpayButton.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('DonateCheckoutPanel (pay inside the pop-up)', () => {
  it('opens at #donate on step 1 of 3 with a default amount and the payment methods', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog', { name: en.title });
    expect(dialog).toHaveClass('ui-dialog--wide');
    const progress = within(dialog).getByRole('list', { name: en.checkoutProgress });
    expect(within(progress).getByText(en.checkoutStepAmount).closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('radio', { name: '₹100' })).toBeChecked();
    expect(screen.getByText(en.checkoutMethodUpi)).toBeVisible();
    expect(screen.getByText(en.checkoutMethodCard)).toBeVisible();
    expect(screen.getByText(en.checkoutMethodNetbanking)).toBeVisible();
    expect(screen.getByTestId('donate-checkout-pay')).toHaveTextContent('Donate ₹100 securely');
  });

  it('stays closed without #donate', () => {
    renderPanel({ path: '/' });
    expect(screen.queryByTestId('donate-checkout')).toBeNull();
  });

  it('starts from the amount a home-page chip chose', () => {
    renderPanel({ amountPaise: 1000 as Paise });
    expect(screen.getByRole('radio', { name: '₹10' })).toBeChecked();
    expect(screen.getByTestId('donate-checkout-pay')).toHaveTextContent('₹10');
  });

  it('opens Razorpay with the chosen amount in rupees, then step 2 → close → step 3', async () => {
    const user = userEvent.setup();
    openRazorpayButton.mockResolvedValue('opened');
    const { updateDraft } = renderPanel();
    await user.click(screen.getByRole('radio', { name: '₹1,000' }));
    expect(updateDraft).toHaveBeenCalledWith({ amountPaise: 100000 });
    await user.click(screen.getByTestId('donate-checkout-pay'));

    expect(openRazorpayButton).toHaveBeenCalledTimes(1);
    const [host, cfg, rupees] = openRazorpayButton.mock.calls[0]!;
    expect(host).toBeInstanceOf(HTMLElement);
    expect(cfg).toEqual(config);
    expect(rupees).toBe(1000);
    expect(await screen.findByText(en.checkoutPayingTitle)).toBeVisible();
    expect(screen.getByText(en.checkoutStepPay).closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByTestId('donate-checkout-fallback')).toHaveAttribute(
      'href',
      'https://razorpay.com/payment-button/pl_U1d9sqDS4jrF1E/view',
    );

    // A message from anywhere else is ignored.
    closeMessage('https://evil.example');
    expect(screen.queryByText(en.checkoutAfterTitle)).toBeNull();

    closeMessage();
    const after = screen.getByTestId('donate-after');
    expect(within(after).getByRole('heading', { name: en.checkoutAfterTitle })).toBeVisible();
    // Both possible outcomes are explained, side by side.
    expect(within(after).getByText(en.checkoutNotPaidTitle)).toBeVisible();
    expect(within(after).getByText(en.checkoutPaidTitle)).toBeVisible();
    // A closed window is not proof of payment: the progress bar stays on step 2 and nothing
    // says the payment went through.
    expect(screen.getByText(en.checkoutStepPay).closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(after).not.toHaveTextContent(/payment (successful|received|confirmed)/i);
    expect(screen.queryByText(/By continuing/)).toBeNull();

    // Try again re-opens Razorpay straight away with the same amount.
    await user.click(screen.getByTestId('donate-checkout-retry'));
    expect(openRazorpayButton).toHaveBeenCalledTimes(2);
    expect(openRazorpayButton.mock.calls[1]![2]).toBe(1000);
    expect(await screen.findByText(en.checkoutPayingTitle)).toBeVisible();

    closeMessage();
    await user.click(screen.getByRole('button', { name: en.checkoutChangeAmount }));
    expect(screen.getByTestId('donate-checkout-pay')).toBeVisible();
  });

  it('shows the fallback link when Razorpay cannot open (blocked script)', async () => {
    const user = userEvent.setup();
    openRazorpayButton.mockResolvedValue('failed');
    renderPanel();
    await user.click(screen.getByTestId('donate-checkout-pay'));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.checkoutFailed);
    expect(screen.getByTestId('donate-checkout-fallback')).toBeVisible();
    await user.click(screen.getByRole('button', { name: en.checkoutChangeAmount }));
    expect(screen.getByTestId('donate-checkout-pay')).toBeVisible();
  });

  it('asks for an amount instead of opening Razorpay when none is chosen', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('radio', { name: /Other amount/ }));
    expect(screen.getByText('Other')).toBeVisible();
    await user.click(screen.getByTestId('donate-checkout-pay'));
    expect(openRazorpayButton).not.toHaveBeenCalled();
    expect(screen.getByText(en.checkoutAmountMissing)).toBeVisible();
  });

  it('shows Tamil text on /ta/', () => {
    renderPanel({ path: '/ta/#donate', lang: 'ta' });
    const ta = DONATE_MESSAGES.ta;
    expect(screen.getByText(ta.checkoutMethodUpi)).toBeVisible();
    expect(screen.getByTestId('donate-checkout-pay')).toHaveTextContent(
      ta.checkoutPay.replace('{amount}', '').trim(),
    );
  });
});

describe('DonateCheckoutPanel thank-you screen (#donate-thanks)', () => {
  it('opens on the thank-you screen after Razorpay redirects back, with step 3 current', async () => {
    const user = userEvent.setup();
    renderPanel({ path: '/#donate-thanks' });
    const thanks = screen.getByTestId('donate-thanks');
    expect(within(thanks).getByRole('heading', { name: en.thanksTitle })).toBeVisible();
    expect(within(thanks).getByText(en.thanksReceipt)).toBeVisible();
    expect(screen.getByText(en.checkoutStepReceipt).closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    // A courtesy screen anyone can open: no amount and no "paid" claim.
    expect(thanks).not.toHaveTextContent(/₹|paid|success/i);
    expect(openRazorpayButton).not.toHaveBeenCalled();
    await user.click(within(thanks).getByRole('button', { name: en.checkoutClose }));
    expect(screen.queryByTestId('donate-thanks')).toBeNull();
  });

  it('shows the Tamil thank-you text on /ta/', () => {
    renderPanel({ path: '/ta/#donate-thanks', lang: 'ta' });
    expect(screen.getByText(DONATE_MESSAGES.ta.thanksTitle)).toBeVisible();
  });
});
