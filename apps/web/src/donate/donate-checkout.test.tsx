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
    expect(screen.getByRole('radio', { name: '₹1,000' })).toBeChecked();
    expect(screen.getByText(en.checkoutMethodUpi)).toBeVisible();
    expect(screen.getByText(en.checkoutMethodCard)).toBeVisible();
    expect(screen.getByText(en.checkoutMethodNetbanking)).toBeVisible();
    expect(screen.getByTestId('donate-checkout-pay')).toHaveTextContent('Donate ₹1,000 securely');
  });

  it('stays closed without #donate', () => {
    renderPanel({ path: '/' });
    expect(screen.queryByTestId('donate-checkout')).toBeNull();
  });

  it('starts from the amount a home-page chip chose', () => {
    renderPanel({ amountPaise: 50000 as Paise });
    expect(screen.getByRole('radio', { name: '₹500' })).toBeChecked();
    expect(screen.getByTestId('donate-checkout-pay')).toHaveTextContent('₹500');
  });

  it('opens Razorpay with the chosen amount in rupees, then step 2 → close → step 3', async () => {
    const user = userEvent.setup();
    openRazorpayButton.mockResolvedValue('opened');
    const { updateDraft } = renderPanel();
    await user.click(screen.getByRole('radio', { name: '₹2,000' }));
    expect(updateDraft).toHaveBeenCalledWith({ amountPaise: 200000 });
    await user.click(screen.getByTestId('donate-checkout-pay'));

    expect(openRazorpayButton).toHaveBeenCalledTimes(1);
    const [host, cfg, rupees] = openRazorpayButton.mock.calls[0]!;
    expect(host).toBeInstanceOf(HTMLElement);
    expect(cfg).toEqual(config);
    expect(rupees).toBe(2000);
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
    expect(screen.getByText(en.checkoutAfterTitle)).toBeVisible();
    expect(screen.getByText(en.checkoutAfterPaid)).toBeVisible();
    expect(screen.getByText(en.checkoutAfterCancelled)).toBeVisible();
    // Never claims the payment succeeded.
    expect(screen.getByTestId('donate-checkout')).not.toHaveTextContent(/paid|success|thank/i);

    await user.click(screen.getByRole('button', { name: en.checkoutAgain }));
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
