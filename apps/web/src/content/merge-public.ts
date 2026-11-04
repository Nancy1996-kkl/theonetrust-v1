import type {
  PublicImpactMetric,
  PublicProgramme,
  PublicTransparencyDocument,
  SiteTextKey,
} from '@theonetrust/contracts';
import type { UiLang } from '../components/ui/ui-strings.ts';
import type { Bilingual, Gated, LandingContent, Programme } from './landing.ts';
import type { ImpactMetric, ProofContent, TransparencyDocument } from './proof.ts';
import type { PublicContentData } from './public-api.ts';

/**
 * Lays published API content over the bundled content (#21). The API response is for ONE
 * language, so each value is used for that language only (the page re-fetches on switch).
 * Anything the API does not provide keeps the bundled value — which is either confirmed
 * generic text or hidden behind `confirmed: false`.
 */
const same = (text: string): Bilingual => ({ en: text, ta: text });
function published<F extends Gated<Bilingual> | null>(text: string | undefined, fallback: F) {
  return text ? { confirmed: true, value: same(text) } : fallback;
}

export function formatMetricValue(metric: PublicImpactMetric, lang: UiLang): string {
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
  const n = Number(metric.value);
  if (metric.valueFormat === 'inr_paise') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n / 100);
  }
  if (metric.valueFormat === 'percent') return `${new Intl.NumberFormat(locale).format(n)}%`;
  return new Intl.NumberFormat(locale).format(n);
}

function toProgramme(p: PublicProgramme): Programme {
  return {
    slug: p.slug,
    title: same(p.title),
    summary: p.description ? same(p.description) : null,
    whoFor: null,
    fund: p.designation === 'GENERAL' ? 'general' : 'earmarked',
    ...(p.slug === 'general' && { featured: true }),
    confirmed: true,
  };
}

function toMetric(m: PublicImpactMetric, lang: UiLang): ImpactMetric {
  return {
    id: m.id,
    value: formatMetricValue(m, lang),
    label: same(m.label),
    source: same(m.source),
    period: same(m.period),
    updated: m.asOf,
    confirmed: true,
  };
}

const FILE_TYPES = ['PDF', 'JPG', 'PNG'] as const;

function toDocument(d: PublicTransparencyDocument): TransparencyDocument | null {
  const fileType = FILE_TYPES.find((t) => t === d.fileType.toUpperCase());
  if (!fileType || !/^https?:\/\//.test(d.url)) return null;
  return {
    id: d.id,
    title: same(d.title),
    language: d.language,
    period: same(d.period ?? '—'),
    published: d.publishedOn,
    fileType,
    url: d.url,
    approved: true,
  };
}

export function mergeLanding(base: LandingContent, data: PublicContentData): LandingContent {
  const text = (key: SiteTextKey) => data.site.texts[key];
  const fromApi = data.programmes.programmes.map(toProgramme);
  const general = base.ways.programmes.find((p) => p.slug === 'general' && p.confirmed);
  // The general fund is how every donation works; keep it even if the API list omits it.
  const programmes =
    general && !fromApi.some((p) => p.slug === 'general') ? [general, ...fromApi] : fromApi;
  return {
    ...base,
    hero: {
      ...base.hero,
      eyebrow: published(text('hero.eyebrow'), base.hero.eyebrow),
      headline: published(text('hero.headline'), base.hero.headline),
      lead: published(text('hero.lead'), base.hero.lead),
      paymentNote: published(text('hero.payment_note'), base.hero.paymentNote),
    },
    about: { ...base.about, intro: published(text('about.intro'), base.about.intro) },
    ways: { ...base.ways, intro: published(text('ways.intro'), base.ways.intro), programmes },
  };
}

export function mergeProof(
  base: ProofContent,
  data: PublicContentData,
  lang: UiLang,
): ProofContent {
  const apiFaqs = data.site.faqs.map((f) => ({
    id: f.id,
    question: same(f.question),
    answer: same(f.answer),
    confirmed: true,
  }));
  const ids = new Set(apiFaqs.map((f) => f.id));
  const finalTitle = data.site.texts['final_cta.title'];
  return {
    ...base,
    impact: { ...base.impact, metrics: data.site.impactMetrics.map((m) => toMetric(m, lang)) },
    transparency: {
      ...base.transparency,
      documents: data.documents.documents.flatMap((d) => toDocument(d) ?? []),
    },
    // Bundled answers (payments, tax) stay; published FAQs replace same-id ones and add new ones.
    faq: { ...base.faq, items: [...base.faq.items.filter((f) => !ids.has(f.id)), ...apiFaqs] },
    finalCta: {
      ...base.finalCta,
      title: finalTitle ? { confirmed: true, value: same(finalTitle) } : base.finalCta.title,
    },
  };
}
