/**
 * Security headers for the public web app (#38), written to dist/_headers at build time (the
 * format Cloudflare Pages and Netlify read) and applied by `vite preview`, so every e2e test runs
 * under the same Content-Security-Policy as production — a violation fails the test.
 *
 * Only our own origin, the API origin and Razorpay Checkout may load or be contacted. Scripts are
 * never inline. Styles allow 'unsafe-inline' because the prerender inlines the stylesheet for a
 * fast first paint (scripts, the real XSS risk, stay strict).
 */
export const RAZORPAY = {
  script: 'https://checkout.razorpay.com',
  // Checkout opens its own frame and talks to Razorpay's API [CONFIRM against Razorpay's CSP
  // guidance with a test-mode payment before launch].
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
  connect: ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
  img: 'https://*.razorpay.com',
};

/** The API's origin from VITE_API_BASE_URL; null when the API is same-origin (relative URL). */
export function apiOrigin(apiBaseUrl) {
  if (!apiBaseUrl) return null;
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ apiBaseUrl, production }) {
  const api = apiOrigin(apiBaseUrl);
  const directives = [
    "default-src 'self'",
    `script-src 'self' ${RAZORPAY.script}`,
    "style-src 'self' 'unsafe-inline'",
    // The one-time UPI QR image is served by the API (never hot-linked from Razorpay).
    ['img-src', "'self'", 'data:', api, RAZORPAY.img].filter(Boolean).join(' '),
    "font-src 'self'",
    ['connect-src', "'self'", api, ...RAZORPAY.connect].filter(Boolean).join(' '),
    `frame-src ${RAZORPAY.frame.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}

export function webSecurityHeaders({ apiBaseUrl, production }) {
  return {
    'Content-Security-Policy': contentSecurityPolicy({ apiBaseUrl, production }),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com")',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    ...(production && { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' }),
  };
}

/** dist/_headers: every path gets the headers; receipts and manage links are never cached. */
export function headersFile(headers) {
  const block = Object.entries(headers)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');
  return `/*\n${block}\n\n/receipt/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n\n/ta/receipt/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n\n/manage/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n\n/ta/manage/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n\n/admin/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n`;
}
