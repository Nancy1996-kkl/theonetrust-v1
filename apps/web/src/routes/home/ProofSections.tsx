import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { DataTable, type Column } from '../../components/ui/DataTable.tsx';
import { StateBlock } from '../../components/ui/StateBlock.tsx';
import { StatusPill } from '../../components/ui/StatusPill.tsx';
import type { TrustFacts } from '../../config/trust-facts.ts';
import type { Bilingual, LandingContent } from '../../content/landing.ts';
import type { ProofContent, TransparencyDocument } from '../../content/proof.ts';
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

/** 8 · Transparency centre — owner-approved documents only; never fake entries. */
export function TransparencySection({ proof, states }: ProofProps) {
  const lang = useLang();
  const date = useDate();
  const { transparency: t } = proof;
  const docs = t.documents.filter((d) => d.approved);
  // Hidden until the trust approves its first document in the dashboard (client, Nov 2026);
  // it then appears by itself. Loading / error states still show so a failure is never silent.
  const status = (states?.transparency ?? READY).status;
  if (status === 'ready' && docs.length === 0) return null;
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
