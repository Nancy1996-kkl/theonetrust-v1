import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  ProgrammesResponse,
  SiteContentResponse,
  TransparencyDocumentsResponse,
} from '@theonetrust/contracts';
import { AppError } from '../../http/errors.ts';
import { parseInput } from '../../http/validation.ts';
import { byLanguage, toDocument, toMetric, toProgramme, toSiteContent } from './mapping.ts';
import type { PublicContentRepository } from './repository.ts';

const LocaleQuery = z.object({ locale: z.enum(['ta', 'en']).default('en') });

export interface PublicContentRouteOptions {
  repo?: PublicContentRepository;
  cacheSeconds: number;
  documentsBaseUrl?: string;
}

/**
 * `/api/v1/public/*` — what the landing page reads. Cacheable for a few minutes (content changes
 * rarely), with a weak ETag so unchanged content answers 304.
 */
export async function publicContentRoutes(app: FastifyInstance, opts: PublicContentRouteOptions) {
  function repo(): PublicContentRepository {
    if (!opts.repo) throw new AppError('SERVICE_UNAVAILABLE');
    return opts.repo;
  }

  function cached<T>(request: FastifyRequest, reply: FastifyReply, body: T): T | FastifyReply {
    const etag = `W/"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
    reply.header(
      'cache-control',
      `public, max-age=${opts.cacheSeconds}, stale-while-revalidate=${opts.cacheSeconds * 2}`,
    );
    reply.header('etag', etag);
    reply.header('vary', 'Origin, Accept-Encoding');
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).send();
    }
    return body;
  }

  app.get('/site-content', async (request, reply) => {
    const { locale } = parseInput(LocaleQuery, request.query);
    const [sections, metrics] = await Promise.all([
      repo().publishedSections(locale),
      repo().publishedMetrics(),
    ]);
    const body: SiteContentResponse = {
      locale,
      ...toSiteContent(sections),
      impactMetrics: metrics.flatMap((m) => toMetric(m, locale) ?? []),
    };
    return cached(request, reply, body);
  });

  app.get('/programmes', async (request, reply) => {
    const { locale } = parseInput(LocaleQuery, request.query);
    const rows = await repo().activeProgrammes();
    const body: ProgrammesResponse = {
      locale,
      programmes: rows.map((r) => toProgramme(r, locale)),
    };
    return cached(request, reply, body);
  });

  app.get('/transparency-documents', async (request, reply) => {
    const { locale } = parseInput(LocaleQuery, request.query);
    const rows = await repo().publishedDocuments();
    const documents = rows
      .flatMap((r) => toDocument(r, opts.documentsBaseUrl) ?? [])
      .sort(byLanguage(locale));
    const body: TransparencyDocumentsResponse = { locale, documents };
    return cached(request, reply, body);
  });
}
