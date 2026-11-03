# Database setup and fallback: Neon first, Supabase if needed

## Decision

- Primary for development and initial deployment: Neon managed PostgreSQL.
- Fallback: Supabase-hosted PostgreSQL.
- The application uses standard PostgreSQL through the backend data-access layer. Do not require Supabase Auth, Supabase Storage, `supabase-js`, or provider-specific database APIs for core donation behavior.
- Google Sheets may be used for optional reports/exports only. It is not a donation/payment system of record.

## Neon setup

1. Create a Neon project and database/branch for the environment. Use separate development and production environments where practical.
2. In Neon Console, open **Connect** and select the right project/branch, database and role.
3. Store the pooled connection string as backend `DATABASE_URL` for application runtime.
4. Store the direct/unpooled connection string as backend `DIRECT_URL` for migrations and administrative tools, where supported by the chosen ORM.
5. Keep both values in an ignored local `.env` file or deployment secret manager. Never place either in `VITE_*`, frontend code, Git, issue text or screenshots.
6. Pin the chosen Prisma ORM major version and follow its current official Neon guide. Prisma configuration differs by major version. Use the driver adapter and connection configuration documented for the selected version; do not mix old and new setup patterns.
7. Run the initial versioned migration from a clean database, then verify tables, constraints and indexes. Use only synthetic test donations in development.

## Suggested environment placeholders

```dotenv
# Backend only. Replace locally; do not commit secrets.
DATABASE_URL=""
DIRECT_URL=""
```

The project should validate these variables on backend startup, fail clearly when missing, and never echo the full URL in logs. Do not add an actual Neon hostname or password to this file.

## How this repo is wired (Prisma ORM 7.10, pinned — ADR 0006)

| Piece | Where | Notes |
| --- | --- | --- |
| Schema | `apps/api/prisma/schema.prisma` | Standard PostgreSQL types only; enums mirror `packages/contracts` (a unit test fails on drift) |
| Migrations | `apps/api/prisma/migrations/` | Versioned SQL. Extra `CHECK` constraints and the append-only audit-log trigger are in the SQL |
| Config | `apps/api/prisma.config.ts` | Migrations use `DIRECT_URL` (Neon: direct/unpooled) |
| Runtime client | `apps/api/src/db/client.ts` | `PrismaClient` + `@prisma/adapter-pg` (standard `pg` driver) on `DATABASE_URL` (Neon: pooled) |
| Repositories | `apps/api/src/db/repositories/` | The only code that queries tables. Feature modules get a repository, never a client |
| Generated client | `apps/api/src/generated/prisma/` | Not committed; `prisma generate` runs on `pnpm install` |
| Seed | `apps/api/src/db/seed.ts` | Synthetic, inactive `[SYNTHETIC]` programmes + default settings only; refuses `NODE_ENV=production` |

Commands (from `apps/api`):

```bash
pnpm db:migrate:dev --name <change>   # create a migration on a local dev database
pnpm db:migrate:deploy                # apply committed migrations (CI, staging, production)
pnpm db:migrate:status
pnpm db:seed                          # synthetic data, development only
```

`DATABASE_URL` is required when `NODE_ENV=production`; the API refuses to start without it and reports
only the variable name, never the URL.

### Run the database tests

The suite **drops and recreates the `public` schema**, then applies every migration from empty. It only
accepts a local/CI host (`localhost`, `127.0.0.1` or `postgres`) — never point it at Neon or Supabase.

```bash
docker run -d --name tot-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm --filter @theonetrust/api test:db
```

CI runs the same suite on a plain `postgres:16` service, plus a schema-vs-migration drift check and a
repeatable seed run (`.github/workflows/ci.yml` → `database` job).

## Tested migration on an empty Supabase database

Evidence to record here when it is run (needs a Supabase project — owner/client action):

1. Create a new, empty Supabase project. Copy the **direct** connection string (or the **session-mode**
   pooler, port 5432, if the network cannot reach the direct host). Not the transaction pooler (6543).
2. From `apps/api`: `DIRECT_URL='<supabase url>' pnpm db:migrate:deploy` → expect `1 migration found … applied`.
3. `DIRECT_URL='<supabase url>' pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
   → expect `No difference detected`.
4. `DATABASE_URL='<supabase url>' NODE_ENV=development pnpm db:seed` → expect success.
5. Delete the test project (or keep it as the fallback environment). Record the date, PostgreSQL version
   and results below.

| Date | Provider / PG version | Migrate | Drift | Seed | By |
| --- | --- | --- | --- | --- | --- |
| 2026-11-03 | Plain PostgreSQL 16 (local + CI service) | ✔ | ✔ none | ✔ | team |
| _pending_ | Supabase (empty project) | | | | |

The migration uses only standard PostgreSQL (`uuid` type, enums, `CHECK`, `plpgsql` trigger), all
available on Supabase and Neon without extensions.

## Switch to Supabase during development

For a database containing only disposable synthetic data:

1. Create a Supabase project and retrieve the PostgreSQL connection details from the dashboard's Connect panel.
2. Select direct connection if the backend host/network can reach it. If not, use the Supabase session-mode pooler supported by the selected ORM/migration tool. Avoid the transaction-mode pooler for schema migrations unless the selected tool explicitly documents support.
3. Apply the same committed schema migrations to the new database. If the data matters, use a database backup/restore instead of recreating only the schema.
4. Replace backend `DATABASE_URL` and `DIRECT_URL` in the local/deployment secret store, restart/redeploy the API, and run API/integration/E2E tests.
5. Verify counts, unique constraints, payment/receipt links, owner auth, dashboard filters, exports and a Razorpay sandbox payment flow.
6. Retain the original Neon database until verification is complete.

## Switch after accepting real donations

This is a controlled data migration, not a URL-only change:

1. Obtain owner approval and schedule a low-traffic maintenance window. Document a rollback decision point.
2. Check the latest migrations and take a restorable source backup using a direct/unpooled connection. Store the backup securely.
3. Pause new donation intents. Keep webhook events retryable during the cutover; never return success for an event that has not been durably recorded. Reconcile recent and pending Razorpay orders before reopening donations.
4. Restore data and apply any missing migrations on the destination. Do not allow the old and new databases to accept simultaneous writes.
5. Validate row counts and foreign keys; uniqueness of provider payment/order IDs and receipt numbers; donation totals; refund states; owner access; dashboard reports; and audit history.
6. Change the backend secrets and deploy. Run a smoke-test suite and a Razorpay sandbox test. Then reconcile pending/recent live orders against trusted provider status.
7. Keep the Neon source intact and read-only through the agreed rollback period. Document what to do if the new database has accepted writes; do not blindly point the app back to the old database and lose those writes.

## Portability rules

- Use PostgreSQL-standard data types, constraints, transactions and SQL; version every schema change.
- Keep all database calls behind backend repositories/services and one initialized DB client.
- Keep business logic out of database-vendor webhooks, auth SDKs and storage SDKs.
- Do not use Neon-specific APIs in donation business logic. Use Neon branching only as an optional environment workflow, not as an application requirement.
- Avoid relying on Supabase-specific RLS policies for authorization unless the team consciously adopts and tests that model on the server. The API must enforce authorization either way.
- Maintain tests for migrations from an empty database and for repositories/services against the configured PostgreSQL database.

## Official docs to verify before implementation

- Neon connection: https://neon.com/docs/get-started/connect-neon
- Neon + Prisma: https://neon.com/docs/guides/prisma
- Supabase PostgreSQL connection modes: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase Neon migration guide: https://supabase.com/docs/guides/platform/migrating-to-supabase/neon

Vendor connection modes, free-plan quotas and ORM configuration can change. Check current official docs when implementing; do not hard-code free-tier limits into application logic.
