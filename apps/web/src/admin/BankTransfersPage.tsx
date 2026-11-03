import { useEffect, useState, type FormEvent } from 'react';
import {
  formatInr,
  type BankCreditDto,
  type BankTransfersResponse,
  type Paise,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, rupeesToPaiseInput, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import type { AdminStrings } from './strings.ts';

const EMPTY_FORM = {
  bankReference: '',
  amount: '',
  receivedOn: '',
  evidence: '',
  donationReference: '',
};

const creditStatus = (t: AdminStrings, s: BankCreditDto['status']) => t[`bankStatus${s}`];

/**
 * `/admin/bank-transfers` (#25). Record a credit from the statement → it is matched or becomes
 * an exception → confirm a second time (retype the reference + a reason) to mark the donation
 * paid. Every step is audited by the API.
 */
export function BankTransfersPage() {
  const { api, t, lang } = useAdmin();
  const money = (p: number) => formatInr(p as Paise, lang === 'ta' ? 'ta-IN' : 'en-IN');
  const [data, setData] = useState<BankTransfersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<{ amount?: true }>({});
  const [selected, setSelected] = useState<BankCreditDto | null>(null);
  const [decision, setDecision] = useState({ reason: '', confirmReference: '' });
  const [decisionError, setDecisionError] = useState(false);
  const [resolveReason, setResolveReason] = useState<Record<string, string>>({});

  const fail = (e: unknown) =>
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));

  useEffect(() => {
    let cancelled = false;
    api
      .bankTransfers()
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fail only formats text
  }, [api, attempt]);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      setAttempt((n) => n + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function record(event: FormEvent) {
    event.preventDefault();
    const amountPaise = rupeesToPaiseInput(form.amount);
    if (amountPaise === null) return setFormErrors({ amount: true });
    setFormErrors({});
    void run(async () => {
      const result = await api.recordBankCredit({
        bankReference: form.bankReference,
        amountPaise,
        receivedOn: form.receivedOn,
        evidence: form.evidence,
        ...(form.donationReference.trim() && {
          donationReference: form.donationReference.trim().toUpperCase(),
        }),
      });
      setForm(EMPTY_FORM);
      return result.matched ? t.bankRecordedMatched : t.bankRecordedException;
    });
  }

  function decide(kind: 'confirm' | 'reject') {
    if (!selected) return;
    if (decision.reason.trim().length < 5) return setDecisionError(true);
    setDecisionError(false);
    void run(async () => {
      if (kind === 'confirm') {
        await api.confirmBankCredit(
          selected.id,
          decision.reason.trim(),
          decision.confirmReference.trim().toUpperCase(),
        );
      } else {
        await api.rejectBankCredit(selected.id, decision.reason.trim());
      }
      setSelected(null);
      setDecision({ reason: '', confirmReference: '' });
      return t.helpSaved;
    });
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

  const creditColumns: Column<BankCreditDto>[] = [
    {
      key: 'utr',
      header: t.bankUtr,
      rowHeader: true,
      // The action sits in the first column so it is reachable without scrolling on a phone.
      cell: (c) =>
        c.status === 'REPORTED' ? (
          <Button variant="secondary" onClick={() => setSelected(c)}>
            <span className="visually-hidden">{t.helpOpen} </span>
            {c.bankReference}
          </Button>
        ) : (
          c.bankReference
        ),
    },
    { key: 'amount', header: t.bankAmount, align: 'end', cell: (c) => money(c.amountPaise) },
    { key: 'on', header: t.bankReceivedOn, cell: (c) => c.receivedOn },
    { key: 'donation', header: t.bankDonation, cell: (c) => c.donationReference ?? '—' },
    { key: 'status', header: t.helpStatus, cell: (c) => creditStatus(t, c.status) },
  ];

  return (
    <div className="admin-page admin-page--wide">
      <h1>{t.bankTitle}</h1>
      <p>{t.bankIntro}</p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}

      <section aria-labelledby="bank-record">
        <h2 id="bank-record">{t.bankRecordTitle}</h2>
        <form className="admin-form" onSubmit={record}>
          <TextField
            label={t.bankUtr}
            required
            value={form.bankReference}
            maxLength={40}
            onChange={(e) => setForm({ ...form, bankReference: e.target.value })}
          />
          <TextField
            label={t.bankAmount}
            required
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            error={formErrors.amount ? t.bankAmountError : undefined}
          />
          <TextField
            label={t.bankReceivedOn}
            type="date"
            required
            value={form.receivedOn}
            onChange={(e) => setForm({ ...form, receivedOn: e.target.value })}
          />
          <TextField
            label={t.bankEvidence}
            required
            maxLength={300}
            value={form.evidence}
            onChange={(e) => setForm({ ...form, evidence: e.target.value })}
          />
          <TextField
            label={t.bankDonationRef}
            showOptional
            maxLength={20}
            value={form.donationReference}
            onChange={(e) => setForm({ ...form, donationReference: e.target.value })}
          />
          <Button type="submit" loading={busy}>
            {t.bankRecord}
          </Button>
        </form>
      </section>

      <section aria-labelledby="bank-credits">
        <h2 id="bank-credits">{t.bankCreditsTitle}</h2>
        <DataTable
          caption={t.bankCreditsCaption}
          columns={creditColumns}
          rows={data.credits}
          rowKey={(c) => c.id}
          empty={<p>{t.bankNone}</p>}
        />
        {selected && (
          <form
            className="admin-form admin-decision"
            onSubmit={(e) => e.preventDefault()}
            aria-labelledby="bank-decide"
          >
            <h3 id="bank-decide">
              {t.bankConfirmTitle}: {selected.bankReference} · {money(selected.amountPaise)} ·{' '}
              {selected.donationReference ?? '—'}
            </h3>
            <TextField
              label={t.bankConfirmReason}
              maxLength={500}
              value={decision.reason}
              onChange={(e) => setDecision({ ...decision, reason: e.target.value })}
              error={decisionError ? t.bankReasonError : undefined}
            />
            {selected.donationReference && (
              <TextField
                label={t.bankConfirmType}
                value={decision.confirmReference}
                onChange={(e) => setDecision({ ...decision, confirmReference: e.target.value })}
              />
            )}
            <div className="admin-decision__actions">
              {selected.donationReference && (
                <Button loading={busy} onClick={() => decide('confirm')}>
                  {t.bankConfirm}
                </Button>
              )}
              <Button variant="secondary" loading={busy} onClick={() => decide('reject')}>
                {t.bankReject}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="bank-awaiting">
        <h2 id="bank-awaiting">{t.bankAwaitingTitle}</h2>
        <DataTable
          caption={t.bankAwaitingCaption}
          columns={[
            { key: 'ref', header: t.bankDonation, rowHeader: true, cell: (a) => a.publicReference },
            {
              key: 'amount',
              header: t.bankAmount,
              align: 'end',
              cell: (a) => money(a.amountPaise),
            },
            { key: 'utr', header: t.bankDonorUtr, cell: (a) => a.donorUtr ?? '—' },
          ]}
          rows={data.awaiting}
          rowKey={(a) => a.publicReference}
          empty={<p>{t.bankNone}</p>}
        />
      </section>

      <section aria-labelledby="bank-exceptions">
        <h2 id="bank-exceptions">{t.bankExceptionsTitle}</h2>
        {data.exceptions.length === 0 ? (
          <p>{t.bankNone}</p>
        ) : (
          <ul className="admin-notes">
            {data.exceptions.map((x) => (
              <li key={x.id}>
                <p>
                  <strong>{t[`kind${x.kind}`]}</strong> ·{' '}
                  {data.credits.find((c) => c.id === x.bankTransferRecordId)?.bankReference ?? '—'}
                </p>
                <form
                  className="admin-decision__actions"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const reason = (resolveReason[x.id] ?? '').trim();
                    if (reason.length < 5) return setError(t.bankReasonError);
                    void run(async () => {
                      await api.resolveException(x.id, reason);
                      return t.helpSaved;
                    });
                  }}
                >
                  <TextField
                    label={t.bankResolveReason}
                    value={resolveReason[x.id] ?? ''}
                    onChange={(e) => setResolveReason({ ...resolveReason, [x.id]: e.target.value })}
                  />
                  <Button type="submit" variant="secondary" loading={busy}>
                    {t.bankResolve}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
