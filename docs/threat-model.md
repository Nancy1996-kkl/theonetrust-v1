# Threat model — Theonetrust.in (#38)

Scope: the public site (`apps/web`, static), the API (`apps/api`, Fastify + PostgreSQL), Razorpay
(payments and monthly mandates), the email provider and the owner dashboard. Reviewed against
PROJECT_SPEC §12 and OWASP ASVS 5.0 (levels 1–2). Last reviewed: 2026-11-05.

## What we protect

| Asset                                                                         | Why it matters                                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Payment truth (`PAID`, amounts, refunds)                                      | A fake "paid" or a wrong amount means a false acknowledgement or lost money |
| Donor personal data: name, phone, email; PAN + address (tax opt-in only)      | Privacy (DPDP Act); PAN is sensitive and reported in Form 113               |
| Help-request data (people asking for help)                                    | Vulnerable people; dignity                                                  |
| Razorpay key secret, webhook secret, `AUTH_SECRET_KEY`, DB URL, email API key | Any one of them breaks payments, sessions or data                           |
| Owner account and session                                                     | Full access to all of the above                                             |
| Acknowledgement and manage-link tokens                                        | Unguessable capability links                                                |
| Published content and documents                                               | Must never show unapproved or invented claims                               |

## Trust boundaries

1. **Browser → static site.** Anyone. Only public, approved content. Content-Security-Policy limits
   scripts to our origin and Razorpay Checkout.
2. **Browser → API.** Anyone. CORS allowlist, rate limits, strict input validation, generic errors.
3. **Owner browser → `/api/v1/admin/*`.** Owner session cookie (`__Host-`, HttpOnly, Secure,
   SameSite=Strict) + CSRF token + Origin check + TOTP second factor; every write audited.
4. **Razorpay → webhook.** Untrusted network; HMAC signature, raw body, idempotent by event ID.
5. **API → Razorpay / email provider.** Outbound only, server-side secrets.
6. **API → PostgreSQL.** Server-only; constraints and CHECKs back the application rules.
7. **Proxy → API.** Only configured proxy addresses (`TRUST_PROXY`) may set the client IP.

## Threats and controls (STRIDE)

| #   | Threat                                                  | Control                                                                                                                                                          | Where tested                                      |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| S1  | Spoofed payment success (redirect, QR, UTR, screenshot) | Only server-verified captured payments become `PAID`; checkout signature verified server-side (constant time); amount/currency/order re-checked against Razorpay | `verify.db.test.ts`, `payment-suite.db.test.ts`   |
| S2  | Forged webhook                                          | HMAC over the raw body, constant-time compare; an unsigned or wrongly signed request is rejected and never processed                                             | `webhook.db.test.ts`                              |
| S3  | Owner account takeover                                  | Argon2 password hash, lockout, sign-in rate limit, TOTP, recovery codes once-only, session idle + max lifetime                                                   | `auth.db.test.ts`                                 |
| S4  | Forged client IP to dodge rate limits                   | `X-Forwarded-For` trusted only from `TRUST_PROXY` addresses (was: from anyone — fixed in #38)                                                                    | `foundation.test.ts`                              |
| T1  | Replayed / duplicate / out-of-order events              | Unique `(provider, providerEventId)`, unique payment ID, forward-only status transitions                                                                         | `webhook.db.test.ts`, `lifecycle.db.test.ts`      |
| T2  | Amount tampering in the browser                         | Server computes amounts in integer paise; mismatch → manual review exception                                                                                     | `payment-suite.db.test.ts`                        |
| T3  | CSRF on owner actions                                   | SameSite=Strict cookie + CSRF header + Origin check on every unsafe method                                                                                       | `auth.db.test.ts`                                 |
| T4  | Malicious upload (executable, script, renamed file)     | Server checks real type from bytes + declared type + extension, size limit, private storage under generated keys, `nosniff`                                      | `cms.test.ts`, `cms.db.test.ts`                   |
| T5  | Unapproved content made public                          | Public queries read PUBLISHED rows only; DB CHECKs for metrics/documents                                                                                         | `public-content.db.test.ts`, `cms.db.test.ts`     |
| R1  | Owner denies a change                                   | Append-only audit log for every admin write (actor, reason, changed field names, correlation ID); a write without an audit entry fails                           | `audit.db.test.ts`                                |
| I1  | Personal data in URLs, logs or public pages             | Tokens only in URLs; request logs drop query strings; receipts show minimal fields; PAN/address encrypted (AES-GCM), masked in UI                                | `receipts.db.test.ts`, `tax.db.test.ts`           |
| I2  | Secrets in Git or the web bundle                        | `check:no-live-keys` (repo), `check:bundle` (built bundle incl. source maps), env schema keeps secrets server-only                                               | `scripts/*.test.mjs`                              |
| I3  | XSS / third-party script injection                      | React escaping; CSP `script-src 'self' https://checkout.razorpay.com`, `object-src 'none'`, `frame-ancestors 'none'`                                             | e2e suite runs under the CSP                      |
| I4  | Clickjacking of the dashboard                           | `frame-ancestors 'none'` + `X-Frame-Options: DENY` (site and API)                                                                                                | `foundation.test.ts`, `security-headers.test.mjs` |
| D1  | Request floods                                          | Global per-IP limit + stricter per-route limits (sign-in, donations, verify, help, receipts, manage)                                                             | route tests                                       |
| D2  | Huge bodies                                             | `BODY_LIMIT_BYTES` (64 KB default); uploads have their own bounded limit                                                                                         | `cms.db.test.ts`                                  |
| E1  | Reaching admin data without a session                   | Guard on every `/admin/*` request incl. unknown paths (401, not 404)                                                                                             | `admin` route tests                               |

## Out of scope / accepted

- Hosting-provider and Razorpay-dashboard security (owner's accounts; 2FA required there too).
- Denial of service beyond rate limiting (handled by the hosting platform).
- A compromised owner device.
