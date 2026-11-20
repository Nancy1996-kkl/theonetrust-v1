# Vercel serverless spike (Phase 2a) — 2026-11-20

Throw-away branch `spike/phase2a-serverless`, deployed only to the **preview** project
`theonetrust-revamp-preview` (never production, never merged). The spike had no secrets and no
database: a fixed development environment, plus a temporary diagnostic route.

## Set-up tested

- `api/[...path].mjs` (repo root) re-exports `apps/api/dist/serverless.mjs`.
- The bundle is built by esbuild during the Vercel build command; the same externals are used as
  for `dist/server.js`.
- `vercel.json` rewrites `/api/:path*` to `/api/[...path]`, placed **before** the SPA rewrites.

## Results (observed on the preview)

| #   | Question                                                                  | Result                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Does a catch-all function under `api/` receive the original path?         | **Yes.** `/api/v1/health` → 200; an unknown path → the API's own 404 JSON; the static site (`/`, `/privacy`) still → 200. **But** Vercel appends the matched segments as a query parameter: `/api/v1/__spike?path=v1%2F__spike`. The entry point strips `path=` (see below).                               |
| 2   | Does the raw body reach Fastify byte for byte?                            | **Yes.** A 17-byte JSON body with irregular spacing had the identical SHA-256 inside Fastify. No `NODEJS_HELPERS=0` was needed, because Fastify reads the stream itself.                                                                                                                                   |
| 3   | Is `@node-rs/argon2`'s Linux binary traced into the function?             | **Yes.** `hash` + `verify` succeeded inside the function.                                                                                                                                                                                                                                                  |
| 4   | Prisma 7 + `adapter-pg` through the Supabase transaction pooler           | **Not tested yet:** this needs the `theonetrust_app` role and password (Phase 2b, run by the owner). It will be tested on a preview once 2b is done.                                                                                                                                                       |
| 5   | Client IP (for rate limits and audit rows) — extra check, not in the plan | The socket is **loopback**. `x-forwarded-for`, `x-real-ip` and `x-vercel-forwarded-for` all carry the **same single** client IP. Values a client sends in those headers are **overwritten** by Vercel (tested with spoofed values). The digits were masked in the spike output, so no IP was ever printed. |
| —   | Runtime                                                                   | The function ran on Node v26 (the project default); the bundle targets Node 22 and runs unchanged.                                                                                                                                                                                                         |

## Decisions taken from these results

- **Catch-all parameter.** `stripCatchAllParam` removes Vercel's `path=` before Fastify routes
  the request. Strict query schemas would otherwise refuse it. No route uses a `path` query.
- **Client IP: no new code.** In production the API trusts only local proxies (the
  `TRUST_PROXY` default `loopback, linklocal, uniquelocal`). Vercel connects from loopback with a
  sanitised one-entry `x-forwarded-for`, so `request.ip` is the real visitor. This is locked by
  `serverless.test.ts`. The plan's `client-ip.ts` is not needed.
- **`NODEJS_HELPERS=0` is not needed** (result 2).
- **Region.** Functions are pinned to `bom1` (Mumbai), next to the Supabase project
  (`ap-south-1`).

## Production gate (from the 2a security review)

Do **not** give the production Vercel project a `DATABASE_URL`, `AUTH_SECRET_KEY` or gateway keys
until both of these are merged:

- **Phase 2c (shared rate limits).** Today each serverless instance keeps its own in-memory
  counters, which reset on every cold start. Sign-in, donation and receipt limits would then be per
  instance, not global.
- **Phase 2d (jobs/cron).** The outbox timer of `server.ts` does not run on serverless, so emails
  and Google Sheet rows would stay queued.

Until then `/api` answers 503, which is safe: the live site does not call it.

## Also from the review (fixed in 2a)

- A failure while building the app (for example an unusable `TRUST_PROXY` value) answers 503 and
  is retried on the next request, instead of failing the instance for its whole life.
- The site's security headers in `vercel.json` now skip `/api/*`. The API sets its own, stricter
  headers in `apps/api/src/http/security.ts`.

## Phase 2b rehearsal finding: Prisma ignores the role's schema (fixed)

Rehearsed on a local mirror of the Supabase project (same roles, ownership and RLS, plus
stand-in "cafe" tables in `public`). Prisma writes the schema into every statement
(`"public"."programmes"`). The database role's `search_path` does **not** change that, and the
driver ignores a `?schema=` in the URL. On the shared project, the app's queries would have been
aimed at the **cafe's `public` schema**. They were refused only because the role has no rights
there.

**Fix:** `DATABASE_SCHEMA` → `PrismaPg(..., { schema })`. Queries then read
`"theonetrust"."programmes"`. The setting is required in production. `nextval('receipt_number_seq')`
is unqualified and resolves through the role's `search_path`; this was rehearsed. Through the
Supabase transaction pooler it is still to be confirmed after 2b.

## Still open

- Result 4: Supavisor transaction pooler, role-level `search_path`, an interactive transaction,
  and `nextval('receipt_number_seq')` — after Phase 2b.
