import type {
  ProgrammesResponse,
  SiteContentResponse,
  TransparencyDocumentsResponse,
} from '@theonetrust/contracts';
import type { UiLang } from '../components/ui/ui-strings.ts';
import { apiUrl } from '../lib/api-url.ts';

export interface PublicContentData {
  site: SiteContentResponse;
  programmes: ProgrammesResponse;
  documents: TransparencyDocumentsResponse;
}

export class PublicContentError extends Error {
  constructor(readonly status: number | 'network') {
    super(`Public content request failed (${status})`);
    this.name = 'PublicContentError';
  }
}

/** Reads the three public endpoints (#21) for one language. Cookies are never sent. */
export async function fetchPublicContent(
  baseUrl: string | undefined,
  lang: UiLang,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<PublicContentData> {
  async function get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(apiUrl(baseUrl, `${path}?locale=${lang}`), {
        credentials: 'omit',
        headers: { accept: 'application/json' },
      });
    } catch {
      throw new PublicContentError('network');
    }
    if (!res.ok) throw new PublicContentError(res.status);
    return (await res.json()) as T;
  }
  const [site, programmes, documents] = await Promise.all([
    get<SiteContentResponse>('/public/site-content'),
    get<ProgrammesResponse>('/public/programmes'),
    get<TransparencyDocumentsResponse>('/public/transparency-documents'),
  ]);
  return { site, programmes, documents };
}
