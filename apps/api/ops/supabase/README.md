# Supabase: trust database users (Phase 2b) — owner steps

The trust's tables live in the **`theonetrust` schema** of the shared Supabase project, next to
the cafe's tables in `public`. These scripts split the trust's database user in two:

| Role                | Used by                                                 | Can                                                                                                                                                         |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theonetrust_owner` | migrations only, from a trusted computer (never Vercel) | owns every trust table                                                                                                                                      |
| `theonetrust_app`   | the website (Vercel), later                             | read and write rows in `theonetrust` only; delete rows only in 4 tables; **cannot** touch the cafe, change tables or switch off the append-only protections |

The scripts were rehearsed on a local copy built the same way as the Supabase project (same
roles, ownership and row-level security, plus stand-in "cafe" tables). The rehearsal covers:
run, verify, run again, a migration as the owner, rollback, and re-apply. The real app ran as
`theonetrust_app` and made, verified and acknowledged a donation; every forbidden action was
refused. To repeat it: `ops/supabase/rehearse-local.sh` (local Postgres only).

## Before you start

- **Not yet for the live website.** Do not add any database setting to the **production** Vercel
  project until Phase 2c (shared rate limits) and 2d (jobs) are merged. See
  `docs/research/2026-11-20-vercel-serverless-spike.md`.
- Passwords never go into chat, Git, screenshots or the PR. Generate them in your password
  manager.

## Steps

1. **Read** `01-roles-and-ownership.sql`, `02-verify-isolation.sql` and `03-rollback.sql`.
2. In Supabase → the project holding the `theonetrust` schema → **SQL Editor**, paste and run
   **`01-roles-and-ownership.sql`**. It checks that it is in the right project, then runs as
   one transaction: either everything completes, or nothing changes.
3. **Passwords.** Generate two strong passwords, one for each role. In a **new** SQL Editor tab,
   run:
   ```sql
   ALTER ROLE theonetrust_app   PASSWORD '<app password>';
   ALTER ROLE theonetrust_owner PASSWORD '<owner password>';
   ```
   Do **not** save this tab as a snippet. Delete it from the editor's history afterwards.
4. Run **`02-verify-isolation.sql`** (read-only). **All 13 rows must say `ok = true`.** A
   screenshot of this result is safe to share; it contains no secrets.
5. **Connection strings** (keep them in your password manager for now):
   - **Website, later** (Vercel, after 2c/2d): Supabase → **Connect** → **Transaction pooler**
     (port 6543). The user is `theonetrust_app.<project-ref>` **[CONFIRM: copy the exact user from
     the Connect dialog]**. Add `?sslmode=require`. The website also needs
     **`DATABASE_SCHEMA=theonetrust`**: without it, the app's queries would point at `public`.
   - **Migrations**, only on your own computer: **Session pooler** (port 5432) or the direct
     connection, user `theonetrust_owner`, with `?schema=theonetrust` at the end. Use it only as
     `DIRECT_URL` when running `pnpm --filter @theonetrust/api db:migrate:deploy`. **Never put it in
     Vercel.**
6. **After every future migration that adds a table**, run `01` again, then `02`. It is safe to
   repeat.

## Undo

Run **`03-rollback.sql`**. It puts everything back as it was: `theonetrust_app` owns the schema,
row-level security stays on with no policies, and `theonetrust_owner` is removed. It touches only
the trust schema and the two `theonetrust_*` roles.

## What the scripts never do

They never touch any table, function or role outside `theonetrust` (the cafe included). They
never change Supabase's `anon`/`authenticated`/`service_role` rights anywhere except the trust
schema, never contain a password, and never drop a table or row.
