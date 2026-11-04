import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RECEIPT_TOKEN_PATTERN, type ReceiptView } from '@theonetrust/contracts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { renderReceiptPdf } from './pdf.ts';
import { receiptViewByToken } from './view.ts';

const TokenParams = z.object({ token: z.string().regex(RECEIPT_TOKEN_PATTERN) });
const PdfQuery = z.object({ lang: z.enum(['en', 'ta']).default('en') });

export interface ReceiptRouteOptions {
  db?: Db;
  /** HMAC key for share tokens; without it (or the database) the routes answer 503. */
  key?: Buffer;
  /** Public site origin for the verification QR, e.g. https://theonetrust.in */
  siteUrl: string;
  perHour: number;
}

/** A private link: never cached, never indexed, never sent on as a referrer. */
function privateHeaders(reply: FastifyReply) {
  reply
    .header('cache-control', 'no-store')
    .header('x-robots-tag', 'noindex, nofollow')
    .header('referrer-policy', 'no-referrer');
}

export function verifyUrl(siteUrl: string, token: string, lang: 'en' | 'ta'): string {
  return `${siteUrl.replace(/\/$/, '')}${lang === 'ta' ? '/ta' : ''}/receipt/${token}`;
}

/**
 * `GET /api/v1/receipts/:token` (the acknowledgement page's data) and
 * `GET /api/v1/receipts/:token/pdf?lang=` (PDF on demand). Same 404 for a malformed, unknown or
 * guessed token, so nothing can be enumerated.
 */
export async function receiptRoutes(app: FastifyInstance, opts: ReceiptRouteOptions) {
  const limit = { rateLimit: { max: opts.perHour, timeWindow: 3_600_000 } };

  async function load(params: unknown): Promise<{ view: ReceiptView; token: string }> {
    if (!opts.db || !opts.key) throw new AppError('SERVICE_UNAVAILABLE');
    const parsed = TokenParams.safeParse(params);
    if (!parsed.success) throw new AppError('NOT_FOUND');
    const view = await receiptViewByToken(opts.db, parsed.data.token, opts.key);
    if (!view) throw new AppError('NOT_FOUND');
    return { view, token: parsed.data.token };
  }

  app.get('/:token', { config: limit }, async (request, reply) => {
    privateHeaders(reply);
    return (await load(request.params)).view;
  });

  app.get('/:token/pdf', { config: limit }, async (request, reply) => {
    privateHeaders(reply);
    const { lang } = parseInput(PdfQuery, request.query);
    const { view, token } = await load(request.params);
    const pdf = await renderReceiptPdf(view, lang, verifyUrl(opts.siteUrl, token, lang));
    return reply
      .type('application/pdf')
      .header(
        'content-disposition',
        `attachment; filename="acknowledgement-${view.receiptNumber}.pdf"`,
      )
      .send(pdf);
  });
}
