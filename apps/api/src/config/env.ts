import { z } from 'zod';

/**
 * Backend environment contract. Validated once at startup; the app fails fast
 * with a list of variable NAMES (never values) when something is wrong.
 * Feature modules must read config from here, never from process.env.
 */
/** Empty strings (e.g. `DATABASE_URL=` copied from .env.example) count as "not set". */
const optionalPostgresUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .regex(/^postgres(ql)?:\/\/[^\s]+$/)
    .optional(),
);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).min(1)),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /**
     * Addresses of the reverse proxy in front of the API in production (#38), comma-separated
     * IPs/CIDRs or proxy-addr names. Only a request arriving FROM one of these may set the client
     * IP via X-Forwarded-For, so a direct caller cannot invent its own IP to dodge rate limits.
     * Default: private and loopback networks (a platform load balancer). 'none' = trust nobody.
     */
    TRUST_PROXY: z
      .string()
      .regex(/^[\w.:/, -]+$/)
      .default('loopback, linklocal, uniquelocal'),
    /** Requests allowed per client IP per window, across all routes (routes may set stricter limits). */
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    /** Largest accepted request body. Forms and webhooks are small; uploads are not handled here. */
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
    /** Runtime connection (Neon: pooled). Required in production; optional while no route needs it. */
    DATABASE_URL: optionalPostgresUrl,
    /** Migrations/admin tools only (Neon: direct/unpooled). Read by prisma.config.ts, not the app. */
    DIRECT_URL: optionalPostgresUrl,
    /**
     * 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts authenticator secrets and
     * signs CSRF tokens. Required in production; without it, sign-in answers 503.
     */
    AUTH_SECRET_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z0-9+/]{43}=$/)
        .optional(),
    ),
    /** Signed-in session ends after this much inactivity… */
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
    /** …and always after this long, active or not. */
    SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(24).default(12),
    /** Wrong passwords or codes in a row before the account is locked. */
    LOGIN_MAX_FAILURES: z.coerce.number().int().min(3).max(20).default(5),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    /**
     * Razorpay API keys — backend only, never VITE_*. Test keys (rzp_test_) until launch (#39):
     * outside production a live key is refused. Without keys, donations answer 503.
     */
    RAZORPAY_KEY_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/)
        .optional(),
    ),
    RAZORPAY_KEY_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(16).max(128).optional(),
    ),
    /** Secret set on the Razorpay webhook (Dashboard → Webhooks). Without it, webhooks answer 503. */
    RAZORPAY_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(16).max(256).optional(),
    ),
    /** Donation intents allowed per IP per hour. */
    DONATION_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(500).default(20),
    /** Get Help submissions allowed per IP per hour (plan §5 anti-spam). */
    HELP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(100).default(5),
    /** A repeat from the same phone within this window returns the first reference. */
    HELP_DUPLICATE_WINDOW_MINUTES: z.coerce.number().int().min(0).max(1440).default(10),
    /**
     * Where the owner is notified of new help requests. Until it is set, no notification is
     * queued (the requests are still saved and visible in the dashboard).
     */
    OWNER_NOTIFICATION_EMAIL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.email().optional(),
    ),
    /** Browser/CDN cache lifetime for public content responses. */
    PUBLIC_CACHE_SECONDS: z.coerce.number().int().min(0).max(86_400).default(300),
    /**
     * Private folder for uploaded transparency documents (#36), outside the web root. Unset =
     * uploads are switched off. Published files are served only through the API.
     */
    DOCUMENT_STORAGE_DIR: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    /** Largest transparency document accepted (default 10 MB). */
    DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(20_971_520).default(10_485_760),
    /**
     * Public base URL of approved transparency files. With the built-in storage (#36) this is
     * `<api origin>/api/v1/documents`. Without it the
     * documents endpoint returns an empty list — never a link that does not work.
     */
    PUBLIC_DOCUMENTS_BASE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url({ protocol: /^https?$/ }).optional(),
    ),
    /**
     * Public site origin used in acknowledgement links and the PDF verification QR (#29).
     * Defaults to the first CORS origin.
     */
    PUBLIC_SITE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url({ protocol: /^https?$/ }).optional(),
    ),
    /** Acknowledgement page + PDF requests per IP per hour. */
    RECEIPT_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(60),
    /**
     * Email provider for the notification outbox (#30): `resend`, `brevo` or `none`. With `none`
     * notifications stay queued (visible in the dashboard) and nothing is sent.
     */
    EMAIL_PROVIDER: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['none', 'resend', 'brevo']).default('none'),
    ),
    /** Provider API key — backend only, never VITE_*. Required unless EMAIL_PROVIDER=none. */
    EMAIL_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(16).max(256).optional(),
    ),
    /** Verified sender, e.g. `Theonetrust.in <no-reply@theonetrust.in>` [CONFIRM domain]. */
    EMAIL_FROM: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .max(200)
        .regex(
          /^(?:[^<>@\r\n]{1,80} <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/,
        )
        .optional(),
    ),
    /**
     * Monthly giving (#32). Off until the trust confirms Razorpay Subscriptions and UPI AutoPay
     * are enabled on its account [CONFIRM].
     */
    RAZORPAY_SUBSCRIPTIONS_ENABLED: z
      .enum(['true', 'false', ''])
      .default('false')
      .transform((v) => v === 'true'),
    /**
     * One-time UPI QR inside the donate pop-up (client, Nov 2026). Needs Razorpay "QR Codes"
     * switched on for the account [CONFIRM]; off by default. Test-mode QRs cannot be scanned.
     */
    RAZORPAY_QR_ENABLED: z
      .enum(['true', 'false', ''])
      .default('false')
      .transform((v) => v === 'true'),
    /** Largest QR payment (paise). Client: ₹2,000. */
    DONATION_QR_MAX_PAISE: z.coerce.number().int().min(100).max(10_000_000).default(200_000),
    /** How long a QR accepts payment (Razorpay allows 2 minutes to 2 hours). */
    DONATION_QR_EXPIRY_MINUTES: z.coerce.number().int().min(3).max(120).default(15),
    /** A checkout payment still unsettled after this many minutes is listed for the owner (#31). */
    ADMIN_STALE_PENDING_MINUTES: z.coerce.number().int().min(5).max(10_080).default(30),
    /** Where donors' replies to the thank-you email go, e.g. the trust's Gmail. Optional. */
    EMAIL_REPLY_TO: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .max(200)
        .regex(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/)
        .optional(),
    ),
    /**
     * Google Sheet of paid donations (client, Nov 2026). Set all three or none. The sheet is
     * shared (Editor) with the service account email; rows are added by the outbox worker.
     */
    GOOGLE_SHEETS_SPREADSHEET_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z0-9_-]{20,100}$/)
        .optional(),
    ),
    /** The tab the rows go to (it must exist). */
    GOOGLE_SHEETS_TAB: z
      .string()
      .regex(/^[^'!\r\n]{1,100}$/)
      .default('Donations'),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/)
        .optional(),
    ),
    /** The service account's private key (PEM). "\n" escapes are accepted. Backend only. */
    GOOGLE_SERVICE_ACCOUNT_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .transform((v) => v.replace(/\\n/g, '\n'))
        .refine((v) => /-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(v), {
          message: 'must be a PEM private key',
        })
        .optional(),
    ),
    /** How often the outbox worker looks for due emails. */
    EMAIL_WORKER_INTERVAL_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(30_000),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.RAZORPAY_KEY_ID) !== Boolean(env.RAZORPAY_KEY_SECRET)) {
      const missing = env.RAZORPAY_KEY_ID ? 'RAZORPAY_KEY_SECRET' : 'RAZORPAY_KEY_ID';
      ctx.addIssue({
        code: 'custom',
        path: [missing],
        message: 'set both Razorpay keys or neither',
      });
    }
    if (env.NODE_ENV !== 'production' && env.RAZORPAY_KEY_ID?.startsWith('rzp_live_')) {
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: 'live key outside production',
      });
    }
    if (env.EMAIL_PROVIDER !== 'none') {
      for (const key of ['EMAIL_API_KEY', 'EMAIL_FROM'] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `required for ${env.EMAIL_PROVIDER}`,
          });
      }
    }
    const sheet = [
      'GOOGLE_SHEETS_SPREADSHEET_ID',
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      'GOOGLE_SERVICE_ACCOUNT_KEY',
    ] as const;
    if (sheet.some((k) => env[k]) && !sheet.every((k) => env[k])) {
      for (const key of sheet) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'set all Google Sheet values' });
      }
    }
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['DATABASE_URL', 'AUTH_SECRET_KEY'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export class EnvValidationError extends Error {
  readonly invalidKeys: string[];

  constructor(invalidKeys: string[]) {
    super(`Invalid or missing environment variables: ${invalidKeys.join(', ')}`);
    this.name = 'EnvValidationError';
    this.invalidKeys = invalidKeys;
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvValidationError(keys);
  }
  return result.data;
}
