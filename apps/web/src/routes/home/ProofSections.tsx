import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PAISE_PER_RUPEE, type Paise } from '@theonetrust/contracts';
import { AmountPicker } from '../../components/ui/AmountPicker.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { DataTable, type Column } from '../../components/ui/DataTable.tsx';
import { StateBlock } from '../../components/ui/StateBlock.tsx';
import { StatusPill } from '../../components/ui/StatusPill.tsx';
import type { TrustFacts } from '../../config/trust-facts.ts';
import type { Bilingual, LandingContent } from '../../content/landing.ts';
import {
  isPublishableMetric,
  isPublishableStory,
  type ProofContent,
  type TransparencyDocument,
} from '../../content/proof.ts';
import { homePath } from '../../i18n/lang.ts';
import { useLang, useMessages } from '../../i18n/use-lang.ts';
import { useDonationDraft } from '../../state/donation-draft.ts';
import { PolicyNotice } from '../policy/PolicyNotice.tsx';
import { Reveal } from './Reveal.tsx';

/** Where a section's data stands. Static content is always ready; API data (#21) uses all three. */
export type SectionState =
  { status: 'ready' } | { status: 'loading' } | { status: 'error'; retry: () => void };

export interface ProofProps {
  proof: ProofContent;
  landing: LandingContent;
  facts: TrustFacts;
  showDrafts: boolean;
  /** Per-section data state; missing = ready. */
  states?: Partial<Record<'impact' | 'transparency' | 'faq', SectionState>>;
}

const READY: SectionState = { status: 'ready' };

function useDate() {
  const lang = useLang();
  const format = new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  return (iso: string) => format.format(new Date(iso));
}

function Draft({ confirmed, label }: { confirmed: boolean; label: Bilingual }) {
  const lang = useLang();
  if (confirmed) return null;
  return <StatusPill tone="warning">{label[lang]}</StatusPill>;
}

/** Section with a heading and its designed loading / error states (issue #13). */
function SectionFrame({
  id,
  title,
  state,
  proof,
  children,
}: {
  id: string;
  title: Bilingual;
  state: SectionState;
  proof: ProofContent;
  children: ReactNode;
}) {
  const lang = useLang();
  const { states } = proof;
  let body = children;
  if (state.status === 'loading') {
    body = <StateBlock state="loading" title={states.loadingTitle[lang]} />;
  } else if (state.status === 'error') {
    body = (
      <StateBlock
        state="error"
        title={states.errorTitle[lang]}
        action={<Button onClick={state.retry}>{states.retry[lang]}</Button>}
      >
        <p>{states.errorBody[lang]}</p>
      </StateBlock>
    );
  }
  return (
    <section id={id} className="landing-section" aria-labelledby={`${id}-title`}>
      <Reveal className="landing__wrap">
        <h2 id={`${id}-title`}>{title[lang]}</h2>
        {body}
      </Reveal>
    </section>
  );
}

/** 7 · Impact and stories — only sourced, dated metrics and consented stories; never zeros. */
export function ImpactSection({ proof, landing, showDrafts, states }: ProofProps) {
  const lang = useLang();
  const date = useDate();
  const { impact } = proof;
  const metrics = impact.metrics.filter(
    (m) => isPublishableMetric(m) && (m.confirmed || showDrafts),
  );
  const stories = impact.stories.filter(
    (s) => isPublishableStory(s) && (s.confirmed || showDrafts),
  );
  const empty = metrics.length === 0 && stories.length === 0;
  return (
    <SectionFrame id="impact" title={impact.title} state={states?.impact ?? READY} proof={proof}>
      {empty ? (
        <StateBlock
          state="empty"
          title={impact.emptyTitle[lang]}
          action={<a href={`${homePath(lang)}#transparency`}>{impact.seeDocuments[lang]}</a>}
        >
          <p>{impact.emptyBody[lang]}</p>
        </StateBlock>
      ) : (
        <>
          {metrics.length > 0 && (
            <ul className="proof-metrics">
              {metrics.map((m) => (
                <li key={m.id} className="proof-metrics__item">
                  <span className="proof-metrics__value">{m.value}</span>
                  <span className="proof-metrics__label">{m.label[lang]}</span>
                  <span className="proof-metrics__meta">
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
            <div className="proof-stories">
              {stories.map((s) => (
                <article key={s.id} className="proof-stories__item">
                  <h3>{s.title[lang]}</h3>
                  <p>{s.body[lang]}</p>
                  <Draft confirmed={s.confirmed} label={landing.draftLabel} />
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </SectionFrame>
  );
}

/** 8 · Transparency centre — owner-approved documents only; never fake entries. */
export function TransparencySection({ proof, states }: ProofProps) {
  const lang = useLang();
  const date = useDate();
  const { transparency: t } = proof;
  const docs = t.documents.filter((d) => d.approved);
  const columns: Column<TransparencyDocument>[] = [
    { key: 'title', header: t.columns.document[lang], cell: (d) => d.title[lang], rowHeader: true },
    {
      key: 'language',
      header: t.columns.language[lang],
      cell: (d) => t.languageNames[d.language][lang],
    },
    { key: 'period', header: t.columns.period[lang], cell: (d) => d.period[lang] },
    {
      key: 'published',
      header: t.columns.published[lang],
      cell: (d) => <time dateTime={d.published}>{date(d.published)}</time>,
    },
    {
      key: 'file',
      header: t.columns.file[lang],
      cell: (d) => (
        <a href={d.url} download>
          {t.download[lang]}
          <span className="visually-hidden">
            {': '}
            {d.title[lang]}
          </span>{' '}
          ({d.fileType})
        </a>
      ),
    },
  ];
  return (
    <SectionFrame
      id="transparency"
      title={t.title}
      state={states?.transparency ?? READY}
      proof={proof}
    >
      <DataTable
        caption={t.tableCaption[lang]}
        hideCaption
        columns={columns}
        rows={docs}
        rowKey={(d) => d.id}
        empty={
          <StateBlock state="empty" title={t.emptyTitle[lang]}>
            <p>{t.emptyBody[lang]}</p>
          </StateBlock>
        }
      />
    </SectionFrame>
  );
}

/** 9 · FAQ — native <details> accordion (keyboard and screen-reader friendly). */
export function FaqSection({ proof, landing, showDrafts, states }: ProofProps) {
  const lang = useLang();
  const { faq } = proof;
  const items = faq.items.filter((f) => f.confirmed || showDrafts);
  return (
    <SectionFrame id="faq" title={faq.title} state={states?.faq ?? READY} proof={proof}>
      {items.length === 0 ? (
        <StateBlock state="empty" title={faq.emptyTitle[lang]} />
      ) : (
        <div className="proof-faq">
          {items.map((f) => (
            <details key={f.id} className="proof-faq__item" id={`faq-${f.id}`}>
              <summary className="proof-faq__question">{f.question[lang]}</summary>
              <div className="proof-faq__answer">
                <p>{f.answer[lang]}</p>
                <Draft confirmed={f.confirmed} label={landing.draftLabel} />
              </div>
            </details>
          ))}
        </div>
      )}
    </SectionFrame>
  );
}

/** 10 · Contact — verified details only, plus Ask for help (secondary, never looks like Donate). */
export function ContactSection({ proof, facts }: ProofProps) {
  const lang = useLang();
  const home = homePath(lang);
  const { contact } = proof;
  const t = useMessages();
  const rows: Array<[string, ReactNode]> = [];
  if (facts.phone)
    rows.push([t.phoneWhatsapp, <a href={`tel:${facts.phone.tel}`}>{facts.phone.display}</a>]);
  if (facts.email) rows.push([t.email, <a href={`mailto:${facts.email}`}>{facts.email}</a>]);
  if (facts.area) rows.push([t.location, facts.area[lang]]);
  if (facts.address) rows.push([contact.addressLabel[lang], facts.address[lang]]);
  if (facts.callHours) rows.push([t.callHours, facts.callHours[lang]]);

  return (
    <section id="contact" className="landing-section" aria-labelledby="contact-title">
      <Reveal className="landing__wrap proof-contact">
        <div>
          <h2 id="contact-title">{contact.title[lang]}</h2>
          <dl className="proof-contact__facts">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="proof-contact__help surface">
          <h3>{contact.helpTitle[lang]}</h3>
          <p>{contact.helpBody[lang]}</p>
          <div className="proof-contact__actions">
            <Link className="ui-button ui-button--secondary" to={`${home}#get-help`}>
              {contact.helpCta[lang]}
            </Link>
            {facts.whatsappUrl && (
              <a
                className="ui-button ui-button--ghost"
                href={facts.whatsappUrl}
                rel="noopener noreferrer"
              >
                {contact.whatsappCta[lang]}
              </a>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** 11 · Final call to action — choose an amount, then Donate opens the panel pre-filled. */
export function FinalCtaSection({ proof, landing, showDrafts }: ProofProps) {
  const lang = useLang();
  const { draft, updateDraft } = useDonationDraft();
  const { finalCta } = proof;
  const [amount, setAmount] = useState<Paise | null>(draft.amountPaise);
  const showTitle = finalCta.title.confirmed || showDrafts;
  const query = amount === null ? '' : `?amount=${amount / PAISE_PER_RUPEE}`;
  const href = `${homePath(lang)}${query}#donate`;
  return (
    <section id="give" className="landing-section proof-cta" aria-labelledby="give-title">
      <Reveal className="landing__wrap">
        <h2 id="give-title">
          {showTitle ? finalCta.title.value[lang] : finalCta.fallbackTitle[lang]}
        </h2>
        {showTitle && <Draft confirmed={finalCta.title.confirmed} label={landing.draftLabel} />}
        <div className="proof-cta__form surface">
          <AmountPicker
            legend={finalCta.amountLegend[lang]}
            presetsRupees={finalCta.presetsRupees}
            value={amount}
            onChange={setAmount}
            name="final-cta-amount"
          />
          <Link
            to={href}
            className="ui-button ui-button--donate"
            onClick={() => {
              if (amount !== null) updateDraft({ amountPaise: amount });
            }}
          >
            {finalCta.donateCta[lang]}
          </Link>
          <PolicyNotice />
        </div>
      </Reveal>
    </section>
  );
}
