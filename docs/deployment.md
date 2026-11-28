# Deployment runbook (#39)

How theonetrust.in goes live and how to roll it back. Everything here is done by the owner or a
developer with the owner's accounts — never from a pull request. Values are placeholders; real
secrets live only in the hosting providers' secret settings.

## 1. Shape

| Part                  | Host                                                                                                           | Notes                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web (`apps/web/dist`) | Static host: Cloudflare Pages or Vercel (website-plan)                                                         | `pnpm build` output. `dist/_headers` carries the CSP and security headers (Cloudflare Pages / Netlify format; on Vercel copy them into `vercel.json`). |
| API (`apps/api`)      | Always-on Node host (22.12 or newer, see `engines`) (no cold starts: payment verification must answer at once) | One instance is enough at launch. Needs a persistent volume for `DOCUMENT_STORAGE_DIR`.                                                                |
| Database              | Neon PostgreSQL, **production branch** (fallback: Supabase PostgreSQL — `docs/database-provider-switch.md`)    | Pooled URL → `DATABASE_URL`, direct URL → `DIRECT_URL`, both `sslmode=require`.                                                                        |
| Email                 | Resend or Brevo                                                                                                | Sender domain verified with SPF, DKIM and DMARC.                                                                                                       |
| Payments              | Cashfree                                                                                                       | Sandbox until the sign-off in `docs/release-checklist.md`. Razorpay is retired (records made with it stay as history).                                 |

## 2. DNS for theonetrust.in

| Record                                 | Purpose                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `theonetrust.in` + `www` → static host | Site; HTTPS certificate issued by the host; `www` redirects to the apex                                 |
| `api.theonetrust.in` → API host        | API; HTTPS only                                                                                         |
| SPF `TXT` on the sender domain         | Value given by the email provider (one SPF record only; merge if one exists)                            |
| DKIM `TXT`/`CNAME`                     | Values given by the email provider                                                                      |
| DMARC `TXT` at `_dmarc`                | Start with `v=DMARC1; p=none; rua=mailto:<owner address>`, move to `p=quarantine` after two clean weeks |

Check with the email provider's "verify domain" button and by sending a test acknowledgement to a
Gmail and an Outlook address (headers show `spf=pass dkim=pass dmarc=pass`).

## 3. Configuration

API environment: every variable in `.env.example` (production values). Then on the API host:

```bash
pnpm --filter @theonetrust/api exec prisma migrate deploy   # uses DIRECT_URL
pnpm --filter @theonetrust/api launch:check                  # ✔/✖ per item, never values
pnpm --filter @theonetrust/api owner:set-password            # first owner account
```

Web build environment: `VITE_API_BASE_URL=https://api.theonetrust.in/api/v1`, `VITE_DONATE_ADAPTER=api`,
`VITE_HELP_ADAPTER=api`. The CSP in `dist/_headers` takes the API origin from this value, so build
with it set. After the build, `pnpm check:bundle` must pass.

## 4. Monitoring

- Uptime monitor on `https://api.theonetrust.in/api/v1/health/ready` (200 only when the database
  answers) every 1–5 minutes, alerting the owner by email/SMS.
- Uptime monitor on `https://theonetrust.in/`.
- Error monitoring: the API logs structured JSON with a correlation ID on every request and an
  `Unhandled error` line for every 500. Send the host's log stream to the host's alerting (or an
  error-monitoring service) and alert on `level >= 50`. Logs never contain secrets, PAN, payment
  signatures or full personal data.
- Payments: `/admin/webhooks` (payment notifications, "needs a look" filter) and `/admin/exceptions`
  in the owner dashboard. Check both daily in the first two weeks.

## 5. Backups and the restore drill

- Neon keeps point-in-time history for the production branch; also take a daily logical backup.
- **Restore drill** (before launch, then every three months), into a new, empty scratch database:

```bash
SOURCE_DATABASE_URL=<production DIRECT_URL> \
RESTORE_DATABASE_URL=<empty scratch database URL> \
node scripts/restore-drill.mjs
```

It dumps, restores, and checks that every table, every row count and the applied migrations match.
Record the date, duration and result in `docs/release-checklist.md`. Delete the scratch database
afterwards. The document folder (`DOCUMENT_STORAGE_DIR`) is backed up with the API host's volume
snapshots and restored the same way.

## 6. Going live with payments (owner, with the developer)

The full go-live list is Phase 7b of `docs/decisions/2026-11-20-cashfree-migration-plan.md`.

1. Cashfree account activated for the trust (KYC); the trust's HTTPS domain whitelisted.
2. In the Cashfree dashboard (production): add the webhook `https://theonetrust.in/api/v1/webhooks/cashfree`
   (API version 2026-01-01) for payment success, failed and user-dropped events and refund events.
   Cashfree signs webhooks with the client secret — there is no separate webhook secret.
3. Put `PAYMENT_PROVIDER=cashfree`, `CASHFREE_ENV=production`, `CASHFREE_CLIENT_ID` and
   `CASHFREE_CLIENT_SECRET` into the API host's secrets; redeploy; `launch:check` must show ✔ for
   `cashfree_live`.
4. Make one small real donation (for example ₹1) from a personal UPI account. Check: the donate panel
   shows success only after verification; `/admin/webhooks` shows `PAYMENT_SUCCESS_WEBHOOK` as
   Handled; the donation is PAID; the acknowledgement email arrives.
5. Refund it from the Cashfree dashboard. Check: `/admin/webhooks` shows the refund event; the
   donation shows the refund; the ledger total is back.
6. Record steps 4–5 in `docs/release-checklist.md`.

## 7. Rollback

- **Web**: promote the previous deployment in the static host (one click); nothing else changes.
- **API**: redeploy the previous release. Migrations are additive (new tables/columns/CHECKs), so the
  previous API runs on the newer schema. Never roll a migration back on production data without a
  restore plan.
- **Payments**: to stop new donations at once, set `PAYMENT_PROVIDER=none` and redeploy, so no new
  order can be created. Keep the Cashfree keys so payments already in flight are still recorded
  (webhooks and the daily re-check need them).
- **Database**: restore from Neon point-in-time history into a new branch, verify with the drill
  script, then point `DATABASE_URL`/`DIRECT_URL` at it (`docs/database-provider-switch.md` for the
  cut-over steps).
