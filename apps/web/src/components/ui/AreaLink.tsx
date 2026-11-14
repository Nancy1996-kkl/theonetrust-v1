import type { TrustFacts } from '../../config/trust-facts.ts';
import type { UiLang } from './ui-strings.ts';

const NEW_TAB = {
  en: ' (map, opens in a new tab)',
  ta: ' (வரைபடம், புதிய தாவலில் திறக்கும்)',
} as const;

/**
 * The trust's area ("Kanchipuram, Tamil Nadu") as a Google Maps link when a map link is set
 * (client, Nov 2026), plain text otherwise. Used in the hero, the contact section and the footer.
 */
export function AreaLink({
  facts,
  lang,
  className,
}: {
  facts: Pick<TrustFacts, 'area' | 'mapUrl'>;
  lang: UiLang;
  className?: string;
}) {
  if (!facts.area) return null;
  if (!facts.mapUrl) return <>{facts.area[lang]}</>;
  return (
    <a className={className} href={facts.mapUrl} target="_blank" rel="noopener noreferrer">
      {facts.area[lang]}
      <span className="visually-hidden">{NEW_TAB[lang]}</span>
    </a>
  );
}
