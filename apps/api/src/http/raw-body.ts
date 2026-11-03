import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** The exact bytes received. Set only on routes with `config: { rawBody: true }`. */
    rawBody?: Buffer;
  }
  interface FastifyContextConfig {
    /**
     * Keep the unparsed body for this route. Reserved for payment webhooks, whose signature
     * is computed over the exact bytes — re-serialising parsed JSON would break verification.
     */
    rawBody?: boolean;
  }
}

/**
 * Replaces the JSON parser with one that reads bytes first, keeps them when the route asks,
 * then parses with Fastify's own safe parser (prototype-poisoning protection included).
 */
export function registerRawBodyJsonParser(app: FastifyInstance): void {
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const bytes = body as Buffer;
    if (request.routeOptions.config.rawBody) request.rawBody = bytes;
    parseJson(request, bytes.toString('utf8'), done);
  });
}
