import type { Env } from '../config/env.ts';

/**
 * Launch readiness of the API's production configuration (#39). Reports names and yes/no only —
 * never a secret value. Used by `pnpm --filter @theonetrust/api launch:check` on the production
 * host before switching on live payments, and recorded in docs/release-checklist.md.
 */
export interface Check {
  id: string;
  ok: boolean;
  detail: string;
}

const https = (u: string | undefined) => Boolean(u && u.startsWith('https://'));

export function launchReadiness(env: Env): Check[] {
  const keyId = env.RAZORPAY_KEY_ID ?? '';
  return [
    { id: 'production', ok: env.NODE_ENV === 'production', detail: 'NODE_ENV=production' },
    {
      id: 'database',
      ok: Boolean(env.DATABASE_URL && env.DIRECT_URL),
      detail: 'DATABASE_URL (pooled) and DIRECT_URL (migrations, backups) set',
    },
    {
      id: 'database_tls',
      ok: /[?&]sslmode=(require|verify-full|verify-ca)\b/.test(env.DATABASE_URL ?? ''),
      detail: 'DATABASE_URL uses sslmode=require (or stricter)',
    },
    { id: 'auth_key', ok: Boolean(env.AUTH_SECRET_KEY), detail: 'AUTH_SECRET_KEY set' },
    {
      id: 'razorpay_live',
      ok: keyId.startsWith('rzp_live_') && Boolean(env.RAZORPAY_KEY_SECRET),
      detail: 'live Razorpay key ID and key secret set (switch only after the test-mode sign-off)',
    },
    {
      id: 'razorpay_webhook',
      ok: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
      detail: 'RAZORPAY_WEBHOOK_SECRET set (same value as the live webhook in the dashboard)',
    },
    {
      id: 'site_https',
      ok: https(env.PUBLIC_SITE_URL) && env.CORS_ORIGINS.every((o) => o.startsWith('https://')),
      detail: 'PUBLIC_SITE_URL and every CORS origin are https://',
    },
    {
      id: 'email',
      ok: env.EMAIL_PROVIDER !== 'none' && Boolean(env.EMAIL_API_KEY && env.EMAIL_FROM),
      detail:
        'email provider, API key and sender set (SPF/DKIM/DMARC verified for the sender domain)',
    },
    {
      id: 'owner_email',
      ok: Boolean(env.OWNER_NOTIFICATION_EMAIL),
      detail: 'OWNER_NOTIFICATION_EMAIL set (or saved in dashboard settings)',
    },
    {
      id: 'documents',
      ok: Boolean(env.DOCUMENT_STORAGE_DIR) && https(env.PUBLIC_DOCUMENTS_BASE_URL),
      detail:
        'DOCUMENT_STORAGE_DIR (persistent, backed-up volume) and https PUBLIC_DOCUMENTS_BASE_URL',
    },
    {
      id: 'trust_proxy',
      ok: env.TRUST_PROXY !== 'none',
      detail: `TRUST_PROXY matches the host's proxy (now: ${env.TRUST_PROXY})`,
    },
  ];
}

export function formatReport(checks: Check[]): string {
  const lines = checks.map((c) => `${c.ok ? '✔' : '✖'} ${c.id.padEnd(17)} ${c.detail}`);
  const failed = checks.filter((c) => !c.ok).length;
  lines.push(failed ? `\n${failed} item(s) not ready.` : '\nReady.');
  return lines.join('\n');
}
