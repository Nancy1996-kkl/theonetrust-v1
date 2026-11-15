import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PageMeta } from '../../seo/PageMeta.tsx';
import { StatusPill } from '../../components/ui/StatusPill.tsx';
import { TRUST_FACTS, type TrustFacts } from '../../config/trust-facts.ts';
import { draftsVisible } from '../../content/landing.ts';
import {
  POLICIES,
  POLICY_ORDER,
  POLICY_UI,
  type Policy,
  type PolicyId,
} from '../../content/policies.ts';
import { localizedPath } from '../../i18n/lang.ts';
import { Reveal } from '../home/Reveal.tsx';
import { ChatIcon, MailIcon, PhoneIcon } from '../home/hero-icons.tsx';
import { useLang } from '../../i18n/use-lang.ts';

interface PolicyPageProps {
  id: PolicyId;
  /** Injected in tests. */
  policies?: Record<PolicyId, Policy>;
  facts?: TrustFacts;
  showDrafts?: boolean;
}

/**
 * One policy page (/terms, /privacy, /refund-policy and /ta/ mirrors). Unconfirmed sections show
 * a "being reviewed" placeholder on the live site; the draft wording only in preview builds.
 */
export function PolicyPage({
  id,
  policies = POLICIES,
  facts = TRUST_FACTS,
  showDrafts = draftsVisible(),
}: PolicyPageProps) {
  const lang = useLang();
  const policy = policies[id];
  const pending = policy.sections.some((s) => !s.confirmed);
  const active = useActiveSection(policy.sections.map((s) => s.id));
  return (
    <article className="hp policy" aria-labelledby="policy-title">
      <PageMeta path={policy.path} />
      <div className="policy-hero">
        <div className="hp-wrap policy-hero__inner">
          <p className="hp-kicker">{POLICY_UI.kicker[lang]}</p>
          <h1 id="policy-title">{policy.title[lang]}</h1>
          <p className="hp-lead policy__intro">{policy.intro[lang]}</p>
          {pending && (
            <p className="policy__notice" role="note">
              <StatusPill tone="info">{POLICY_UI.pendingNotice[lang]}</StatusPill>
            </p>
          )}
        </div>
      </div>
      <div className="hp-wrap policy-layout">
        <nav aria-label={POLICY_UI.onThisPage[lang]} className="policy-toc">
          <h2 className="policy-toc__title">{POLICY_UI.onThisPage[lang]}</h2>
          <ol>
            {policy.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? 'location' : undefined}
                >
                  {section.heading[lang]}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="policy-body">
          {policy.sections.map((section, index) => {
            const showText = section.confirmed || showDrafts;
            return (
              <Reveal key={section.id}>
                <section
                  id={section.id}
                  className="policy-card"
                  aria-labelledby={`${section.id}-heading`}
                >
                  <span className="policy-card__num" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h2 id={`${section.id}-heading`}>{section.heading[lang]}</h2>
                  {!section.confirmed && (
                    <p>
                      <StatusPill tone="warning">
                        {showDrafts ? POLICY_UI.draftLabel[lang] : POLICY_UI.pendingSection[lang]}
                      </StatusPill>
                    </p>
                  )}
                  {showText && (
                    <>
                      {section.paragraphs.map((para) => (
                        <p key={para.en}>{para[lang]}</p>
                      ))}
                      {section.list && (
                        <ul>
                          {section.list.map((item) => (
                            <li key={item.en}>{item[lang]}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </section>
              </Reveal>
            );
          })}
          <Reveal>
            <section className="policy-contact" aria-labelledby="policy-contact">
              <div className="policy-contact__text">
                <h2 id="policy-contact">{POLICY_UI.contactHeading[lang]}</h2>
                <p>{POLICY_UI.contactLead[lang]}</p>
                {facts.callHours && (
                  <p className="policy-contact__hours">
                    <span>{POLICY_UI.callHours[lang]}</span> {facts.callHours[lang]}
                  </p>
                )}
              </div>
              <ul className="policy-contact__actions">
                {facts.whatsappUrl && (
                  <li>
                    <a
                      className="ui-button ui-button--primary hp-btn policy-contact__btn"
                      href={facts.whatsappUrl}
                      rel="noopener noreferrer"
                    >
                      <ChatIcon />
                      {POLICY_UI.whatsappUs[lang]}
                    </a>
                  </li>
                )}
                {facts.phone && (
                  <li>
                    <a
                      className="ui-button ui-button--secondary hp-btn policy-contact__btn"
                      href={`tel:${facts.phone.tel}`}
                    >
                      <PhoneIcon />
                      <span className="policy-contact__btn-text">
                        <span className="policy-contact__btn-label">{POLICY_UI.callUs[lang]}</span>{' '}
                        <span>{facts.phone.display}</span>
                      </span>
                    </a>
                  </li>
                )}
                {facts.email && (
                  <li>
                    <a
                      className="ui-button ui-button--secondary hp-btn policy-contact__btn"
                      href={`mailto:${facts.email}`}
                    >
                      <MailIcon />
                      <span className="policy-contact__btn-text">
                        <span className="policy-contact__btn-label">{POLICY_UI.emailUs[lang]}</span>{' '}
                        <span>{facts.email}</span>
                      </span>
                    </a>
                  </li>
                )}
              </ul>
            </section>
          </Reveal>
          <nav aria-label={POLICY_UI.otherPolicies[lang]} className="policy__others">
            <h2>{POLICY_UI.otherPolicies[lang]}</h2>
            <ul>
              {POLICY_ORDER.filter((other) => other !== id).map((other) => (
                <li key={other}>
                  <Link to={localizedPath(policies[other].path, lang)}>
                    {policies[other].title[lang]}
                    <span className="policy__arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </article>
  );
}

/** Which section is on screen, for the "On this page" highlight. Off without IntersectionObserver. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(' ');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = key
      .split(' ')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries
          .filter((e) => e.isIntersecting)
          .sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);
  return active;
}
