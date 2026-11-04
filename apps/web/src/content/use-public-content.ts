import { useEffect, useMemo, useState } from 'react';
import type { UiLang } from '../components/ui/ui-strings.ts';
import type { SectionState } from '../routes/home/ProofSections.tsx';
import { LANDING_CONTENT, type LandingContent } from './landing.ts';
import { mergeLanding, mergeProof } from './merge-public.ts';
import { PROOF_CONTENT, type ProofContent } from './proof.ts';
import { fetchPublicContent, type PublicContentData } from './public-api.ts';

export type ContentSource = 'api' | 'bundled';

/**
 * `VITE_CONTENT_SOURCE=api` on the live site reads published content from the API (#21).
 * `bundled` (default: local development without an API, tests and e2e) uses only the
 * confirmed content shipped with the page.
 */
export function contentSource(
  env: { VITE_CONTENT_SOURCE?: string } = import.meta.env,
): ContentSource {
  return env.VITE_CONTENT_SOURCE === 'api' ? 'api' : 'bundled';
}

export interface PublicContentState {
  content: LandingContent;
  proof: ProofContent;
  states: { impact: SectionState; transparency: SectionState };
}

type Load =
  | { status: 'loading'; lang: UiLang }
  | { status: 'error'; lang: UiLang }
  | { status: 'ready'; lang: UiLang; data: PublicContentData };

export function usePublicContent(
  lang: UiLang,
  source: ContentSource = contentSource(),
  fetchImpl?: typeof fetch,
): PublicContentState {
  const [load, setLoad] = useState<Load>({ status: 'loading', lang });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (source !== 'api') return;
    let cancelled = false;
    fetchPublicContent(import.meta.env.VITE_API_BASE_URL, lang, fetchImpl)
      .then((data) => !cancelled && setLoad({ status: 'ready', lang, data }))
      .catch(() => !cancelled && setLoad({ status: 'error', lang }));
    return () => {
      cancelled = true;
    };
  }, [source, lang, attempt, fetchImpl]);

  return useMemo(() => {
    const ready: SectionState = { status: 'ready' };
    if (source !== 'api') {
      return {
        content: LANDING_CONTENT,
        proof: PROOF_CONTENT,
        states: { impact: ready, transparency: ready },
      };
    }
    // A response for the other language (after a switch) counts as still loading.
    const current = load.lang === lang ? load : { status: 'loading' as const, lang };
    if (current.status === 'ready') {
      return {
        content: mergeLanding(LANDING_CONTENT, current.data),
        proof: mergeProof(PROOF_CONTENT, current.data, lang),
        states: { impact: ready, transparency: ready },
      };
    }
    const pending: SectionState =
      current.status === 'error'
        ? {
            status: 'error',
            retry: () => {
              setLoad({ status: 'loading', lang });
              setAttempt((n) => n + 1);
            },
          }
        : { status: 'loading' };
    // Until the API answers, only confirmed bundled content shows; impact and documents wait.
    return {
      content: LANDING_CONTENT,
      proof: PROOF_CONTENT,
      states: { impact: pending, transparency: pending },
    };
  }, [source, load, lang]);
}
