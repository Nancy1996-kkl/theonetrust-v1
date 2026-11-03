import { useEffect, useState, type FormEvent } from 'react';
import type { AuditEntryDto } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError, type AuditFilters } from './api.ts';
import { auditActionLabel, formatAuditTime, istDayStart } from './audit-labels.ts';

interface FormState {
  action: string;
  from: string;
  to: string;
}

function toFilters(form: FormState): AuditFilters {
  const from = istDayStart(form.from);
  const to = istDayStart(form.to, 1); // "to" date is inclusive
  return {
    ...(form.action && { action: form.action }),
    ...(from && { from }),
    ...(to && { to }),
  };
}

/** `/admin/audit-log` — read-only, newest first, with filters and "show older". */
export function AuditLogPage() {
  const { api, t, lang } = useAdmin();
  const [form, setForm] = useState<FormState>({ action: '', from: '', to: '' });
  const [filters, setFilters] = useState<AuditFilters>({});
  const [items, setItems] = useState<AuditEntryDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  function showError(e: unknown) {
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));
    setStatus('error');
  }

  // First page whenever the filters change (or after "Try again").
  useEffect(() => {
    let cancelled = false;
    api
      .auditLog(filters)
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
  }, [api, filters, reloadKey]);

  async function loadOlder() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.auditLog(filters, cursor);
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
    setFilters(toFilters(form));
  }

  const columns: Column<AuditEntryDto>[] = [
    {
      key: 'when',
      header: t.auditWhen,
      rowHeader: true,
      cell: (row) => <time dateTime={row.createdAt}>{formatAuditTime(row.createdAt, lang)}</time>,
    },
    { key: 'who', header: t.auditWho, cell: (row) => row.actorEmail ?? t.auditSystem },
    {
      key: 'what',
      header: t.auditWhat,
      cell: (row) => (
        <>
          {auditActionLabel(row.action, lang)}
          <code className="admin-audit__code">{row.action}</code>
        </>
      ),
    },
    {
      key: 'record',
      header: t.auditRecord,
      cell: (row) => (
        <>
          {row.entityType}
          {row.entityId && <code className="admin-audit__code">{row.entityId.slice(0, 8)}</code>}
        </>
      ),
    },
    { key: 'fields', header: t.auditFields, cell: (row) => row.changedFields.join(', ') || '—' },
    { key: 'reason', header: t.auditReason, cell: (row) => row.reason ?? '—' },
  ];

  return (
    <div className="admin-page admin-page--wide">
      <h1>{t.auditTitle}</h1>
      <p>{t.auditIntro}</p>
      <form className="admin-filters" onSubmit={apply} aria-label={t.auditFilters}>
        <SelectField
          label={t.auditAction}
          value={form.action}
          onChange={(e) => setForm({ ...form, action: e.target.value })}
          options={[
            { value: '', label: t.auditActionAll },
            { value: 'auth', label: t.auditActionAuth },
            { value: 'admin', label: t.auditActionAdmin },
          ]}
        />
        <TextField
          label={t.auditFrom}
          type="date"
          value={form.from}
          onChange={(e) => setForm({ ...form, from: e.target.value })}
        />
        <TextField
          label={t.auditTo}
          type="date"
          value={form.to}
          onChange={(e) => setForm({ ...form, to: e.target.value })}
        />
        <Button type="submit" variant="secondary">
          {t.auditApply}
        </Button>
      </form>

      {status === 'loading' && <StateBlock state="loading" title={t.loading} headingLevel={2} />}
      {status === 'error' && (
        <StateBlock
          state="error"
          title={t.auditErrorTitle}
          headingLevel={2}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setStatus('loading');
                setReloadKey((k) => k + 1);
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
            caption={t.auditCaption}
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
            empty={
              <StateBlock state="no-results" title={t.auditEmptyTitle} headingLevel={2}>
                {t.auditEmpty}
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
