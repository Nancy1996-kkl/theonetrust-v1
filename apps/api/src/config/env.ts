import { z } from 'zod';

/**
 * Backend environment contract. Validated once at startup; the app fails fast
 * with a list of variable NAMES (never values) when something is wrong.
 * Feature modules must read config from here, never from process.env.
 */
const EnvSchema = z.object({
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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Requests allowed per client IP per window, across all routes (routes may set stricter limits). */
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  /** Largest accepted request body. Forms and webhooks are small; uploads are not handled here. */
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
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
