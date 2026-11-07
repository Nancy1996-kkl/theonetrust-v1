import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  DONATION_STATUSES,
  LEDGER_RECEIPT_FILTERS,
  LEDGER_SORTS,
  RECEIPT_METHODS,
  type LedgerItem,
  type LedgerList,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { istFor, moneyFor } from './ledger-format.ts';
import { LEDGER_STRINGS, fillText } from './ledger-strings.ts';
import { LEDGER_KEYS as KEYS, filtersFrom } from './ledger-format.ts';

/**
 * `/admin/donations` (#31): search and filter every donation. Filters live in the URL, so
 * back/forward and a shared link keep them. Read-only: nothing here edits a donation.
 */
export function DonationsPage() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const money = moneyFor(lang);
  const ist = istFor(lang);
  const [params, setParams] = useSearchParams();
  const filters = filtersFrom(params);
  const key = params.toString();
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(KEYS.filter((k) => k !== 'page').map((k) => [k, params.get(k) ?? ''])),
  );
  const [data, setData] = useState<{ key: string; list: LedgerList } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .donations(filtersFrom(new URLSearchParams(key)))
      .then((list) => {
        if (cancelled) return;
        setData({ key, list });
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
  }, [api, t, key, attempt]);

  function apply(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) if (v.trim()) next.set(k, v.trim());
    setParams(next);
  }

  function goTo(page: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  }

  const columns: Column<LedgerItem>[] = [
    {
      key: 'reference',
      header: l.colReference,
      rowHeader: true,
      cell: (d) => <Link to={`/admin/donations/${d.id}`}>{d.reference}</Link>,
    },
    { key: 'amount', header: l.colAmount, align: 'end', cell: (d) => money(d.amountPaise) },
    {
      key: 'status',
      header: l.colStatus,
      cell: (d) => (
        <StatusPill
          tone={
            d.status === 'PAID'
              ? 'success'
              : d.status === 'FAILED' || d.status === 'MANUAL_REVIEW'
                ? 'error'
                : d.status === 'REFUNDED' || d.status === 'REFUND_PENDING'
                  ? 'warning'
                  : 'info'
          }
        >
          {l.statuses[d.status]}
        </StatusPill>
      ),
    },
    { key: 'created', header: l.colCreated, cell: (d) => ist(d.createdAt) },
    { key: 'method', header: l.colMethod, cell: (d) => (d.method ? l.methods[d.method] : '—') },
    {
      key: 'purpose',
      header: l.colPurpose,
      cell: (d) => (d.programme ? d.programme[lang] : l.generalFund),
    },
    { key: 'donor', header: l.colDonor, cell: (d) => d.donorName },
    {
      key: 'receipt',
      header: l.colReceipt,
      cell: (d) =>
        d.receipt ? `${d.receipt.number} · ${l.receiptStates[d.receipt.state]}` : l.none,
    },
  ];

  const list = data?.key === key ? data.list : null;
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const select = (
    name: string,
    label: string,
    options: Array<{ value: string; label: string }>,
  ) => (
    <SelectField
      label={label}
      value={form[name] ?? ''}
      onChange={(e) => setForm({ ...form, [name]: e.target.value })}
      options={[{ value: '', label: l.any }, ...options]}
    />
  );

  return (
    <div className="admin-page admin-page--wide">
      <h1>{l.ledgerTitle}</h1>
      <p>{l.ledgerIntro}</p>
      <form className="admin-filters" onSubmit={apply} role="search">
        <TextField
          label={l.search}
          value={form.q ?? ''}
          maxLength={64}
          onChange={(e) => setForm({ ...form, q: e.target.value })}
        />
        <TextField
          label={l.from}
          type="date"
          value={form.from ?? ''}
          onChange={(e) => setForm({ ...form, from: e.target.value })}
        />
        <TextField
          label={l.to}
          type="date"
          value={form.to ?? ''}
          onChange={(e) => setForm({ ...form, to: e.target.value })}
        />
        {select(
          'status',
          l.status,
          DONATION_STATUSES.map((s) => ({ value: s, label: l.statuses[s] })),
        )}
        {select(
          'method',
          l.method,
          RECEIPT_METHODS.map((m) => ({ value: m, label: l.methods[m] })),
        )}
        {select(
          'receipt',
          l.receipt,
          LEDGER_RECEIPT_FILTERS.map((r) => ({ value: r, label: l.receiptFilters[r] })),
        )}
        <TextField
          label={l.programme}
          value={form.programme ?? ''}
          maxLength={40}
          onChange={(e) => setForm({ ...form, programme: e.target.value })}
        />
        <SelectField
          label={l.sort}
          value={form.sort || 'created_desc'}
          onChange={(e) => setForm({ ...form, sort: e.target.value })}
          options={LEDGER_SORTS.map((s) => ({ value: s, label: l.sorts[s] }))}
        />
        <div className="admin-filters__actions">
          <Button type="submit">{l.apply}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setForm({});
              setParams(new URLSearchParams());
            }}
          >
            {l.clear}
          </Button>
        </div>
      </form>
      <p>
        <a href={api.donationsExportUrl(filters)} download>
          {l.exportCsv}
        </a>
      </p>
      {error && (
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
      )}
      {!list && !error && <StateBlock state="loading" title={t.loading} headingLevel={2} />}
      {list && (
        <>
          <DataTable
            caption={l.caption}
            columns={columns}
            rows={list.items}
            rowKey={(d) => d.id}
            empty={<p>{l.noResults}</p>}
          />
          <nav className="admin-pager" aria-label={l.caption}>
            <Button
              variant="secondary"
              disabled={list.page <= 1}
              onClick={() => goTo(list.page - 1)}
            >
              {l.previous}
            </Button>
            <span>{fillText(l.pageOf, { page: list.page, pages, total: list.total })}</span>
            <Button
              variant="secondary"
              disabled={list.page >= pages}
              onClick={() => goTo(list.page + 1)}
            >
              {l.next}
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
