---
name: release-gate
description: Final go/no-go before a deployment or release — full test matrix, dependency and secret checks, migrations and a signed release report. Use before every production deploy.
---

# Release gate

1. `main` is green in CI; working tree clean; tag candidate commit.
2. `pnpm verify` locally — record the summary table.
3. `pnpm audit --prod` — no high/critical advisories (or documented, accepted risk).
4. Secret scan: `git grep -nE "rzp_(live|test)_|BEGIN .*PRIVATE KEY|postgres(ql)?://[^ ]+:[^ ]+@"`
   returns nothing; build output `apps/web/dist` contains no server env names or secrets.
5. Env: every variable in `.env.example` exists in the deployment secret store; none of the
   backend ones use the `VITE_` prefix.
6. DB: migrations apply cleanly to a fresh database and to a restored copy of production;
   backup taken and restore tested (see `docs/database-provider-switch.md`).
7. Payments: Cashfree sandbox smoke test (success, failure, webhook) on the release candidate.
   For the first live release: one small real donation + refund, verified in the dashboard.
8. Run `change-auditor`, `payment-security-reviewer` and `ui-a11y-reviewer` against the release diff.
9. Every `[CONFIRM]` item in issue #1 is resolved, or the dependent feature is disabled.

Write `docs/releases/<date>.md`: version, commit, checks with results, known risks, rollback steps,
owner sign-off. Any unresolved Critical/High ⇒ **no release**.
