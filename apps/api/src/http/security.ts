import type { FastifyInstance } from 'fastify';

/**
 * Security headers for a JSON-only API. Nothing here is ever rendered as a page, so the policy
 * is as tight as it gets: no content may load, no framing, no MIME sniffing, no caching.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-site',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  // Donor and admin responses must never sit in a shared or browser cache.
  'cache-control': 'no-store',
};

/** HTTPS only, two years, subdomains included. Sent only in production, behind TLS. */
export const HSTS_HEADER = 'max-age=63072000; includeSubDomains';

export function registerSecurityHeaders(app: FastifyInstance, production: boolean): void {
  app.addHook('onSend', async (_request, reply) => {
    reply.headers(SECURITY_HEADERS);
    if (production) reply.header('strict-transport-security', HSTS_HEADER);
  });
}
