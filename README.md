# Theonetrust.in

Bilingual (தமிழ் / English) website for a charitable trust: donations (Cashfree — UPI, cards,
netbanking; monthly giving returns later with Cashfree Subscriptions), a "Get Help" request form, transparency documents and a private owner
dashboard.

- Plan: [`docs/website-plan.md`](docs/website-plan.md) · Spec: [`PROJECT_SPEC.md`](PROJECT_SPEC.md) ·
  UX: [`docs/ux-design-brief.md`](docs/ux-design-brief.md)
- Work is tracked as ordered [GitHub issues](../../issues) grouped by phase milestones.
- Rules for engineers and Claude Code: [`CLAUDE.md`](CLAUDE.md) · Testing: [`docs/testing-strategy.md`](docs/testing-strategy.md)

## Requirements

Node 22 (`.nvmrc`) and pnpm 10 (`corepack enable`).

## Setup

```bash
pnpm install
cp .env.example .env          # fill locally; never commit
pnpm exec playwright install chromium --with-deps   # once, for e2e (run inside apps/web)
pnpm dev                      # web http://localhost:5173 · API http://localhost:4000/api/v1/health
```

## Quality gate

```bash
pnpm verify:quick   # format, lint, typecheck, unit tests, tests-required gate
pnpm verify         # + coverage thresholds, build, Playwright on 5 viewports with the auto bug detector
```

CI runs the same gate on every pull request. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Structure

| Path                 | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `apps/web`           | React 19 + Vite + React Router — public site and `/admin`          |
| `apps/api`           | Fastify 5 API — all secrets, database and payments                 |
| `packages/contracts` | Shared DTOs, status enums, money helpers                           |
| `scripts`            | `verify.mjs`, `check-tests-required.mjs`                           |
| `.claude`            | Claude Code agents, skills and hooks                               |
| `docs`               | Plan, spec, UX brief, research, decisions (ADRs), testing strategy |
