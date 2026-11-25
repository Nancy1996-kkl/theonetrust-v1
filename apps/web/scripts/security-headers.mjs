/**
 * Security headers for the public web app (#38), written to dist/_headers at build time (the
 * format Cloudflare Pages and Netlify read), to vercel.json by scripts/sync-vercel-headers.mjs
 * (Vercel reads only that file; CI fails on drift) and applied by `vite preview`, so every e2e test runs
 * under the same Content-Security-Policy as production — a violation fails the test.
 *
 * Only our own origin, the API origin and Cashfree's checkout may load or be contacted. Scripts
 * are never inline. Styles allow 'unsafe-inline' because the prerender inlines the stylesheet for a
 * fast first paint (scripts, the real XSS risk, stay strict).
 */
/**
 * Cashfree checkout (Phase 5): cashfree.js v3 loads from sdk.cashfree.com and opens its pop-up,
 * which talks to the sandbox or production API host. Cashfree publishes no CSP list, so this is
 * the narrow starting set of the plan [CONFIRM from CSP violation reports in a sandbox run; widen
 * only with evidence]. Razorpay is retired: none of its hosts are allowed.
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
    `script-src 'self' ${CASHFREE.script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${CASHFREE.img}`,
    "font-src 'self'",
    ['connect-src', "'self'", api, ...CASHFREE.connect].filter(Boolean).join(' '),
    `frame-src ${CASHFREE.frame.join(' ')}`,
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
      'camera=(), microphone=(), geolocation=(), payment=(self "https://sdk.cashfree.com")',
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
