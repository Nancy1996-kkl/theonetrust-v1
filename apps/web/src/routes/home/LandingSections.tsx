import { Link } from 'react-router';
import { BentoGrid, BentoTile } from '../../components/ui/Card.tsx';
import { StatusPill } from '../../components/ui/StatusPill.tsx';
import type { TrustFacts } from '../../config/trust-facts.ts';
import type { Bilingual, Gated, LandingContent, Programme } from '../../content/landing.ts';
import { visible } from '../../content/landing.ts';
import { homePath, localizedPath } from '../../i18n/lang.ts';
import { useLang } from '../../i18n/use-lang.ts';
import { useDonationDraft } from '../../state/donation-draft.ts';
import { HeroBanner } from './HeroBanner.tsx';
import { ArrowIcon, HeartIcon, PinIcon } from './hero-icons.tsx';
import { Reveal } from './Reveal.tsx';

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
export function HeroSection({ content, facts, showDrafts }: SectionProps) {
  const lang = useLang();
  const home = homePath(lang);
  const { hero, draftLabel } = content;
  const headline = visible(hero.headline, showDrafts);
  return (
    <section id="top" className="landing-hero surface-inverse" aria-labelledby="hero-title">
      <HeroBanner pauseLabel={hero.pauseBanner[lang]} playLabel={hero.playBanner[lang]} />
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

/** 3 · About + trust facts strip — only verified facts; unknown ones are not rendered at all. */
export function AboutSection({ content, facts, showDrafts }: SectionProps) {
  const lang = useLang();
  const { about, draftLabel } = content;
  const rows: Array<[Bilingual, string]> = [];
  if (facts.legalName) rows.push([about.factLabels.legalName, facts.legalName]);
  if (facts.registration) rows.push([about.factLabels.registration, facts.registration]);
  if (facts.established) rows.push([about.factLabels.established, facts.established]);
  if (facts.area) rows.push([about.factLabels.area, facts.area[lang]]);
  if (facts.taxApproval) rows.push([about.factLabels.taxApproval, facts.taxApproval[lang]]);

  return (
    <section id="about" className="landing-section" aria-labelledby="about-title">
      <Reveal className="landing__wrap">
        <h2 id="about-title">{about.title[lang]}</h2>
        <GatedText
          item={visible(about.intro, showDrafts)}
          className="landing__intro"
          draftLabel={draftLabel}
        />
        {rows.length > 0 && (
          <dl className="landing-facts">
            {rows.map(([label, value]) => (
              <div key={label.en} className="landing-facts__item">
                <dt>{label[lang]}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Reveal>
    </section>
  );
}

function ProgrammeCard({ programme, content }: { programme: Programme; content: LandingContent }) {
  const lang = useLang();
  const { updateDraft } = useDonationDraft();
  const { ways, draftLabel } = content;
  const href = `${homePath(lang)}?programme=${programme.slug}#donate`;
  return (
    <BentoTile
      title={programme.title[lang]}
      span={programme.featured ? 2 : 1}
      className={['landing-card', programme.featured && 'landing-card--featured']
        .filter(Boolean)
        .join(' ')}
      action={
        <Link
          to={href}
          className="landing-card__link"
          onClick={() => updateDraft({ programme: programme.slug })}
        >
          {ways.giveCta[lang]}
          <span className="visually-hidden">: {programme.title[lang]}</span>
          <span aria-hidden="true"> →</span>
        </Link>
      }
    >
      <DraftBadge item={programme} label={draftLabel} />
      {programme.summary && <p>{programme.summary[lang]}</p>}
      {programme.whoFor && (
        <p className="landing-card__who">
          <strong>{ways.whoForLabel[lang]}:</strong> {programme.whoFor[lang]}
        </p>
      )}
      <StatusPill tone={programme.fund === 'general' ? 'info' : 'neutral'}>
        {ways.fundLabels[programme.fund][lang]}
      </StatusPill>
    </BentoTile>
  );
}

/** 4 · Ways we help — bento grid; each card pre-selects its need in the donate panel. */
export function WaysWeHelpSection({ content, showDrafts }: SectionProps) {
  const lang = useLang();
  const { ways, draftLabel } = content;
  const programmes = ways.programmes.filter((p) => p.confirmed || showDrafts);
  return (
    <section id="ways-we-help" className="landing-section" aria-labelledby="ways-title">
      <Reveal className="landing__wrap">
        <h2 id="ways-title">{ways.title[lang]}</h2>
        <GatedText
          item={visible(ways.intro, showDrafts)}
          className="landing__intro"
          draftLabel={draftLabel}
        />
        <BentoGrid className="landing-ways">
          {programmes.map((programme) => (
            <ProgrammeCard key={programme.slug} programme={programme} content={content} />
          ))}
        </BentoGrid>
      </Reveal>
    </section>
  );
}

/** 5 · How a donation helps — rendered only when at least one verified example exists. */
export function DonationHelpsSection({ content, showDrafts }: SectionProps) {
  const lang = useLang();
  const { donationHelps, draftLabel } = content;
  const examples = donationHelps.examples.filter((e) => e.confirmed || showDrafts);
  if (examples.length === 0) return null;
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
  const rupees = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
  return (
    <section id="how-donations-help" className="landing-section" aria-labelledby="helps-title">
      <Reveal className="landing__wrap">
        <h2 id="helps-title">{donationHelps.title[lang]}</h2>
        <ul className="landing-helps">
          {examples.map((example) => (
            <li key={example.amountRupees} className="landing-helps__item">
              <strong>{rupees.format(example.amountRupees)}</strong>
              <span>{example.covers[lang]}</span>
              <DraftBadge item={example} label={draftLabel} />
            </li>
          ))}
        </ul>
        <p className="landing__note">{donationHelps.illustrativeNote[lang]}</p>
      </Reveal>
    </section>
  );
}

/** 6 · How it works — four steps, with the payment-help policy link. */
export function HowItWorksSection({ content }: SectionProps) {
  const lang = useLang();
  const { howItWorks } = content;
  return (
    <section id="how-it-works" className="landing-section" aria-labelledby="how-title">
      <Reveal className="landing__wrap">
        <h2 id="how-title">{howItWorks.title[lang]}</h2>
        <ol className="landing-steps">
          {howItWorks.steps.map((step, i) => (
            <li key={step.en} className="landing-steps__item">
              <span className="landing-steps__number" aria-hidden="true">
                {i + 1}
              </span>
              <span>{step[lang]}</span>
            </li>
          ))}
        </ol>
        <p>
          <Link to={localizedPath('/refund-policy', lang)}>{howItWorks.policyLink[lang]}</Link>
        </p>
      </Reveal>
    </section>
  );
}
