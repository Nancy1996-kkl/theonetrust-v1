import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  TAX_CERTIFICATE_STATUSES,
  type TaxCertificateStatusDto,
  type TaxTrackingItem,
  type TaxYearSummary,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { istFor, moneyFor, recentYears } from './ledger-format.ts';
import { LEDGER_STRINGS, fillText } from './ledger-strings.ts';

/**
 * Form 113 by financial year (#35): totals, the 31 May reminder, the audited CSV download, bulk
 * "filed" with the acknowledgement number, and per-donation certificate status with evidence.
 */
export function TaxFilingSection() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const money = moneyFor(lang);
  const ist = istFor(lang);
  const years = recentYears(new Date());
  const [fy, setFy] = useState('');
  const [summary, setSummary] = useState<TaxYearSummary | null>(null);
  const [items, setItems] = useState<TaxTrackingItem[]>([]);
  const [reason, setReason] = useState('');
  const [mark, setMark] = useState({ ref: '', reason: '' });
  const [editing, setEditing] = useState<{
    id: string;
    status: TaxCertificateStatusDto;
    ref113: string;
    ref114: string;
    date: string;
    reason: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fail = (e: unknown) =>
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));

  useEffect(() => {
    let cancelled = false;
    api
      .taxSummary(fy || undefined)
      .then(async (s) => {
        const list = await api.taxTracking(s.financialYear);
        if (cancelled) return;
        setSummary(s);
        setItems(list.items);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fail only formats text
  }, [api, fy, attempt]);

  async function markFiled(event: FormEvent) {
    event.preventDefault();
    if (!summary || mark.ref.trim().length < 3 || mark.reason.trim().length < 5)
      return setError(l.reasonError);
    try {
      const r = await api.markForm113Filed(
        summary.financialYear,
        mark.ref.trim(),
        mark.reason.trim(),
      );
      setMessage(fillText(l.filingMarked, { count: r.updated }));
      setMark({ ref: '', reason: '' });
      setAttempt((n) => n + 1);
    } catch (e) {
      fail(e);
    }
  }

  async function saveStatus(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    if (editing.reason.trim().length < 5) return setError(l.reasonError);
    try {
      await api.updateTaxStatus(editing.id, {
        status: editing.status,
        ...(editing.ref113.trim() && { form113Reference: editing.ref113.trim() }),
        ...(editing.ref114.trim() && { form114Reference: editing.ref114.trim() }),
        ...(editing.date && { form114IssuedOn: editing.date }),
        reason: editing.reason.trim(),
      });
      setEditing(null);
      setMessage(l.certSaved);
      setAttempt((n) => n + 1);
    } catch (e) {
      fail(e);
    }
  }

  const columns: Column<TaxTrackingItem>[] = [
    {
      key: 'ref',
      header: l.colReference,
      rowHeader: true,
      cell: (i) => <Link to={`/admin/donations/${i.donationId}`}>{i.reference}</Link>,
    },
    {
      key: 'status',
      header: l.colCert,
      cell: (i) => (
        <span className="admin-email__status">
          <StatusPill
            tone={
              i.status === 'PENDING_TRUST_FILING' || i.status === 'CORRECTION_REQUIRED'
                ? 'warning'
                : 'success'
            }
          >
            {l.certStatuses[i.status]}
          </StatusPill>
          <Button
            variant="secondary"
            onClick={() =>
              setEditing({
                id: i.id,
                status: i.status,
                ref113: i.form113Reference ?? '',
                ref114: i.form114Reference ?? '',
                date: i.form114IssuedOn ?? '',
                reason: '',
              })
            }
          >
            {l.certUpdate} <span className="visually-hidden">{i.reference}</span>
          </Button>
        </span>
      ),
    },
    { key: 'amount', header: l.colAmount, align: 'end', cell: (i) => money(i.netPaise) },
    { key: 'paid', header: l.paidAt, cell: (i) => ist(i.paidAt) },
    { key: 'donor', header: l.colDonor, cell: (i) => i.donorName },
    { key: 'pan', header: l.colPan, cell: (i) => i.panMasked ?? '—' },
  ];

  return (
    <section aria-labelledby="tax-filing">
      <h2 id="tax-filing">{l.filingTitle}</h2>
      <p>{l.filingIntro}</p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <SelectField
        label={l.filingYear}
        value={fy || summary?.financialYear || ''}
        onChange={(e) => setFy(e.target.value)}
        options={years.map((y) => ({ value: y, label: y }))}
      />
      {summary && (
        <>
          <p>
            {fillText(l.filingTotals, {
              donations: summary.donations,
              donors: summary.donors,
              total: money(summary.totalPaise),
            })}
          </p>
          <p>
            {summary.daysLeft >= 0
              ? fillText(l.filingDeadline, { date: summary.deadline, days: summary.daysLeft })
              : fillText(l.filingOverdue, { date: summary.deadline })}
          </p>
          {summary.reminder && (
            <p>
              <StatusPill tone="warning">{l.filingReminder}</StatusPill>
            </p>
          )}
          <p className="admin-muted">{l.filingDraft}</p>
          <div className="admin-form">
            <TextField
              label={l.filingReason}
              maxLength={400}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {reason.trim().length >= 5 && (
              <a
                className="ui-button ui-button--secondary"
                href={api.form113Url(summary.financialYear, reason.trim())}
                download
              >
                {l.filingDownload}
              </a>
            )}
          </div>
          <form
            className="admin-form admin-decision"
            onSubmit={markFiled}
            aria-labelledby="tax-mark"
          >
            <h3 id="tax-mark">{l.filingMarkTitle}</h3>
            <TextField
              label={l.filingRef}
              maxLength={80}
              value={mark.ref}
              onChange={(e) => setMark({ ...mark, ref: e.target.value })}
            />
            <TextField
              label={l.reason}
              maxLength={400}
              value={mark.reason}
              onChange={(e) => setMark({ ...mark, reason: e.target.value })}
            />
            <Button type="submit">{l.filingMark}</Button>
          </form>
          <DataTable
            caption={l.filingCaption}
            columns={columns}
            rows={items}
            rowKey={(i) => i.id}
            empty={<p>{l.nothing}</p>}
          />
        </>
      )}
      {editing && (
        <form
          className="admin-form admin-decision"
          onSubmit={saveStatus}
          aria-labelledby="tax-cert"
        >
          <h3 id="tax-cert">{l.colCert}</h3>
          <SelectField
            label={l.colCert}
            value={editing.status}
            onChange={(e) =>
              setEditing({ ...editing, status: e.target.value as TaxCertificateStatusDto })
            }
            options={TAX_CERTIFICATE_STATUSES.map((s) => ({ value: s, label: l.certStatuses[s] }))}
          />
          <TextField
            label={l.filingRef}
            maxLength={80}
            value={editing.ref113}
            onChange={(e) => setEditing({ ...editing, ref113: e.target.value })}
          />
          <TextField
            label={l.cert114Ref}
            maxLength={80}
            value={editing.ref114}
            onChange={(e) => setEditing({ ...editing, ref114: e.target.value })}
          />
          <TextField
            label={l.cert114Date}
            type="date"
            value={editing.date}
            onChange={(e) => setEditing({ ...editing, date: e.target.value })}
          />
          <TextField
            label={l.reason}
            maxLength={400}
            value={editing.reason}
            onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
          />
          <div className="admin-filters__actions">
            <Button type="submit">{l.taxSave}</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {l.cancel}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
