import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { AdminReceiptItem, AdminReceiptList } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { istFor, moneyFor } from './ledger-format.ts';
import { LEDGER_STRINGS, fillText } from './ledger-strings.ts';

/** Copy link · Download PDF · Send email again (with a reason). Shared with the detail page. */
export function ReceiptActions({
  receipt,
  onResent,
}: {
  receipt: AdminReceiptItem;
  onResent?: () => void;
}) {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const [note, setNote] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = receipt.token ? `${window.location.origin}/receipt/${receipt.token}` : null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote(l.copied);
    } catch {
      setNote(`${l.copyFailed} ${link}`);
    }
  }

  async function resend(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 5) return setReasonError(true);
    setReasonError(false);
    setBusy(true);
    try {
      await api.resendReceipt(receipt.id, reason.trim());
      setNote(l.resent);
      setResending(false);
      setReason('');
      onResent?.();
    } catch (e) {
      setNote(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-receipt-actions">
      {link && (
        <>
          <Button variant="secondary" onClick={() => void copy()}>
            {l.copyLink}
            <span className="visually-hidden"> {receipt.receiptNumber}</span>
          </Button>
          <a
            className="ui-button ui-button--secondary"
            href={api.receiptPdfUrl(receipt.token ?? '', lang)}
            download
          >
            {l.download}
            <span className="visually-hidden"> {receipt.receiptNumber}</span>
          </a>
        </>
      )}
      {receipt.canResend && !resending && (
        <Button variant="secondary" onClick={() => setResending(true)}>
          {l.resend}
          <span className="visually-hidden"> {receipt.receiptNumber}</span>
        </Button>
      )}
      {resending && (
        <form className="admin-form" onSubmit={resend}>
          <TextField
            label={l.reason}
            maxLength={400}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reasonError ? l.reasonError : undefined}
          />
          <Button type="submit" loading={busy}>
            {l.resend}
          </Button>
        </form>
      )}
      {note && <p role="status">{note}</p>}
    </div>
  );
}

/** `/admin/receipts` (#31): every acknowledgement with its state and the donor email status. */
export function ReceiptsPage() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const money = moneyFor(lang);
  const ist = istFor(lang);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminReceiptList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .receipts(page)
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
  }, [api, t, page, attempt]);

  if (!data) {
    return error ? (
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
    );
  }

  const columns: Column<AdminReceiptItem>[] = [
    { key: 'number', header: l.colNumber, rowHeader: true, cell: (r) => r.receiptNumber },
    {
      key: 'actions',
      header: l.colAction,
      // Actions sit near the start so they are reachable without scrolling on a phone.
      cell: (r) => <ReceiptActions receipt={r} onResent={() => setAttempt((n) => n + 1)} />,
    },
    {
      key: 'ref',
      header: l.colReference,
      cell: (r) => <Link to={`/admin/donations/${r.donationId}`}>{r.reference}</Link>,
    },
    { key: 'amount', header: l.colAmount, align: 'end', cell: (r) => money(r.amountPaise) },
    {
      key: 'state',
      header: l.colState,
      cell: (r) => (
        <StatusPill tone={r.state === 'VALID' ? 'success' : 'warning'}>
          {l.receiptStates[r.state]}
        </StatusPill>
      ),
    },
    { key: 'issued', header: l.colIssued, cell: (r) => ist(r.issuedAt) },
    {
      key: 'email',
      header: l.colEmail,
      cell: (r) =>
        r.lastEmail
          ? t[`emailStatus${r.lastEmail.status as 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'}`]
          : l.noEmail,
    },
  ];
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="admin-page admin-page--wide">
      <h1>{l.receiptsTitle}</h1>
      <p>{l.receiptsIntro}</p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      <DataTable
        caption={l.receiptsCaption}
        columns={columns}
        rows={data.items}
        rowKey={(r) => r.id}
        empty={<p>{l.receiptsEmpty}</p>}
      />
      <nav className="admin-pager" aria-label={l.receiptsCaption}>
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {l.previous}
        </Button>
        <span>{fillText(l.pageOf, { page, pages, total: data.total })}</span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          {l.next}
        </Button>
      </nav>
    </div>
  );
}
