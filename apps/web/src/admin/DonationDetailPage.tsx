import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { DonationDetail } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { istFor, moneyFor } from './ledger-format.ts';
import { LEDGER_STRINGS, fillText } from './ledger-strings.ts';
import { ReceiptActions } from './ReceiptsPage.tsx';

function col<Row>(
  key: string,
  header: string,
  cell: (row: Row) => ReactNode,
  extra: Partial<Pick<Column<Row>, 'align' | 'rowHeader'>> = {},
): Column<Row> {
  return { key, header, cell, ...extra };
}

/** One history table; rows may repeat, so keys include the position. */
function Section<Row>({
  title,
  rows,
  columns,
  rowKey,
  empty,
}: {
  title: string;
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row, index: number) => string;
  empty: string;
}) {
  const wrapped = rows.map((row, index) => ({ row, index }));
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <DataTable
        caption={title}
        hideCaption
        columns={columns.map((c) => ({ ...c, cell: ({ row }: { row: Row }) => c.cell(row) }))}
        rows={wrapped}
        rowKey={({ row, index }) => rowKey(row, index)}
        empty={<p>{empty}</p>}
      />
    </section>
  );
}

/**
 * `/admin/donations/:id` (#31): everything about one donation — payment attempts, status
 * history, webhook history, bank transfers, acknowledgements, emails and exceptions. The only
 * action is an audited "re-check with Razorpay"; amounts and statuses are never edited here.
 */
export function DonationDetailPage() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const money = moneyFor(lang);
  const ist = istFor(lang);
  const { id = '' } = useParams();
  const [data, setData] = useState<DonationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fail = (e: unknown) =>
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));

  useEffect(() => {
    let cancelled = false;
    api
      .donation(id)
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
  }, [api, id, attempt]);

  async function recheck(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 5) return setReasonError(true);
    setReasonError(false);
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.recheckDonation(id, reason.trim());
      setMessage(fillText(l.rechecked, { status: l.statuses[result.status] }));
      setReason('');
      setAttempt((n) => n + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

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

  type D = DonationDetail;
  const summary: [string, string][] = [
    [l.colStatus, l.statuses[data.status]],
    [l.gift, money(data.giftPaise)],
    [l.fee, money(data.feePaise)],
    [l.total, money(data.amountPaise)],
    [l.refunded, money(data.refundedPaise)],
    [l.colCreated, ist(data.createdAt)],
    [l.paidAt, ist(data.paidAt)],
    [l.colMethod, data.method ? l.methods[data.method] : '—'],
    [l.colPurpose, data.programme ? data.programme[lang] : l.generalFund],
    [l.colDonor, data.donorName],
    [l.contact, [data.donorEmailMasked, data.donorPhoneMasked].filter(Boolean).join(' · ') || '—'],
    [l.language, data.locale === 'ta' ? 'தமிழ்' : 'English'],
    [l.wantsReceipt, data.wantsReceipt ? l.yes : l.no],
    [l.taxOptIn, data.taxOptIn ? `${l.yes} · PAN ${data.taxOptIn.panMasked ?? '—'}` : l.no],
  ];

  return (
    <div className="admin-page admin-page--wide">
      <p>
        <Link to="/admin/donations">{l.back}</Link>
      </p>
      <h1>{fillText(l.detailTitle, { reference: data.reference })}</h1>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <section aria-labelledby="d-summary">
        <h2 id="d-summary">{l.summary}</h2>
        <dl className="admin-figures admin-figures--grid">
          {summary.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      {data.channel === 'CHECKOUT' && (
        <form className="admin-form admin-decision" onSubmit={recheck} aria-labelledby="d-recheck">
          <h2 id="d-recheck">{l.recheck}</h2>
          <p>{l.recheckHelp}</p>
          <TextField
            label={l.reason}
            maxLength={400}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reasonError ? l.reasonError : undefined}
          />
          <Button type="submit" variant="secondary" loading={busy}>
            {l.recheck}
          </Button>
        </form>
      )}
      <Section<D['attempts'][number]>
        title={l.attempts}
        rows={data.attempts}
        empty={l.nothing}
        columns={[
          col('order', l.orderId, (a) => a.providerOrderId, { rowHeader: true }),
          col('payment', l.paymentId, (a) => a.providerPaymentId ?? '—'),
          col('status', l.providerStatus, (a) => a.providerStatus ?? '—'),
          col('captured', l.captured, (a) => money(a.capturedPaise), { align: 'end' }),
          col('refunded', l.refunded, (a) => money(a.refundedPaise), { align: 'end' }),
          col('sig', l.signature, (a) => (a.signatureVerified ? l.yes : l.no)),
        ]}
        rowKey={(a) => a.providerOrderId}
      />
      <Section<D['statusHistory'][number]>
        title={l.history}
        rows={data.statusHistory}
        empty={l.nothing}
        columns={[
          col('at', l.colWhen, (h) => ist(h.at), { rowHeader: true }),
          col('change', l.colStatus, (h) => `${l.statuses[h.from]} → ${l.statuses[h.to]}`),
          col('source', l.source, (h) => h.source),
        ]}
        rowKey={(h, i) => `${h.at}-${i}`}
      />
      <Section<D['webhooks'][number]>
        title={l.webhooks}
        rows={data.webhooks}
        empty={l.nothing}
        columns={[
          col('at', l.colWhen, (w) => ist(w.receivedAt), { rowHeader: true }),
          col('event', l.eventType, (w) => w.eventType),
          col('processing', l.processing, (w) =>
            [w.processingStatus, w.processingError].filter(Boolean).join(' · '),
          ),
        ]}
        rowKey={(w, i) => `${w.receivedAt}-${i}`}
      />
      {data.channel === 'BANK_TRANSFER' && (
        <Section<D['bankTransfers'][number]>
          title={l.bankTransfers}
          rows={data.bankTransfers}
          empty={l.nothing}
          columns={[
            col('ref', l.colReference, (b) => b.bankReference, { rowHeader: true }),
            col('amount', l.colAmount, (b) => money(b.amountPaise), { align: 'end' }),
            col('on', l.colWhen, (b) => b.receivedOn),
            col('status', l.colStatus, (b) => b.status),
          ]}
          rowKey={(b) => b.bankReference}
        />
      )}
      <Section<D['receipts'][number]>
        title={l.receipts}
        rows={data.receipts}
        empty={l.nothing}
        columns={[
          col('number', l.colNumber, (r) => r.receiptNumber, { rowHeader: true }),
          col('amount', l.colAmount, (r) => money(r.amountPaise), { align: 'end' }),
          col('state', l.colState, (r) => (
            <StatusPill tone={r.state === 'VALID' ? 'success' : 'warning'}>
              {l.receiptStates[r.state]}
            </StatusPill>
          )),
          col('actions', l.colAction, (r) => <ReceiptActions receipt={r} />),
        ]}
        rowKey={(r) => r.id}
      />
      <Section<D['notifications'][number]>
        title={l.emails}
        rows={data.notifications}
        empty={l.nothing}
        columns={[
          col(
            'template',
            l.eventType,
            (n) =>
              t[
                `emailTpl${n.template === 'owner_donation_paid' || n.template === 'donor_donation_paid' || n.template === 'owner_help_request_new' ? n.template : 'other'}`
              ],
            { rowHeader: true },
          ),
          col('status', l.colStatus, (n) => [n.status, n.lastError].filter(Boolean).join(' · ')),
          col('sent', l.colWhen, (n) => ist(n.sentAt)),
        ]}
        rowKey={(n) => n.id}
      />
      <Section<D['exceptions'][number]>
        title={l.exceptions}
        rows={data.exceptions}
        empty={l.nothing}
        columns={[
          col(
            'kind',
            l.colKind,
            (x) => (x.kind in l.kinds ? l.kinds[x.kind as keyof typeof l.kinds] : x.kind),
            { rowHeader: true },
          ),
          col('status', l.colStatus, (x) => [x.status, x.resolution].filter(Boolean).join(' · ')),
          col('at', l.colWhen, (x) => ist(x.createdAt)),
        ]}
        rowKey={(x) => x.id}
      />
    </div>
  );
}
