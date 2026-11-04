import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  HELP_KINDS,
  HELP_REQUEST_STATUSES,
  type HelpCaseFilters,
  type HelpCaseListItem,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { HELP_KIND_LABELS } from '../help/help-messages.ts';
import { errorText, statusLabel, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { formatAuditTime } from './audit-labels.ts';

/** `/admin/help-requests` — the case inbox (plan §5). */
export function HelpInboxPage() {
  const { api, t, lang } = useAdmin();
  const [form, setForm] = useState<HelpCaseFilters>({});
  const [filters, setFilters] = useState<HelpCaseFilters>({});
  const [items, setItems] = useState<HelpCaseListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  function showError(e: unknown) {
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));
    setStatus('error');
  }

  useEffect(() => {
    let cancelled = false;
    api
      .helpCases(filters)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setStatus('ready');
      })
      .catch((e: unknown) => !cancelled && showError(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showError only formats text
  }, [api, filters, attempt]);

  async function loadOlder() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.helpCases(filters, cursor);
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      showError(e);
    } finally {
      setLoadingMore(false);
    }
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    setStatus('loading');
    setFilters({ ...form });
  }

  const set = (key: keyof HelpCaseFilters) => (value: string) =>
    setForm(
      (f) =>
        Object.fromEntries(
          Object.entries({ ...f, [key]: value }).filter(([, v]) => Boolean(v)),
        ) as HelpCaseFilters,
    );

  const columns: Column<HelpCaseListItem>[] = [
    {
      key: 'reference',
      header: t.helpReference,
      rowHeader: true,
      cell: (row) => (
        <Link to={`/admin/help-requests/${row.id}`}>
          {row.reference}
          <span className="visually-hidden"> — {t.helpOpen}</span>
        </Link>
      ),
    },
    {
      key: 'received',
      header: t.helpReceived,
      cell: (row) => <time dateTime={row.createdAt}>{formatAuditTime(row.createdAt, lang)}</time>,
    },
    {
      key: 'status',
      header: t.helpStatus,
      cell: (row) => (
        <StatusPill
          tone={row.status === 'NEW' ? 'warning' : row.status === 'CLOSED' ? 'neutral' : 'info'}
        >
          {statusLabel(t, row.status)}
        </StatusPill>
      ),
    },
    {
      key: 'type',
      header: t.helpType,
      cell: (row) =>
        row.kind === 'CALLBACK'
          ? t.helpKindCallback
          : row.helpTypes
              .map((k) => HELP_KIND_LABELS[k as keyof typeof HELP_KIND_LABELS]?.[lang] ?? k)
              .join(', '),
    },
    {
      key: 'language',
      header: t.helpLanguage,
      cell: (row) => (row.callLanguage === 'ta' ? 'தமிழ்' : 'English'),
    },
    { key: 'phone', header: t.helpPhone, cell: (row) => row.phoneMasked },
    { key: 'assignee', header: t.helpAssignee, cell: (row) => row.assigneeEmail ?? '—' },
    { key: 'remind', header: t.helpRemind, cell: (row) => row.remindOn ?? '—' },
  ];

  return (
    <div className="admin-page admin-page--wide">
      <h1>{t.helpTitle}</h1>
      <p>{t.helpIntro}</p>
      <form className="admin-filters" onSubmit={apply} aria-label={t.helpFilters}>
        <SelectField
          label={t.helpStatus}
          value={form.status ?? ''}
          onChange={(e) => set('status')(e.target.value)}
          options={[
            { value: '', label: t.helpAny },
            ...HELP_REQUEST_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) })),
          ]}
        />
        <SelectField
          label={t.helpType}
          value={form.helpType ?? ''}
          onChange={(e) => set('helpType')(e.target.value)}
          options={[
            { value: '', label: t.helpAny },
            ...HELP_KINDS.map((k) => ({ value: k, label: HELP_KIND_LABELS[k][lang] })),
          ]}
        />
        <SelectField
          label={t.helpLanguage}
          value={form.language ?? ''}
          onChange={(e) => set('language')(e.target.value)}
          options={[
            { value: '', label: t.helpAny },
            { value: 'ta', label: 'தமிழ்' },
            { value: 'en', label: 'English' },
          ]}
        />
        <SelectField
          label={t.helpKind}
          value={form.kind ?? ''}
          onChange={(e) => set('kind')(e.target.value)}
          options={[
            { value: '', label: t.helpAny },
            { value: 'FULL', label: t.helpKindFull },
            { value: 'CALLBACK', label: t.helpKindCallback },
          ]}
        />
        <Button type="submit" variant="secondary">
          {t.auditApply}
        </Button>
      </form>
      <p>
        <a href={api.helpExportUrl(filters)} download>
          {t.helpExport}
        </a>
      </p>

      {status === 'loading' && <StateBlock state="loading" title={t.loading} headingLevel={2} />}
      {status === 'error' && (
        <StateBlock
          state="error"
          title={t.helpErrorTitle}
          headingLevel={2}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setStatus('loading');
                setAttempt((n) => n + 1);
              }}
            >
              {t.retry}
            </Button>
          }
        >
          {error}
        </StateBlock>
      )}
      {status === 'ready' && (
        <>
          <DataTable
            caption={t.helpCaption}
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
            empty={
              <StateBlock state="no-results" title={t.helpEmptyTitle} headingLevel={2}>
                {t.helpEmpty}
              </StateBlock>
            }
          />
          {cursor && (
            <Button variant="secondary" loading={loadingMore} onClick={() => void loadOlder()}>
              {t.auditLoadMore}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
