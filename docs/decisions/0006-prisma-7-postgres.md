# ADR 0006 — Prisma ORM 7 with the standard `pg` driver adapter

- **Date**: 2026-11-03
- **Status**: Accepted
- **Issue**: #18

## Decision

- **Prisma ORM 7.10.1** (`prisma`, `@prisma/client`, `@prisma/adapter-pg`), exact pins. Prisma 8 is
  still a release candidate; re-evaluate when it is stable.
- `prisma-client` generator (ESM, TypeScript output in `apps/api/src/generated/prisma`, not committed).
- Runtime: `@prisma/adapter-pg` over `pg` 8.23 on `DATABASE_URL` (Neon pooled). Not the Neon serverless
  adapter: the API is a long-running Node server, and the standard driver keeps Supabase and plain
  PostgreSQL identical.
- Migrations: `prisma migrate` on `DIRECT_URL` (Neon direct/unpooled), configured in `prisma.config.ts`.
- Rules Prisma cannot express (money `CHECK`s, evidence rules, singleton settings, append-only audit
  log trigger) are hand-written SQL in the migration and covered by the database test suite.
- `prisma` and `@prisma/engines` are added to `onlyBuiltDependencies` (they fetch the schema engine).

## Consequences

- Every schema change is a reviewed migration; CI applies all migrations to an empty PostgreSQL 16 and
  fails on schema/migration drift.
- Domain code uses repositories in `src/db/repositories`; no Neon or Supabase SDK anywhere.
- Do not copy Prisma 5/6 examples (`url = env(...)` in `schema.prisma`, `prisma-client-js`).
