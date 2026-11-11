import { Link } from 'react-router';
import { StatusPill } from '../../components/ui/StatusPill.tsx';
import type { TrustFacts } from '../../config/trust-facts.ts';
import type { Bilingual, Gated, LandingContent } from '../../content/landing.ts';
import { visible } from '../../content/landing.ts';
import { homePath } from '../../i18n/lang.ts';
import { useLang } from '../../i18n/use-lang.ts';
import { HeroCarousel } from './HeroCarousel.tsx';
import { ArrowIcon, HeartIcon, PinIcon } from './hero-icons.tsx';

export interface SectionProps {
  content: LandingContent;
  facts: TrustFacts;
  showDrafts: boolean;
}

function DraftBadge({ item, label }: { item: { confirmed: boolean }; label: Bilingual }) {
  const lang = useLang();
  if (item.confirmed) return null;
  return (
    <StatusPill tone="warning" className="landing__draft">
      {label[lang]}
    </StatusPill>
  );
}

function GatedText({
  item,
  as: Tag = 'p',
  className,
  draftLabel,
}: {
  item: Gated<Bilingual> | null;
  as?: 'p' | 'span';
  className?: string;
  draftLabel: Bilingual;
}) {
  const lang = useLang();
  if (!item) return null;
  return (
    <Tag className={className}>
      {item.value[lang]} <DraftBadge item={item} label={draftLabel} />
    </Tag>
  );
}

/** Headline with the accent words on their own line; plain text if the accent is missing. */
function HeroTitle({ text, accent }: { text: string; accent: string | null }) {
  const at = accent ? text.indexOf(accent) : -1;
  if (!accent || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="landing-hero__accent">{accent}</span>
      {text.slice(at + accent.length)}
    </>
  );
}

/** 2 · Hero — forest band, beneficiary banner with a forest scrim, Donate first. */
/** Hero kept from the client's own design (#90): video carousel; only the words changed. */
export function HeroSection({ content, facts, showDrafts }: SectionProps) {
  const lang = useLang();
  const home = homePath(lang);
  const { hero, draftLabel } = content;
  const headline = visible(hero.headline, showDrafts);
  return (
    <section id="top" className="landing-hero surface-inverse" aria-labelledby="hero-title">
      <HeroCarousel
        pauseLabel={hero.pauseBanner[lang]}
        playLabel={hero.playBanner[lang]}
        carouselLabel={hero.carouselLabel[lang]}
        slideLabelTemplate={hero.slideLabel[lang]}
      />
      <div className="landing__wrap landing-hero__inner">
        <div className="landing-hero__text">
          <GatedText
            item={visible(hero.eyebrow, showDrafts)}
            className="landing-hero__eyebrow"
            draftLabel={draftLabel}
          />
          <h1 id="hero-title" className="landing-hero__title">
            {headline ? (
              <HeroTitle text={headline.value[lang]} accent={hero.headlineAccent?.[lang] ?? null} />
            ) : (
              facts.siteName
            )}
          </h1>
          {headline && <DraftBadge item={headline} label={draftLabel} />}
          <GatedText
            item={visible(hero.lead, showDrafts)}
            className="landing-hero__lead"
            draftLabel={draftLabel}
          />
          <div className="landing-hero__actions">
            <a className="ui-button ui-button--donate landing-hero__donate" href={`${home}#donate`}>
              {hero.donateCta[lang]}
              <HeartIcon />
            </a>
            <a className="ui-button ui-button--secondary" href={`${home}#about`}>
              {hero.learnMoreCta[lang]}
              <ArrowIcon />
            </a>
          </div>
          <p className="landing-hero__help">
            {hero.getHelpPrompt[lang]}{' '}
            <Link className="landing-hero__help-link" to={`${home}#get-help`}>
              {hero.getHelpCta[lang]}
            </Link>
          </p>
          {facts.area && (
            <p className="landing-hero__place">
              <PinIcon />
              {facts.area[lang]}
            </p>
          )}
          <GatedText
            item={visible(hero.paymentNote, showDrafts)}
            className="landing-hero__note"
            draftLabel={draftLabel}
          />
        </div>
      </div>
    </section>
  );
}
