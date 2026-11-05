# Release checklist — theonetrust.in (#39)

Go-live gate (PROJECT_SPEC §14 Phase 7): every item is ✔, or explicitly accepted in writing by the
trust owner below. Fill in date and initials; do not tick an item that was not actually done.
How to do each step: `docs/deployment.md`.

## A. Build and code (developer)

| #   | Item                                                                                                                           | Evidence                             | Done (date / initials) |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ---------------------- |
| A1  | `pnpm verify` passes on the release commit (format, lint, types, unit + coverage, build, e2e at 5 viewports, visual baselines) | CI run link                          |                        |
| A2  | `pnpm check:no-live-keys`, `pnpm check:bundle`, `pnpm audit:deps` pass                                                         | CI run link                          |                        |
| A3  | Security review #38 has no open critical/high finding                                                                          | `docs/security/review-2026-11-05.md` |                        |
| A4  | Accessibility audit #37: manual NVDA and TalkBack checks recorded                                                              | `docs/testing/a11y-i18n-audit.md`    |                        |

## B. Hosting and domain (developer + owner)

| #   | Item                                                                                    | Evidence           | Done |
| --- | --------------------------------------------------------------------------------------- | ------------------ | ---- |
| B1  | Web on the static host with `dist/_headers` applied (check the response headers of `/`) | header screenshot  |      |
| B2  | API on an always-on host; `pnpm --filter @theonetrust/api launch:check` shows all ✔     | output (no values) |      |
| B3  | `theonetrust.in`, `www`, `api.theonetrust.in` on HTTPS; `www` redirects                 | browser check      |      |
| B4  | Email domain: SPF, DKIM, DMARC pass on a real test email (Gmail + Outlook)              | email headers      |      |
| B5  | Uptime monitors on `/api/v1/health/ready` and `/`, alerts reach the owner               | test alert         |      |
| B6  | Error alerts on API `Unhandled error` logs reach the owner                              | test alert         |      |
| B7  | `TRUST_PROXY` set to the host's proxy addresses (#38 O1)                                | `launch:check`     |      |

## C. Data (developer + owner)

| #   | Item                                                                                                                       | Evidence          | Done |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---- |
| C1  | Neon production branch created; migrations applied with `prisma migrate deploy`                                            | migrate status    |      |
| C2  | **Restore drill** with `scripts/restore-drill.mjs` into an empty scratch database: tables, row counts and migrations match | output + duration |      |
| C3  | Document storage volume is persistent and included in backups                                                              | host setting      |      |
| C4  | Owner account created, authenticator set up, recovery codes stored offline                                                 | owner confirms    |      |

## D. Payments (owner + developer)

| #   | Item                                                                                                                              | Evidence                        | Done |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---- |
| D1  | Razorpay account activated for the trust; methods confirmed                                                                       | dashboard                       |      |
| D2  | Test-mode payment on the deployed site with the CSP on: Checkout opens and completes (#38 O3)                                     | screenshot                      |      |
| D3  | Live webhook created with a new secret and the events in `docs/deployment.md` §6                                                  | dashboard                       |      |
| D4  | Live keys + webhook secret on the API host only; `launch:check` ✔                                                                 | output                          |      |
| D5  | **Live webhook verified**: one small real donation → PAID, `/admin/webhooks` shows it Handled, acknowledgement email arrives      | reference (no card/UPI details) |      |
| D6  | That donation refunded from the dashboard; refund visible in the ledger and webhooks view                                         | reference                       |      |
| D7  | Monthly giving: stays **off** (`RAZORPAY_SUBSCRIPTIONS_ENABLED=false`) unless Razorpay Subscriptions is confirmed for the account | setting                         |      |
| D8  | International payments stay off until FCRA/bank/gateway requirements are confirmed (spec §12)                                     | setting                         |      |

## E. Trust facts and legal ([CONFIRM] items)

Each item is either confirmed (and filled in) or its feature stays hidden — the site already hides
everything below until it is confirmed. Tick the column that applies.

| #   | Item                                                                              | Where                                                                     | Confirmed & filled | Kept hidden/off |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------ | --------------- |
| E1  | Trust legal name, registration, established year, postal address                  | `apps/web/src/config/trust-facts.ts`; dashboard → Settings                |                    |                 |
| E2  | About, mission, ways-we-help introductions                                        | `apps/web/src/content/landing.ts` or dashboard → Page content             |                    |                 |
| E3  | Impact figures — only sourced, dated, approved                                    | dashboard → Impact figures                                                |                    |                 |
| E4  | Stories — only with documented consent                                            | dashboard → Page content                                                  |                    |                 |
| E5  | Transparency documents — owner-approved only                                      | dashboard → Documents                                                     |                    |                 |
| E6  | Allocation/earmarking policy; separate accounting per need                        | `content/proof.ts`, `content/policies.ts`                                 |                    |                 |
| E7  | Privacy: retention periods, DPDP rights and grievance contact (counsel)           | `content/policies.ts`                                                     |                    |                 |
| E8  | Terms: governing law and jurisdiction (counsel)                                   | `content/policies.ts`                                                     |                    |                 |
| E9  | Refunds: request window and processing time                                       | `content/policies.ts`                                                     |                    |                 |
| E10 | Tax benefit (RNPO + Section 354 approval, CA-confirmed); Form 113 CSV layout (CA) | dashboard → Tax                                                           |                    |                 |
| E11 | Bank transfer details (account name, number, IFSC, bank)                          | `trust_settings` in the database, entered by the developer with the owner |                    |                 |
| E12 | Fee table for "cover the fee"                                                     | dashboard → Settings                                                      |                    |                 |

## F. Rollback ready

| #   | Item                                                                         | Done |
| --- | ---------------------------------------------------------------------------- | ---- |
| F1  | Previous web deployment can be promoted in one step (tried once)             |      |
| F2  | Previous API release can be redeployed (tried once on staging)               |      |
| F3  | "Stop live payments" step in `docs/deployment.md` §7 understood by the owner |      |

## Owner sign-off

I have checked the items above. Items not ticked are accepted as listed here:

| Accepted item | Reason | Until |
| ------------- | ------ | ----- |
|               |        |       |

Signed for the trust: ______________________ Date: ____________
