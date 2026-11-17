/**
 * Razorpay Payment Page mode (client, Nov 2026): no API or database. When
 * VITE_DONATE_PAGE_URL holds the trust's Razorpay Payment Page link, the Donate pop-up sends the
 * donor there; Razorpay takes the payment, emails the receipt and lists it in its dashboard.
 *
 * Only an https link on Razorpay's own page hosts is accepted, so a typo or a look-alike domain
 * can never turn the Donate button into a link to somewhere else.
 */
const ALLOWED_HOSTS = new Set(['pages.razorpay.com', 'rzp.io']);

export function donatePageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;
  if (url.username || url.password || url.pathname === '/' || url.pathname === '') return null;
  return url.toString();
}

export const DONATE_PAGE_URL = donatePageUrl(import.meta.env.VITE_DONATE_PAGE_URL);
