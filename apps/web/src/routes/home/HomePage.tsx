import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PAISE_PER_RUPEE, formatInr, type Paise } from '@theonetrust/contracts';
import { TRUST_FACTS, type TrustFacts } from '../../config/trust-facts.ts';
import { draftsVisible, type Bilingual, type LandingContent } from '../../content/landing.ts';
import { isPublishableMetric, isPublishableStory, type ProofContent } from '../../content/proof.ts';
import { usePublicContent } from '../../content/use-public-content.ts';
import { DONATE_PRESETS_RUPEES } from '../../donate/donate-messages.ts';
import { homePath, localizedPath } from '../../i18n/lang.ts';
import { useDonationDraft } from '../../state/donation-draft.ts';
import { useLang } from '../../i18n/use-lang.ts';
import { PolicyNotice } from '../policy/PolicyNotice.tsx';
import { PageMeta } from '../../seo/PageMeta.tsx';
import { ChatIcon } from './hero-icons.tsx';
import { HeroSection } from './LandingSections.tsx';
import { Reveal } from './Reveal.tsx';
import {
  Draft,
  StateGate,
  TransparencySection,
  type ProofProps,
  type SectionState,
} from './ProofSections.tsx';
import { READY, useDate } from './section-state.ts';
import { PHOTOS, TAB_PHOTOS, type HomePhoto } from './photos.ts';
import { EXPLORE_TABS, HOME_TEXT as T, SERVICES, STEPS, type Service } from './home-content.ts';

/**
 * The home page (redesign approved by the client, Nov 2026), in order: hero, mission & vision,
 * where help is needed, services, explore tabs, impact, transparency, how it works, donation,
 * contact, FAQ. Uses the published content (programmes, impact figures, FAQ, contact) — nothing
 * here is invented. Photos are samples until the trust sends its own (see photos.ts).
 */
export function HomePage({
  content: injectedContent,
  proof: injectedProof,
  states: injectedStates,
  facts = TRUST_FACTS,
  showDrafts = draftsVisible(),
}: {
  /** Injected in tests; the live page reads published content from the API (#21). */
  content?: LandingContent;
  proof?: ProofContent;
  states?: ProofProps['states'];
  facts?: TrustFacts;
  showDrafts?: boolean;
}) {
  const lang = useLang();
  const live = usePublicContent(lang);
  const content = injectedContent ?? live.content;
  const proof = injectedProof ?? live.proof;
  const states: ProofProps['states'] = injectedStates ?? (injectedProof ? undefined : live.states);
  return (
    <div className="hp">
      <PageMeta path="/" organisation />
      <HeroSection content={content} facts={facts} showDrafts={showDrafts} />
      <VisionMission />
      <WhereNeeded content={content} showDrafts={showDrafts} />
      <Services />
      <Explore />
      <Impact
        proof={proof}
        landing={content}
        showDrafts={showDrafts}
        state={states?.impact ?? READY}
      />
      <TransparencySection
        proof={proof}
        landing={content}
        facts={facts}
        showDrafts={showDrafts}
        {...(states ? { states } : {})}
      />
      <HowItWorks content={content} />
      <Donation />
      <Contact facts={facts} proof={proof} />
      <Faq proof={proof} landing={content} showDrafts={showDrafts} state={states?.faq ?? READY} />
    </div>
  );
}

/** Creative Commons photos need a credit; Unsplash ones do not. Shown on hover. */
function creditLine(photo: HomePhoto): string | undefined {
  return /^CC /.test(photo.credit.license)
    ? `Photo: ${photo.credit.author} · ${photo.credit.license}`
    : undefined;
}

/** A framed photo; `shape` gives each section its own outline. Without a photo, a slot. */
function Photo({
  shape,
  label,
  photo,
}: {
  shape: 'leaf' | 'arch' | 'blob' | 'pill' | 'strips' | 'stack';
  label: Bilingual;
  photo?: HomePhoto | undefined;
}) {
  const lang = useLang();
  const clip = `hp-clip-${useId().replace(/:/g, '')}`;
  if (photo && shape === 'strips') {
    // Three tilted pills cut from the same photo (the sample's "split" look), drawn as an SVG
    // mask so it scales with the column.
    return (
      <figure className="hp-photo hp-photo--strips">
        <svg className="hp-strips" viewBox="0 0 100 100" role="img" aria-label={photo.alt[lang]}>
          <defs>
            <clipPath id={clip}>
              {[8, 37, 66].map((x, i) => (
                <rect
                  key={x}
                  className={`hp-strips__pill hp-strips__pill--${i + 1}`}
                  x={x}
                  y={i === 1 ? 2 : 10}
                  width="27"
                  height={i === 1 ? 92 : 80}
                  rx="13.5"
                  transform={`rotate(-18 ${x + 13.5} 50)`}
                />
              ))}
            </clipPath>
          </defs>
          {[8, 37, 66].map((x, i) => (
            <rect
              key={x}
              className="hp-strips__shadow"
              x={x + 2}
              y={(i === 1 ? 2 : 10) + 3}
              width="27"
              height={i === 1 ? 92 : 80}
              rx="13.5"
              transform={`rotate(-18 ${x + 13.5} 50)`}
            />
          ))}
          <image
            className="hp-strips__img"
            href={photo.src}
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clip})`}
          >
            {creditLine(photo) && <title>{creditLine(photo)}</title>}
          </image>
        </svg>
      </figure>
    );
  }
  if (photo) {
    return (
      <figure className={`hp-photo hp-photo--${shape} hp-photo--real`}>
        <div className="hp-photo__frame">
          <img
            className="hp-photo__img"
            src={photo.src}
            alt={photo.alt[lang]}
            title={creditLine(photo)}
            loading="lazy"
            decoding="async"
            width={1024}
            height={700}
          />
        </div>
      </figure>
    );
  }
  return (
    <figure className={`hp-photo hp-photo--${shape}`}>
      <div className="hp-photo__frame" role="img" aria-label={`${T.photo[lang]}: ${label[lang]}`}>
        <span className="hp-photo__icon" aria-hidden="true" />
        <span className="hp-photo__label">{T.photo[lang]}</span>
      </div>
    </figure>
  );
}

function SectionHead({
  id,
  kicker,
  title,
  intro,
}: {
  id: string;
  kicker?: Bilingual;
  title: Bilingual;
  intro?: Bilingual;
}) {
  const lang = useLang();
  return (
    <div className="hp-head">
      {kicker && <p className="hp-kicker">{kicker[lang]}</p>}
      <h2 id={id}>{title[lang]}</h2>
      {intro && <p className="hp-lead">{intro[lang]}</p>}
    </div>
  );
}

// 2 · Vision & mission — photo left, text right.
function VisionMission() {
  const lang = useLang();
  return (
    <section id="about" className="hp-section hp-tint-warm" aria-labelledby="hp-vision-title">
      <Reveal>
        <div className="hp-wrap hp-split hp-split--reverse">
          <div className="hp-split__text">
            <SectionHead
              id="hp-vision-title"
              kicker={T.visionKicker}
              title={T.visionTitle}
              intro={T.visionIntro}
            />
            <div className="hp-duo">
              <article className="hp-card">
                <h3>{T.vision[lang]}</h3>
                <p>{T.visionBody[lang]}</p>
              </article>
              <article className="hp-card">
                <h3>{T.mission[lang]}</h3>
                <p>{T.missionBody[lang]}</p>
              </article>
            </div>
          </div>
          <Photo shape="strips" label={T.visionTitle} photo={PHOTOS.vision} />
        </div>
      </Reveal>
    </section>
  );
}

// 3 · Where help is needed — the trust's own programmes.
function WhereNeeded({ content, showDrafts }: { content: LandingContent; showDrafts: boolean }) {
  const lang = useLang();
  const { updateDraft } = useDonationDraft();
  const { ways } = content;
  const programmes = ways.programmes.filter((p) => p.confirmed || showDrafts);
  return (
    <section id="ways-we-help" className="hp-section" aria-labelledby="hp-need-title">
      <Reveal>
        <div className="hp-wrap hp-need-layout">
          <aside className="hp-need-intro">
            <SectionHead
              id="hp-need-title"
              kicker={T.needKicker}
              title={T.needTitle}
              intro={T.needIntro}
            />
            <span className="hp-need-intro__mark" aria-hidden="true" />
            <a className="ui-button ui-button--donate hp-btn" href="#donate">
              {T.donateNow[lang]}
            </a>
          </aside>
          <ol className="hp-need-list hp-stagger">
            {programmes.map((p, i) => (
              <li key={p.slug} className="hp-need-row">
                <span className="hp-need-row__num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="hp-need-row__body">
                  <p className="hp-need-row__tag">{ways.fundLabels[p.fund][lang]}</p>
                  <h3>{p.title[lang]}</h3>
                  <Draft confirmed={p.confirmed} label={content.draftLabel} />
                  {p.summary && <p>{p.summary[lang]}</p>}
                  {p.whoFor && (
                    <p className="hp-need-row__who">
                      <strong>{ways.whoForLabel[lang]}:</strong> {p.whoFor[lang]}
                    </p>
                  )}
                </div>
                <Link
                  className="hp-need-row__give"
                  to={`${homePath(lang)}?programme=${encodeURIComponent(p.slug)}#donate`}
                  onClick={() => updateDraft({ programme: p.slug })}
                >
                  {T.give[lang]} <span aria-hidden="true">→</span>
                  <span className="visually-hidden"> — {p.title[lang]}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>
    </section>
  );
}

function ServiceIcon({ icon }: { icon: Service['icon'] }) {
  const paths: Record<Service['icon'], ReactNode> = {
    health: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
    education: (
      <>
        <path d="M2 9l10-5 10 5-10 5Z" />
        <path d="M6 11v5c3 2 9 2 12 0v-5" />
      </>
    ),
    food: (
      <>
        <path d="M4 11h16a8 8 0 0 1-16 0Z" />
        <path d="M9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4" />
      </>
    ),
    emergency: (
      <>
        <path d="M12 3 2 20h20Z" />
        <path d="M12 10v4M12 17v.5" />
      </>
    ),
  };
  return (
    <svg className="hp-service__icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[icon]}
    </svg>
  );
}

// 3b · Our services — four icon cards, the first one highlighted.
function Services() {
  const lang = useLang();
  return (
    <section id="services" className="hp-section hp-tint-sage" aria-labelledby="hp-services-title">
      <Reveal>
        <div className="hp-wrap">
          <SectionHead id="hp-services-title" kicker={T.servicesKicker} title={T.servicesTitle} />
          <ul className="hp-services hp-stagger">
            {SERVICES.map((s, i) => (
              <li key={s.id} className={`hp-service${i === 1 ? ' hp-service--feature' : ''}`}>
                <ServiceIcon icon={s.icon} />
                <h3>{s.title[lang]}</h3>
                <p>{s.body[lang]}</p>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

// 4 · Explore — accessible tabs (arrow keys, Home/End), big photo, title and points.
function Explore() {
  const lang = useLang();
  const base = useId();
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const tab = EXPLORE_TABS[active] ?? EXPLORE_TABS[0];
  function onKey(event: KeyboardEvent) {
    const last = EXPLORE_TABS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? active === last
          ? 0
          : active + 1
        : event.key === 'ArrowLeft'
          ? active === 0
            ? last
            : active - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }
  if (!tab) return null;
  return (
    <section id="explore" className="hp-section" aria-labelledby="hp-explore-title">
      <Reveal>
        <div className="hp-wrap">
          <SectionHead id="hp-explore-title" kicker={T.exploreKicker} title={T.exploreTitle} />
          <div className="hp-tabs" role="tablist" aria-label={T.exploreTabsLabel[lang]}>
            {EXPLORE_TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${t.id}`}
                aria-selected={i === active}
                aria-controls={`${base}-panel`}
                tabIndex={i === active ? 0 : -1}
                className="hp-tab"
                onClick={() => setActive(i)}
                onKeyDown={onKey}
              >
                {t.label[lang]}
              </button>
            ))}
          </div>
          <div
            id={`${base}-panel`}
            role="tabpanel"
            aria-labelledby={`${base}-tab-${tab.id}`}
            key={tab.id}
            className={`hp-explore hp-split hp-tabpanel-anim${active % 2 ? ' hp-explore--photo-right' : ''}`}
          >
            <Photo shape="stack" label={tab.title} photo={TAB_PHOTOS[tab.id]} />
            <div className="hp-split__text">
              <h3 className="hp-explore__title">{tab.title[lang]}</h3>
              <p>{tab.body[lang]}</p>
              <ul className="hp-ticks">
                {tab.points.map((p) => (
                  <li key={p.en}>{p[lang]}</li>
                ))}
              </ul>
              <a className="ui-button ui-button--donate hp-btn" href="#donate">
                {T.donateNow[lang]}
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// 5 · Impact — only publishable, sourced, dated figures and consented stories; never zeros.
function Impact({
  proof,
  landing,
  showDrafts,
  state,
}: {
  proof: ProofContent;
  landing: LandingContent;
  showDrafts: boolean;
  state: SectionState;
}) {
  const lang = useLang();
  const date = useDate();
  const { impact } = proof;
  const hasDocuments = proof.transparency.documents.some((d) => d.approved);
  const metrics = impact.metrics.filter(
    (m) => isPublishableMetric(m) && (m.confirmed || showDrafts),
  );
  const stories = impact.stories.filter(
    (st) => isPublishableStory(st) && (st.confirmed || showDrafts),
  );
  return (
    <section id="impact" className="hp-section hp-dark" aria-labelledby="hp-impact-title">
      <Reveal>
        <div className="hp-wrap">
          <SectionHead id="hp-impact-title" kicker={T.impactKicker} title={impact.title} />
          <StateGate state={state} proof={proof}>
            {metrics.length === 0 && stories.length === 0 ? (
              <p className="hp-lead">
                {T.impactEmpty[lang]}
                {hasDocuments && (
                  <>
                    {' '}
                    <a href="#transparency">{impact.seeDocuments[lang]}</a>
                  </>
                )}
              </p>
            ) : (
              <>
                {metrics.length > 0 && (
                  <ul className="hp-stats hp-stagger">
                    {metrics.map((m) => (
                      <li key={m.id}>
                        <span className="hp-stats__value">{m.value}</span>
                        <span className="hp-stats__label">{m.label[lang]}</span>
                        <span className="hp-stats__meta">
                          {impact.sourceLabel[lang]}: {m.source[lang]} · {impact.periodLabel[lang]}:{' '}
                          {m.period[lang]} · {impact.updatedLabel[lang]}:{' '}
                          <time dateTime={m.updated}>{date(m.updated)}</time>
                        </span>
                        <Draft confirmed={m.confirmed} label={landing.draftLabel} />
                      </li>
                    ))}
                  </ul>
                )}
                {stories.length > 0 && (
                  <div className="hp-stories">
                    {stories.map((st) => (
                      <article key={st.id} className="hp-card">
                        <h3>{st.title[lang]}</h3>
                        <p>{st.body[lang]}</p>
                        <Draft confirmed={st.confirmed} label={landing.draftLabel} />
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </StateGate>
        </div>
      </Reveal>
    </section>
  );
}

// 6 · How it works — numbered steps joined by a line.
function HowItWorks({ content }: { content: LandingContent }) {
  const lang = useLang();
  return (
    <section id="how-it-works" className="hp-section" aria-labelledby="hp-how-title">
      <Reveal>
        <div className="hp-wrap">
          <SectionHead id="hp-how-title" kicker={T.howKicker} title={T.howTitle} />
          <ol className="hp-steps hp-stagger">
            {STEPS.map((s, i) => (
              <li key={s.title.en} className="hp-step">
                <span className="hp-step__num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="hp-step__title">{s.title[lang]}</h3>
                <p>{s.body[lang]}</p>
              </li>
            ))}
          </ol>
          <p className="hp-note">
            <Link to={localizedPath('/refund-policy', lang)}>
              {content.howItWorks.policyLink[lang]}
            </Link>
          </p>
        </div>
      </Reveal>
    </section>
  );
}

// 7 · Donation — text left, photo right — amount chips open the centred donate pop-up pre-filled.
function Donation() {
  const lang = useLang();
  const { updateDraft } = useDonationDraft();
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
  return (
    <section id="give" className="hp-section hp-tint-warm" aria-labelledby="hp-donate-title">
      <Reveal>
        <div className="hp-wrap hp-donate">
          <div className="hp-donate__main">
            <SectionHead
              id="hp-donate-title"
              kicker={T.donateKicker}
              title={T.donateTitle}
              intro={T.donateLead}
            />
            <p>{T.donateBody[lang]}</p>
            <p className="hp-note">{T.monthlyNote[lang]}</p>
            <div className="hp-donate__box">
              <ul className="hp-chips">
                {DONATE_PRESETS_RUPEES.map((r) => (
                  <li key={r}>
                    <Link
                      className="hp-chip"
                      to={`${homePath(lang)}?amount=${r}#donate`}
                      onClick={() => updateDraft({ amountPaise: (r * PAISE_PER_RUPEE) as Paise })}
                    >
                      {formatInr((r * PAISE_PER_RUPEE) as Paise, locale)}
                    </Link>
                  </li>
                ))}
                <li>
                  <a className="hp-chip hp-chip--ghost" href="#donate">
                    {T.donateOther[lang]}
                  </a>
                </li>
              </ul>
              <a className="ui-button ui-button--donate hp-btn hp-btn--wide" href="#donate">
                {T.donateNow[lang]}
              </a>
              <PolicyNotice />
            </div>
          </div>
          <div className="hp-donate__art">
            <span className="hp-donate__blob" aria-hidden="true" />
            <Photo shape="blob" label={T.donateTitle} photo={PHOTOS.donate} />
            <p className="hp-badge">
              <span className="hp-badge__heart" aria-hidden="true">
                ♥
              </span>
              {T.smallAct[lang]}
            </p>
          </div>
        </div>
        <div className="hp-wrap">
          <div className="hp-band">
            <p className="hp-band__title">{T.bandTitle[lang]}</p>
            <p className="hp-band__links">
              <a href="#donate">{T.bandDonate[lang]}</a>
              <span aria-hidden="true"> · </span>
              <a href="#contact">{T.bandVolunteer[lang]}</a>
              <span aria-hidden="true"> · </span>
              <a href="#contact">{T.bandPartner[lang]}</a>
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// 8 · Contact — photo left, verified details only.
function Contact({ facts, proof }: { facts: TrustFacts; proof: ProofContent }) {
  const lang = useLang();
  const rows: Array<[Bilingual, ReactNode]> = [];
  if (facts.phone)
    rows.push([
      { en: 'Phone / WhatsApp', ta: 'போன் / WhatsApp' },
      <a href={`tel:${facts.phone.tel}`}>{facts.phone.display}</a>,
    ]);
  if (facts.email)
    rows.push([
      { en: 'Email', ta: 'மின்னஞ்சல்' },
      <a href={`mailto:${facts.email}`}>{facts.email}</a>,
    ]);
  if (facts.area) rows.push([{ en: 'Location', ta: 'இடம்' }, facts.area[lang]]);
  if (facts.address) rows.push([proof.contact.addressLabel, facts.address[lang]]);
  if (facts.callHours)
    rows.push([{ en: 'Call hours', ta: 'அழைக்கும் நேரம்' }, facts.callHours[lang]]);
  return (
    <section id="contact" className="hp-section" aria-labelledby="hp-contact-title">
      <Reveal>
        <div className="hp-wrap hp-split hp-split--reverse">
          <div className="hp-split__text">
            <SectionHead
              id="hp-contact-title"
              kicker={T.contactKicker}
              title={T.contactTitle}
              intro={T.contactBody}
            />
            <dl className="hp-facts">
              {rows.map(([label, value]) => (
                <div key={label.en}>
                  <dt>{label[lang]}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="hp-actions">
              <Link className="ui-button ui-button--secondary hp-btn" to="#get-help">
                {T.askHelp[lang]}
              </Link>
              {facts.whatsappUrl && (
                <a
                  className="ui-button ui-button--primary hp-btn"
                  href={facts.whatsappUrl}
                  rel="noopener noreferrer"
                >
                  <ChatIcon />
                  {T.whatsappUs[lang]}
                </a>
              )}
            </div>
          </div>
          <Photo shape="pill" label={T.contactTitle} photo={PHOTOS.contact} />
        </div>
      </Reveal>
    </section>
  );
}

// 9 · FAQ — the trust's published questions.
function Faq({
  proof,
  landing,
  showDrafts,
  state,
}: {
  proof: ProofContent;
  landing: LandingContent;
  showDrafts: boolean;
  state: SectionState;
}) {
  const lang = useLang();
  const items = proof.faq.items.filter((f) => f.confirmed || showDrafts);
  return (
    <section id="faq" className="hp-section hp-tint-sage" aria-labelledby="hp-faq-title">
      <Reveal>
        <div className="hp-wrap hp-faq-wrap">
          <SectionHead id="hp-faq-title" kicker={T.faqKicker} title={T.faqTitle} />
          {/* One answer open at a time: opening a question closes the one before. */}
          <StateGate state={state} proof={proof}>
            {items.length === 0 ? (
              <p className="hp-lead">{proof.faq.emptyTitle[lang]}</p>
            ) : (
              <div className="hp-faq hp-stagger">
                {items.map((f) => (
                  <details
                    key={f.id}
                    id={`faq-${f.id}`}
                    className="hp-faq__item"
                    onToggle={(event) => {
                      const opened = event.currentTarget;
                      if (!opened.open) return;
                      opened.parentElement
                        ?.querySelectorAll<HTMLDetailsElement>('details[open]')
                        .forEach((other) => {
                          if (other !== opened) other.open = false;
                        });
                    }}
                  >
                    <summary>{f.question[lang]}</summary>
                    <p>{f.answer[lang]}</p>
                    <Draft confirmed={f.confirmed} label={landing.draftLabel} />
                  </details>
                ))}
              </div>
            )}
          </StateGate>
        </div>
      </Reveal>
    </section>
  );
}
