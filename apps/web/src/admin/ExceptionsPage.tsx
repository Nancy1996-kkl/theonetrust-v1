import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ExceptionQueue, ExceptionQueueItem } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { istFor, moneyFor } from './ledger-format.ts';
import { LEDGER_STRINGS, fillText } from './ledger-strings.ts';

/**
 * `/admin/exceptions` (#31): stale pending payments, mismatches, duplicates, refunds and bank
 * cases. Actions: re-check with Razorpay, or mark an exception resolved — each with a reason,
 * each audited. No status or amount can be set by hand.
 */
export function ExceptionsPage() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const money = moneyFor(lang);
  const ist = istFor(lang);
  const [data, setData] = useState<ExceptionQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<{
    item: ExceptionQueueItem;
    action: 'recheck' | 'resolve';
  } | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) =>
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));

  useEffect(() => {
    let cancelled = false;
    api
      .exceptionQueue()
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
  }, [api, attempt]);

  async function act(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (reason.trim().length < 5) return setReasonError(true);
    setReasonError(false);
    setBusy(true);
    setMessage(null);
    try {
      if (selected.action === 'recheck' && selected.item.donationId) {
        const r = await api.recheckDonation(selected.item.donationId, reason.trim());
        setMessage(fillText(l.rechecked, { status: l.statuses[r.status] }));
      } else if (selected.item.exceptionId) {
        await api.resolveException(selected.item.exceptionId, reason.trim());
        setMessage(l.resolved);
      }
      setSelected(null);
      setReason('');
      setAttempt((n) => n + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="admin-page">
        <h1>{l.exceptionsTitle}</h1>
        {error ? (
          <StateBlock
            state="error"
            title={t.helpErrorTitle}
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

  const columns: Column<ExceptionQueueItem>[] = [
    { key: 'kind', header: l.colKind, rowHeader: true, cell: (i) => l.kinds[i.kind] },
    {
      key: 'action',
      header: l.colAction,
      cell: (i) => (
        <span className="admin-receipt-actions">
          {i.actions.map((action) => (
            <Button
              key={action}
              variant="secondary"
              onClick={() => setSelected({ item: i, action })}
            >
              {action === 'recheck' ? l.recheck : l.resolve}
              <span className="visually-hidden"> {i.reference ?? i.providerPaymentId ?? ''}</span>
            </Button>
          ))}
        </span>
      ),
    },
    {
      key: 'ref',
      header: l.colReference,
      cell: (i) =>
        i.donationId ? (
          <Link to={`/admin/donations/${i.donationId}`}>{i.reference}</Link>
        ) : (
          (i.providerPaymentId ?? '—')
        ),
    },
    {
      key: 'amount',
      header: l.colAmount,
      align: 'end',
      cell: (i) => (i.amountPaise === null ? '—' : money(i.amountPaise)),
    },
    { key: 'when', header: l.colWhen, cell: (i) => ist(i.createdAt) },
  ];

  return (
    <div className="admin-page admin-page--wide">
      <h1>{l.exceptionsTitle}</h1>
      <p>{l.exceptionsIntro}</p>
      <p className="admin-muted">{fillText(l.staleNote, { minutes: data.staleAfterMinutes })}</p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <DataTable
        caption={l.exceptionsCaption}
        columns={columns}
        rows={data.items}
        rowKey={(i) => i.key}
        empty={<p>{l.queueEmpty}</p>}
      />
      {selected && (
        <form className="admin-form admin-decision" onSubmit={act} aria-labelledby="x-decide">
          <h2 id="x-decide">
            {selected.action === 'recheck' ? l.recheck : l.resolve}: {l.kinds[selected.item.kind]} ·{' '}
            {selected.item.reference ?? selected.item.providerPaymentId ?? '—'}
          </h2>
          {selected.action === 'recheck' && <p>{l.recheckHelp}</p>}
          <TextField
            label={l.reason}
            maxLength={400}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reasonError ? l.reasonError : undefined}
          />
          <div className="admin-filters__actions">
            <Button type="submit" loading={busy}>
              {selected.action === 'recheck' ? l.recheck : l.resolve}
            </Button>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              {l.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
