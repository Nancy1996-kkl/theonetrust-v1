# Theonetrust.in — rules for Claude Code and engineers

Bilingual (Tamil/English) charitable-trust website, donation platform (Razorpay) and owner
dashboard. Money, donor privacy and beneficiary dignity are involved: **correctness beats speed**.

## Sources of truth (read before changing anything)

1. The GitHub issue you are working on (scope + acceptance criteria). One issue per PR.
2. `docs/website-plan.md` — corrected plan (wins over the original spec where they differ).
3. `PROJECT_SPEC.md` — detailed product/engineering spec.
4. `docs/ux-design-brief.md` — visual system (Midnight Navy, Libre Baskerville / Inter / Noto Sans Tamil).
5. `docs/research/` and `docs/decisions/` — dated research and architecture decisions (ADRs).
6. `docs/testing-strategy.md` — how the test harness works.

## Commands

| Command                     | What it does                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev`                  | Web (5173) + API (4000)                                                             |
| `pnpm verify:quick`         | format, lint, typecheck, script tests, unit tests, tests-required gate              |
| `pnpm verify`               | everything above + coverage thresholds + build + Playwright + visual baselines      |
| `pnpm test:e2e`             | Playwright with the auto bug detector (console, exceptions, network, overflow, axe) |
| `pnpm test:visual`          | Visual baselines: key screens and states, en + ta, 5 viewports (Linux Chromium)     |
| `pnpm check:tests-required` | fails if a package's source changed without a test change in that package           |

Local Playwright in the cloud sandbox: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm test:e2e`.

## Non-negotiables

- **Never invent facts**: no trust registrations, statistics, stories, testimonials, tax claims or
  contact details. Unverified values stay hidden behind `[CONFIRM]` (issue #1). Stop and ask.
- **Payments**: the browser redirect, a QR scan, a UTR or a screenshot is never proof of payment.
  Only server-verified captured payments become `PAID`. Amounts are integer paise. Webhooks are
  signature-verified and idempotent. Secrets live only in the API — never in `VITE_*`, Git or logs.
- **Tax**: the site issues a "Donation acknowledgement", never Form 114, and promises no deduction
  until the CA confirms approval (`taxBenefitEnabled` defaults off).
- **Privacy**: no PAN, phone, email or address in URLs, public pages, logs or public receipts.
- **Tamil and English parity** for every user-facing string.
- **Accessibility**: WCAG 2.2 AA. Never communicate state by colour alone.
- **No personal names** of the team or owner anywhere in the product, docs or commits — speak as the trust/team.

## Workflow for every change (use the `implementation-task` skill)

1. Read the issue, the relevant spec sections and the code you will touch. `git status` must be clean.
2. Branch: `feat/<issue>-<slug>` or `fix/<issue>-<slug>`.
3. Write the **test matrix first** (`edge-case-matrix` skill): success, failure and edge cases.
4. Implement the smallest coherent change using existing tokens/components/patterns.
   No hard-coded colours, sizes, URLs or limits — use tokens, config or settings.
5. Tests must cover every row of the matrix: unit (Vitest), API (`app.inject`), and Playwright for
   any user-visible change. Every Playwright test automatically runs the auto bug detector.
6. Run `pnpm verify` (or at least `pnpm verify:quick` + the affected e2e). Never claim a check passed
   unless you ran it and saw it pass.
7. Run the `change-audit` skill, then the relevant reviewer agents
   (`payment-security-reviewer` for anything touching money; `ui-a11y-reviewer` for UI).
8. PR description follows `.github/pull_request_template.md`: files changed, behaviour changed,
   test matrix, commands run with results, screenshots, risks, rollback.

## Forbidden

- Deleting or weakening a failing test, lowering a coverage threshold, adding `test.skip`/`.only`,
  or adding an auto-bug-detector exception without a written reason in the PR.
- Editing `.env`, live secrets, provider dashboards, production data or irreversible migrations
  without explicit owner approval.
- Rewriting whole files when a focused patch works. Drive-by refactors outside the issue scope.
- Importing server-only packages (Prisma, pg, razorpay, …) into `apps/web` (lint enforces this).

## Layout

```
apps/web        React 19 + Vite + React Router (public site + /admin)   e2e/ = Playwright
apps/api        Fastify 5 + Zod (all secrets, DB, payments)
packages/contracts  shared DTOs, status enums, money helpers (no secrets, no DB models)
scripts/        verify.mjs, check-tests-required.mjs
.claude/        agents, skills, hooks (post-edit audit + stop gate)
docs/           plan, spec, UX brief, research, decisions, testing strategy
```
