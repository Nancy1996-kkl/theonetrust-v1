/**
 * Security headers for the public web app (#38), written to dist/_headers at build time (the
 * format Cloudflare Pages and Netlify read), to vercel.json by scripts/sync-vercel-headers.mjs
 * (Vercel reads only that file; CI fails on drift) and applied by `vite preview`, so every e2e test runs
 * under the same Content-Security-Policy as production — a violation fails the test.
 *
 * Only our own origin, the API origin, Razorpay Checkout and Cashfree's checkout may load or be
 * contacted. Scripts are
 * never inline. Styles allow 'unsafe-inline' because the prerender inlines the stylesheet for a
 * fast first paint (scripts, the real XSS risk, stay strict).
 */
export const RAZORPAY = {
  // checkout.razorpay.com serves Checkout and the Payment Button embed; the embed then loads
  // its helpers from cdn.razorpay.com (seen with a test-mode button, Nov 2026).
  script: ['https://checkout.razorpay.com', 'https://cdn.razorpay.com'],
  // Checkout opens its own frame and talks to Razorpay's API; the Payment Button form is an
  // iframe on razorpay.com [CONFIRM against Razorpay's CSP guidance with a test-mode payment
  // before launch].
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://razorpay.com'],
  connect: ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
  img: 'https://*.razorpay.com',
  // The Payment Button embed adds a Google Fonts stylesheet for its own button. Our pages keep
  // self-hosted fonts; only this Razorpay request uses these origins.
  style: 'https://fonts.googleapis.com',
  font: 'https://fonts.gstatic.com',
};

/**
 * Cashfree checkout (Phase 5): cashfree.js v3 loads from sdk.cashfree.com and opens its pop-up,
 * which talks to the sandbox or production API host. Cashfree publishes no CSP list, so this is
 * the narrow starting set of the plan [CONFIRM from CSP violation reports in a sandbox run; widen
 * only with evidence]. Razorpay stays allowed while its button is the rollback.
 */
export const CASHFREE = {
  script: ['https://sdk.cashfree.com'],
  frame: ['https://sdk.cashfree.com', 'https://sandbox.cashfree.com', 'https://api.cashfree.com'],
  connect: ['https://sdk.cashfree.com', 'https://sandbox.cashfree.com', 'https://api.cashfree.com'],
  img: 'https://*.cashfree.com',
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
    `script-src 'self' ${[...RAZORPAY.script, ...CASHFREE.script].join(' ')}`,
    `style-src 'self' 'unsafe-inline' ${RAZORPAY.style}`,
    // The one-time UPI QR image is served by the API (never hot-linked from Razorpay).
    ['img-src', "'self'", 'data:', api, RAZORPAY.img, CASHFREE.img].filter(Boolean).join(' '),
    `font-src 'self' ${RAZORPAY.font}`,
    ['connect-src', "'self'", api, ...RAZORPAY.connect, ...CASHFREE.connect]
      .filter(Boolean)
      .join(' '),
    `frame-src ${[...RAZORPAY.frame, ...CASHFREE.frame].join(' ')}`,
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
      'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com" "https://sdk.cashfree.com")',
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
