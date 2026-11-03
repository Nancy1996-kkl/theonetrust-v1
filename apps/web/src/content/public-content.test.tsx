import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { apiUrl } from '../lib/api-url.ts';
import { LANDING_CONTENT } from './landing.ts';
import { formatMetricValue, mergeLanding, mergeProof } from './merge-public.ts';
import { PROOF_CONTENT } from './proof.ts';
import { PublicContentError, fetchPublicContent, type PublicContentData } from './public-api.ts';
import { contentSource, usePublicContent } from './use-public-content.ts';

const DATA: PublicContentData = {
  site: {
    locale: 'ta',
    texts: {
      'hero.headline': 'வெளியிட்ட தலைப்பு',
      'about.intro': 'அறிமுகம்',
      'final_cta.title': 'இறுதி',
    },
    faqs: [{ id: 'new-one', question: 'கேள்வி?', answer: 'பதில்.' }],
    impactMetrics: [
      {
        id: 'm1',
        label: 'மாணவர்கள்',
        value: '1200',
        valueFormat: 'count',
        source: 'கணக்குகள்',
        period: '2025-26',
        asOf: '2026-03-31',
      },
    ],
  },
  programmes: {
    locale: 'ta',
    programmes: [
      { slug: 'education', title: 'கல்வி', description: 'புத்தகங்கள்', designation: 'RESTRICTED' },
    ],
  },
  documents: {
    locale: 'ta',
    documents: [
      {
        id: 'd1',
        title: 'ஆண்டறிக்கை',
        language: 'ta',
        period: null,
        publishedOn: '2026-06-01',
        fileType: 'pdf',
        fileSizeBytes: 10,
        url: 'https://files.example/a.pdf',
      },
      {
        id: 'bad',
        title: 'Unsupported',
        language: 'en',
        period: null,
        publishedOn: '2026-06-01',
        fileType: 'DOCX',
        fileSizeBytes: 10,
        url: 'https://files.example/b.docx',
      },
    ],
  },
};

describe('apiUrl', () => {
  it.each([
    [undefined, '/api/v1/public/x'],
    ['', '/api/v1/public/x'],
    ['http://localhost:4000', 'http://localhost:4000/api/v1/public/x'],
    ['http://localhost:4000/', 'http://localhost:4000/api/v1/public/x'],
    ['http://localhost:4000/api/v1', 'http://localhost:4000/api/v1/public/x'],
    ['https://api.theonetrust.in/api/v1/', 'https://api.theonetrust.in/api/v1/public/x'],
  ])('%j → %s', (base, expected) => {
    expect(apiUrl(base, '/public/x')).toBe(expected);
  });
});

describe('mergeLanding', () => {
  it('uses published texts and API programmes, keeps the general fund and unpublished slots hidden', () => {
    const merged = mergeLanding(LANDING_CONTENT, DATA);
    expect(merged.hero.headline).toEqual({
      confirmed: true,
      value: { en: 'வெளியிட்ட தலைப்பு', ta: 'வெளியிட்ட தலைப்பு' },
    });
    expect(merged.about.intro?.confirmed).toBe(true);
    expect(merged.hero.lead).toBe(LANDING_CONTENT.hero.lead);
    expect(merged.hero.paymentNote).toBe(LANDING_CONTENT.hero.paymentNote);
    expect(merged.ways.programmes.map((p) => p.slug)).toEqual(['general', 'education']);
    expect(merged.ways.programmes[1]).toMatchObject({ fund: 'earmarked', confirmed: true });
    // Bundled draft programmes are not shown when the API is the source.
    expect(merged.ways.programmes.some((p) => !p.confirmed)).toBe(false);
  });

  it('uses the API general programme when there is one', () => {
    const merged = mergeLanding(LANDING_CONTENT, {
      ...DATA,
      programmes: {
        locale: 'en',
        programmes: [
          { slug: 'general', title: 'General', description: null, designation: 'GENERAL' },
        ],
      },
    });
    expect(merged.ways.programmes).toHaveLength(1);
    expect(merged.ways.programmes[0]).toMatchObject({
      featured: true,
      fund: 'general',
      summary: null,
    });
  });
});

describe('mergeProof', () => {
  it('shows only API metrics/documents, keeps bundled FAQs and adds published ones', () => {
    const merged = mergeProof(PROOF_CONTENT, DATA, 'ta');
    expect(merged.impact.metrics).toEqual([
      expect.objectContaining({ id: 'm1', value: '1,200', updated: '2026-03-31', confirmed: true }),
    ]);
    expect(merged.transparency.documents.map((d) => d.id)).toEqual(['d1']);
    expect(merged.transparency.documents[0]).toMatchObject({ fileType: 'PDF', approved: true });
    expect(merged.faq.items.at(-1)?.id).toBe('new-one');
    expect(merged.faq.items.length).toBe(PROOF_CONTENT.faq.items.length + 1);
    expect(merged.finalCta.title.confirmed).toBe(true);
  });

  it('a published FAQ replaces the bundled one with the same id', () => {
    const id = PROOF_CONTENT.faq.items[0]!.id;
    const merged = mergeProof(
      PROOF_CONTENT,
      { ...DATA, site: { ...DATA.site, faqs: [{ id, question: 'Q', answer: 'A' }], texts: {} } },
      'en',
    );
    expect(merged.faq.items.filter((f) => f.id === id)).toHaveLength(1);
    expect(merged.faq.items.at(-1)?.question.en).toBe('Q');
    expect(merged.finalCta.title).toBe(PROOF_CONTENT.finalCta.title);
  });

  it('formats rupees and percentages', () => {
    const base = DATA.site.impactMetrics[0]!;
    expect(formatMetricValue({ ...base, valueFormat: 'inr_paise', value: '5000000' }, 'en')).toBe(
      '₹50,000',
    );
    expect(formatMetricValue({ ...base, valueFormat: 'percent', value: '85' }, 'en')).toBe('85%');
  });
});

function okFetch(data = DATA) {
  return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(url);
    const body = path.includes('site-content')
      ? data.site
      : path.includes('programmes')
        ? data.programmes
        : data.documents;
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

describe('fetchPublicContent', () => {
  it('calls the three endpoints for the language, without cookies', async () => {
    const fetchImpl = okFetch();
    const data = await fetchPublicContent('http://localhost:4000/api/v1', 'ta', fetchImpl);
    expect(data.site.texts['hero.headline']).toBe('வெளியிட்ட தலைப்பு');
    expect(fetchImpl.mock.calls.map((c) => String(c[0])).sort()).toEqual([
      'http://localhost:4000/api/v1/public/programmes?locale=ta',
      'http://localhost:4000/api/v1/public/site-content?locale=ta',
      'http://localhost:4000/api/v1/public/transparency-documents?locale=ta',
    ]);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ credentials: 'omit' });
  });

  it('reports HTTP and network failures', async () => {
    await expect(
      fetchPublicContent(
        '',
        'en',
        vi.fn(async () => new Response('', { status: 503 })),
      ),
    ).rejects.toEqual(new PublicContentError(503));
    await expect(
      fetchPublicContent(
        '',
        'en',
        vi.fn(async () => Promise.reject(new TypeError('x'))),
      ),
    ).rejects.toMatchObject({
      status: 'network',
    });
  });
});

describe('usePublicContent', () => {
  it('bundled source: bundled content, everything ready, no request', () => {
    const fetchImpl = okFetch();
    const { result } = renderHook(() => usePublicContent('en', 'bundled', fetchImpl));
    expect(result.current.content).toBe(LANDING_CONTENT);
    expect(result.current.states.impact.status).toBe('ready');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('api source: loading, then merged content', async () => {
    const fetchImpl = okFetch();
    const { result } = renderHook(() => usePublicContent('ta', 'api', fetchImpl));
    expect(result.current.states.impact.status).toBe('loading');
    expect(result.current.content).toBe(LANDING_CONTENT);
    await waitFor(() => expect(result.current.states.impact.status).toBe('ready'));
    expect(result.current.proof.impact.metrics).toHaveLength(1);
    expect(result.current.content.hero.headline.confirmed).toBe(true);
  });

  it('api source: error with a working retry', async () => {
    let fail = true;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (fail) return new Response('', { status: 500 });
      return okFetch()(url);
    });
    const { result } = renderHook(() => usePublicContent('en', 'api', fetchImpl));
    await waitFor(() => expect(result.current.states.transparency.status).toBe('error'));
    fail = false;
    const state = result.current.states.transparency;
    act(() => {
      if (state.status === 'error') state.retry();
    });
    expect(result.current.states.transparency.status).toBe('loading');
    await waitFor(() => expect(result.current.states.transparency.status).toBe('ready'));
  });

  it('re-fetches when the language changes and treats the old answer as loading', async () => {
    const fetchImpl = okFetch();
    const { result, rerender } = renderHook(
      ({ lang }) => usePublicContent(lang, 'api', fetchImpl),
      {
        initialProps: { lang: 'en' as 'en' | 'ta' },
      },
    );
    await waitFor(() => expect(result.current.states.impact.status).toBe('ready'));
    rerender({ lang: 'ta' });
    expect(result.current.states.impact.status).toBe('loading');
    await waitFor(() => expect(result.current.states.impact.status).toBe('ready'));
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('locale=ta'))).toBe(true);
  });

  it('contentSource reads VITE_CONTENT_SOURCE (default bundled)', () => {
    expect(contentSource({ VITE_CONTENT_SOURCE: 'api' })).toBe('api');
    expect(contentSource({})).toBe('bundled');
    expect(contentSource({ VITE_CONTENT_SOURCE: 'API' })).toBe('bundled');
  });
});
