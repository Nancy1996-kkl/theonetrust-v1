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
  return (
    <article className="page prose policy" aria-labelledby="policy-title">
      <PageMeta path={policy.path} />
      <h1 id="policy-title">{policy.title[lang]}</h1>
      <p className="policy__intro">{policy.intro[lang]}</p>
      {pending && (
        <p className="policy__notice" role="note">
          <StatusPill tone="info">{POLICY_UI.pendingNotice[lang]}</StatusPill>
        </p>
      )}
      {policy.sections.map((section) => {
        const showText = section.confirmed || showDrafts;
        return (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
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
        );
      })}
      <section aria-labelledby="policy-contact">
        <h2 id="policy-contact">{POLICY_UI.contactHeading[lang]}</h2>
        <p>{POLICY_UI.contactLead[lang]}</p>
        <ul>
          {facts.email && (
            <li>
              <a href={`mailto:${facts.email}`}>{facts.email}</a>
            </li>
          )}
          {facts.phone && (
            <li>
              <a href={`tel:${facts.phone.tel}`}>{facts.phone.display}</a>
            </li>
          )}
        </ul>
      </section>
      <nav aria-label={POLICY_UI.otherPolicies[lang]} className="policy__others">
        <h2>{POLICY_UI.otherPolicies[lang]}</h2>
        <ul>
          {POLICY_ORDER.filter((other) => other !== id).map((other) => (
            <li key={other}>
              <Link to={localizedPath(policies[other].path, lang)}>
                {policies[other].title[lang]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
