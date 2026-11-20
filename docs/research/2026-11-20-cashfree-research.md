# Cashfree Payments: research for this stack (20 Nov 2026)

Researched from official cashfree.com docs on 2026-11-20. Facts we could not confirm in official docs are marked **UNVERIFIED**.

## One-time payments: PG Orders API

- **API version and base URLs:** `x-api-version: 2026-01-01`. Sandbox `https://sandbox.cashfree.com/pg`, production `https://api.cashfree.com/pg`.
- **Auth headers:** `x-client-id` and `x-client-secret`, plus an optional `x-idempotency-key`.
- **`POST /orders` fields:**
  - `order_id`: 3–45 characters, alphanumeric plus `_` and `-`.
  - `order_amount`: rupees as a decimal with 2 places, minimum 1. Convert from paise at the boundary.
  - `customer_details.customer_id` and `customer_details.customer_phone` (10 digits) are **mandatory**. Email and name are optional.
  - `order_meta.return_url` and `order_meta.notify_url`: max 250 characters each.
  - `order_tags`: 10 at most.
  - `order_expiry_time`.
- **Response:** `payment_session_id` is the only value the browser needs.
- Source: https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order

## Browser checkout: cashfree.js v3

- **Loading:** `https://sdk.cashfree.com/js/v3/cashfree.js` (or npm `@cashfreepayments/cashfree-js`), then `Cashfree({ mode: 'sandbox' | 'production' })`.
- **Opening:** `checkout({ paymentSessionId, redirectTarget: '_modal' })` opens the payment popup over the page.
- **What the promise resolves to:**
  - `error`: closed or failed
  - `redirect`: the popup couldn't open (in-app browsers)
  - `paymentDetails`: payment completed, **whatever the result**
- **None of these results is proof of payment.** The server must check Get Order `PAID`.
- **Payment methods:** UPI app icons on mobile, QR code on desktop, cards, netbanking.
- **Production checkout needs a whitelisted HTTPS domain.** `*.vercel.app` preview domains are not allowed.
- **CSP domains: UNVERIFIED.** Start with `sdk.cashfree.com` and `*.cashfree.com`, then confirm in sandbox.
- Sources: https://www.cashfree.com/docs/payments/online/web/redirect and https://www.cashfree.com/docs/payments/online/go-live/whitelist.md

## Server-side verification

- **Get Order:** `GET /pg/orders/{id}`. `order_status` is ACTIVE, PAID, EXPIRED, TERMINATION_REQUESTED or TERMINATED.
- **Get Payments:** `GET /pg/orders/{id}/payments`. Each payment has `cf_payment_id`, `payment_status` (SUCCESS, FAILED, USER_DROPPED, PENDING, NOT_ATTEMPTED, VOID, CANCELLED, and also FLAGGED), `is_captured` and `payment_amount`.
- **One order accepts several attempts** until one succeeds.
- **Rule for PAID:** order `PAID` **and** a payment that is `SUCCESS` **and** captured **and** whose amount and currency match the stored paise.

## Webhooks

- **Events:**
  - `PAYMENT_SUCCESS_WEBHOOK`
  - `PAYMENT_FAILED_WEBHOOK`
  - `PAYMENT_USER_DROPPED_WEBHOOK`
  - `REFUND_STATUS_WEBHOOK`
  - `AUTO_REFUND_STATUS_WEBHOOK`
- **Signature:** `x-webhook-signature` = `base64(HMAC_SHA256(PG client secret, x-webhook-timestamp + rawBody))`. There is no separate webhook secret. Use the raw body.
- **Event ID:** none. Derive a dedupe key such as `cf_payment_id` + type (`cf_refund_id` for refunds).
- **Delivery:** at-least-once. Cashfree retries until it gets HTTP 200 (2, 10 and 30 minutes by default; up to 10 retries).
- **Configuring:** in the dashboard under Developers > Webhooks, with the version pinned per endpoint.
- Sources: https://www.cashfree.com/docs/api-reference/payments/latest/payments/webhooks and https://www.cashfree.com/docs/payments/online/webhooks/overview

## Refunds and settlement

- **Creating a refund:** `POST /pg/orders/{id}/refunds` with `refund_amount` and `refund_id`. Partial refunds are allowed, within 6 months of the payment.
- **Settlement:** T+2 by default. T+1 during the new-merchant offer.

## Monthly giving: Subscriptions

- **Mandate types:** UPI Autopay, eNACH and cards.
- **Creating one:** `POST /pg/subscriptions`. Both email and phone are required.
- **Browser checkout:** `subscriptionsCheckout({ subsSessionId })`. The docs show only `_blank`; **popup support is UNVERIFIED**.
- **Limits:** UPI and cards ₹15,000 without additional authentication. UPI needs a pre-debit notice at least 25 hours before each debit.
- **Fees:** ₹7.5 per mandate, then per debit ₹5 under ₹1,000 or ₹15 at ₹1,000 and above. Mandates are excluded from the 0% offer.
- Sources: https://www.cashfree.com/docs/payments/subscription/introduction and https://www.cashfree.com/docs/payments/subscription/faq

## Receipts

- Cashfree emails the payer a payment confirmation.
- No 80G or donation-receipt feature was found, so the trust's own "Donation acknowledgement" stays separate.

## Pricing (rate card as of 10 Aug 2026)

- **Standard rates:** 1.95% on UPI, domestic cards, netbanking and wallets, plus 18% GST. No setup fee and no annual fee.
- **New-merchant offer:** 0% platform fee up to ₹20 lakh GMV for sign-ups from 21 Jul 2026, valid until 31 Mar 2027. GST is still charged on the notional 1.95%.
- **UPI MDR from 15 Oct 2026:** 0.4% on UPI payments above ₹2,000 (blog).
- Sources: https://www.cashfree.com/docs/help/account/pricing and https://www.cashfree.com/blog/upi-charges-new-mdr-rules/

## Onboarding a charitable trust

- **Documents:** the trust's PAN, the trust deed or registration, signatory KYC, the list of trustees and the trust's bank account.
- **Cashfree's FAQ says non-profits need an 80G/12A or FCRA certificate.** Confirm this with Cashfree.
- **Website must have** T&C, About, Contact, Privacy and Refund pages, and the name must match the KYC documents.
- **Sandbox keys** are under Developers > API Keys. Whether they work before activation is UNVERIFIED.
- **Sandbox test data:** UPI `testsuccess@gocash` and `testfailure@gocash`. Cards with OTP `111000`.
- Sources: https://www.cashfree.com/docs/help/onboarding-related/onboarding-faqs and https://www.cashfree.com/docs/api-reference/payments/data-to-test-integration

## SDK choice

- The npm package `cashfree-pg` is at v5.x. We use plain `fetch` with Zod validation instead: only about 4 endpoints plus an HMAC check, with the API version pinned explicitly.
