import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { DataTable, type Column } from '../../components/ui/DataTable.tsx';
import { StateBlock } from '../../components/ui/StateBlock.tsx';
import { StatusPill } from '../../components/ui/StatusPill.tsx';
import type { TrustFacts } from '../../config/trust-facts.ts';
import type { Bilingual, LandingContent } from '../../content/landing.ts';
import {
  isPublishableAllocation,
  isWellFormedAllocation,
  type Allocation,
  type ProofContent,
  type TransparencyDocument,
} from '../../content/proof.ts';
import { useLang } from '../../i18n/use-lang.ts';
import { READY, useDate } from './section-state.ts';
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

export function Draft({ confirmed, label }: { confirmed: boolean; label: Bilingual }) {
  const lang = useLang();
  if (confirmed) return null;
  return <StatusPill tone="warning">{label[lang]}</StatusPill>;
}

/** A section's body, or its designed loading / error state instead (issue #13). */
export function StateGate({
  state,
  proof,
  children,
}: {
  state: SectionState;
  proof: ProofContent;
  children: ReactNode;
}) {
  const lang = useLang();
  const { states } = proof;
  if (state.status === 'loading') {
    return <StateBlock state="loading" title={states.loadingTitle[lang]} />;
  }
  if (state.status === 'error') {
    return (
      <StateBlock
        state="error"
        title={states.errorTitle[lang]}
        action={<Button onClick={state.retry}>{states.retry[lang]}</Button>}
      >
        <p>{states.errorBody[lang]}</p>
      </StateBlock>
    );
  }
  return <>{children}</>;
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
  const body = (
    <StateGate state={state} proof={proof}>
      {children}
    </StateGate>
  );
  return (
    <section id={id} className="landing-section" aria-labelledby={`${id}-title`}>
      <Reveal className="landing__wrap">
        <h2 id={`${id}-title`}>{title[lang]}</h2>
        {body}
      </Reveal>
    </section>
  );
}

/** Where donations go — text percentages with bars (never colour or length alone). */
function AllocationChart({
  allocation,
  proof,
  showDrafts,
  draftLabel,
}: {
  allocation: Allocation;
  proof: ProofContent;
  showDrafts: boolean;
  draftLabel: Bilingual;
}) {
  const lang = useLang();
  const { transparency: t } = proof;
  const show =
    isPublishableAllocation(allocation) || (showDrafts && isWellFormedAllocation(allocation));
  if (!show) return null;
  const percent = new Intl.NumberFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    style: 'percent',
    maximumFractionDigits: 1,
  });
  return (
    <figure className="proof-allocation" aria-labelledby="allocation-title">
      <h3 id="allocation-title" className="proof-allocation__title">
        {t.allocationTitle[lang]}
      </h3>
      <Draft confirmed={allocation.confirmed} label={draftLabel} />
      <ul className="proof-allocation__list">
        {allocation.items.map((item) => (
          <li key={item.id} className="proof-allocation__item">
            <span className="proof-allocation__label">{item.label[lang]}</span>
            <span className="proof-allocation__value">{percent.format(item.percent / 100)}</span>
            <span className="proof-allocation__track" aria-hidden="true">
              <span className="proof-allocation__bar" style={{ inlineSize: `${item.percent}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="proof-allocation__meta">
        {t.allocationSourceLabel[lang]}: {allocation.source?.[lang]} ·{' '}
        {t.allocationPeriodLabel[lang]}: {allocation.period?.[lang]}
      </figcaption>
    </figure>
  );
}

/** 8 · Transparency centre — owner-approved documents only; never fake entries. */
export function TransparencySection({ proof, landing, showDrafts, states }: ProofProps) {
  const lang = useLang();
  const date = useDate();
  const { transparency: t } = proof;
  const docs = t.documents.filter((d) => d.approved);
  const chart =
    isPublishableAllocation(t.allocation) || (showDrafts && isWellFormedAllocation(t.allocation));
  // Hidden until the trust approves its first document or confirms its "where donations go"
  // figures in the dashboard (client, Nov 2026); it then appears by itself. Loading / error states
  // still show so a failure is never silent.
  const status = (states?.transparency ?? READY).status;
  if (status === 'ready' && docs.length === 0 && !chart) return null;
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
      <AllocationChart
        allocation={t.allocation}
        proof={proof}
        showDrafts={showDrafts}
        draftLabel={landing.draftLabel}
      />
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
