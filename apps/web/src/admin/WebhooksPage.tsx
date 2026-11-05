import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AdminWebhookItem, AdminWebhookList, WebhookStatusDto } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { istFor } from './ledger-format.ts';
import { LEDGER_STRINGS, fillText } from './ledger-strings.ts';

const FILTERS = ['', 'attention', 'FAILED', 'RECEIVED', 'PROCESSED', 'IGNORED'] as const;
type Filter = (typeof FILTERS)[number];

const TONE: Record<WebhookStatusDto, 'success' | 'warning' | 'error' | 'neutral'> = {
  PROCESSED: 'success',
  IGNORED: 'neutral',
  RECEIVED: 'warning',
  FAILED: 'error',
};

/**
 * `/admin/webhooks` (#39): what Razorpay sent and how it was handled. Read-only: a failed
 * delivery is retried by Razorpay; the owner re-checks a donation from its own page.
 */
export function WebhooksPage() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const ist = istFor(lang);
  const [filter, setFilter] = useState<Filter>('');
  const [data, setData] = useState<AdminWebhookList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .webhooks(
        filter === 'attention' ? { attention: true } : filter ? { status: filter } : undefined,
      )
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(
            errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')),
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [api, t, filter, attempt]);

  const columns: Column<AdminWebhookItem>[] = [
    { key: 'event', header: l.whEvent, rowHeader: true, cell: (w) => w.eventType },
    {
      key: 'status',
      header: l.whStatus,
      cell: (w) => (
        <span className="admin-email__status">
          <StatusPill tone={TONE[w.status]}>{l.whStatuses[w.status]}</StatusPill>
          {w.needsAttention && <StatusPill tone="warning">{l.whNeedsLook}</StatusPill>}
        </span>
      ),
    },
    { key: 'note', header: l.whNote, cell: (w) => w.note ?? '—' },
    { key: 'attempts', header: l.whAttempts, align: 'end', cell: (w) => w.attempts },
    { key: 'received', header: l.whReceived, cell: (w) => ist(w.receivedAt) },
    {
      key: 'donation',
      header: l.whDonation,
      cell: (w) =>
        w.donation ? (
          <Link to={`/admin/donations/${w.donation.id}`}>{w.donation.reference}</Link>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="admin-page admin-page--wide">
      <h1>{l.whTitle}</h1>
      <p>{fillText(l.whIntro, { minutes: data?.staleAfterMinutes ?? 30 })}</p>
      <SelectField
        label={l.whFilter}
        value={filter}
        onChange={(e) => setFilter(e.target.value as Filter)}
        options={FILTERS.map((f) => ({
          value: f,
          label: f === '' ? l.whAll : f === 'attention' ? l.whAttention : l.whStatuses[f],
        }))}
      />
      {error ? (
        <StateBlock
          state="error"
          title={t.loadErrorTitle}
          headingLevel={2}
          action={
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              {t.retry}
            </Button>
          }
        >
          {error}
        </StateBlock>
      ) : !data ? (
        <StateBlock state="loading" title={t.loading} headingLevel={2} />
      ) : (
        <DataTable
          caption={l.whCaption}
          columns={columns}
          rows={data.items}
          rowKey={(w) => w.id}
          empty={<p>{l.nothing}</p>}
        />
      )}
    </div>
  );
}
