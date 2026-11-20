/**
 * Which donate pop-up the site shows (Phase 5 of the Cashfree plan), in this order:
 * 1. `VITE_DONATE_PROVIDER=cashfree` → the full pop-up talking to our API (Cashfree inside it);
 * 2. a Razorpay Payment Button ID → the button inside the pop-up (kept as the rollback);
 * 3. a Razorpay Payment Page link;
 * 4. otherwise the full pop-up (which says online giving is not open until the API is on).
 */
export type DonatePopup = 'panel' | 'button' | 'link';

export function selectDonatePopup(options: {
  provider: string | undefined;
  hasButton: boolean;
  hasPageLink: boolean;
}): DonatePopup {
  if (options.provider === 'cashfree') return 'panel';
  if (options.hasButton) return 'button';
  if (options.hasPageLink) return 'link';
  return 'panel';
}
