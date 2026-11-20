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

## Still open

- Result 4: Supavisor transaction pooler, role-level `search_path`, an interactive transaction,
  and `nextval('receipt_number_seq')` — after Phase 2b.
