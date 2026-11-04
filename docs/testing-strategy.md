# Testing strategy and harness

Goal: every change arrives with automated proof that the success path works, failure paths fail
safely and edge cases are handled — and bugs are detected even when nobody wrote a test for them.

## Layers

| Layer         | Tool                                                                                          | Where                        | Runs                   |
| ------------- | --------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------- |
| Static        | Prettier, ESLint (strict TS, React hooks, jsx-a11y strict, server-import ban), `tsc --strict` | everywhere                   | pre-merge              |
| Unit          | Vitest (+ Testing Library, axe-core in jsdom)                                                 | `src/**/*.test.ts(x)`        | every save / pre-merge |
| API           | Vitest + Fastify `app.inject()`                                                               | `apps/api/src/**/*.test.ts`  | pre-merge              |
| E2E           | Playwright, 5 viewports (360, 390, 768, 1366, 1440)                                           | `apps/web/e2e/`              | pre-merge              |
| Scripts/hooks | `node:test`                                                                                   | `scripts/`, `.claude/hooks/` | pre-merge              |

## Auto bug detectors (no test needs to ask for them)

**Unit** (`apps/web/src/test/setup.ts`): any `console.error`/`console.warn` during a test fails it
(React key warnings, `act()` warnings, invalid DOM nesting…). Allow-list per test only with
`consoleGuard.allow(/specific/)`.

**E2E** (`apps/web/e2e/fixtures/guard.ts`, auto fixture on every test): fails on console
errors/warnings, uncaught exceptions, failed requests and same-origin 4xx/5xx, horizontal overflow
(names the offending elements), axe WCAG 2.2 AA violations (incl. colour contrast in a real
browser), missing `lang`/`title`/`<main>`, ≠ 1 `<h1>`, duplicate ids, unnamed links.
`guard.self-test.spec.ts` plants each bug type to prove the detector still catches it.

**Crawler** (`crawl.spec.ts`): visits every internal link from `/` — new pages are covered automatically.

**Coverage thresholds**: contracts 100%; web and API ≥ 90% lines/functions/statements, ≥ 85% branches.
Vitest `requireAssertions` fails tests that assert nothing.

## Gates that force tests to be written

- **tests-required** (`scripts/check-tests-required.mjs`): a package whose `src` changed must also
  change a test in the same package. Bypass only with `Tests-Not-Needed: <reason>` in the PR body.
- **Claude Code hooks** (`.claude/settings.json`):
  - _PostToolUse_ — blocks edits containing secrets/PAN or conflict markers; reminds to write tests
    when production source changes.
  - _Stop_ — runs `pnpm verify:quick` before Claude finishes; on failure Claude must fix it.
- **CI** (`.github/workflows/ci.yml`): format → lint → typecheck → script tests → unit + coverage →
  tests-required → no live payment keys → diff check → build → bundle secret scan → Playwright (5 viewports) with
  `failOnFlakyTests`. Reports and traces are uploaded on failure.

## Payment test suite (#28)

Razorpay **test mode only**. `pnpm check:no-live-keys` (in `verify` and CI) fails on any tracked
live key ID (`rzp_live_…`), a filled-in Razorpay secret outside test files, or a committed `.env`;
the API also refuses a live key outside production. API tests stub the Razorpay HTTP API but use
the production signature code; they run in the CI `database` job against PostgreSQL 16.

| Case                                             | API (`apps/api/src/modules/…`)                                                    | Browser (`apps/web/e2e/donate.spec.ts`)               |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Success (callback, webhook first, re-check only) | `payments/payment-suite.db.test.ts` › success; `verify.db.test.ts`                | success only after verification (en/ta)               |
| Cancel                                           | payment-suite › cancel and failure                                                | cancelled checkout keeps need and amount              |
| Failure, retry as a new order                    | payment-suite › cancel and failure; `webhook.db.test.ts`                          | failed payment offers try again; UPI limit            |
| Duplicate webhook                                | payment-suite › duplicate…; `webhook.db.test.ts`                                  | —                                                     |
| Delayed webhook (after callback / after failure) | payment-suite › success, duplicate…                                               | pending verification never shows success              |
| Out-of-order events                              | payment-suite › duplicate…; `webhook.db.test.ts`; `transitions.test.ts`           | —                                                     |
| Amount / currency / order mismatch               | payment-suite › mismatches; `verify.db.test.ts`                                   | —                                                     |
| Bad signatures (callback and webhook)            | payment-suite › bad signatures; `webhook.db.test.ts`                              | —                                                     |
| Refresh / back button                            | payment-suite › refresh and back button; `donations.db.test.ts` (Idempotency-Key) | refresh while confirming; back button after a payment |
| ₹1 donation, limit errors                        | payment-suite › amounts; `donations.db.test.ts`                                   | ₹1 donation; amount limits                            |
| Unmatched bank-transfer credit                   | payment-suite › unmatched…; `bank.db.test.ts` (owner-recorded credit)             | bank transfer "not confirmed yet"                     |
| Refunds                                          | `webhook.db.test.ts` › refunds                                                    | —                                                     |
| Monthly giving                                   | later (subscriptions issue)                                                       | later                                                 |

## How an engineer (or Claude) works an issue

1. `implementation-task` skill → plan + `edge-case-matrix` (success / failure / edge rows).
2. Tests first (or `test-engineer` agent), see them fail, implement, `pnpm verify`.
3. `change-audit` skill + reviewer agents (`change-auditor`, `payment-security-reviewer`,
   `ui-a11y-reviewer`) → fix Critical/High.
4. PR with the template: matrix, real command output, screenshots, risks.

## Planned additions (tracked in issues)

Visual regression baselines and Tamil/English screenshot matrix (#37), Lighthouse budgets (#16),
API integration tests against a real PostgreSQL in CI (#18),
security scanning (#38).
