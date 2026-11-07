import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type {
  AdminSubscriptionDetail,
  AdminSubscriptionItem,
  AdminSubscriptionList,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { istFor, moneyFor } from './ledger-format.ts';
import { LEDGER_STRINGS, fillText } from './ledger-strings.ts';

const STATUSES = [
  'CREATED',
  'AUTHENTICATED',
  'ACTIVE',
  'PAUSED',
  'HALTED',
  'CANCELLED',
  'COMPLETED',
] as const;

/**
 * `/admin/monthly-giving` (#33): every monthly gift with its status (as Razorpay reports it),
 * charges and open problems; "Show history" lists status changes and each charge. Read-only.
 */
export function MonthlyGivingPage() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const money = moneyFor(lang);
  const ist = istFor(lang);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminSubscriptionList | null>(null);
  const [detail, setDetail] = useState<AdminSubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fail = (e: unknown) =>
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));

  useEffect(() => {
    let cancelled = false;
    api
      .subscriptions(status || undefined, page)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fail only formats text
  }, [api, status, page, attempt]);

  async function show(id: string) {
    try {
      setDetail(await api.subscription(id));
    } catch (e) {
      fail(e);
    }
  }

  if (!data) {
    return (
      <div className="admin-page">
        <h1>{l.monthlyTitle}</h1>
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
        ) : (
          <StateBlock state="loading" title={t.loading} headingLevel={2} />
        )}
      </div>
    );
  }

  const tone = (s: AdminSubscriptionItem['status']) =>
    s === 'ACTIVE' || s === 'AUTHENTICATED'
      ? 'success'
      : s === 'HALTED'
        ? 'error'
        : s === 'PAUSED' || s === 'CREATED'
          ? 'warning'
          : 'neutral';
  const columns: Column<AdminSubscriptionItem>[] = [
    {
      key: 'ref',
      header: l.colReference,
      rowHeader: true,
      cell: (s) => (
        <Button variant="secondary" onClick={() => void show(s.id)}>
          <span className="visually-hidden">{l.showDetail} </span>
          {s.reference}
        </Button>
      ),
    },
    { key: 'amount', header: l.colAmount, align: 'end', cell: (s) => money(s.amountPaise) },
    {
      key: 'status',
      header: l.colStatus,
      cell: (s) => <StatusPill tone={tone(s.status)}>{l.subStatuses[s.status]}</StatusPill>,
    },
    {
      key: 'route',
      header: l.colMethod,
      cell: (s) => (s.methodRoute === 'upi_autopay' ? l.routeUpi : l.routeMandate),
    },
    {
      key: 'charges',
      header: l.colCharges,
      align: 'end',
      cell: (s) => `${s.paidCharges} / ${s.charges}`,
    },
    { key: 'last', header: l.colLastCharge, cell: (s) => ist(s.lastChargeAt) },
    { key: 'open', header: l.colOpen, align: 'end', cell: (s) => String(s.openExceptions) },
    { key: 'donor', header: l.colDonor, cell: (s) => s.donorName },
  ];
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="admin-page admin-page--wide">
      <h1>{l.monthlyTitle}</h1>
      <p>{l.monthlyIntro}</p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      <SelectField
        label={l.status}
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        options={[
          { value: '', label: l.any },
          ...STATUSES.map((s) => ({ value: s, label: l.subStatuses[s] })),
        ]}
      />
      <DataTable
        caption={l.monthlyCaption}
        columns={columns}
        rows={data.items}
        rowKey={(s) => s.id}
        empty={<p>{l.monthlyEmpty}</p>}
      />
      <nav className="admin-pager" aria-label={l.monthlyCaption}>
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {l.previous}
        </Button>
        <span>{fillText(l.pageOf, { page, pages, total: data.total })}</span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          {l.next}
        </Button>
      </nav>
      {detail && (
        <section aria-labelledby="monthly-detail" className="admin-decision">
          <h2 id="monthly-detail">{fillText(l.monthlyHistory, { reference: detail.reference })}</h2>
          <ul>
            {detail.history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {ist(h.at)} — {l.subStatuses[h.from as AdminSubscriptionItem['status']]} →{' '}
                {l.subStatuses[h.to as AdminSubscriptionItem['status']]} ({h.source})
              </li>
            ))}
            {detail.exceptions.map((x) => (
              <li key={x.id}>
                {ist(x.createdAt)} —{' '}
                {x.kind in l.kinds ? l.kinds[x.kind as keyof typeof l.kinds] : x.kind} ({x.status})
              </li>
            ))}
          </ul>
          <h3>{l.monthlyCharges}</h3>
          {detail.chargeList.length === 0 ? (
            <p>{l.nothing}</p>
          ) : (
            <ul>
              {detail.chargeList.map((c) => (
                <li key={c.id}>
                  <Link to={`/admin/donations/${c.id}`}>{c.reference}</Link> ·{' '}
                  {money(c.amountPaise)} · {l.statuses[c.status]} ·{' '}
                  {c.receipt ? c.receipt.number : l.none}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
