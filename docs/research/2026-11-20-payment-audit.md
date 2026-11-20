# Payment audit before the Razorpay → Cashfree switch (2026-11-20)

Status: research / read-only audit. Nothing in the code, database, Vercel, Supabase or GitHub was
changed. Line numbers refer to `main` at `b75d7a8`.

Scope: every place Razorpay is referenced or assumed; the donation state machine, idempotency,
amounts, receipts and the outbox; how hard each part is to move to Cashfree; admin/auth; what
breaks if the API runs as Vercel serverless functions; security/privacy findings; test coverage.

Cashfree facts used below were checked against Cashfree's own docs on 2026-11-20 (links at the
end). Anything not confirmed there is marked **[CONFIRM]**.

---

## 0. Summary

- The domain core is in good shape and mostly provider-agnostic: one transition service
  (`transitions.ts`), one reconcile path (`reconcile.ts`) shared by callback, status re-check,
  webhook and owner re-check, receipts issued in the same transaction as `PAID`, and an outbox
  that is written in that transaction and sent later. Amounts are integer paise end to end.
- The provider boundary (`PaymentProvider` in `apps/api/src/modules/donations/provider.ts`) is
  real but **shaped around Razorpay**: a browser-side checkout signature, `order_`/`pay_`/`qr_`
  ID regexes, hex HMAC webhooks with an event-ID header, Razorpay status words, and `'RAZORPAY'`
  literals in contracts, Prisma enums/defaults and the web client.
- Cashfree differs in ways that touch the core, not only the adapter: no checkout signature (the
  server must fetch the order/payments), webhooks signed with the PG secret over
  `timestamp + raw body`, Base64-encoded, and **no documented event ID** (dedupe key must be
  derived), amounts in decimal rupees, `customer_details.customer_phone` required on order
  creation, and orders that accept several payment attempts until one succeeds.
- **One existing correctness bug becomes much more likely with Cashfree**: a failed attempt
  followed by a successful attempt on the same order leaves the donation `FAILED` with money
  captured (§5, F-1).
- The API assumes an always-on Node process (timer-driven outbox worker, in-memory rate limits,
  local-disk document storage, `listen()`); it does not run on Vercel functions as-is (§4).
- The live Vercel site serves **no Content-Security-Policy**: the CSP is written to
  `dist/_headers`, which Vercel ignores (§5, F-2, verified with a live request).

---

## 1. Where Razorpay is referenced or assumed

### 1.1 API — payments core

| File:line                                                       | What is Razorpay-specific                                                                                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/donations/provider.ts:37-53`              | `PaymentProvider.name: 'RAZORPAY'`; `verifyCheckoutSignature(orderId, paymentId, signature)` (Razorpay Checkout handler contract); optional QR methods modelled on Razorpay QR Codes      |
| `provider.ts:72-81`                                             | `QR_ID = /^qr_…/`; `isRazorpayImageUrl` allows only `rzp.io` / `razorpay.com`                                                                                                             |
| `provider.ts:100-101`                                           | `PAYMENT_ID = /^pay_…/`, `ORDER_ID = /^order_…/`                                                                                                                                          |
| `provider.ts:103-132`                                           | `parseProviderPayment` parses the Razorpay Payment entity (`id`, `order_id`, `amount` in paise, `status`, `method`, `amount_refunded`)                                                    |
| `provider.ts:135-299`                                           | `razorpayProvider`: `https://api.razorpay.com`, Basic auth, `/v1/orders`, `/v1/payments/:id`, `/v1/orders/:id/payments`, `/v1/payments/qr_codes…`; checkout HMAC = hex(HMAC-SHA256(`order | payment`, key secret)) at `:158-170` |
| `apps/api/src/modules/donations/routes.ts:281-290`              | QR attempt stored with `provider: 'RAZORPAY'` and the QR ID in `providerOrderId`                                                                                                          |
| `routes.ts:296-304`                                             | `createOrder` with `receipt`/`notes` (Razorpay field names live in the adapter, but the route's comments and flow assume them)                                                            |
| `routes.ts:426-438`                                             | `response()` returns `checkout: { provider: 'RAZORPAY', keyId, orderId }`                                                                                                                 |
| `apps/api/src/db/repositories/donations.ts:283-285`             | `addPaymentAttempt` hard-codes `provider: 'RAZORPAY'`                                                                                                                                     |
| `apps/api/src/modules/payments/verify-routes.ts:17-22`          | `VerifyBody` requires `order_…`, `pay_…`, `signature`                                                                                                                                     |
| `verify-routes.ts:84-101`                                       | checkout-signature check, then `fetchPayment(paymentId)`                                                                                                                                  |
| `verify-routes.ts:122-139`                                      | status re-check: QR detection by `qr_` prefix, `fetchQrPayments`/`fetchOrderPayments`, picks `captured` → `authorized` → first                                                            |
| `apps/api/src/modules/payments/reconcile.ts:22-27`              | `STATUS_FOR` maps Razorpay payment statuses `created/authorized/captured/failed`                                                                                                          |
| `reconcile.ts:117-162`                                          | `applyRefund` relies on Razorpay's `amount_refunded` on the payment entity                                                                                                                |
| `apps/api/src/modules/payments/webhook-routes.ts:156-161`       | `verifyWebhookSignature`: hex HMAC-SHA256 of raw body with a separate webhook secret                                                                                                      |
| `webhook-routes.ts:165-173`                                     | `RazorpayEvent` envelope (`event`, `payload.payment.entity`, `payload.refund`, `payload.subscription`, `payload.qr_code`)                                                                 |
| `webhook-routes.ts:206-213`                                     | `virtual_account.credited` (Smart Collect)                                                                                                                                                |
| `webhook-routes.ts:216-241`                                     | `qr_code.credited/created/closed`                                                                                                                                                         |
| `webhook-routes.ts:243-247`                                     | `payment.authorized/captured/failed`, `order.paid`, `refund.created/processed/failed`                                                                                                     |
| `webhook-routes.ts:255-258`                                     | `invoice_id` → subscription payment                                                                                                                                                       |
| `webhook-routes.ts:267-278`                                     | QR fallback via `notes.donation_reference` and `providerOrderId startsWith 'qr_'`                                                                                                         |
| `webhook-routes.ts:302-316`                                     | route `POST /webhooks/razorpay`; headers `x-razorpay-signature`, `x-razorpay-event-id`                                                                                                    |
| `webhook-routes.ts:321-337`                                     | dedupe row keyed on `provider: 'RAZORPAY'` + event ID                                                                                                                                     |
| `apps/api/src/modules/payments/webhook-admin-routes.ts:177-180` | comments assume Razorpay retry semantics                                                                                                                                                  |
| `apps/api/src/modules/ledger/admin-routes.ts:256-297`           | owner "re-check with Razorpay" (`fetchPayment` / `fetchOrderPayments`)                                                                                                                    |
| `apps/api/src/modules/ledger/query.ts:73`                       | search by provider order/payment ID                                                                                                                                                       |
| `apps/api/src/modules/cms/settings-routes.ts:45-54`             | payment mode derived from `keyId.startsWith('rzp_live_')`                                                                                                                                 |

### 1.2 API — monthly giving (Razorpay Subscriptions)

| File:line                                              | What                                                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/subscriptions/provider.ts:9-155` | `razorpaySubscriptions`: `/v1/plans`, `/v1/subscriptions`, cancel, fetch; `sub_`/`plan_`/`pay_` regexes; signature = hex(HMAC(`payment | subscription`)) |
| `subscriptions/rules.ts:370-422` (file lines 7-58)     | `TOTAL_COUNT = 120` ("Razorpay's practical open-ended"); `PROVIDER_STATUS` maps Razorpay subscription statuses                         |
| `subscriptions/lifecycle.ts:193-204` (file 38-49)      | `SUBSCRIPTION_EVENTS` = Razorpay `subscription.*` names                                                                                |
| `subscriptions/lifecycle.ts` `recordCharge`            | synthetic `subpay_<paymentId>` order ID when a charge has no order                                                                     |
| `subscriptions/routes.ts:98-119`                       | one Razorpay plan per amount, `provider: 'RAZORPAY'` filter                                                                            |
| `subscriptions/routes.ts:121-133`                      | `checkout: { provider: 'RAZORPAY', keyId, subscriptionId }`                                                                            |
| `subscriptions/routes.ts:53-58`                        | verify body `sub_`, `pay_`, signature                                                                                                  |
| `packages/contracts/src/subscription.ts:6-7`           | `UPI_AUTOPAY_MAX_PAISE = 1_500_000` ("Razorpay's default mandate cap")                                                                 |

### 1.3 Config, wiring, CLI, scripts

| File:line                                                   | What                                                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/config/env.ts:76-91`                          | `RAZORPAY_KEY_ID` (regex `rzp_(test                                                                                                                       | live)_…`), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| `env.ts:165-180`                                            | `RAZORPAY_SUBSCRIPTIONS_ENABLED`, `RAZORPAY_QR_ENABLED`, QR expiry "Razorpay allows 2 minutes to 2 hours"                                                 |
| `env.ts:230-244`                                            | both-keys-or-neither; live key refused outside production (`rzp_live_`)                                                                                   |
| `apps/api/src/app.ts:81-88, 115, 127-131, 220-281, 366-371` | imports and wiring of `razorpayProvider`, `razorpaySubscriptions`, `razorpayWebhookRoutes`; log redaction of `x-razorpay-signature`; admin payment status |
| `apps/api/src/cli/launch-check.ts:17-39`                    | `razorpay_live`, `razorpay_webhook` checks                                                                                                                |
| `scripts/check-no-live-keys.mjs:3-15, 60`                   | scans for `rzp_live_` and `RAZORPAY_*_SECRET=` values only                                                                                                |
| `scripts/check-bundle-secrets.mjs:13-14, 25, 32`            | server-only names `RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`; `rzp_live_` pattern; `node_modules/razorpay`                                           |
| `.env.example:52-55, 73-74`                                 | Razorpay variables                                                                                                                                        |
| `.github/workflows/ci.yml`                                  | mentions Razorpay (test mode)                                                                                                                             |

### 1.4 Shared contracts (`packages/contracts`)

| File:line                               | What                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/donation.ts:58-71`                 | `DonationIntentResponse.checkout.provider: 'RAZORPAY'`, `keyId`, `orderId`                    |
| `src/donation.ts:79-92`                 | `DonationQrResponse` ("Razorpay QR Codes") — the shape itself is generic                      |
| `src/donation.ts:115-121`               | `PaymentVerifyRequest { orderId, paymentId, signature }` = Razorpay Checkout handler output   |
| `src/subscription.ts:48`                | `checkout: { provider: 'RAZORPAY'; keyId; subscriptionId }`                                   |
| `src/ledger.ts:15, 80-82, 145, 211-223` | provider order/payment IDs and status in admin DTOs (generic names, Razorpay comments)        |
| `src/money.ts`                          | provider-agnostic (integer paise, `toPaise`, `rupeesToPaise`, `formatInr`)                    |
| `src/statuses.ts`                       | provider-agnostic `DONATION_STATUSES`                                                         |
| `src/donation.ts:7`, `src/receipt.ts:7` | `FEE_COVER_METHODS`/`RECEIPT_METHODS` use Razorpay method words (`upi`, `card`, `netbanking`) |

### 1.5 Database (Prisma schema + 13 migrations)

| Where                                                     | Provider-specific element                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `schema.prisma:40-43`; migration `20261103063444_init:11` | Postgres enum `PaymentProvider ('RAZORPAY','BANK_TRANSFER')`                                              |
| `schema.prisma:292`; `init:100`                           | `payment_attempts.provider DEFAULT 'RAZORPAY'`                                                            |
| `schema.prisma:318`; `init:119`                           | `webhook_events.provider DEFAULT 'RAZORPAY'`                                                              |
| `schema.prisma:398`; `20261106090000_monthly_giving:13`   | `subscription_plans.provider DEFAULT 'RAZORPAY'`                                                          |
| `schema.prisma:293-294`                                   | `provider_order_id UNIQUE`, `provider_payment_id UNIQUE` (global, not per provider)                       |
| `schema.prisma:302-304`; `20261107120000_donation_qr`     | `qr_image_url`, `qr_expires_at` (+ CHECK both-or-neither); QR ID stored in `provider_order_id`            |
| `schema.prisma:333`                                       | `webhook_events UNIQUE (provider, provider_event_id)` — assumes the provider sends an event ID            |
| `schema.prisma:343-344, 405`                              | `provider_subscription_id UNIQUE`, `provider_plan_id`, plan unique `(provider, amount, period, interval)` |
| `schema.prisma:107-110`                                   | `DonationChannel` has only `CHECKOUT`/`BANK_TRANSFER` (QR intents are stored as `CHECKOUT`)               |
| `schema.prisma:112-124`                                   | exception kinds with Razorpay wording (`SUBSCRIPTION_HALTED` = Razorpay's "halted")                       |
| `20261104090000_receipts:38` and `receipts/issue.ts:17`   | `receipt_number_seq` called unqualified (needs the right `search_path` on the `theonetrust` schema)       |

Nothing stores card/UPI data. Column names are generic (`provider_*`), so the schema can hold
Cashfree data after an enum value is added and defaults are changed.

### 1.6 Web (`apps/web`)

| File:line                                                                                                      | What                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/RootLayout.tsx:19, 87-95`                                                                             | adapter choice: Payment Button (`VITE_DONATE_BUTTON_ID`) → Payment Page (`VITE_DONATE_PAGE_URL`) → full `DonatePanel`                                                                                                                        |
| `src/donate/razorpay-button.ts:1-128`                                                                          | live mode: injects `https://checkout.razorpay.com/v1/payment-button.js`, `pl_` button IDs, `data-prefill.amount.<field>`, listens for `close_modal` from `https://razorpay.com`, `regeneratorRuntime` CSP shim                               |
| `src/donate/DonateCheckoutPanel.tsx:23-36, 89-120, 285`                                                        | Payment Button pop-up flow                                                                                                                                                                                                                   |
| `src/donate/donate-page-link.ts:137-152`                                                                       | only `pages.razorpay.com` / `rzp.io` accepted                                                                                                                                                                                                |
| `src/donate/DonateLinkPanel.tsx`                                                                               | Payment Page link mode                                                                                                                                                                                                                       |
| `src/donate/donate-client.ts:100-121, 124-133, 249-305, 420-422`                                               | `checkout.js` loader, `new Razorpay({ key, order_id, handler })`, `razorpay_payment_id`/`razorpay_signature` → `/payments/verify`; mock uses `rzp_test_mock`/`order_MOCK…`                                                                   |
| `src/donate/monthly-client.ts:13, 43, 53, 121-151, 229-230`                                                    | subscription Checkout, `config.display.hide` per method                                                                                                                                                                                      |
| `src/donate/QrPay.tsx:59`                                                                                      | QR copy (image comes from our API, generic)                                                                                                                                                                                                  |
| `src/vite-env.d.ts:13-18`                                                                                      | `VITE_DONATE_PAGE_URL` (Razorpay page), `VITE_DONATE_BUTTON_ID` (`pl_…`), `VITE_DONATE_AMOUNT_FIELD`                                                                                                                                         |
| `scripts/security-headers.mjs:10-24, 40-63`                                                                    | CSP allow-list for `checkout.razorpay.com`, `cdn.razorpay.com`, `api.razorpay.com`, `razorpay.com`, `lumberjack.razorpay.com`, `*.razorpay.com`, Google Fonts for the button; `Permissions-Policy payment=(self "https://api.razorpay.com")` |
| `src/admin/ledger-strings.ts:16-18, 83, 126, 170, 183-185, 259-264, 274-277, 343, 384, 427, 440-442, 514-519`  | bilingual admin strings naming Razorpay                                                                                                                                                                                                      |
| `src/admin/{DonationDetailPage,ExceptionsPage,WebhooksPage,MonthlyGivingPage}.tsx`                             | comments + provider order/payment ID display                                                                                                                                                                                                 |
| `src/manage/ManagePage.tsx:22`                                                                                 | "Cancelling happens at Razorpay first"                                                                                                                                                                                                       |
| `src/content/policies.ts:4, 89`                                                                                | public privacy/terms text names Razorpay (Tamil + English)                                                                                                                                                                                   |
| `src/content/{landing,proof}.ts`, `src/routes/home/home-content.ts`, `src/seo/seo.ts`, `src/app/routes.tsx:32` | public copy / policy routes mention Razorpay                                                                                                                                                                                                 |
| `vercel.json`                                                                                                  | static web build only; rewrites; **no CSP** (see F-2)                                                                                                                                                                                        |

### 1.7 Tests, mocks and docs

- Unit/API tests with Razorpay fixtures: `donations/provider.test.ts`, `payments/webhook.test.ts`,
  `subscriptions/subscriptions.test.ts`, `config/env.test.ts`, `app.test.ts`, `cli/launch-check.test.ts`.
- DB tests with `order_`/`pay_`/`qr_`/`sub_` IDs and Razorpay HMACs: `payments/{payment-suite,
verify,webhook,qr,bank,webhook-admin}.db.test.ts`, `donations/donations.db.test.ts`,
  `receipts/receipts.db.test.ts`, `subscriptions/{lifecycle,subscriptions}.db.test.ts`,
  `ledger/ledger.db.test.ts`, `notifications/notifications.db.test.ts`.
- Web: `donate/{razorpay-button,donate-checkout,donate-link,donate,monthly,bank,qr,tax}.test.ts(x)`,
  `admin/cms.test.tsx`, `scripts/security-headers.test.mjs`; e2e `donate.spec.ts`,
  `admin.spec.ts`, `receipt.spec.ts` (mock adapter, mock Checkout).
- Scripts: `scripts/check-no-live-keys.test.mjs`, `scripts/check-bundle-secrets.test.mjs`,
  `.claude/hooks/lib.mjs` (+ test).
- Docs naming Razorpay: `PROJECT_SPEC.md`, `README.md`, `docs/website-plan.md`,
  `docs/deployment.md`, `docs/release-checklist.md`, `docs/threat-model.md`,
  `docs/testing-strategy.md`, `docs/research/2026-10-payment-limits.md`,
  `docs/security/review-2026-11-05.md`, ADRs `0002` and `0005`, `docs/design/*`,
  `docs/ux-design-brief.md`, `docs/tamil-copy-review.md`, `.claude/agents/*`,
  `.claude/skills/release-gate/SKILL.md`, and `CLAUDE.md` itself.

---

## 2. Donation flow, state machine and what is provider-agnostic

### 2.1 Statuses and transitions

`apps/api/src/modules/payments/transitions.ts:313-355` (file lines 11-55) is the only writer of
`donation_intents.status`:

```
CREATED        → PENDING | AUTHORIZED | PAID | FAILED | MANUAL_REVIEW
PENDING        → AUTHORIZED | PAID | FAILED | MANUAL_REVIEW
AUTHORIZED     → PAID | FAILED | MANUAL_REVIEW
MANUAL_REVIEW  → PAID | FAILED | PENDING
PAID           → REFUND_PENDING
REFUND_PENDING → REFUNDED | PAID
FAILED, REFUNDED: terminal
```

- `PAID` is accepted only from `gateway_verified` or `owner_bank_evidence` (`:335-337`).
- Conditional `updateMany … where status = <read status>` + `count !== 1 → CONFLICT` prevents lost
  updates; `paid_at` stamped once; append-only `donation_status_events` (trigger in
  `20261105090000_admin_ledger:42-48`).

### 2.2 How a payment becomes PAID

1. `POST /donation-intents` (`donations/routes.ts:142-322`): server validates, computes
   `amountPaise = gift + fee` (`db/repositories/donations.ts:266-277`, DB CHECK in
   `20261103120000_donation_orders:17`), creates the intent, then the provider order with the
   server amount, and stores a `payment_attempt` with the order ID and amount.
2. Browser Checkout → `POST /payments/verify` (`verify-routes.ts:73-108`): signature check, then
   `fetchPayment` **from Razorpay with the secret**; the browser's claim is never trusted.
3. Webhook (`webhook-routes.ts:302-371`) and status re-check (`verify-routes.ts:110-146`) and
   owner re-check (`ledger/admin-routes.ts:259-297`) all call `applyProviderPayment`.
4. `applyProviderPayment` (`reconcile.ts:29-103`) compares order ID, amount (paise) and currency
   with **our** attempt; mismatch or a second payment ID → `MANUAL_REVIEW` + `payment_exceptions`;
   `captured` → `PAID` with source `gateway_verified`; then in the **same transaction**:
   receipt (`issueReceiptIfEligible`), outbox rows (`enqueueDonationPaid`), tax tracking.
5. Bank transfer: donor claim only moves to `PENDING` (`donations/routes.ts:363-380`); only the
   owner with bank evidence can mark `PAID` (`payments/bank-admin-routes.ts`).

Verdict: the "only server-verified becomes PAID" rule is enforced in one place and is
provider-agnostic. Good.

### 2.3 Idempotency

- Donation creation: optional `Idempotency-Key` header, unique column; replay returns the same
  order (`donations/routes.ts:193-220`). Race: two concurrent first requests with the same key →
  second insert raises P2002 → 500 (not caught; low impact, see F-7).
- Webhooks: `webhook_events UNIQUE (provider, provider_event_id)`; row written before processing;
  `FAILED` rows are re-processed on retry (`webhook-routes.ts:320-370`). A row stuck in `RECEIVED`
  is treated as a duplicate (F-3).
- Receipts: `receipts.payment_attempt_id UNIQUE` → one original per payment (`receipts/issue.ts:35-36`).
- Outbox: `dedupe_key UNIQUE`, `createMany … skipDuplicates` (`notifications/outbox.ts`).
- Subscription charges: `provider_payment_id UNIQUE` + P2002 handling (`subscriptions/lifecycle.ts` `recordCharge`).

### 2.4 Amounts

Integer paise everywhere: Zod `int()` on input, `toPaise` (`packages/contracts/src/money.ts:17-22`),
`Int` columns + CHECKs, Razorpay sends paise, comparison is exact (`reconcile.ts:43-46`).
Cashfree sends and expects **decimal rupees (≤ 2 dp)** for `order_amount`; the adapter must convert
`paise → "123.45"` with integer maths and parse responses with `Math.round(x * 100)` plus an
exact-equality check, so floating rupees never enter the domain.

### 2.5 Receipts and notifications

- Acknowledgement ("Donation acknowledgement", never Form 114): issued in the PAID transaction if
  the donor asked and the amount ≥ `receipt_min_paise` (`receipts/issue.ts:28-52`); number from
  `receipt_number_seq`; share token = HMAC(key, salt), only the hash stored; refunds void/correct,
  never delete (`:69-103`, delete-blocking trigger in migration `20261104090000_receipts:41-47`).
- Outbox: owner email, donor thank-you (if email), Google Sheet row; worker claims rows with a
  5-minute lease, backoff 1m/5m/30m/2h/12h, 6 attempts, cancel if refunded before send
  (`notifications/worker.ts:29-32, 168-171, 236-310`). Started only by `server.ts:18-34`.
- Provider coupling: only `paymentReference = providerPaymentId` and the method label mapping
  (`worker.ts:82-98`; `RECEIPT_METHODS`).

### 2.6 Swap difficulty to Cashfree

| Part                                            | Rating          | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transition service (`transitions.ts`)           | **Low**         | Fully provider-agnostic. Only change: decide whether `FAILED` stays terminal for orders that can still be paid (F-1).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Reconcile (`reconcile.ts`)                      | **Medium**      | Logic works on `ProviderPayment`, but `STATUS_FOR` uses Razorpay words, refunds rely on `amount_refunded` on the payment, and "second payment ID = duplicate" is wrong for Cashfree's multi-attempt orders. Map Cashfree `payment_status` (`SUCCESS`, `FAILED`, `PENDING`, `USER_DROPPED`, `CANCELLED`, `VOID`, `NOT_ATTEMPTED`, `FLAGGED` **[CONFIRM list]**) in the adapter; refunds need a separate refund fetch.                                                                                                                                         |
| Provider interface + adapter (`provider.ts`)    | **Medium**      | Interface must lose `verifyCheckoutSignature` (Cashfree returns no signature to the browser) and gain `paymentSessionId`; new `cashfreeProvider` with `x-client-id`/`x-client-secret`/`x-api-version`, `POST /pg/orders`, `GET /pg/orders/{id}`, `GET /pg/orders/{id}/payments`, refunds. Our `publicReference` (`TOT-D-…`, 18 chars) fits Cashfree's `order_id` rules (3–45 chars, alnum/`_`/`-`). Optional `x-idempotency-key` maps to our idempotency key.                                                                                                |
| Order creation route (`donations/routes.ts`)    | **Medium**      | Cashfree requires `customer_details.customer_id` and `customer_phone`; today phone is optional and nothing personal goes to the provider (`notes` are non-personal). Needs a product/privacy decision (F-8).                                                                                                                                                                                                                                                                                                                                                 |
| Verify route (`verify-routes.ts`)               | **Medium**      | Body becomes `{ publicReference }` (or `{ publicReference, orderId }`); verification = server fetch of order + payments; no signature step. The status re-check already works this way and can be reused.                                                                                                                                                                                                                                                                                                                                                    |
| Webhook route (`webhook-routes.ts`)             | **High**        | New signature scheme (Base64 HMAC-SHA256 of `timestamp + raw body` with the PG secret; separator ambiguity in Cashfree's docs, test with their verifier), timestamp freshness window to define, **no event ID** → dedupe on a derived key (e.g. SHA-256 of raw body, or `type + cf_payment_id + payment_status`), new payload shape (`data.order`, `data.payment`, `type`), new event names (`PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK`, refund webhooks **[CONFIRM names/versions]**), `x-webhook-version` header. |
| QR (one-time UPI QR)                            | **High**        | Razorpay QR Codes API has no 1:1 Cashfree equivalent in our adapter; Cashfree's route is an order + UPI "qrcode" pay channel **[CONFIRM]**. Image is not hot-linked today (served by our API) — keep that. Consider dropping QR in v1 and letting Cashfree's checkout show UPI QR.                                                                                                                                                                                                                                                                           |
| Monthly giving (Subscriptions / UPI AutoPay)    | **High**        | Different API (plans, subscriptions, mandate auth), statuses, events and signatures. Feature is off (`RAZORPAY_SUBSCRIPTIONS_ENABLED=false`). Recommend keeping it off and porting later.                                                                                                                                                                                                                                                                                                                                                                    |
| Receipts / acknowledgements                     | **Low**         | Keyed on `payment_attempt_id`; provider-agnostic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Outbox, email, Google Sheet                     | **Low**         | Only the payment reference and method label mapping (`upi`, `card`, `netbanking` vs Cashfree `payment_group` values such as `upi`, `credit_card`, `debit_card`, `net_banking`, `wallet` **[CONFIRM]**).                                                                                                                                                                                                                                                                                                                                                      |
| Bank transfer, owner evidence                   | **Low**         | Untouched; enum value `BANK_TRANSFER` stays.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Prisma schema / migrations                      | **Medium**      | New migration: `ALTER TYPE "PaymentProvider" ADD VALUE 'CASHFREE'` (irreversible, needs owner approval), change three column defaults, maybe a `QR` channel. `provider_order_id`/`provider_payment_id` are globally unique — fine if Cashfree IDs are stored as strings (`cf_payment_id` is numeric; store as text). `webhook_events.provider_event_id` becomes a derived key.                                                                                                                                                                               |
| Contracts                                       | **Low–Medium**  | Replace `'RAZORPAY'` literals with a `PaymentProviderName` union; `checkout: { provider: 'CASHFREE', paymentSessionId, mode: 'sandbox'                                                                                                                                                                                                                                                                                                                                                                                                                       | 'production', orderId }`; `PaymentVerifyRequest` shrinks. |
| Env / config / launch check / secret scanners   | **Low**         | `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV` (`sandbox`/`production`), `CASHFREE_API_VERSION`; webhooks use the same PG secret per Cashfree's docs (no separate webhook secret). Scanners need Cashfree secret patterns **[CONFIRM key prefixes]**.                                                                                                                                                                                                                                                                                        |
| Web — full `DonatePanel`                        | **Medium**      | Replace `checkout.js` with Cashfree JS SDK v3 (`checkout({ paymentSessionId, redirectTarget: '_modal' })` **[CONFIRM]**), then call verify. CSP origins change.                                                                                                                                                                                                                                                                                                                                                                                              |
| Web — no-code live mode (Payment Button / Page) | **Low–Medium**  | Replace with a Cashfree no-code Payment Form/Link (`donate-page-link.ts` host allow-list, `razorpay-button.ts` close-message origin).                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Admin UI strings, policy pages                  | **Low**         | Bilingual string edits ("Razorpay" → provider-neutral or "Cashfree"), with Tamil/English parity.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tests                                           | **Medium–High** | Many fixtures hard-code Razorpay IDs/HMACs; the matrix itself (success, cancel, failure, duplicate, out-of-order, bad signature, mismatch, refresh/back) is reusable.                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 3. Admin and authentication

- **Owner account creation**: `pnpm --filter @theonetrust/api owner:set-password`
  (`apps/api/src/cli/set-owner-password.ts`): interactive, hidden password input, needs
  `DATABASE_URL`. `setOwnerPassword` (`cli/owner-account.ts:318-354` / file 32-69) upserts an
  `OWNER` row, Argon2id hash (`auth/passwords.ts`, m=19 MiB, t=2, p=1), clears TOTP, unlocks,
  revokes all sessions, deletes recovery codes and writes an audit row. No self-signup; no admin
  user-management API. The four writes are not in one transaction (low risk: re-run fixes it).
  For the Supabase `theonetrust` schema this must be run from a trusted machine with the
  `theonetrust_app` password once it exists.
- **Sign-in**: password → short "pending" session (10 min) → TOTP setup (first time) or TOTP
  verify → full session (`auth/service.ts`). New token at each privilege step (no fixation).
  Lockout after 5 failures for 15 min (env). TOTP replay blocked via `totp_last_step`; TOTP
  secret AES-256-GCM encrypted with a key derived from `AUTH_SECRET_KEY`; 10 hashed recovery codes.
- **Sessions**: random 43-char token in `__Host-tot_admin` (prod), `HttpOnly; Secure;
SameSite=Strict; Path=/`; only SHA-256 stored; idle 30 min, absolute 12 h
  (`auth/session-cookie.ts`, `auth/service.ts:117-129`).
- **CSRF**: Origin allow-list + `x-csrf-token` = HMAC(csrf key, session token) on every unsafe
  method (`auth/http.ts:39-54`). Sign-in routes limited to 10 per 15 min per IP.
- **Admin guard** (`admin/guard.ts`): 401 before anything (even unknown paths), MFA required,
  CSRF checked; every admin mutation must write an audit row or the response becomes 500
  (`admin/routes.ts:111-118`). Audit log is append-only by trigger.
- **What the dashboard shows from payments**: overview (totals, stale pending > 30 min), ledger
  list + filters + masked CSV export (audited; names/emails/phones masked,
  `ledger/admin-routes.ts:97-160`), donation detail (attempts with provider order ID, payment ID,
  provider status, method, captured/refunded paise, signature-verified time, status history,
  webhook history), "re-check with Razorpay" (audited, cannot choose a status), exception queue
  (mismatch, duplicate, unmatched credit, subscription problems) with resolve-with-reason,
  receipts list/resend, webhook delivery view (counts, stale `RECEIVED`/`FAILED`), monthly giving,
  bank-transfer matching, notification outbox with retry, settings page with payment mode
  (`rzp_live_` prefix → "live") and secret-set flags (never values).

---

## 4. Runtime / hosting assumptions vs Vercel serverless (Hobby)

`docs/deployment.md:12` explicitly targets an **always-on Node host** ("no cold starts: payment
verification must answer at once", persistent volume for documents). `vercel.json` builds only the
web app. Blockers if the API is moved into Vercel functions:

| #   | Blocker (evidence)                                                                                                                                                          | Effect on Vercel                                                                                                                                       | Suggested workaround                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Long-running server: `server.ts:48` `app.listen`, signal handlers `:40-46`                                                                                                  | No listener in functions                                                                                                                               | Add a function entry that builds the app once per instance and forwards requests (`await app.ready(); app.server.emit('request', req, res)`), or Vercel's Fastify support **[CONFIRM current Vercel docs]**. Keep `buildApp` unchanged — it is already listen-free.                                                                                                                                                                                       |
| B2  | Outbox worker on `setInterval` (`notifications/schedule.ts:10-21`, started in `server.ts:18-34`, default every 30 s)                                                        | Never runs; emails and sheet rows stay `PENDING` forever                                                                                               | (a) after a request commits `PAID`, run one bounded `processDueNotifications` pass in the background (`waitUntil`) — the lease/claim logic already makes this safe; (b) Vercel cron once a day as a safety net (Hobby limit); (c) a free external scheduler (GitHub Actions `schedule`, or Supabase `pg_cron` + `pg_net`) calling a protected `POST /internal/outbox/run` every 5–15 min with a shared secret; (d) the dashboard's existing retry button. |
| B3  | Backoff up to 12 h (`worker.ts:31`)                                                                                                                                         | With only daily cron, retries are coarse                                                                                                               | Acceptable with (a)+(c); document that a failing provider may delay emails.                                                                                                                                                                                                                                                                                                                                                                               |
| B4  | In-memory rate limits (`app.ts:191-195`; per-route limits on donations, verify, status, receipts, help, sign-in)                                                            | Each instance has its own counter and resets on cold start: brute-force and spam limits are weak                                                       | Postgres-backed counter table (fixed window) or a hosted Redis/KV store via `@fastify/rate-limit` `redis` option; add Vercel Firewall rate-limit rules where available on the plan. Sign-in lockout is DB-backed and still works.                                                                                                                                                                                                                         |
| B5  | `trustProxy` defaults to `loopback, linklocal, uniquelocal` (`env.ts:41-44`, `app.ts:168`)                                                                                  | Client IP may resolve to Vercel's internal address → all users share one rate-limit bucket, or spoofable XFF                                           | Use the platform's client-IP header as Vercel documents it (`x-real-ip` / `x-forwarded-for` set by the edge **[CONFIRM]**) through a custom `keyGenerator`; never trust a raw client-supplied XFF.                                                                                                                                                                                                                                                        |
| B6  | Local-disk document storage (`cms/storage.ts:16-24`, `DOCUMENT_STORAGE_DIR`)                                                                                                | Function filesystem is ephemeral/read-only except `/tmp`                                                                                               | Implement `DocumentStore` on a private object store (Supabase Storage via S3 API or Vercel Blob private), still served only through the API; or leave uploads off at launch.                                                                                                                                                                                                                                                                              |
| B7  | DB client per process (`db/client.ts:305-307`, `PrismaPg` with a `pg` pool)                                                                                                 | Many cold instances × pool size can exhaust Postgres connections                                                                                       | Runtime `DATABASE_URL` = Supabase **transaction pooler** (port 6543) with a small pool (`max: 1–3`, short idle timeout); migrations keep the direct/session URL (`prisma.config.ts` → `DIRECT_URL`). Verify Prisma 7 + `adapter-pg` interactive transactions through the pooler with a DB test run.                                                                                                                                                       |
| B8  | Tables live in schema `theonetrust`, but the schema/migrations and `nextval('receipt_number_seq')` are unqualified, and `PrismaPg` is created with only a connection string | Queries hit `public` (or fail) unless `search_path` is right                                                                                           | `ALTER ROLE theonetrust_app SET search_path = theonetrust` (works through the pooler because it is a role default), or pass the schema option to the adapter **[CONFIRM Prisma 7 adapter-pg option]**. Test `nextval` explicitly.                                                                                                                                                                                                                         |
| B9  | RLS "deny-all" on the `theonetrust` tables, app role `theonetrust_app`                                                                                                      | If the role neither owns the tables nor has `BYPASSRLS`, every query returns nothing / fails                                                           | Give `theonetrust_app` ownership or `BYPASSRLS`, or add explicit allow policies for that role only; keep deny-all for `anon`/`authenticated`. Verify with a read/write smoke test before launch.                                                                                                                                                                                                                                                          |
| B10 | Raw-body webhook verification (`http/raw-body.ts:393-401` via Fastify content parser)                                                                                       | Works only if the function hands Fastify the untouched request stream                                                                                  | Use the `server.emit('request')` style entry (Node `IncomingMessage` stream) and add a test that a re-serialised body fails verification.                                                                                                                                                                                                                                                                                                                 |
| B11 | Cold starts (Prisma client init, Argon2 native module `@node-rs/argon2`)                                                                                                    | Slower first verify/sign-in                                                                                                                            | Acceptable: verify is idempotent and the donor UI already polls `/donations/status`; webhooks retry. Make sure the native Argon2 binary for the function's Linux target is bundled (build currently marks it `--external`, `apps/api/package.json` build script).                                                                                                                                                                                         |
| B12 | Function time limit (60 s stated for this plan)                                                                                                                             | Each provider call has a 10 s timeout; a webhook does a few queries + one transaction                                                                  | Fits. But a killed invocation between "event recorded" and "processed" leaves the row `RECEIVED`, which is then acknowledged as a duplicate forever (F-3) — fix before going serverless.                                                                                                                                                                                                                                                                  |
| B13 | Cookies `__Host-…; SameSite=Strict`                                                                                                                                         | Work if the API is on the same site (`theonetrust.in/api/*` or `api.theonetrust.in`); **not** on `*.vercel.app` previews talking to a different domain | Serve the API from the same Vercel project under `/api/*` (simplest: same origin, no CORS), or a same-site subdomain.                                                                                                                                                                                                                                                                                                                                     |
| B14 | One Vercel project builds only the web (`vercel.json`)                                                                                                                      | No function is built                                                                                                                                   | Add an `api/` function entry (or a second Vercel project for `apps/api`) + rewrite `/api/v1/*`.                                                                                                                                                                                                                                                                                                                                                           |
| B15 | Vercel Hobby terms                                                                                                                                                          | Hobby is meant for personal, non-commercial use; a trust taking donations may not qualify                                                              | Check Vercel's fair-use terms with the trust before relying on Hobby in production.                                                                                                                                                                                                                                                                                                                                                                       |
| B16 | CLI tasks (`owner:set-password`, `db:migrate:deploy`, `launch:check`)                                                                                                       | Cannot run in functions                                                                                                                                | Run from a trusted machine with `DIRECT_URL`; never expose as HTTP endpoints.                                                                                                                                                                                                                                                                                                                                                                             |

---

## 5. Security, privacy and correctness findings

Severity is for the trust's donation platform; each has evidence and a fix.

**F-1 (High, correctness/money) — failed attempt then success on the same order leaves the
donation FAILED while money is captured.**
`reconcile.ts:47-62` treats any second payment ID on an attempt as `DUPLICATE_PAYMENT`, and
`reconcile.ts:65-74` stores the _first_ payment ID it sees even if that payment failed. A
`payment.failed` webhook moves the donation to `FAILED`, which is terminal
(`transitions.ts:320`). If the donor then retries inside the same checkout (same order) and pays,
the captured payment is flagged duplicate, `canTransition(FAILED, MANUAL_REVIEW)` is false, and the
donation stays `FAILED` (the donor sees "failed"; only an open exception reveals the money). The
status and owner re-checks fetch only the stored (failed) payment ID
(`verify-routes.ts:128-129`, `ledger/admin-routes.ts:272-274`), so they cannot self-heal. The
test suite only covers "retry = new order" (`payment-suite.db.test.ts:230-239`). Razorpay
Checkout already allows in-modal retries on one order; Cashfree orders explicitly stay `ACTIVE`
until one transaction succeeds, so this path becomes common.
Fix: record `providerPaymentId` only for the payment that settles the order (or keep a
`provider_payments` child table); do not mark the donation `FAILED` while the order can still be
paid (for Cashfree, drive status from `order_status` = `PAID`/`EXPIRED`/`TERMINATED`); allow
`FAILED → PAID` for `gateway_verified` on the same order, or re-check by order instead of payment
ID. Add tests: failed→success same order (callback, webhook, both orders of arrival).

**F-2 (Medium–High, security) — no CSP on the live site.**
`apps/web/scripts/security-headers.mjs:1-5` writes the CSP and Permissions-Policy to
`dist/_headers` (Cloudflare/Netlify format). Vercel does not read `_headers`; `vercel.json` sets
only `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` (and `/admin` noindex). A live
`HEAD https://theonetrust-v1.vercel.app` on 2026-11-20 returned no `content-security-policy` and no
`permissions-policy`. `/receipt/*` and `/manage/*` also miss the `no-store` / `no-referrer`
overrides at the edge. `docs/deployment.md:11` already says to copy them into `vercel.json`.
Fix: generate the headers into `vercel.json` (or a build step that writes Vercel's
`headers` config) and add an e2e/CI check against the deployed preview. When switching provider,
replace the Razorpay origins with Cashfree's SDK/API/frame origins (sandbox and production).

**F-3 (Medium, payments) — a webhook stuck in `RECEIVED` is acknowledged as a duplicate forever.**
`webhook-routes.ts:321-326`: `if (row && row.processingStatus !== 'FAILED') return 200 duplicate`.
If the process dies after `create` (`:329-337`) and before the outcome update (`:348-357`) — likely
on serverless timeouts or cold-start kills — every retry is acknowledged and never applied. The
admin view flags it as stale (`webhook-admin-routes.ts:189-193`), but nothing re-applies it.
Fix: re-process `RECEIVED` rows older than a short lease, or record + process + mark in one
transaction. Mitigated today by the donor status re-check for one-time gifts, not for refunds or
subscription events.

**F-4 (Medium, ops) — owner re-check is broken for QR and monthly-charge attempts.**
`ledger/admin-routes.ts:272-274` always calls `fetchOrderPayments(attempt.providerOrderId)`; for a
QR attempt that ID is `qr_…`, for a subscription charge it may be `subpay_…`; the Razorpay adapter
rejects both (`provider.ts:175-176`) → outcome `provider_rejected`. The donor status route handles
QR correctly (`verify-routes.ts:124-134`). Fix: share one "re-check" helper between both routes.

**F-5 (Medium, privacy) — Google Sheet receives full donor PII.**
`notifications/worker.ts:139-151` writes name, email and phone (and payment reference) to the
trust's Google Sheet. This was requested by the client, but it moves personal data outside the
system; access to the sheet must be limited and it should be named in the privacy policy (both
languages). Sheet append is not idempotent: a crash after `appendRow` and before marking `SENT`
(`worker.ts:271-281`) re-sends after the 5-min lease → duplicate rows. Fix: include the donation
reference as a key and de-duplicate, or accept and document.

**F-6 (Medium, migration) — webhook secret model changes.**
Cashfree signs webhooks with the PG client secret (no separate webhook secret), Base64, over
`timestamp + raw body`; it documents no event ID and no replay window, and recommends IP
allowlisting (not enforceable on Vercel Hobby without trusting a forwarded IP). Fix: verify with
`timingSafeEqual` on equal-length Base64 buffers, reject timestamps outside a window (e.g. 5 min),
dedupe on a derived key, keep the raw-body parser, add `x-webhook-signature` to log redaction
(`app.ts:112-118`), and treat the client secret as the single most sensitive value (rotation
changes both API auth and webhook verification).

**F-7 (Low) — idempotency race on donation creation.** Two concurrent first requests with the
same `Idempotency-Key` → the second hits the unique index and returns 500
(`donations/routes.ts:194-236`, no P2002 handling, unlike subscriptions/webhooks). Same pattern in
`subscriptions/routes.ts:161-209`, where the Razorpay subscription is created before the DB row,
so a failed insert leaves an orphan subscription at the provider. Fix: catch P2002 and return the
winner.

**F-8 (Medium, privacy/product) — Cashfree needs a customer phone.** Cashfree's Create Order
requires `customer_details.customer_id` and `customer_phone`. Today phone is optional (email-only
donors are allowed, `donations/routes.ts:154-157`) and only non-personal notes go to the provider
(`routes.ts:300-303`, `subscriptions/routes.ts:179-180`). Decide with the trust: require phone, or
**[CONFIRM]** whether Cashfree accepts a placeholder; never use a fake real-looking number.
Use the public reference (not the UUID or email) as `customer_id`.

**F-9 (Low) — QR intents are stored as channel `CHECKOUT`** (`donations/routes.ts:235`); reports
cannot tell QR from Checkout except by the `qr_` prefix. Add a `QR` channel if QR is kept.

**F-10 (Low) — settings "live/test" detection is prefix-based on Razorpay keys**
(`cms/settings-routes.ts:45-50`) and the launch check likewise (`cli/launch-check.ts:32-39`).
With Cashfree, use an explicit `CASHFREE_ENV`.

**Positive controls worth keeping** (verified): secrets only in API env with fail-fast validation
that never prints values (`env.ts:285-292`); live keys refused outside production (`env.ts:238`);
bundle and repo secret scanners; log redaction of PII keys, cookies and signature header
(`app.ts:98-118`) and path-only request logging (`app.ts:138-144`); generic public errors
(`app.ts:201-208`); raw-body HMAC with constant-time compare; amount/currency/order cross-check;
no PII in Razorpay notes; receipt/manage tokens are HMAC-derived, only hashes stored, `no-store`
and `no-referrer` on the API; QR image proxied from an allow-listed host with size and type
limits (`provider.ts:237-257`); masked CSV export; audited admin mutations.

**Current live mode note.** The live site uses the no-code Payment Button: nothing on our side
verifies payments, the `#donate-thanks` screen never claims "paid"
(`razorpay-button.ts:19-24`), and Razorpay's dashboard/email is the record. That is consistent
with the rules; the same pattern applies to a Cashfree no-code form during the transition.

---

## 6. Test coverage map (payments)

Counts are `it(`/`test(` occurrences per file.

| Layer                                             | Files (tests)                                                                                                                                                                                                                                                                                                                                                                                                                               | Covers                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest, no DB)                              | `donations/provider.test.ts` (12), `payments/transitions.test.ts` (4), `payments/webhook.test.ts` (3), `donations/fees.test.ts` (9), `receipts/receipts.test.ts` (6), `notifications/notifications.test.ts` (15), `notifications/sheet.test.ts` (6), `subscriptions/subscriptions.test.ts` (10), `config/env.test.ts` (21), `app.test.ts` (8), `cli/launch-check.test.ts`                                                                   | adapter parsing/validation, HMACs, transition table, fee maths, numbering, templates, env rules                                                                                                                                                                                                                                                                                                                        |
| API + DB (`app.inject`, real Postgres)            | `payments/payment-suite.db.test.ts` (21), `verify.db.test.ts` (13), `webhook.db.test.ts` (16), `qr.db.test.ts` (10), `bank.db.test.ts` (11), `webhook-admin.db.test.ts` (4), `donations/donations.db.test.ts` (15), `receipts/receipts.db.test.ts` (18), `notifications/notifications.db.test.ts` (20), `subscriptions/lifecycle.db.test.ts` (13), `subscriptions.db.test.ts` (17), `ledger/ledger.db.test.ts` (12), `db/schema.db.test.ts` | success; cancel; failure; forged success after failure; callback-then-webhook and webhook-then-callback; status re-check; duplicate (×3) / stale / out-of-order webhooks; amount, currency and foreign-order mismatches; bad signatures; same Idempotency-Key; refresh/back replay; ₹1; refunds full/partial/failed; Smart Collect credit; QR paths; bank evidence; subscriptions incl. cancel-from-UPI-app and halted |
| Web unit (Vitest + RTL)                           | `donate/*.test.ts(x)`, `admin/cms.test.tsx`, `scripts/security-headers.test.mjs`                                                                                                                                                                                                                                                                                                                                                            | adapters, Payment Button/Page helpers, mock flows, CSP string                                                                                                                                                                                                                                                                                                                                                          |
| E2E (Playwright, mock adapter, auto bug detector) | `e2e/donate.spec.ts` (15), `receipt.spec.ts` (5), `admin.spec.ts` (10)                                                                                                                                                                                                                                                                                                                                                                      | success only after verification (ta/en), cancel, failure, UPI limit, pending, refresh, back, QR, bank transfer, monthly + manage/cancel, acknowledgement pages                                                                                                                                                                                                                                                         |
| Coverage gates                                    | `apps/api/vitest.config.ts:58`, `vitest.db.config.ts:120`                                                                                                                                                                                                                                                                                                                                                                                   | 90/90/85/90 (lines/functions/branches/statements) for both suites                                                                                                                                                                                                                                                                                                                                                      |

**Gaps** (add before or with the Cashfree switch):

1. Failed → successful payment on the **same order** (callback-first and webhook-first) — F-1.
2. Webhook row left `RECEIVED` (crash between record and process) is re-processed — F-3.
3. Owner re-check for QR and subscription-charge attempts — F-4.
4. Concurrent same-`Idempotency-Key` creation (expect 200 with the same order, not 500) — F-7.
5. Raw-body integrity under the deployment entry point (re-serialised JSON must fail signature).
6. Webhook timestamp outside the window / replayed with a new timestamp (Cashfree).
7. Decimal-rupee conversion edge cases (₹1.00, ₹0.01 fee, large amounts) and a float that does not
   round-trip.
8. Outbox draining without the timer (inline/cron entry) and sheet duplicate on retry.
9. Deployed-headers check (CSP actually present on the Vercel response) — F-2.
10. No real-browser test against the provider sandbox; the e2e suite runs only the mock adapter.
    Plan one manual sandbox run per release (documented in `docs/release-checklist.md`).

---

## 7. Suggested order of work (each its own issue/PR)

1. Fix F-1 and F-3 on the Razorpay code first (tests included) — they are provider-independent.
2. Fix F-2 (CSP on Vercel) — independent of the API.
3. Generalise the provider boundary (contracts union, interface without checkout signature,
   adapter-side status/amount mapping) with Razorpay still passing all tests.
4. Add `cashfreeProvider` + Cashfree webhook route behind config; migration adding `CASHFREE`
   (owner approval required); web Checkout via Cashfree SDK; CSP origins.
5. Serverless entry + outbox trigger + shared rate-limit store + document storage, or choose an
   always-on host for the API (the existing design) and keep Vercel for the web only.
6. Keep QR and monthly giving off until ported.

---

## Sources (Cashfree)

- Webhook signature verification: https://www.cashfree.com/docs/payments/online/webhooks/signature-verification
- Webhook security checklist (headers, IP allowlist): https://www.cashfree.com/docs/payments/online/webhooks/security-checklist
- Webhooks overview: https://www.cashfree.com/docs/payments/online/webhooks/overview
- Create Order API (headers, `order_id` rules, `order_amount`, `customer_details`, `order_status`): https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
