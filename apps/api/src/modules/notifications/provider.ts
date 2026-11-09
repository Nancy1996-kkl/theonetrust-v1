/**
 * Email provider adapter (#30). One small interface so Resend and Brevo (or a later provider)
 * are interchangeable, selected by EMAIL_PROVIDER. The API key never leaves this module and is
 * never logged; errors carry a short code only, never the provider's response body.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** The outbox row ID: lets a provider that supports it drop an accidental re-send. */
  idempotencyKey: string;
}

export class EmailSendError extends Error {
  /** `permanent`: retrying cannot help (rejected address, bad request, auth). */
  constructor(
    readonly code: string,
    readonly permanent: boolean,
  ) {
    super(`email send failed: ${code}`);
    this.name = 'EmailSendError';
  }
}

export interface EmailProvider {
  name: 'resend' | 'brevo';
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

interface ProviderConfig {
  apiKey: string;
  from: string;
  /** Replies from donors go here (e.g. the trust's Gmail). */
  replyTo?: string;
  fetch?: FetchImpl;
  timeoutMs?: number;
}

/** "Name <addr>" or "addr" → parts. */
export function parseSender(from: string): { name: string | null; email: string } {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(from);
  return match
    ? { name: match[1]?.trim() || null, email: match[2] ?? '' }
    : { name: null, email: from };
}

async function post(
  fetchImpl: FetchImpl,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new EmailSendError('network', false);
  }
  if (res.ok) return ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  // 429 and 5xx are worth retrying; other 4xx mean the request itself is wrong.
  const retryable = res.status === 429 || res.status >= 500;
  throw new EmailSendError(`http_${res.status}`, !retryable);
}

export function resendProvider(config: ProviderConfig): EmailProvider {
  const fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
  return {
    name: 'resend',
    async send(message) {
      const body = await post(
        fetchImpl,
        'https://api.resend.com/emails',
        { authorization: `Bearer ${config.apiKey}`, 'idempotency-key': message.idempotencyKey },
        {
          from: config.from,
          to: [message.to],
          ...(config.replyTo && { reply_to: config.replyTo }),
          subject: message.subject,
          text: message.text,
          html: message.html,
        },
        config.timeoutMs ?? 10_000,
      );
      return { id: typeof body.id === 'string' ? body.id : null };
    },
  };
}

export function brevoProvider(config: ProviderConfig): EmailProvider {
  const fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
  const sender = parseSender(config.from);
  return {
    name: 'brevo',
    async send(message) {
      const body = await post(
        fetchImpl,
        'https://api.brevo.com/v3/smtp/email',
        { 'api-key': config.apiKey },
        {
          sender: sender.name
            ? { name: sender.name, email: sender.email }
            : { email: sender.email },
          to: [{ email: message.to }],
          ...(config.replyTo && { replyTo: { email: config.replyTo } }),
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
          headers: { 'X-Idempotency-Key': message.idempotencyKey },
        },
        config.timeoutMs ?? 10_000,
      );
      return { id: typeof body.messageId === 'string' ? body.messageId : null };
    },
  };
}

export function selectEmailProvider(env: {
  EMAIL_PROVIDER: 'none' | 'resend' | 'brevo';
  EMAIL_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
  EMAIL_REPLY_TO?: string | undefined;
}): EmailProvider | undefined {
  if (env.EMAIL_PROVIDER === 'none' || !env.EMAIL_API_KEY || !env.EMAIL_FROM) return undefined;
  const config = {
    apiKey: env.EMAIL_API_KEY,
    from: env.EMAIL_FROM,
    ...(env.EMAIL_REPLY_TO && { replyTo: env.EMAIL_REPLY_TO }),
  };
  return env.EMAIL_PROVIDER === 'resend' ? resendProvider(config) : brevoProvider(config);
}
