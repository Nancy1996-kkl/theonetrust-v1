# Theonetrust.in — Complete Corrected Website Plan

> Markdown copy of `docs/reference/website-plan.pdf` (prepared 29 Oct 2026), plus the
> 30 Oct 2026 payment-limits addendum (§17). Where this plan and `PROJECT_SPEC.md` differ,
> **this plan wins**. It is a build plan, not legal or tax advice: every `[CONFIRM]` item needs
> verified trust documents or the trust's CA before launch.
>
> **Update 25 Nov 2026 — payment gateway:** the trust chose **Cashfree**; Razorpay is removed from
> the code (`docs/decisions/2026-11-20-cashfree-migration-plan.md`, Phase 8). Where this plan says
> Razorpay below, read Cashfree. Monthly giving (Subscriptions / UPI AutoPay) and the separate
> one-time QR are not offered until Phase 9; Cashfree's own payment window shows a UPI QR. Bank
> transfer stays manual (the owner confirms with bank evidence); there is no Smart Collect.

## 1. Mission and scope

Theonetrust.in is a trust-owned website that helps poor families and helpless people of all
kinds (not only teenagers). It has three jobs:

1. **Receive donations** from ₹1 by UPI QR, card and netbanking, with optional monthly autopay the donor agrees to.
2. **Receive help requests** through an easy "Get Help" form, including requests made for someone else.
3. **Show transparency**: verified trust facts, dated updates and downloadable documents.

The public site is one long bilingual (Tamil/English) landing page plus focused utility routes:
`/donate`, `/receipt/:token`, `/manage/:token` (autopay), `/help`, legal pages and `/admin/*`.
Payments, receipts, tax records and the database stay behind a separate API.

Carried-over non-negotiables: a browser redirect or QR scan is never proof of payment; amounts
are integer paise; nothing is invented; beneficiary dignity and consent come first.

## 2. What changed from the original spec

| Topic          | Original spec                    | Corrected decision                                                                    |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| Mission        | Teenagers and families           | All poor and helpless people, within the trust deed's objects [CONFIRM]               |
| Support form   | Minimal contact form             | Guided multi-step Get Help form with "help someone else" mode and a case inbox        |
| Autopay        | Not covered                      | Monthly giving via Razorpay Subscriptions / UPI AutoPay, consent and one-click cancel |
| Minimum amount | Not specified                    | ₹1 allowed; optional "cover the fee" tick                                             |
| Receipt        | Every verified payment           | Optional acknowledgement from a configurable threshold (default ₹500)                 |
| Tax            | Receipt vs statutory certificate | Same, plus tax-benefit opt-in, Form 113 export, identity record for every donor       |
| Animation      | Small transitions only           | Elegant scroll reveals and transitions, reduced-motion support                        |
| Harness        | Full set of agents and skills    | Lean first, grown as features land                                                    |

## 3. Stack and cost

| Layer    | Choice                                                                          | Note                                                                    |
| -------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Frontend | React + TypeScript + Vite + React Router; CSS tokens                            | Cloudflare Pages or Vercel (verify limits)                              |
| API      | Node.js + TypeScript + Fastify                                                  | Prefer an always-on host: sleeping free tiers slow payment verification |
| Database | Neon PostgreSQL (pooled `DATABASE_URL`, direct `DIRECT_URL`); Supabase fallback | See `database-provider-switch.md`                                       |
| ORM      | Prisma, pinned major                                                            |                                                                         |
| Payments | Razorpay (UPI QR, cards, netbanking, Subscriptions)                             | Per-transaction fees; verify pricing                                    |
| Email    | Resend or Brevo behind an adapter                                               |                                                                         |
| Receipts | PDF generated on demand                                                         |                                                                         |
| Tests    | Vitest, API integration tests, Playwright                                       |                                                                         |

Google Sheets may be used only for optional reports — never the system of record.

## 4. Public landing page (section order)

Calm, classy design with purposeful animation: scroll reveals, gentle hover/focus, count-up only
for verified figures, a language switch that keeps the chosen amount, `prefers-reduced-motion`.

1. **Header** — logo and legal name; anchors (About, Ways we help, Impact, Transparency, Contact); தமிழ் / English; two distinct buttons: **Donate** and **Get Help**.
2. **Hero** — human headline, one short paragraph of real scope, primary Donate, secondary Get Help. Approved real photos or a typographic hero. No invented urgency, counts or deadlines.
3. **Trust facts strip** — legal name, registration, year, contact, tax-approval status only with evidence. Unknown fields hidden.
4. **Ways we help** — education, food & essentials, health access, emergency, livelihood, other [CONFIRM list]. Each card: who it is for, general vs earmarked, passes the area into the donation form.
5. **How a donation helps** — illustrative only when costs are verified; admin costs and unallocated funds explained.
6. **How it works** — choose need → amount → pay → acknowledgement and updates.
7. **Impact and stories** — metrics need source, period and date; documented consent; minors anonymous. No verified data ⇒ factual statement of current activity, never zeros.
8. **Transparency centre** — approved registration proof, approval evidence if applicable, annual/audit reports, allocation, privacy and safeguarding policies.
9. **FAQ** — donation use, earmarking, pending/failed payments, receipt timing, honest tax status, how to request help, data use, reporting a concern.
10. **Contact** — verified phone, email, address, WhatsApp.
11. **Footer** — legal name, particulars, privacy, terms, refund & correction policy, receipt help, transparency documents.

WCAG 2.2 AA. Test Tamil fonts and wrapping at 360, 390, 768, 1366 and 1440 px.

## 5. Get Help form and case inbox

**Wizard** (big touch targets, Tamil and English):

1. Who needs help? Myself / Someone I know / I am helping on behalf of someone.
2. What kind of help? Icon cards: education, food & essentials, health, emergency, livelihood, other, "I don't know how to explain".
3. Short optional description — no sensitive financial or medical documents.
4. Contact: phone or WhatsApp, preferred language, best time to call. For someone else: helper's contact plus the person's name or village if comfortable.
5. Consent and submit: privacy notice, consent to contact; third-party confirmation. Result page shows a reference ID and "we will call you".

**For people who cannot fill a form**: one-field Call me back (phone only), WhatsApp click-to-chat and phone number. Voice notes only after storage and safeguarding rules are decided.

**Rules**: say "Submitting this form does not guarantee help." No medical records, income proof, Aadhaar or photos in the first form. No public names/locations/stories without documented consent. Anti-spam (rate limits, honeypot, optional CAPTCHA) and server validation.

**Admin case inbox**: statuses New, Contacted, Verifying, Helping, Closed; private notes, assignee, reminder dates, filters by type and language, CSV export with masked personal data; every status change audited.

## 6. Donation experience

**Flow**: landing → choose need (or general) → amount → name and contact (private record) → optional receipt and tax options → Razorpay Checkout (UPI QR/app, card, netbanking) → server verification → success page with receipt link only after verified payment, otherwise "Pending verification" with a safe re-check.

**Rules**

- From ₹1; quick picks plus custom amount; validated on the server; stored as integer paise.
- Optional "cover the processing fee" tick, never forced.
- Prefer order-linked Razorpay Checkout with its own UPI QR. A static UPI QR is manual reconciliation only; a donor-entered UTR or screenshot never marks a donation paid.
- **Monthly giving**: Razorpay Subscriptions / UPI AutoPay [CONFIRM enablement]. Consent screen (amount, frequency, how to cancel); tokenised manage link to pause/cancel without login; every charge is its own payment record.
- "Hide my name publicly" is separate from the private identity record.
- Status model: CREATED, PENDING, AUTHORIZED, PAID, FAILED, REFUND_PENDING, REFUNDED, MANUAL_REVIEW.
- Foreign donations disabled until FCRA, bank and gateway approval are verified.

## 7. Tax and compliance (summary of research)

A donor does not violate tax by donating; the compliance risks sit with the trust.

- Income-tax Act 2025 replaces the 1961 Act from 1 April 2026. **Section 133** is the donor deduction (formerly 80G). **Section 332** registers the trust as an RNPO; **Section 354** approval makes donations deductible. Existing 80G approvals continue for their approved period under transition rules [CONFIRM with CA].
- Under the default regime most Chapter VIII deductions are unavailable — never promise a tax saving.
- Cash donations above ₹2,000 get no deduction. The site takes only online (non-cash) payments.
- **Form 113** (donation statement) and **Form 114** (donor certificate) by 31 May after the financial year; Form 114 is generated on the e-filing portal from a Form 113 CSV. The website PDF is an acknowledgement only, never Form 114.
- Anonymous donations (no identity record) can be taxed at 30% above a threshold — record a name and contact for every donor; the CA decides the minimum identity record.
- 85% application rule, audit and ITR-7 apply to the RNPO; audit form name per CA.
- Pure donations are not a GST supply — no GST on donations.
- Tamil Nadu: registered deed at the Sub-Registrar is the operative step; check the deed's objects cover helping poor and helpless people of all types [CONFIRM].

**In the product**: settings for RNPO reference, Section 354 approval number, validity and a `taxBenefitEnabled` switch (default off); private name + contact for every donation, address only for tax opt-in; tax opt-in explains the old-regime condition and why PAN/address are needed, PAN never in URLs, emails or public pages; admin Form 113 CSV export by financial year (April–March, IST) and a 31 May reminder; receipt wording "Donation acknowledgement" until approval is confirmed.

## 8. Receipts

- Offered when the verified amount meets a configurable minimum (default ₹500, `RECEIPT_MIN_PAISE`); optional for the donor.
- Free delivery: download link on the success page, and email only with consent.
- Created only after verified capture; one receipt number per payment; unguessable token (store only its hash); no PAN, phone, email or full address on the public view; PDF on demand from a versioned template.
- Statutory certificate tracked separately in `tax_certificate_tracking` (NOT_APPLICABLE, PENDING_TRUST_FILING, FORM_113_FILED, FORM_114_ISSUED, CORRECTION_REQUIRED). The site never claims to issue it.
- Refunds/corrections add records; never delete. Owner notification is a queued, retryable email; email failure never undoes a paid donation.

## 9. Data model

From the spec: `admin_users`, `programmes`, `donation_intents`, `payment_attempts`, `webhook_events`,
`receipts`, `tax_certificate_tracking`, `notification_outbox`, `content_sections`, `impact_metrics`,
`transparency_documents`, `audit_logs`. Added: `help_requests`, `help_request_notes`,
`donation_subscriptions`, `donor_identity_records` (PAN encrypted), `trust_settings`,
`bank_transfer_records` (§17). UUIDs, paise, PostgreSQL-standard types, repositories only, never card/UPI credentials.

## 10. API additions

Keep `/api/v1` and the spec's endpoints. Add: `POST /help-requests`, `POST /help-requests/callback`,
`POST /subscriptions`, `GET/POST /subscriptions/manage/:token`, subscription charge events on the
Razorpay webhook, admin help-request list/detail/status/notes, Form 113 CSV export by financial year,
tax profile and receipt-threshold settings. Validate all input, rate-limit public endpoints, audit admin actions.

## 11. Owner dashboard

Overview (verified totals, pending, failed, refunds), donations ledger with filters and CSV export,
payment exceptions and reconciliation, receipts and resend, help request inbox, monthly-giving
subscriptions, programmes and content, transparency documents, tax & compliance page, settings,
append-only audit log. Owner-only at launch with an authenticator-app second factor.
Data architecture: `docs/decisions/0002-dashboard-data-architecture.md`.

## 12. Security and privacy gates

Secrets only on the backend; signature and webhook verification; idempotent webhooks; amount,
currency and order checked against provider data; HttpOnly/Secure/SameSite cookies; CORS allowlist;
CSRF where needed; rate limits; admin enforced on the API; privacy notice; tested backups and restore.

## 13. Harness engineering

Root `CLAUDE.md`, reviewer agents, skills, hooks and a CI gate. See `docs/testing-strategy.md`.

## 14. Page and data maps

- **Donation**: landing → Donate → intent saved → Razorpay order → Checkout (UPI QR, card, autopay) → callback to API → signed webhook → verified PAID → receipt (if ≥ threshold) → email to donor and owner → admin ledger and Form 113 export.
- **Help**: landing → Get Help wizard or Call me back → request saved → owner notified → case inbox → follow-up call → status updates.
- **Data**: intent → payment attempts → receipt → tax tracking; intent → donor identity record; subscription → many payment attempts; help request → notes; everything admin-side → audit log.

## 15. Build phases and gates

| Phase                | Build                                                                                                             | Gate                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0 Facts              | Legal name, registration, approvals, bank beneficiary, contacts, photos, owner email, receipt wording, help scope | Signed-off content and legal checklist                                                     |
| 1 Design             | Wireframes, tokens, Tamil typography, animation plan, component states                                            | Hero, donation panel, Get Help wizard, footer, admin shell approved                        |
| 2 Public site        | Landing page, bilingual content, Get Help front end, accessible nav                                               | Both languages at all viewports; no placeholder facts                                      |
| 3 Backend            | DB, migrations, env validation, admin auth, help-request API, audit log, inbox                                    | Unauthorised access denied; clean migration; no secrets in repo/bundle                     |
| 4 Payments (sandbox) | Intent, order, callback + webhook verification, state model, QR, bank transfer                                    | Success, cancel, failure, duplicate/delayed webhook, mismatch, bad signature; no live keys |
| 5 Receipts & email   | Receipt rules, PDF, link, outbox, resend                                                                          | One receipt per payment; no PII in public link                                             |
| 6 Autopay & tax      | Subscriptions, manage link, tax opt-in, Form 113 export                                                           | Razorpay and CA confirm what is enabled                                                    |
| 7 Launch             | Full tests, accessibility, backup restore, monitoring, live webhook test                                          | No unresolved critical/high issue                                                          |

## 16. Items to confirm before launch

1. Registration and donor approval under the new Act (Sections 332 and 354) — decides whether tax features launch.
2. Exact legal name, trust deed objects and final list of help types.
3. Whether Razorpay enables UPI AutoPay, Subscriptions, eMandate and Smart Collect for the trust.
4. Minimum donor identity record the CA wants for every donation.
5. Audit form, filing dates and any Tamil Nadu requirements (CA).
6. Consent for every beneficiary photo, story and testimonial.
7. FCRA position (foreign donations off until confirmed).

## 17. Addendum (30 Oct 2026): payment limits and large donations

Details and sources: `docs/research/2026-10-payment-limits.md`.

- **Three different "₹2,000" rules** — none limits QR payments to ₹2,000:
  1. Tax: cash donations above ₹2,000 get no deduction; UPI/QR is not cash.
  2. UPI MDR from 15 Oct 2026: 0.4% merchant fee on P2M UPI above ₹2,000 (capped ₹300 at ≥ ₹75,000); paid by the trust, so the cover-fee estimate must come from a configurable fee table.
  3. UPI limits: generally ₹1 lakh per transaction; banks may set lower (some RRBs ₹5,000–₹25,000); new UPI users ₹5,000 in the first 24 hours.
- **Large donations**: card/netbanking for any amount; bank transfer (NEFT/RTGS) via Razorpay Smart Collect virtual accounts [CONFIRM] or manual reconciliation where only the owner can mark paid with bank evidence.
- **Monthly giving limits**: UPI AutoPay ₹15,000 per debit without extra authentication (charity is not a higher-limit category) ⇒ above that use eMandate (up to ₹1 crore) or card. Mandates above ₹15,000 are not supported on PhonePe/BHIM. Donors can pause/cancel from their UPI app; the trust cannot modify a UPI mandate (amount change = cancel + new mandate); avoid last-day-of-cycle charges; banks send a 24-hour pre-debit notice.
