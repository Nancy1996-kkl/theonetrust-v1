# Sitemap and information architecture

Sources: `docs/website-plan.md` §1, §4, §14; `docs/ux-design-brief.md` §5; ADR 0004 (Tamil URLs);
ADR 0005 (single public page). Nothing here states facts about the trust; content comes from
issue #1 when verified.

**Shape (owner decision, 31 Oct 2026):**

- **Public visitors and donors use one single page** — `theonetrust.in` (English) and
  `theonetrust.in/ta/` (Tamil). Donating, Get Help and the payment result all happen **inside that
  page** in panels; nobody is sent to another page to finish a task.
- **Small linked pages** exist only because Razorpay requires policy links to activate live
  payments: Terms, Privacy, Refund & cancellation. They are reached from the footer.
- **Private links** sent by email: a receipt (acknowledgement) link and a monthly-giving manage link.
- **The owner uses a private dashboard** at `/admin`, in Tamil or English with a toggle.

## Routes

`apps/web/src/app/sitemap.test.ts` fails if the app defines a route that is not in this table, or
if a public browsing page is added beyond the single page and the policy pages.
Status: **Built** = exists in `apps/web/src/app/routes.tsx` · **Planned** = built by the issue shown.

<!-- prettier-ignore-start -->
| Route | Tamil route | Purpose | Who | Access | Search engines | Built in | Status |
|---|---|---|---|---|---|---|---|
| `/` | `/ta/` | The single public page: hero, about, ways we help, donate panel, get-help panel, impact, transparency, FAQ, contact | Everyone | Public | Index | #11, #12, #13, #15, #24 | Built (placeholder) |
| `/privacy` | `/ta/privacy` | Privacy policy (Razorpay requirement) | Everyone | Public | Index | #14 | Built |
| `/terms` | `/ta/terms` | Terms and conditions (Razorpay requirement) | Everyone | Public | Index | #14 | Built |
| `/refund-policy` | `/ta/refund-policy` | Refund, cancellation and correction policy, incl. "shipping: not applicable — donations only" (Razorpay requirement) | Donors | Public | Index | #14 | Built |
| `/receipt/:token` | `/ta/receipt/:token` | Donation acknowledgement (minimal fields) + PDF download + verification QR target; link sent by email or shown in the donate panel | Donor and anyone they share it with | Private random token | No index | #29 | Planned |
| `/manage/:token` | `/ta/manage/:token` | See and cancel monthly giving without logging in; pause only where Razorpay supports it for that method (UPI mandates are paused in the donor's UPI app) | Monthly donor | Private random token | No index | #32, #33 | Planned |
| `/admin/login` | — | Owner sign-in with authenticator-app second factor | Trust owner | Public page, rate-limited | No index | #19 | Planned |
| `/admin` | — | Overview: verified totals, pending, failed, refunds, recent activity, exceptions | Trust owner | Owner session | No index | #31 | Planned |
| `/admin/donations` | — | Donations ledger with filters and CSV export | Trust owner | Owner session | No index | #31 | Planned |
| `/admin/donations/:id` | — | One donation: payment attempts, webhook history, receipt, notifications | Trust owner | Owner session | No index | #31 | Planned |
| `/admin/exceptions` | — | Payment exceptions and reconciliation (pending too long, mismatch, bank transfers) | Trust owner | Owner session | No index | #25, #31 | Planned |
| `/admin/receipts` | — | Receipts: copy link, download, resend | Trust owner | Owner session | No index | #31 | Planned |
| `/admin/help-requests` | — | Help request inbox: New → Contacted → Verifying → Helping → Closed | Trust owner | Owner session | No index | #22 | Planned |
| `/admin/help-requests/:id` | — | One help request with private notes and status history | Trust owner | Owner session | No index | #22 | Planned |
| `/admin/monthly-giving` | — | Monthly giving subscriptions and their charge history | Trust owner | Owner session | No index | #33 | Planned |
| `/admin/programmes` | — | Ways we help: create, edit, pause (bilingual) | Trust owner | Owner session | No index | #36 | Planned |
| `/admin/content` | — | Site sections, FAQ, impact metrics, stories (draft → preview → publish) | Trust owner | Owner session | No index | #36 | Planned |
| `/admin/transparency` | — | Transparency documents upload and publishing | Trust owner | Owner session | No index | #36 | Planned |
| `/admin/tax` | — | Tax & compliance: approval details, Form 113 export, 31 May reminder | Trust owner | Owner session | No index | #34, #35 | Planned |
| `/admin/settings` | — | Trust profile, receipt threshold, owner email, fee table, payment config status | Trust owner | Owner session | No index | #36 | Planned |
| `/admin/audit-log` | — | Append-only audit log | Trust owner | Owner session | No index | #20 | Planned |
| `*` | `/ta/*` | Not found page with a link home | Everyone | Public | No index | #2 | Built |
<!-- prettier-ignore-end -->

### URL rules

- **No personal data in URLs**, ever: no name, phone, email, PAN or address. Receipt and manage
  links use random tokens; the server stores only their hash.
- Panels open from anchors on the single page: `#donate` opens the donate panel, `#get-help` opens
  the Get Help panel. Closing a panel returns to where the visitor was.
- The single page accepts only safe pre-fill parameters for the donate panel: `?programme=<slug>&amount=<whole rupees>&frequency=monthly`
  (e.g. `/ta/?programme=education#donate`). Unknown or invalid values are ignored, never trusted —
  the server validates everything again.
- The payment result never appears in the URL. While a payment is being confirmed, a private status
  token is kept only in that browser tab, so a refresh re-checks safely; if the tab is closed, the
  acknowledgement arrives by email (when given) and the owner sees the donation in the dashboard.
- Landing-page anchors use the same English IDs in both languages, so `/ta/#transparency` works.
- Old or mistyped paths show the not-found page.

## The single page (`/` and `/ta/`)

Section order follows the plan (§4). IDs are the anchor targets used by the navigation.

| #   | Section                                 | Anchor ID            | In nav?          | Notes                                                                                |
| --- | --------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| 1   | Header                                  | —                    | —                | Logo + trust name, nav, தமிழ் / English switch, **Get Help** and **Donate** buttons  |
| 2   | Hero                                    | `top`                | —                | Human headline, short real scope, Donate (primary) + Get Help (secondary)            |
| 3   | About: introduction + trust facts strip | `about`              | **About**        | Only verified facts (issue #1); unknown fields hidden                                |
| 4   | Ways we help                            | `ways-we-help`       | **Ways we help** | Each card opens the donate panel with that need selected; general vs earmarked       |
| 5   | How a donation helps                    | `how-donations-help` | —                | Illustrative only when costs are verified                                            |
| 6   | How it works                            | `how-it-works`       | —                | Need → amount → pay → acknowledgement and updates                                    |
| 7   | Impact and stories                      | `impact`             | **Impact**       | Sourced, dated metrics; consented stories; factual empty state, never zeros          |
| 8   | Transparency centre                     | `transparency`       | **Transparency** | Dated documents with language, period, file type                                     |
| 9   | FAQ                                     | `faq`                | —                | Includes payment limits, tax honesty, "no fee for donors", how to stop monthly gifts |
| 10  | Contact                                 | `contact`            | **Contact**      | Phone, WhatsApp, email, area, call hours                                             |
| 11  | Footer                                  | —                    | —                | Legal name and particulars, policy links, receipt help, language switch              |

### Panels on the single page

| Panel                      | Opens from                                                                | Contains                                                                                                            | Result shown in the panel                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Donate** (`#donate`)     | Header and hero Donate buttons, Ways we help cards, shared pre-fill links | Need → amount (one-time or monthly) → name and contact → optional acknowledgement / tax options → Razorpay Checkout | Verified thank-you (+ acknowledgement link above the threshold), pending verification with **Check again**, failed, cancelled |
| **Get Help** (`#get-help`) | Header and hero Get Help buttons, Contact section                         | Who needs help → kind of help → short description → contact and best time → consent; plus Call me back and WhatsApp | Reference ID and "we will call you"                                                                                           |

Panels are accessible dialogs (labelled, focus kept inside, Escape and a visible close button,
focus returns to the button that opened them). On phones they open full-height; on desktop as a
side panel. Switching language keeps the panel open with the same answers.

## Razorpay activation links

Razorpay asks for these links before enabling live payments:

| Razorpay asks for                    | We give                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| About us                             | `https://theonetrust.in/#about`                                                        |
| Contact us                           | `https://theonetrust.in/#contact`                                                      |
| Pricing details                      | `https://theonetrust.in/#donate` (voluntary amounts from ₹1; no fee charged to donors) |
| Terms and conditions                 | `https://theonetrust.in/terms`                                                         |
| Privacy policy                       | `https://theonetrust.in/privacy`                                                       |
| Cancellation / refund (and shipping) | `https://theonetrust.in/refund-policy`                                                 |

If Razorpay's checks reject anchor links for About, Contact or Pricing, small pages can be added for
them — this table and the route table are updated first.

## Navigation

**Desktop (≥ 80em, 1280px — Tamil labels need the room; wireframe #6)** — one row: logo + name · About · Ways we help · Impact · Transparency · Contact ·
தமிழ் / English · **Get Help** (secondary button) · **Donate** (gold primary button).
The header is sticky; the current section is marked with `aria-current="location"`.

**Tablet and mobile (< 80em)** — logo + name · **Donate** (always visible) · menu button
(accessible name "Menu" / "பட்டியல்"). The menu holds the five anchors, **Get Help** and the language
switch, opens as a sheet below the header (not full-screen), traps focus, and closes on Escape,
outside click or link choice. Get Help is also in the hero, so it is never more than one tap away.

**Footer** — four groups:

1. Trust: legal name, short mission, registration particulars (verified only).
2. Explore: About, Ways we help, Impact, Transparency, FAQ.
3. Help: Get Help, Contact, receipt help.
4. Legal: Terms, Privacy, Refund & cancellation, language switch, © year.

Social links only if the trust confirms accounts it maintains.

## Owner dashboard (`/admin`)

- Owner only, behind login with an authenticator-app second factor.
- **Tamil and English with a toggle** in the dashboard header. The choice is saved to the owner's
  account, so it is the same on every device. Admin URLs do not change with the language and are
  never indexed by search engines.
- Every screen, label, status, error and export column header exists in both languages.

## Search engines

- Indexed: `/`, `/privacy`, `/terms`, `/refund-policy` and their `/ta/` mirrors.
- `noindex` + excluded from `sitemap.xml`: receipt, manage, admin and not-found pages.
- `hreflang` alternates `en-IN`, `ta-IN`, `x-default` (English) on every indexed page (issue #16).

## Contact facts confirmed so far (issue #1)

Website theonetrust.in · email info.theonetrust@gmail.com · phone and WhatsApp +91 96005 16999 ·
Kanchipuram, Tamil Nadu · calls **every day, 8 AM – 10 PM**. Postal address: pending from the client.

## Deferred to a later phase (from the UX brief)

Separate pages for About / Mission & Vision, Welfare activity detail, Projects and project detail,
Impact & achievements, News & updates, Gallery. Adding any of them changes the single-page decision
(ADR 0005), so it needs the owner's approval first; then they follow the same rules: English at the
root, Tamil under `/ta/`, verified content only, listed in this table first.
