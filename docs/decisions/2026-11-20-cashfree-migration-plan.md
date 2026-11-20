# Cashfree migration and Vercel serverless hosting — implementation plan (2026-11-20)

- **Status**: Proposed — needs owner approval before any implementation PR starts.
- **Inputs**: `CLAUDE.md`, `docs/research/2026-11-20-payment-audit.md` (the "audit", findings F-1…F-10
  and blockers B1…B16), `docs/research/2026-11-20-cashfree-research.md` (the "research"),
  `docs/deployment.md`, ADRs 0002/0005/0006, and the code on `main` at `b75d7a8`.
- **Owner decisions already taken**: Cashfree replaces Razorpay; keep the Donate pop-up with its
  3-step progress bar (Amount → Pay securely → Receipt) and the `#donate-thanks` screen, now backed by
  the real API and Cashfree's popup checkout (`redirectTarget: '_modal'`); zero new monthly cost —
  API as Vercel functions on Hobby inside the existing project `theonetrust-v1`, same origin under
  `/api/*`; database = existing `theonetrust` schema in the Supabase project `cafe-production`, role
  `theonetrust_app`; the cafe's data must never be readable or writable by the trust role.
- **Scope of this document**: planning only. No source, database, Vercel, Supabase or GitHub change
  was made while writing it.

Anything not confirmed in official documentation is marked **[CONFIRM]** and must be checked (in
the Cashfree sandbox, Vercel docs or Supabase docs) inside the PR that relies on it.

---

## 1. Target architecture

### 1.1 Diagram

```
                                 ┌──────────────────────── Vercel project theonetrust-v1 (Hobby) ─────────────────────────┐
 Donor browser                   │                                                                                        │
 (en / ta, single page)          │  Static: apps/web/dist  (CSP + security headers from vercel.json)                      │
   │  GET /, /ta/ ─────────────▶ │                                                                                        │
   │                             │  Function: api/[...path].ts  → apps/api/src/serverless.ts                              │
   │  POST /api/v1/donation-intents ─▶  buildApp(env, {db}) once per instance; app.server.emit('request', req, res)     │
   │  POST /api/v1/payments/verify   │    • Fastify 5 + Zod, raw-body parser for webhooks (NODEJS_HELPERS=0)            │
   │  GET  /api/v1/donations/status/:ref • Prisma 7 + adapter-pg, pool max 2–3, idle 5 s                               │
   │  /api/v1/auth/*, /api/v1/admin/* │    • after-commit hook → waitUntil(drain outbox for this donation)              │
   │                             │    • region: same as the Supabase project (bom1 if the DB is in ap-south-1)            │
   │                             │  Cron (Hobby, once a day): GET /api/v1/internal/jobs/daily  (Bearer CRON_SECRET)       │
   │                             └───────────────┬───────────────────────────────┬────────────────────────────────────────┘
   │                                             │ TLS, Supavisor transaction     │ HTTPS, x-client-id / x-client-secret,
   │                                             │ pooler :6543, user              │ x-api-version 2026-01-01
   │                                             ▼ theonetrust_app.<ref>           ▼
   │                             ┌──────────────────────────────┐        ┌───────────────────────────────┐
   │                             │ Supabase cafe-production     │        │ Cashfree PG                   │
   │                             │  schema theonetrust (RLS on, │        │  POST /pg/orders              │
   │                             │  policies only for           │        │  GET  /pg/orders/{id}         │
   │                             │  theonetrust_app)            │        │  GET  /pg/orders/{id}/payments│
   │                             │  cafe schemas: no grants     │        │  GET/POST /pg/orders/{id}/refunds
   │                             └──────────────────────────────┘        └──────────────┬────────────────┘
   │  cashfree.js v3 (sdk.cashfree.com)                                                  │ webhook (at-least-once)
   └──── checkout({ paymentSessionId, redirectTarget: '_modal' }) ◀──── Cashfree modal ─┘ POST /api/v1/webhooks/cashfree
                                                                                          (x-webhook-signature,
 Email: Resend (free tier) ◀── outbox drain (inline after PAID, daily cron, admin "Run now")    x-webhook-timestamp)
 Google Sheet (optional, minimised) ◀── same outbox
```

### 1.2 Request paths

1. **Create**: pop-up step 1 → `POST /api/v1/donation-intents` (amount, fee choice, phone, optional
   name/email, `Idempotency-Key`) → server computes `amountPaise`, creates the intent, calls
   Cashfree `POST /pg/orders` with `order_id = publicReference` (`TOT-D-` + 12 Crockford chars,
   `apps/api/src/db/references.ts:9`, fits Cashfree's 3–45 char rule) and stores the attempt → returns
   `{ publicReference, checkout: { provider: 'CASHFREE', paymentSessionId, mode } }`.
2. **Pay**: browser loads `https://sdk.cashfree.com/js/v3/cashfree.js` on demand and opens the modal.
   Whatever the promise resolves to, it is **not** proof of payment.
3. **Verify**: browser → `POST /api/v1/payments/verify { publicReference }` → server fetches the order
   and its payments from Cashfree with the secret → `applyProviderPayment` (shared reconcile) → PAID
   only under the PAID rule (§4.3). Then the browser polls `GET /api/v1/donations/status/:ref`.
4. **Webhook**: Cashfree → `POST /api/v1/webhooks/cashfree` → raw-body signature check → durable
   dedupe row → **re-fetch the order from Cashfree** (the payload is only a trigger) → same reconcile.
5. **Background**: the PAID transaction writes outbox rows (existing behaviour, `reconcile.ts`); after
   the transaction commits the request schedules one bounded drain with `waitUntil`.

### 1.3 Background work without a long-running worker — decision

**Primary approach: inline, after-commit drain with `waitUntil`, plus a once-a-day Vercel cron
backstop and the existing admin "retry/run now" button.** No paid scheduler, no worker process.

| Option                                                                       | Cost | Reliability                                                                                                                              | Verdict                    |
| ---------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Inline drain after commit (`waitUntil` from `@vercel/functions`)             | ₹0   | Runs within seconds of PAID in the same invocation; existing 5-min lease/claim in `notifications/worker.ts` makes concurrent drains safe | **Primary**                |
| Vercel cron (Hobby: once per day, timing within the hour **[CONFIRM]**)      | ₹0   | Coarse, but guaranteed by the platform                                                                                                   | **Backstop** (daily jobs)  |
| Admin "Run jobs now" button (audited)                                        | ₹0   | Manual                                                                                                                                   | Keep (existing retry UI)   |
| Free external pinger (cron-job.org / GitHub Actions `schedule`) every 15 min | ₹0   | GitHub schedules drift and pause after inactivity; third-party holds a bearer secret                                                     | Optional, owner's choice   |
| Supabase `pg_cron` + `pg_net`                                                | ₹0   | Good, but runs inside the **cafe's** database and adds an outbound-HTTP extension there                                                  | Rejected (tenant coupling) |

Why this is safe: **money state never depends on background work.** PAID is written synchronously by
verify, status re-check, webhook or owner re-check; Cashfree retries webhooks (2, 10, 30 min, up to 10
times, research §Webhooks). Background work only sends emails/sheet rows and re-checks stragglers.
The worst case of a missed inline drain is an acknowledgement email delayed until the daily cron.

Daily job (`/api/v1/internal/jobs/daily`, one route, bounded batches, each step independent):

1. Drain the outbox (`processDueNotifications`, existing, with a `limit`).
2. Re-process webhook rows stuck in `RECEIVED` older than the lease (F-3).
3. Reconcile Cashfree orders whose intent is `CREATED/PENDING/AUTHORIZED`, older than 15 min and
   younger than the order expiry + 1 day (max 25 per run, to respect the function duration and
   Cashfree rate limits).
4. Purge expired sessions and old rate-limit buckets.
5. Write one `job_runs` row (start, end, counts, error code only) shown on `/admin` overview.

---

## 2. Cross-cutting decisions

### 2.1 Razorpay: keep or remove?

**Recommendation: generalise first with Razorpay still green, switch with a flag, remove the Razorpay
_API_ adapter in a cleanup PR ≥ 30 days after Cashfree go-live. Keep the Razorpay no-code Payment
Button mode as the rollback path until then.**

Reasons:

- The live site does not use the Razorpay API path at all (it uses the no-code button,
  `apps/web/src/donate/razorpay-button.ts`), so rollback never needs the Razorpay API adapter; it needs
  the button mode (`VITE_DONATE_BUTTON_ID`).
- Keeping `razorpayProvider` passing during Phase 1 proves the new interface is truly provider-agnostic
  and keeps ~150 existing payment tests as a regression net while the core changes.
- Two webhook routes and two subscription adapters are long-term maintenance and attack surface;
  remove them once Cashfree has run cleanly for a month (and no Razorpay refund can still arrive via
  the API — the button mode records nothing on our side anyway).
- The Postgres enum value `RAZORPAY` stays forever (dropping an enum value is not practical and
  historic rows may use it).

### 2.2 Redirect fallback without a new page

ADR 0005 forbids `/donate/status/…` pages ("There are no separate `/donate`, `/donate/status/…` or
`/help` pages"). The request asked for a `/donate/status` page; **this plan uses a panel state
instead**, which respects the ADR: `order_meta.return_url = <PUBLIC_SITE_URL>/?cf_order={order_id}`
(`/ta/?cf_order=…` for Tamil). On load, the app sees `cf_order` (pattern-checked against
`TOT-D-…`), opens the Donate pop-up directly on step 2 "Checking your payment", removes the parameter
with `history.replaceState`, and polls status. If the owner prefers a real page, amend ADR 0005 first.
The public reference is not personal data; the status endpoint already accepts it.

### 2.3 Staging data must not pollute the trust's ledger

Sandbox donations made on preview deployments must not land in the production `theonetrust` schema.
**Recommendation: a separate free Supabase project (or at least a separate `theonetrust_staging`
schema + role) for Vercel's _Preview_ environment.** A free project costs ₹0 and isolates staging
from both the cafe and production; it may pause when idle, which is acceptable for staging.
[Owner decision; the plan assumes a separate free project.]

### 2.4 Env-based mode rules (fail fast, `apps/api/src/config/env.ts`)

- `PAYMENT_PROVIDER` ∈ `none | razorpay | cashfree` (default `none` → donation creation answers 503
  with a bilingual "donations are paused" message on the web).
- `CASHFREE_ENV` ∈ `sandbox | production`, required when `PAYMENT_PROVIDER=cashfree`.
- `VERCEL_ENV=production` with `CASHFREE_ENV=sandbox` is refused unless `PAYMENT_PROVIDER=none`
  (replaces the `rzp_live_` prefix rules, F-10). `VERCEL_ENV=preview` with `CASHFREE_ENV=production`
  is refused.
- The checkout DTO carries `mode`, so the web needs no build-time Cashfree setting other than the
  adapter switch.

---

## 3. Phases

Each phase is one or more issues, **one issue per PR**, following `implementation-task` → test matrix
first (`edge-case-matrix`) → `pnpm verify` → `change-audit` → `payment-security-reviewer` (money) and
`ui-a11y-reviewer` (UI). Effort: S ≤ 1 day, M 2–3 days, L 4–6 days (one engineer, including tests).

### Phase 0 — Pre-work fixes on the current code (before any Cashfree code)

Provider-independent defects from the audit that would make Cashfree or serverless unsafe.

#### 0.1 F-1: failed attempt then success on the same order (High, money) — M

- **Change**
  - `apps/api/src/modules/payments/reconcile.ts`: only record `providerPaymentId` for a payment that
    settles or may settle the order (`captured`/`authorized`); a failed payment updates
    `providerStatus` but never claims the attempt. "Duplicate" means a **second captured** payment
    with a different ID, not "any second payment ID".
  - `apps/api/src/modules/payments/transitions.ts`: allow `FAILED → PAID` **only** with source
    `gateway_verified` (money captured on our own order is the truth); add an exception row of a new
    kind or reuse `PAYMENT_MISMATCH`-style note so the owner sees "paid after an earlier failure".
  - `verify-routes.ts` status re-check and `ledger/admin-routes.ts` owner re-check: re-check **by
    order** (all payments of the order), never only by the stored payment ID. Extract one helper
    `apps/api/src/modules/payments/recheck.ts` used by both (also fixes F-4).
- **DB migration**: none.
- **Tests**: `payment-suite.db.test.ts` + `verify.db.test.ts` + `webhook.db.test.ts`: failed→success
  same order with (a) callback first, (b) webhook first, (c) failed webhook arriving after the success,
  (d) two captured payments on one order → MANUAL_REVIEW, (e) owner re-check heals a FAILED donation
  with a captured payment; `transitions.test.ts`: `FAILED → PAID` allowed only for `gateway_verified`,
  refused for every other source; F-4 owner re-check for QR and `subpay_` attempts.
- **Acceptance**: no path leaves a captured payment on a FAILED donation; exactly one receipt; outbox
  rows written once.
- **Rollback**: revert the PR (no schema change).
- **Owner input**: none.

#### 0.2 F-3: webhook row stuck in `RECEIVED` (Medium) — S

- **Change** `apps/api/src/modules/payments/webhook-routes.ts:174-195`: a `RECEIVED` row older than a
  short lease (config `WEBHOOK_REPROCESS_AFTER_MS`, default 120 000) is claimed with a conditional
  `updateMany … where processingStatus = 'RECEIVED' and receivedAt < cutoff` and re-processed; a fresh
  `RECEIVED` row still answers "duplicate" (a concurrent delivery is in flight). Reconcile is already
  idempotent, so double processing cannot double-apply.
- **Tests** (`webhook.db.test.ts`): stale RECEIVED re-processed once; fresh RECEIVED acknowledged;
  two concurrent retries of a stale row → exactly one processes; PROCESSED/IGNORED still duplicate.
- **Rollback**: revert. **Owner input**: none.

#### 0.3 F-2: CSP actually served on Vercel (Medium–High) — S/M

- **Change**
  - `scripts/sync-vercel-headers.mjs` (new): imports `webSecurityHeaders` from
    `apps/web/scripts/security-headers.mjs` and writes the `headers` block of `vercel.json`
    (all paths: CSP, Permissions-Policy, COOP, HSTS in production; `/receipt/*`, `/ta/receipt/*`,
    `/manage/*`, `/ta/manage/*`: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; keep the
    existing `/assets` and `/admin` rules).
  - `scripts/sync-vercel-headers.test.mjs`: fails CI if `vercel.json` differs from the generator
    (drift check), and asserts no inline-script allowance.
  - `scripts/check-deployed-headers.mjs <url>` (new, manual/CI-on-preview): `HEAD` the deployment and
    assert CSP and Permissions-Policy are present and equal to the generator's output.
  - Same-origin API: `apiOrigin('/api/v1')` already returns `null`, so `connect-src 'self'` covers it.
  - Origins stay Razorpay-only in this phase (the live button needs them).
- **Tests**: script unit tests above; `e2e/shell.spec.ts` already runs under `vite preview` headers.
- **Acceptance**: `check-deployed-headers` passes against the PR's preview URL; live button still
  opens (manual check on preview).
- **Rollback**: revert `vercel.json` (web-only deploy).
- **Owner input**: approve the preview check of the live button flow.

#### 0.4 F-7: idempotency race on donation creation (Low, cheap) — S

- **Change** `apps/api/src/modules/donations/routes.ts:193-236`: catch P2002 on the idempotency
  column and return the winner's response (same pattern as webhooks).
- **Tests** (`donations.db.test.ts`): two concurrent first requests with the same key → both 200,
  same `publicReference`, one provider order (fake provider counts calls).

### Phase 1 — Provider-agnostic boundary (Razorpay stays green) — M/L

- **Goal**: domain code knows nothing about a provider's words, ID formats or signature scheme.
- **Files**
  - `packages/contracts/src/provider.ts` (new): `PAYMENT_PROVIDERS = ['RAZORPAY', 'CASHFREE',
'BANK_TRANSFER']`, `PaymentProviderName`; `CheckoutDescriptor` discriminated union:
    `{ provider: 'RAZORPAY'; keyId; orderId } | { provider: 'CASHFREE'; paymentSessionId; mode:
'sandbox' | 'production' }`.
  - `packages/contracts/src/donation.ts:58-71, 115-121`: use the union; `PaymentVerifyRequest`
    becomes `{ publicReference }` plus an optional provider-specific `proof` object (Razorpay's
    signature triple), so both adapters fit.
  - `apps/api/src/modules/donations/provider.ts` → split into `payments/provider/types.ts` (interface)
    and `payments/provider/razorpay.ts` (existing code, unchanged behaviour). New interface:

    ```ts
    interface PaymentProvider {
      readonly name: PaymentProviderName;
      readonly capabilities: { requiresCustomerPhone: boolean; browserProof: boolean; qr: boolean };
      createOrder(input: CreateOrderInput): Promise<CreatedOrder>; // returns CheckoutDescriptor
      fetchOrderState(orderRef: string): Promise<ProviderOrderState>; // order status + all payments
      verifyBrowserProof?(orderRef: string, proof: unknown): boolean; // Razorpay only
      verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders, now: Date): VerifiedWebhook;
      fetchRefunds(orderRef: string): Promise<ProviderRefund[]>;
      createRefund(input: RefundInput): Promise<ProviderRefund>; // unused in v1 UI, tested
    }
    ```

    `ProviderOrderState = { orderRef; orderStatus: 'ACTIVE'|'PAID'|'EXPIRED'|'TERMINATED'|'UNKNOWN';
payments: NormalisedPayment[] }`, `NormalisedPayment = { paymentId; status:
'PENDING'|'AUTHORIZED'|'CAPTURED'|'FAILED'|'CANCELLED'|'UNKNOWN'; amountPaise; currency; method:
ReceiptMethod | null; refundedPaise }`. Provider words are mapped **inside adapters**
    (`reconcile.ts:22-27` `STATUS_FOR` moves into the Razorpay adapter).

  - `apps/api/src/modules/payments/reconcile.ts`: new entry `applyOrderState(db, attemptId, state)`
    implementing the PAID rule of §4.3 provider-agnostically; `applyProviderPayment` becomes a thin
    wrapper for Razorpay until removal.
  - `apps/api/src/db/repositories/donations.ts:283-285`, `donations/routes.ts:281-290, 426-438`:
    provider name from the selected adapter, not the literal.
  - `apps/api/src/app.ts:81-88, 220-281`: select the adapter by `PAYMENT_PROVIDER`.
  - `apps/api/src/config/env.ts`: `PAYMENT_PROVIDER`.
- **DB migration**: none in this phase.
- **Tests**: every existing Razorpay unit/DB/e2e test must pass unchanged in behaviour (fixtures may
  move); new unit tests for the Razorpay status mapping; contract tests for the descriptor union;
  `app.test.ts`: `PAYMENT_PROVIDER=none` → `POST /donation-intents` 503 with the generic error body.
- **Acceptance**: `grep -R "'RAZORPAY'" apps/api/src --include=*.ts` only hits the Razorpay adapter,
  enum mirrors and tests; coverage gates unchanged.
- **Rollback**: revert (no schema change, live site unaffected).
- **Owner input**: none.

### Phase 2 — Vercel serverless hosting + Supabase role (split into 4 PRs) — L in total

#### 2a. Spike, then the function entry — M

- **Spike first (throw-away branch, preview only)**: prove on a preview deployment that (1) a
  catch-all function under `api/` receives the original path, (2) the raw body reaches Fastify byte
  for byte, (3) `@node-rs/argon2`'s Linux binary is traced into the function, (4) Prisma 7 +
  `adapter-pg` works through the Supavisor transaction pooler including an interactive transaction
  and `nextval`. Record results in `docs/research/` before 2a merges. **[CONFIRM]** each of these is
  a Vercel/Supabase behaviour we have not yet observed.
- **Files**
  - `api/[...path].ts` (new, repo root): `export default handler` re-exported from
    `apps/api/src/serverless.ts`; `export const config = { maxDuration: 30 }` (job route 60).
  - `apps/api/src/serverless.ts` (new): loads env once, `createDb(url, { max: DB_POOL_MAX })`,
    `buildApp(env, { db, afterCommit })`, memoised `app.ready()`, then
    `app.server.emit('request', req, res)`. No `listen`, no signal handlers, no `setInterval`.
    `server.ts` stays for local dev and CI.
  - `apps/api/src/db/client.ts`: `createDb(url, { max, idleTimeoutMillis: 5000,
connectionTimeoutMillis: 5000 })`.
  - `vercel.json`: rewrite `/api/:path*` → the function (ordered **before** the SPA rewrites),
    `functions` block (`maxDuration`, `includeFiles` if the spike shows tracing misses), `regions`
    (one region = the DB's region; `bom1` if the DB is in Mumbai **[CONFIRM DB region]**), `crons`.
    Build command also builds the API bundle and runs `prisma generate`.
  - `apps/api/src/http/client-ip.ts` (new): on Vercel (`VERCEL=1`) take the client IP from
    `x-vercel-forwarded-for` / `x-real-ip` as Vercel documents **[CONFIRM header]**; never trust a
    client-supplied raw `x-forwarded-for`; used by rate limits and audit rows.
  - `apps/api/src/app.ts`: `REDACT_PATHS` gains `x-webhook-signature`, `x-client-secret`,
    `customer_phone`, `customer_details`; trustProxy handling via `client-ip.ts`.
  - Env `NODEJS_HELPERS=0` so Vercel does not pre-parse the body.
- **Document storage (B6)**: **disabled in this phase.** `DOCUMENT_STORAGE_DIR` unset → upload routes
  already have no store; the admin "Documents" page is hidden (§Phase 3). A free private object store
  (Supabase Storage via S3 API in a separate bucket, or Vercel Blob private) is a later issue.
- **Tests**: `serverless.test.ts` — handler with a Node `IncomingMessage`/`ServerResponse` pair:
  health 200; raw-body integrity (a re-serialised JSON body fails webhook verification); a second
  call reuses the app instance; unknown path 404 JSON; `client-ip.test.ts` (spoofed XFF ignored).
- **Acceptance**: preview `GET /api/v1/health/ready` → 200 with the staging DB; `pnpm verify` green;
  bundle check (`pnpm check:bundle`) still finds no server-only names in `apps/web/dist`.
- **Rollback**: remove the rewrite (static site keeps working; nothing on the live site calls `/api`
  yet because the web still uses the Razorpay button).
- **Owner input**: Supabase project region; approval of preview DB choice (§2.3).

#### 2b. Supabase role, grants, RLS policies and search_path (owner-run SQL) — S (code) + owner time

Not a Prisma migration: CI runs migrations on a plain Postgres where `theonetrust_app` does not
exist. Ship as reviewed scripts the owner runs in the Supabase SQL editor:
`apps/api/ops/supabase/01-theonetrust-app-role.sql`, `02-verify-isolation.sql`. **Irreversible-ish /
production change → explicit owner approval.** The password is generated by the owner, typed only in
the SQL editor and Vercel env — never in chat, Git or logs.

```sql
-- 01-theonetrust-app-role.sql  (run as postgres in cafe-production; review before running)
BEGIN;
ALTER ROLE theonetrust_app WITH LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10;
-- password: set separately in the SQL editor:  ALTER ROLE theonetrust_app PASSWORD '<generated>';
ALTER ROLE theonetrust_app SET search_path = theonetrust;
ALTER ROLE theonetrust_app SET statement_timeout = '15s';
ALTER ROLE theonetrust_app SET idle_in_transaction_session_timeout = '30s';

-- Only the trust schema. Nothing on public or any cafe schema.
REVOKE ALL ON SCHEMA theonetrust FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA theonetrust FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA theonetrust TO theonetrust_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA theonetrust TO theonetrust_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA theonetrust TO theonetrust_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA theonetrust
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO theonetrust_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA theonetrust
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO theonetrust_app;

-- RLS stays ON (deny-all for everyone else); one permissive policy per table for the app role only.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'theonetrust' LOOP
    EXECUTE format('ALTER TABLE theonetrust.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS theonetrust_app_all ON theonetrust.%I', t.tablename);
    EXECUTE format('CREATE POLICY theonetrust_app_all ON theonetrust.%I FOR ALL TO theonetrust_app USING (true) WITH CHECK (true)', t.tablename);
  END LOOP;
END $$;
COMMIT;
```

Notes:

- Append-only rules (audit log, status events, receipts) are **triggers**, so they still bind the app
  role; DELETE is granted only because the schema's own triggers refuse it where it matters. If the
  owner prefers, DELETE can be revoked on `admin_audit_log`, `donation_status_events`, `receipts`
  **[decide in review; the DB tests show which tables the app deletes from]**.
- `_prisma_migrations` must not be writable by the app role in production: revoke INSERT/UPDATE/
  DELETE on it after the grant above.
- Every future migration that adds a table must be followed by re-running `01-…sql` (idempotent);
  `launch:check` gets a `db_rls_policies` item that fails if any table in `theonetrust` lacks RLS or
  the app policy, and a `db_search_path` item (`SELECT current_schema()` = `theonetrust`, and
  `nextval('receipt_number_seq')` resolves — B8).
- `02-verify-isolation.sql` (read-only) lists every privilege `theonetrust_app` holds outside
  `theonetrust` (`has_table_privilege`, `has_schema_privilege`, `has_function_privilege` over
  `pg_namespace`); expected result: only `USAGE` on `public` and `EXECUTE` on functions granted to
  `PUBLIC` by Postgres defaults. **Risk**: cafe functions in `public` are executable by `PUBLIC` by
  default; review that list with the cafe's maintainer before revoking anything (a blanket revoke
  could break the cafe).
- Pooler user name is `theonetrust_app.<project-ref>` on port 6543 (transaction mode). Role-level
  `search_path` should apply through Supavisor **[CONFIRM in the 2a spike]**; fallback: the
  `schema` option of `PrismaPg` **[CONFIRM Prisma 7.10 option]** plus a schema-qualified
  `nextval('theonetrust.receipt_number_seq')` in `receipts/issue.ts`.
- Migrations keep running from a trusted machine with a `DIRECT_URL` (session pooler 5432 or direct)
  as the schema owner; `DIRECT_URL` is **never** stored in Vercel.

#### 2c. Shared rate-limit store (B4/B5) — M

- **Change**: `apps/api/src/http/rate-limit-store.ts` (new) implementing `@fastify/rate-limit`'s
  custom store on Postgres: table `rate_limit_buckets(key text primary key, window_start timestamptz,
hits int)`, upsert with `ON CONFLICT … DO UPDATE` in one statement; key = route id + SHA-256(IP +
  daily salt) (no raw IP stored). Used only for sensitive routes (sign-in, MFA, donation-intents,
  verify, status, receipts, help); the global per-instance in-memory limit stays as a cheap first
  layer. DB errors fail **open for public reads, closed for sign-in** (documented).
- **DB migration**: `2026112x_rate_limit_buckets` — additive, reversible (drop table). Re-run 2b SQL.
- **Tests**: unit (window rollover, key hashing), DB (two app instances share a counter — simulates
  two serverless instances; 11th sign-in in 15 min → 429), API (`retry-after` header).
- **Owner input**: approve the migration.

#### 2d. Jobs route, cron, inline drain (B2/B3/B12) — M

- **Files**: `apps/api/src/modules/jobs/{routes.ts,daily.ts}` (+ tests);
  `apps/api/src/modules/notifications/worker.ts` (`processDueNotifications({ limit, intentId? })`);
  `apps/api/src/serverless.ts` (`afterCommit` → `waitUntil`); `apps/api/src/modules/admin` overview
  shows the last `job_runs` row; `vercel.json` `crons: [{ path: '/api/v1/internal/jobs/daily',
schedule: '30 0 * * *' }]` (06:00 IST).
- **Auth**: `Authorization: Bearer <CRON_SECRET>` compared in constant time (Vercel sends it to cron
  invocations **[CONFIRM]**); optional `JOBS_SECRET` for an external pinger; no CSRF (no cookies);
  404 (not 401) when unauthorised to avoid advertising the route; rate-limited.
- **DB migration**: `job_runs` table — additive, reversible.
- **Tests**: DB tests for each job step (stale RECEIVED re-processed; pending order reconciled to PAID
  through a fake Cashfree; outbox drained; nothing processed twice when two runs overlap); API tests
  for auth (missing/wrong/right secret); unit test that a failing step does not stop the others.
- **Env**: `CRON_SECRET`, `JOBS_SECRET` (optional), `DB_POOL_MAX`.

### Phase 3 — Admin bootstrap and the dashboard in this phase — S/M

- **Owner account — recommendation: the existing CLI, run by the owner locally**
  (`pnpm --filter @theonetrust/api owner:set-password`, `apps/api/src/cli/set-owner-password.ts`)
  against the production `DATABASE_URL` from a trusted machine. Reasons: no new HTTP attack surface,
  Argon2id hashing already implemented, it revokes sessions and audits. A one-time "setup token" web
  flow is rejected: it adds a public endpoint that can be raced or leaked, for a once-only task.
  - Small fix in the same PR: make `setOwnerPassword` (`cli/owner-account.ts`) one transaction.
  - First sign-in on the deployed site: password → authenticator enrolment (QR + manual key) →
    10 recovery codes shown once (existing flow, `auth/service.ts`). Owner stores them offline.
- **Pages enabled now**: overview (with job status), donations ledger + detail + masked CSV export,
  "Re-check with the payment gateway", exceptions, webhooks, acknowledgements (receipts) + resend,
  notification outbox, settings (read-only payment mode, secret-set flags), audit log, account
  (password, MFA, recovery codes).
- **Hidden now** (feature flags in `/admin/settings` capabilities, extend
  `cms/settings-routes.ts:18, 54`): documents (no storage), monthly giving (Phase 8), bank-transfer
  matching (unless the owner wants it at launch), tax filing (`taxBenefitEnabled` off), CMS content
  editing (content is in code), help requests (unless the web Get Help adapter is switched to `api`).
- **Admin strings**: provider-neutral wording "payment gateway" / Tamil equivalent instead of
  "Razorpay" (`src/admin/ledger-strings.ts`), Tamil reviewed per `docs/tamil-copy-review.md`.
- **Tests**: `owner-account.test.ts` (transactional), `admin.spec.ts` (hidden nav items absent, en+ta,
  axe via the auto bug detector), API tests that hidden features' routes answer 404/403 when off.
- **Owner input**: run the CLI; choose which optional pages to show; keep recovery codes safe.

### Phase 4 — Cashfree adapter, webhook route and migration (API) — L

#### 4a. Migration (owner approval — **irreversible**)

- `2026112x_cashfree_provider/migration.sql`: `ALTER TYPE "PaymentProvider" ADD VALUE 'CASHFREE';`
  — **irreversible** (Postgres cannot drop an enum value without rebuilding the type). Must be its own
  migration: the new value cannot be used in the same transaction.
- `2026112y_provider_defaults/migration.sql`: drop the `'RAZORPAY'` defaults on
  `payment_attempts.provider`, `webhook_events.provider`, `subscription_plans.provider` (code always
  sets the provider). Reversible.
- `schema.prisma:40-43, 292, 318, 398` updated; `packages/contracts` enum mirror test updated.

#### 4b. Adapter — `apps/api/src/modules/payments/provider/cashfree.ts` (+ `cashfree.schemas.ts`,

`cashfree.money.ts`, tests)

- Plain `fetch` + Zod, no SDK. Base URL by `CASHFREE_ENV` (`https://sandbox.cashfree.com/pg`,
  `https://api.cashfree.com/pg`); headers `x-client-id`, `x-client-secret`, `x-api-version:
2026-01-01` (from `CASHFREE_API_VERSION`, pinned default), `x-request-id` = correlation ID,
  `x-idempotency-key` = our `Idempotency-Key` (or the intent ID) on create calls; 10 s timeout;
  responses parsed with Zod; **response bodies are never logged** (Cashfree errors may echo customer
  data); errors map to the existing `PaymentProviderError('network'|'rejected'|'unexpected_response')`.
- **Money**: `paiseToRupeeString(p)` = `${Math.trunc(p/100)}.${String(p%100).padStart(2,'0')}` on
  integers only (refuses non-integers, ≤ 0, > configured max); `rupeesToPaiseExact(x)` accepts a
  number or string from Cashfree, converts via string parsing (not `x*100`), and **throws** if more than
  2 decimals or the round-trip differs. Floats never reach the domain.
- **createOrder**: `order_id = publicReference`; `order_amount` string from paise; `order_currency
INR`; `customer_details = { customer_id: publicReference, customer_phone }` (name/email **not**
  sent by default — data minimisation, owner can opt in); `order_meta.return_url =
<PUBLIC_SITE_URL>[/ta]/?cf_order={order_id}`, `order_meta.notify_url = <PUBLIC_SITE_URL>/api/v1/
webhooks/cashfree` (both ≤ 250 chars, checked at boot); `order_expiry_time = now +
CASHFREE_ORDER_EXPIRY_MINUTES` (default 30); `order_tags` only non-personal (`purpose`, `fund`,
  `lang`) — never phone/email/name; `order_note` empty. Returns `paymentSessionId` and the stored
  `cf_order_id` as metadata.
- **fetchOrderState**: `GET /orders/{id}` + `GET /orders/{id}/payments`; maps `payment_status`
  `SUCCESS` (+ `is_captured`) → `CAPTURED`, `PENDING`/`NOT_ATTEMPTED` → `PENDING`, `FAILED` →
  `FAILED`, `USER_DROPPED`/`CANCELLED`/`VOID` → `CANCELLED`, `FLAGGED` → `UNKNOWN` (→ manual review);
  `payment_group` → `RECEIPT_METHODS` (`upi`, `credit_card`/`debit_card` → `card`, `net_banking` →
  `netbanking`, `wallet`, else `other`) **[CONFIRM value list in sandbox]**; `cf_payment_id` stored as
  a string.
- **Refunds**: `fetchRefunds` (`GET /orders/{id}/refunds`, sum of `SUCCESS` refunds in paise),
  `createRefund` (`POST /orders/{id}/refunds` with `refund_id = TOT-R-…`, partial allowed within 6
  months) — not wired to the admin UI in v1 (refunds are made in the Cashfree dashboard).
- Env `apps/api/src/config/env.ts`: `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV`,
  `CASHFREE_API_VERSION`, `CASHFREE_ORDER_EXPIRY_MINUTES`; both-or-neither; mode rules of §2.4.
- Scanners: `scripts/check-no-live-keys.mjs`, `scripts/check-bundle-secrets.mjs` gain
  `CASHFREE_CLIENT_SECRET` and Cashfree secret-key patterns **[CONFIRM prefixes from the dashboard,
  e.g. `cfsk_ma_prod_`]**; `.claude/hooks/lib.mjs` likewise. `.env.example` placeholders only.
- `cli/launch-check.ts`: `cashfree_keys`, `cashfree_env_matches_vercel_env`, `cashfree_reachable`
  (authenticated `GET` of a non-existent order → 404 means keys work), `db_search_path`,
  `db_rls_policies`, `email_domain`.

#### 4c. Webhook route — `apps/api/src/modules/payments/cashfree-webhook-routes.ts`

`POST /api/v1/webhooks/cashfree`, `{ config: { rawBody: true, rateLimit: false } }`:

1. Require `x-webhook-signature`, `x-webhook-timestamp` (digits), `x-webhook-version` (log only).
2. `expected = base64(HMAC_SHA256(CASHFREE_CLIENT_SECRET, timestamp + rawBody))`; decode both to
   buffers, **length check, then `timingSafeEqual`**; any mismatch → 400, nothing written. The
   concatenation (no separator) must be confirmed against Cashfree's own verifier in sandbox
   **[CONFIRM — audit F-6 notes separator ambiguity]**.
3. Timestamp: reject only timestamps more than 5 min **in the future**. Do **not** reject old
   timestamps until sandbox shows whether retries are re-signed **[CONFIRM]** — otherwise legitimate
   30-minute retries would be dropped. Replays are harmless because of step 5.
4. Derived dedupe key → `webhook_events.provider_event_id`:
   payments `pay:<type>:<cf_payment_id>:<payment_status>`, refunds `ref:<type>:<cf_refund_id>:
<refund_status>`, otherwise `raw:<sha256(rawBody)>`. Durable insert **before** processing; P2002 →
   200 duplicate; stale `RECEIVED` handled per Phase 0.2.
5. Process: look up the attempt by `data.order.order_id` (= publicReference) **and** provider
   `CASHFREE`; **re-fetch the order state from Cashfree** and reconcile; the payload's amounts and
   statuses are never trusted on their own. Unknown order → `IGNORED` + exception `UNMATCHED_CREDIT`
   for the owner. Refund events → `fetchRefunds` → `applyRefund`.
6. Answer 200 only after the outcome is stored; 500 on failure so Cashfree retries.

#### 4d. Route changes

- `donations/routes.ts`: when `provider.capabilities.requiresCustomerPhone`, `donorPhone` is
  required and validated with the existing `normalizeIndianMobile` (10 digits, 6–9 start); bilingual
  field error; the contract documents it.
- `verify-routes.ts`: `POST /payments/verify { publicReference }` → `recheck.ts` → reconcile;
  provider fetch failure → stays PENDING (existing behaviour).
- `donations/status/:ref`: unchanged contract; re-check via `recheck.ts` when unsettled (rate-limited).
- QR route: disabled for Cashfree (`capabilities.qr = false`; the Cashfree modal itself shows a UPI QR
  on desktop). Monthly routes: off.

#### 4e. Implementation notes (21 Nov 2026, as built)

Cashfree API facts were re-checked against the official API reference on 20 Nov 2026 before coding
(create/get order, get payments, get refunds, webhook headers and signature).

- **Where the code lives:** `apps/api/src/modules/donations/cashfree.ts` (adapter, money helpers,
  signature) and `apps/api/src/modules/payments/cashfree-webhook-routes.ts`. The Razorpay adapter
  was not moved (no drive-by refactor); the 1c file split stays optional.
- **Durable webhook record** (`deliverWebhook`) is now shared by the Razorpay and Cashfree routes,
  so both follow the same RECEIVED/FAILED/claim rules.
- **Deviation 1 — order PAID with no captured payment:** the adapter throws
  `unexpected_response`, so the donation keeps its status and the owner's re-check shows
  `provider_unexpected_response`; the daily job keeps re-checking. Nothing is guessed.
- **Deviation 2 — SUCCESS payment on an order that is not PAID** is held as `authorized`, never
  `captured`.
- **Added:** nullable `payment_attempts.checkout_session_id` (reversible migration) so an
  Idempotency-Key retry returns the same Cashfree session instead of a second order.
- **Not done here:** dropping the `'RAZORPAY'` column defaults (not needed: code always sets the
  provider); `cli/launch-check.ts` Cashfree checks and the `VERCEL_ENV`/`CASHFREE_ENV` match
  (Phase 8 launch gate); Cashfree secret-key prefix patterns in the scanners **[CONFIRM prefix from
  the dashboard]** — the scanners already catch a filled-in `CASHFREE_CLIENT_SECRET` assignment and
  the setting name in the web bundle.
- **Razorpay never receives the donor's phone:** only a gateway that requires it gets it.

#### Tests for Phase 4

- Unit: money conversions (₹1.00, ₹0.01 fee, 1 999 999.99, `"10.5"`, `10.005` refused, `1e21`
  refused, `0.1+0.2`-style float refused); Zod parsing of each Cashfree response; status/method
  mapping table; signature (valid, tampered body, tampered timestamp, wrong secret, wrong length,
  non-base64, missing headers); dedupe-key derivation.
- API + DB (`app.inject`, fake Cashfree via the injected `fetch`): create order (phone required,
  phone never in tags/notify URL/logs — log capture assertion), idempotent create, verify paths,
  webhook-first and verify-first, duplicate/late/out-of-order webhooks, failed→success on one order,
  amount/currency mismatch → MANUAL_REVIEW, order PAID with no matching payment → MANUAL_REVIEW, two
  SUCCESS payments → MANUAL_REVIEW, EXPIRED order → FAILED, refund full/partial/failed, unknown order.
- `payment-security-reviewer` must return `VERDICT: SHIP`.

### Phase 5 — Web: Cashfree popup in the existing 3-step pop-up — L

- **Files**
  - `apps/web/src/donate/DonateCashfreePanel.tsx` (new; reuses `Dialog`, `Stepper`, `AmountPicker`,
    `LogoSpinner`, the `#donate` / `#donate-thanks` hashes and the thanks animation of
    `DonateCheckoutPanel.tsx:261-289` — extract the thanks block into a shared component rather than
    duplicating it).
  - `apps/web/src/donate/cashfree-sdk.ts` (new): loads `https://sdk.cashfree.com/js/v3/cashfree.js`
    once, on demand (after step 1 submit), with a timeout; resolves `Cashfree({ mode })` with the mode
    from the API; typed result handling.
  - `apps/web/src/donate/donor-details.ts` (new): phone/email/name validation mirroring the API.
  - `apps/web/src/donate/donation-return.ts` (new): `cf_order` return handling (§2.2), sessionStorage
    of the in-flight reference (no personal data stored).
  - `apps/web/src/donate/donate-client.ts`: `createIntent` with a per-form `Idempotency-Key` (kept
    in component state so double-clicks and retries reuse it), `verify(publicReference)`,
    `pollStatus(ref)` (2 s, 3 s, 5 s, 8 s… up to 90 s, stops on PAID/FAILED, pauses when the tab is
    hidden).
  - `apps/web/src/donate/donate-messages.ts`: new strings, English and Tamil.
  - `apps/web/src/app/RootLayout.tsx:87-95`: explicit precedence, tested:
    `VITE_DONATE_PROVIDER=cashfree` (and `VITE_DONATE_ADAPTER=api`) → `DonateCashfreePanel`; else
    `VITE_DONATE_BUTTON_ID` → Razorpay button (rollback); else page link; else `DonatePanel`.
  - `apps/web/src/vite-env.d.ts`: `VITE_DONATE_PROVIDER`.
  - `apps/web/scripts/security-headers.mjs` + `scripts/sync-vercel-headers.mjs`: add Cashfree origins
    — `script-src https://sdk.cashfree.com`; `frame-src https://sdk.cashfree.com
https://sandbox.cashfree.com https://api.cashfree.com`; `connect-src https://sdk.cashfree.com
https://sandbox.cashfree.com https://api.cashfree.com`; `img-src https://*.cashfree.com`
    **[CONFIRM the exact list from CSP violation reports in a sandbox run; start narrow, widen only
    with evidence]**. Keep Razorpay origins while the button remains the rollback; remove them in the
    cleanup phase. Permissions-Policy `payment=(self "https://sdk.cashfree.com")` **[CONFIRM]**.
- **Flow (3 steps kept)**
  1. **Amount** — chips/custom amount (prefilled from the home chips via `DonationDraftContext`), fee
     cover choice, then "Your details": mobile number (required), name (optional, needed only for a
     named acknowledgement), email (optional; needed to receive the acknowledgement by email),
     "email me the acknowledgement" choice. Button "Pay ₹{amount} securely".
  2. **Pay securely** — "Opening secure payment…" → Cashfree modal. After the promise resolves (any
     result) → "Checking your payment…" (live region, spinner + text, not colour alone) → verify +
     poll. Outcomes: PAID → step 3; FAILED/expired → "The payment did not go through. No money was
     taken for this attempt." + "Try again" (same order while ACTIVE, else a new intent); still
     PENDING after polling → "We have not received confirmation yet. If money left your account it
     will be recorded automatically and you will get an acknowledgement." + reference shown;
     SDK blocked/offline → "The secure payment window could not open" + retry + bank-transfer/contact
     hint; `redirect` result (in-app browsers) → full-page navigation to Cashfree, return per §2.2.
  3. **Receipt** — existing thanks screen (`#donate-thanks`) only when the server says PAID; link
     to `/receipt/:token` (or `/ta/receipt/:token`) when an acknowledgement exists.
- **Phone copy (draft — Tamil must be reviewed per `docs/tamil-copy-review.md` before merge)**
  - EN label "Mobile number"; hint "Our payment partner needs a mobile number to process the payment.
    We never show it publicly or use it for marketing." Error "Enter a 10-digit Indian mobile number."
  - TA label "கைப்பேசி எண்"; hint "பணம் செலுத்துதலைச் செயல்படுத்த எங்கள் கட்டண கூட்டாளருக்கு கைப்பேசி
    எண் தேவை. இதை நாங்கள் பொதுவில் காட்டுவதோ விளம்பரத்துக்குப் பயன்படுத்துவதோ இல்லை." Error
    "10 இலக்க இந்திய கைப்பேசி எண்ணை உள்ளிடுங்கள்." **[CONFIRM Tamil review]**
  - Input: `type="tel"`, `inputmode="numeric"`, `autocomplete="tel-national"`, visible label,
    `aria-describedby` for hint + error, error announced, `+91` shown as static text.
- **Privacy**: phone/email/name only in the POST body; never in URLs, `sessionStorage`, analytics,
  console, error messages or `order_tags`; the `Idempotency-Key` is random.
- **Tests**
  - Unit (Vitest + RTL): precedence in `RootLayout`; phone validation en/ta; SDK loader (success,
    timeout, script error, double load); result handling for `error`/`redirect`/`paymentDetails`;
    polling backoff and stop conditions; return-param parsing (valid, malformed, foreign pattern
    ignored); idempotency key reuse on double click.
  - Playwright (`e2e/donate-cashfree.spec.ts`, mock API + a fake `cashfree.js` served via
    `page.route`, auto bug detector on, CSP enforced by `vite preview`): see §5 matrix; en + ta;
    5 viewports; reduced motion; keyboard-only; axe clean.
  - Visual baselines for the new step-1 fields (owner reviews diffs before baseline update).
- **Rollback**: set `VITE_DONATE_PROVIDER` empty and keep `VITE_DONATE_BUTTON_ID` → redeploy, or
  Vercel "Instant Rollback" to the previous production deployment.
- **Owner input**: approve the copy (both languages) and the "phone required" change; decide whether
  to send name/email to Cashfree.

### Phase 6 — Acknowledgement emails and the optional Google Sheet — M

- **Provider — recommendation: Resend free tier** (already implemented, `notifications/provider.ts:74`).
  Free-tier figures to confirm on the pricing pages at setup **[CONFIRM]**: Resend ≈ 3 000/month,
  100/day, one domain; Brevo ≈ 300/day with transactional sending. Either covers a trust's volume;
  Resend wins on simpler domain setup, an `Idempotency-Key` header and no daily-quota surprises at
  this volume. Brevo stays a one-env-var fallback (`EMAIL_PROVIDER=brevo`).
- **Domain**: needs DNS control of `theonetrust.in` (or a sending subdomain such as
  `mail.theonetrust.in`): SPF, DKIM, DMARC (`p=none` → `quarantine` after two clean weeks), per
  `docs/deployment.md` §2.
- **Idempotency**: outbox `dedupe_key` (existing); pass the outbox row ID as the provider's
  idempotency key so a lease expiry cannot double-send **[CONFIRM Resend header semantics]**; cancel
  if refunded before send (existing).
- **Content**: trust-branded "Donation acknowledgement" (never "Form 114", no tax promise while
  `taxBenefitEnabled` is off), donor email in the donor's language, owner email with reference,
  amount, method and a dashboard link — **no phone, no email address, no PAN in the owner email**
  (the dashboard holds them).
- **Google Sheet (optional, F-5)**: off by default. If enabled: reference, date, amount, method,
  fund, masked donor name only; a `reference` column used to skip duplicates before append; privacy
  policy (en + ta) names the sheet; sheet shared only with the owner's account.
- **Files**: `notifications/{worker.ts,templates.ts,sheet.ts}`, `content/policies.ts` (provider and
  processor names, both languages), tests.
- **Tests**: template snapshots en/ta; no PII in owner email (assert); idempotency key passed;
  sheet minimisation and duplicate skip; DB test: PAID → inline drain sends exactly once even with a
  concurrent cron drain.
- **Env**: `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
  `OWNER_NOTIFICATION_EMAIL`; sheet: `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_TAB`,
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`.
- **Owner input**: sender address and reply-to; DNS records added; decide on the sheet.

### Phase 7 — Sandbox end-to-end, go-live and rollback — M (mostly owner time)

#### 7a. Sandbox run (preview deployment + staging DB)

- Preview env: `PAYMENT_PROVIDER=cashfree`, `CASHFREE_ENV=sandbox`, staging `DATABASE_URL`.
- Preview deployments are protected by Vercel Authentication by default; Cashfree cannot pass it.
  Use per-order `notify_url` with Vercel's "Protection Bypass for Automation" token **[CONFIRM
  availability on Hobby]**, or temporarily disable protection for the sandbox session only. Rotate
  the bypass token afterwards.
- Run the manual sandbox script in `docs/release-checklist.md` (new section): UPI
  `testsuccess@gocash`, `testfailure@gocash`, card OTP `111000`, failure then success on one order,
  close the modal, refresh mid-flow, two tabs, refund full and partial from the sandbox dashboard,
  record CSP violations (none allowed), confirm webhook signature scheme and retry timestamps.

#### 7b. Go-live checklist (owner + developer)

1. **Cashfree KYC/activation for the trust**: PAN, trust deed/registration, signatory KYC, trustees
   list, bank account; Cashfree's FAQ says non-profits need **12A/80G (or FCRA)** — confirm with
   Cashfree; if the trust cannot provide these yet, **go-live is blocked** and the Razorpay button
   stays live.
2. Website pages required by Cashfree are live: Terms, About, Contact, Privacy, Refund (existing
   routes `/terms`, `/privacy`, `/refund-policy` updated to name Cashfree in en + ta; name matches KYC).
3. **Domain**: attach `theonetrust.in` (+ `www` redirect) to the Vercel project; HTTPS issued.
   Cashfree production checkout needs a whitelisted HTTPS domain and `*.vercel.app` is not allowed —
   **production cannot go live before this**.
4. Whitelist the domain in the Cashfree dashboard; configure the webhook
   `https://theonetrust.in/api/v1/webhooks/cashfree` (version pinned to 2026-01-01) for payment
   success/failed/user-dropped and refund events.
5. Production env in Vercel (owner enters values): `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`,
   `CASHFREE_ENV=production`, `PAYMENT_PROVIDER=cashfree`, `PUBLIC_SITE_URL`, `CORS_ORIGINS`;
   web `VITE_DONATE_PROVIDER=cashfree`, `VITE_DONATE_ADAPTER=api`, `VITE_API_BASE_URL=/api/v1`.
6. Run `migrate deploy` (owner machine), re-run `01-…sql`, `launch:check` all ✔, `check:bundle` ✔,
   `check-deployed-headers` ✔ on the production URL.
7. Smoke: ₹1 real UPI donation → panel shows success only after verification → `/admin` shows PAID,
   webhook Handled, acknowledgement email received (donor + owner) → refund from the Cashfree
   dashboard → refund recorded, acknowledgement corrected, ledger total back. Record in
   `docs/release-checklist.md`.
8. First two weeks: check `/admin/webhooks` and `/admin/exceptions` daily (existing guidance).

#### 7c. Rollback

- **Web**: Vercel Instant Rollback to the previous production deployment (Razorpay button build), or
  redeploy with `VITE_DONATE_PROVIDER` empty and `VITE_DONATE_BUTTON_ID` set.
- **API**: set `PAYMENT_PROVIDER=none` and redeploy → no new orders; **keep the Cashfree secret and
  webhook** so in-flight payments are still recorded; the daily job keeps reconciling.
- **DB**: migrations are additive except the enum value (harmless when unused); never roll back data.

### Phase 8 — Cleanup (≥ 30 days after go-live) — M

Remove `payments/provider/razorpay.ts`, `webhook-routes.ts` (Razorpay), Razorpay QR,
`razorpay-button.ts`, `DonateLinkPanel`, Razorpay CSP origins, Razorpay env vars and scanners'
Razorpay-only parts, Razorpay wording in docs/agents/CLAUDE.md (provider-neutral). Keep the enum
value. Update `docs/deployment.md` (Vercel + Supabase shape) and supersede ADR 0006's "long-running
Node server" note with an ADR for serverless hosting.

### Phase 9 — Monthly giving with Cashfree Subscriptions (later) — L

- **Constraints from the research**: `POST /pg/subscriptions` requires **email and phone**; checkout
  `subscriptionsCheckout({ subsSessionId })` documented with `_blank` only (popup **[CONFIRM]**) →
  redirect flow returning to `/?cf_sub=…` (panel state, ADR 0005); UPI/cards ₹15 000 without extra
  authentication (`UPI_AUTOPAY_MAX_PAISE` stays 1 500 000); pre-debit notice ≥ 25 h before each debit
  **[CONFIRM who sends it — Cashfree or merchant]**; fees ₹7.5 per mandate + ₹5 (< ₹1 000) / ₹15 per
  debit, **not** covered by the 0% offer — owner must accept this cost.
- **Work**: `subscriptions/provider/cashfree.ts` (plans, subscription create/fetch/cancel), webhook
  handling for subscription/mandate/charge events **[CONFIRM event names]** on the same route with
  derived dedupe keys, `lifecycle.ts` status mapping, F-7 orphan fix (create the DB row first, then
  the provider subscription), manage page cancel-at-provider-first copy, admin Monthly giving page
  re-enabled. Each debit → a `payment_attempt` with `provider_order_id` = Cashfree's charge/order
  reference, PAID rule unchanged.
- **Migration**: additive columns if Cashfree needs references the schema lacks (decide in the PR).
- **Tests**: existing subscription matrix ported (create, authorise, first debit, later debits,
  failed debit, cancel from the UPI app, halted/paused mandate, > ₹15 000 refused for UPI, duplicate
  and out-of-order events).
- **Env**: `CASHFREE_SUBSCRIPTIONS_ENABLED` (replaces `RAZORPAY_SUBSCRIPTIONS_ENABLED`).

---

## 4. Payment rules (normative for Phases 1, 4, 5)

### 4.1 Amounts

Integer paise in the DB, contracts and domain. Conversion to and from Cashfree's decimal rupees only
in `cashfree.money.ts`, exact, refusing anything that does not round-trip.

### 4.2 Attempts and orders

One `payment_attempt` per Cashfree order (= per intent, `order_id = publicReference`). Multiple
Cashfree payment attempts inside one order are **not** separate rows; their history is visible via
webhook rows and the latest `providerStatus`. A new intent (new order) is created only when the
previous order is `EXPIRED`/`TERMINATED` or the donor changes the amount.

### 4.3 PAID rule

A donation becomes `PAID` (source `gateway_verified`) only when, from a server-side fetch with our
secret: order `order_status = PAID` **and** exactly one payment with `payment_status = SUCCESS` **and**
`is_captured = true` **and** `payment_amount` (converted exactly) `= attempt.amountPaise` **and**
currency `INR` **and** the order ID equals the attempt's `providerOrderId`. Then, in the same
transaction: receipt (if eligible), outbox rows, tax tracking (existing).

Other outcomes:

| Server-side state                                                   | Donation                                   |
| ------------------------------------------------------------------- | ------------------------------------------ |
| Order ACTIVE, payments none/PENDING/FAILED/USER_DROPPED             | stays PENDING (never FAILED while payable) |
| Order EXPIRED or TERMINATED, no SUCCESS                             | FAILED                                     |
| Order PAID but no matching SUCCESS payment, or amount/currency diff | MANUAL_REVIEW + exception                  |
| Two SUCCESS payments on one order                                   | MANUAL_REVIEW + exception                  |
| SUCCESS after the donation was FAILED (late)                        | PAID + exception note for the owner        |
| `FLAGGED` payment                                                   | MANUAL_REVIEW                              |
| Refund SUCCESS (sum)                                                | `applyRefund` (existing rules)             |

---

## 5. End-to-end test matrix (payment flow)

Layer key: **U** unit, **A** API `app.inject` (+ DB), **E** Playwright with the auto bug detector
(console, exceptions, network, overflow, axe), **M** manual sandbox run (Phase 7a).

| #   | Case                                                                    | Expected                                                                      | Layers  |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| 1   | Chip amount on home → Donate pop-up                                     | Step 1 prefilled with the chip amount; en and ta                              | U, E    |
| 2   | Custom amount below min / above max / non-integer                       | Inline bilingual error, no API call                                           | U, E    |
| 3   | Phone missing / 9 digits / starts with 5 / with +91 and spaces          | Error for invalid; `+91 98…` normalised; API refuses invalid too              | U, A, E |
| 4   | Success via popup (`paymentDetails`) + webhook                          | Step 2 "checking" → step 3 thanks only after server PAID; one receipt; emails | A, E, M |
| 5   | Popup closed without paying (`error`)                                   | "No money was taken for this attempt" + Try again; status PENDING             | U, E, M |
| 6   | Failed attempt, then success in the same order                          | PAID; exactly one receipt; failed attempt does not mark FAILED                | A, E, M |
| 7   | Webhook arrives before the browser verify                               | Verify returns PAID immediately                                               | A       |
| 8   | Browser verify before webhook; webhook later                            | Webhook → duplicate-safe no-op                                                | A       |
| 9   | Duplicate webhook (same derived key)                                    | 200 duplicate, no second transition                                           | A       |
| 10  | Late FAILED webhook after PAID                                          | Ignored (no backwards move)                                                   | A       |
| 11  | Out-of-order: SUCCESS then USER_DROPPED for another attempt             | Stays PAID                                                                    | A       |
| 12  | Bad signature / tampered body / tampered timestamp / missing headers    | 400, nothing written                                                          | U, A    |
| 13  | Future timestamp (> 5 min)                                              | 400                                                                           | U, A    |
| 14  | Re-serialised JSON body under the serverless entry                      | Signature fails                                                               | A       |
| 15  | Webhook row stuck RECEIVED (crash)                                      | Re-processed after the lease, once                                            | A       |
| 16  | Webhook for an unknown order                                            | IGNORED + `UNMATCHED_CREDIT` exception                                        | A       |
| 17  | Amount tampering (client sends a different amount at verify)            | Ignored; server amount from DB; mismatch from Cashfree → MANUAL_REVIEW        | A       |
| 18  | Currency mismatch in Cashfree data                                      | MANUAL_REVIEW                                                                 | A       |
| 19  | Order expired without payment                                           | FAILED via status re-check or daily job; donor sees "did not go through"      | A, E    |
| 20  | Payment stays PENDING beyond polling                                    | Pending message with reference; daily job reconciles later                    | A, E    |
| 21  | Double click on "Pay"                                                   | One intent (same Idempotency-Key), one order                                  | U, A, E |
| 22  | Concurrent first requests with the same key                             | Both 200, same reference                                                      | A       |
| 23  | Back button during step 2 / after step 3                                | Pop-up state restored from sessionStorage; no second order; no false success  | E       |
| 24  | Refresh mid-payment                                                     | Re-opens "checking" with the stored reference; resolves from the server       | E, M    |
| 25  | Two tabs donating at once                                               | Two independent intents; each tab polls its own reference                     | E, M    |
| 26  | Language switch mid-flow (en → ta at step 1 and at step 2)              | Amount/details kept, strings switch, in-flight reference kept                 | E       |
| 27  | Redirect fallback (`redirect` result) → return `/?cf_order=…`, `/ta/?…` | Pop-up opens on "checking"; param removed from the URL; correct language      | U, E, M |
| 28  | Malformed/foreign `cf_order` value                                      | Ignored, no API call                                                          | U, E    |
| 29  | SDK blocked (CSP, adblock) or offline                                   | "Could not open" message + retry; no console CSP violation from our code      | E       |
| 30  | API down / 503 `PAYMENT_PROVIDER=none`                                  | Bilingual "donations are paused" message, no stack traces                     | A, E    |
| 31  | Cashfree API timeout at create                                          | Generic error, intent not left half-created (or cleaned by job)               | A       |
| 32  | Reduced motion                                                          | No thanks animation; state conveyed in text                                   | E       |
| 33  | Keyboard only + screen reader                                           | Focus trapped in pop-up, returns to opener; live-region announcements; axe ok | E       |
| 34  | Get Help panel while Donate flow pending                                | Get Help unaffected; only one dialog open at a time                           | E       |
| 35  | Header/footer Donate buttons, all 5 viewports                           | Open the same pop-up; no overflow                                             | E       |
| 36  | Phone/email never in URL, logs, order_tags, sessionStorage              | Log-capture assertion; request-URL assertion; storage assertion               | A, E    |
| 37  | Receipt link from step 3 (en/ta)                                        | `/receipt/:token` loads, `no-store`, `no-referrer` headers                    | E       |
| 38  | Full refund from the Cashfree dashboard                                 | REFUNDED; acknowledgement corrected, not deleted; pending emails cancelled    | A, M    |
| 39  | Partial refund                                                          | Stays PAID with refunded paise recorded                                       | A, M    |
| 40  | Refund failed                                                           | Back to PAID                                                                  | A       |
| 41  | Owner re-check from `/admin` on a PENDING donation                      | Audited; same reconcile; cannot choose a status                               | A, E    |
| 42  | Inline drain + daily cron drain at the same time                        | Each email sent once                                                          | A       |
| 43  | Sandbox keys on production / production keys on preview                 | Boot refused (env validation)                                                 | U       |
| 44  | CSP present on the deployed preview/production                          | `check-deployed-headers` passes                                               | script  |
| 45  | Razorpay button rollback build                                          | Old flow still works (existing `donate-checkout` tests)                       | U, E    |

---

## 6. Risks and open questions

### Top risks

1. **Cashfree activation may require 12A/80G (or FCRA)**. If the trust lacks them, Cashfree cannot go
   live; the whole plan stays in sandbox and the Razorpay button remains.
2. **Vercel Hobby is for personal, non-commercial use** (audit B15). A trust taking donations may be
   outside the fair-use terms; Vercel could require Pro (cost). Owner should confirm with Vercel's
   terms before relying on it.
3. **Shared Supabase project with the cafe**: blast radius (connection limits, CPU, a mistaken grant,
   backups/restores affect both), and `PUBLIC`-executable functions in the cafe's `public` schema.
   Mitigated by the role SQL and the isolation check; a separate free project for the trust is the
   stronger option if the owner reconsiders.
4. **Domain**: `theonetrust.in` is not attached to Vercel; Cashfree production and the email domain
   both depend on it.
5. **Unverified Cashfree details**: webhook signature concatenation, whether retries are re-signed
   (timestamp window), CSP origins, `payment_group` values, subscription popup support. Each is a
   [CONFIRM] gate in the PR that uses it.
6. **Serverless unknowns** until the 2a spike: catch-all routing, raw body, Argon2 binary tracing,
   Prisma through the transaction pooler, role `search_path` through Supavisor.
7. **Mandatory phone** may reduce completed donations and is new personal data sent to a processor —
   privacy policy update (en + ta) needed.
8. **Daily-only cron** on Hobby: acknowledgement emails delayed up to a day if the inline drain
   fails; acceptable but visible in `/admin` job status.
9. **Pricing changes**: the 0% offer ends 31 Mar 2027 (then 1.95% + GST); the UPI MDR note comes from
   a Cashfree blog, not the rate card.

### Open questions for the owner

1. Separate free Supabase project for Preview/staging (recommended) — yes/no?
2. Supabase project region (decides the Vercel function region).
3. Send donor name/email to Cashfree, or phone only (recommended: phone only)?
4. Admin pages to show at launch beyond the core set (bank transfer, help requests)?
5. Google Sheet: keep (minimised) or drop?
6. Sending address and reply-to for acknowledgements.
7. Optional 15-minute external pinger — wanted?
8. Revoke DELETE for the app role on append-only tables — yes/no?
9. Monthly giving fees acceptable for Phase 9?

---

## 7. Owner inputs per phase (no secrets in chat — values go into Vercel env or the Supabase SQL

editor by the owner)

| Phase  | Owner inputs                                                                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Approve the plan; check the live button on the 0.3 preview                                                                                                                                                |
| 1      | None                                                                                                                                                                                                      |
| 2a     | DB region; staging DB decision; Vercel env for Preview: `DATABASE_URL` (staging), `AUTH_SECRET_KEY`, `CORS_ORIGINS`, `PUBLIC_SITE_URL`, `DB_POOL_MAX`, `NODEJS_HELPERS`                                   |
| 2b     | Review and run `01-theonetrust-app-role.sql`; set the role password in the SQL editor; put the pooler `DATABASE_URL` into Vercel Production; run `02-verify-isolation.sql`, share the result (no secrets) |
| 2c, 2d | Approve additive migrations and run `migrate deploy` from a trusted machine; set `CRON_SECRET` (and `JOBS_SECRET` if a pinger is wanted)                                                                  |
| 3      | Run `owner:set-password` locally; enrol the authenticator; store recovery codes offline; choose optional admin pages                                                                                      |
| 4      | **Approve the irreversible enum migration**; create Cashfree sandbox keys; enter `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV=sandbox`, `PAYMENT_PROVIDER` in Preview env                |
| 5      | Approve en/ta copy (incl. phone hint) and the "phone required" change; name/email-to-Cashfree decision                                                                                                    |
| 6      | Email account (Resend), DNS records (SPF/DKIM/DMARC), `EMAIL_*`, `OWNER_NOTIFICATION_EMAIL`; Sheet decision and `GOOGLE_*` if kept; privacy-policy wording approval                                       |
| 7      | KYC documents (incl. 12A/80G per Cashfree), attach `theonetrust.in` to Vercel, whitelist domain + webhook in Cashfree, production keys into Vercel, ₹1 smoke + refund, go/no-go                           |
| 8      | Confirm 30 clean days                                                                                                                                                                                     |
| 9      | Accept subscription fees; Cashfree subscriptions activation                                                                                                                                               |

---

## 8. Effort and recommended PR order

| Order | PR                                                       | Phase | Effort | Depends on        |
| ----- | -------------------------------------------------------- | ----- | ------ | ----------------- |
| 1     | F-1 same-order failed→success + shared re-check (F-4)    | 0.1   | M      | —                 |
| 2     | F-3 stale RECEIVED webhook                               | 0.2   | S      | —                 |
| 3     | F-2 CSP in `vercel.json` + drift + deployed-header check | 0.3   | S/M    | —                 |
| 4     | F-7 idempotency race                                     | 0.4   | S      | —                 |
| 5     | Provider-agnostic boundary (Razorpay green)              | 1     | M/L    | 1                 |
| 6     | Serverless spike (preview only, findings doc)            | 2a    | S      | —                 |
| 7     | Function entry, client IP, redaction                     | 2a    | M      | 6                 |
| 8     | Supabase role/RLS scripts + launch-check DB items        | 2b    | S      | 7                 |
| 9     | Postgres rate-limit store                                | 2c    | M      | 7, 8              |
| 10    | Jobs route, cron, inline drain, `job_runs`               | 2d    | M      | 7, 8              |
| 11    | Admin bootstrap + page gating                            | 3     | S/M    | 8                 |
| 12    | Enum + defaults migrations (owner approval)              | 4a    | S      | 5                 |
| 13    | Cashfree adapter + env + scanners + launch check         | 4b    | M      | 5, 12             |
| 14    | Cashfree webhook route + route changes (phone required)  | 4c/4d | M      | 13, 2             |
| 15    | Web Cashfree panel + CSP origins + return handling       | 5     | L      | 14, 3             |
| 16    | Emails + sheet minimisation + policy text                | 6     | M      | 10                |
| 17    | Release checklist sandbox script; sandbox run            | 7a    | S      | 15, 16            |
| 18    | Go-live (configuration only, no code)                    | 7b    | —      | 17 + KYC + domain |
| 19    | Cleanup of Razorpay API code                             | 8     | M      | 30 days           |
| 20    | Monthly giving on Cashfree                               | 9     | L      | 19                |

Rough total to go-live (PRs 1–17): about 5–7 engineer-weeks, plus owner time for KYC, DNS and
reviews. Phase 0 PRs and the spike (6) can run in parallel.
