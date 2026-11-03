# ADR 0001 — Toolchain and version pins

- **Date**: 2026-10-30
- **Status**: Accepted
- **Issue**: #2

## Decision

pnpm 10 workspaces (`apps/web`, `apps/api`, `packages/contracts`), Node 22 LTS, exact version pins.

| Tool              | Version    | Why not latest                                                                                     |
| ----------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| TypeScript        | 6.0.x      | `typescript-eslint` 8.x supports TypeScript `< 6.1`; TS 7 (native) would break type-aware linting. |
| ESLint            | 9.39.x     | `eslint-plugin-jsx-a11y` peers stop at ESLint 9; accessibility linting is required.                |
| React / React DOM | 19.3       | latest                                                                                             |
| React Router      | 8.5        | latest (data router: `createBrowserRouter`)                                                        |
| Vite / Vitest     | 8.3 / 5.0  | latest                                                                                             |
| Fastify / Zod     | 5.12 / 4.6 | latest                                                                                             |
| Prisma ORM        | 7.10       | 8.x is a release candidate (ADR 0006)                                                              |
| Playwright        | 1.63       | matches the browsers pre-installed in the cloud sandbox; CI installs its own Chromium              |

Re-evaluate when `typescript-eslint` supports TS 7 and `jsx-a11y` supports ESLint 10 (Dependabot PRs).

## Consequences

- API is bundled with esbuild for production (workspace `contracts` is TypeScript source).
- Install scripts are allow-listed (`onlyBuiltDependencies`) for supply-chain safety.
