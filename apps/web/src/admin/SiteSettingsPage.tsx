import { useEffect, useState, type FormEvent } from 'react';
import type { AdminTrustSettings } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { AreaField } from './AreaField.tsx';
import { useAdmin } from './admin-context.ts';
import { cmsErrorText, reasonOk, rupeesToPaise } from './cms-format.ts';
import { CMS_STRINGS } from './cms-strings.ts';
import { fillText } from './ledger-strings.ts';

type Form = {
  legalName: string;
  registrationText: string;
  receiptMin: string;
  maxDonation: string;
  ownerEmail: string;
  feeTable: string;
};

function formOf(s: AdminTrustSettings): Form {
  return {
    legalName: s.legalName ?? '',
    registrationText: s.registrationText ?? '',
    receiptMin: String(s.receiptMinPaise / 100),
    maxDonation: String(s.maxDonationPaise / 100),
    ownerEmail: s.ownerEmailSource === 'settings' ? (s.ownerEmail ?? '') : '',
    feeTable:
      s.feeTable === null || s.feeTable === undefined ? '' : JSON.stringify(s.feeTable, null, 2),
  };
}

/**
 * `/admin/settings` (#36): trust profile, receipt threshold, owner email, fee table and the
 * largest online gift. Payment configuration is status only — secrets are never shown.
 */
export function SiteSettingsPage() {
  const { api, t, lang } = useAdmin();
  const c = CMS_STRINGS[lang];
  const [data, setData] = useState<AdminTrustSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .trustSettings()
      .then((s) => {
        if (cancelled) return;
        setData(s);
        setForm(formOf(s));
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(cmsErrorText(t, c, e)));
    return () => {
      cancelled = true;
    };
  }, [api, t, c, attempt]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (!reasonOk(reason)) return setReasonError(true);
    setReasonError(false);
    setMessage(null);
    setError(null);
    let feeTable: unknown = null;
    if (form.feeTable.trim()) {
      try {
        feeTable = JSON.parse(form.feeTable);
      } catch {
        return setError(c.setFeeInvalid);
      }
    }
    const receiptMinPaise = rupeesToPaise(form.receiptMin);
    const maxDonationPaise = rupeesToPaise(form.maxDonation);
    if (receiptMinPaise === null || maxDonationPaise === null) return setError(c.invalid);
    try {
      const s = await api.updateTrustSettings({
        legalName: form.legalName.trim() || null,
        registrationText: form.registrationText.trim() || null,
        receiptMinPaise,
        maxDonationPaise,
        ownerEmail: form.ownerEmail.trim() || null,
        feeTable,
        reason: reason.trim(),
      });
      setData(s);
      setForm(formOf(s));
      setReason('');
      setMessage(c.saved);
    } catch (e) {
      setError(cmsErrorText(t, c, e));
    }
  }

  if (!data || !form) {
    return (
      <div className="admin-page">
        <h1>{c.setTitle}</h1>
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

  const p = data.payment;
  const setText = (on: boolean) => (on ? c.paySet : c.payNotSet);

  return (
    <div className="admin-page">
      <h1>{c.setTitle}</h1>
      <p>{c.setIntro}</p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <form className="admin-form" onSubmit={save}>
        <TextField
          label={c.setLegalName}
          maxLength={200}
          value={form.legalName}
          onChange={(e) => setForm({ ...form, legalName: e.target.value })}
        />
        <TextField
          label={c.setRegistration}
          maxLength={400}
          value={form.registrationText}
          onChange={(e) => setForm({ ...form, registrationText: e.target.value })}
        />
        <TextField
          label={c.setReceiptMin}
          inputMode="numeric"
          value={form.receiptMin}
          onChange={(e) => setForm({ ...form, receiptMin: e.target.value })}
        />
        <TextField
          label={c.setMaxDonation}
          inputMode="numeric"
          value={form.maxDonation}
          onChange={(e) => setForm({ ...form, maxDonation: e.target.value })}
        />
        <TextField
          label={c.setOwnerEmail}
          type="email"
          maxLength={200}
          value={form.ownerEmail}
          hint={
            data.ownerEmailSource === 'server'
              ? fillText(c.setOwnerFromServer, { email: data.ownerEmail ?? '' })
              : data.ownerEmailSource === 'none'
                ? c.setOwnerNone
                : undefined
          }
          onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
        />
        <AreaField
          label={c.setFeeTable}
          rows={8}
          spellCheck={false}
          value={form.feeTable}
          onChange={(e) => setForm({ ...form, feeTable: e.target.value })}
        />
        <TextField
          label={c.reason}
          maxLength={400}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError ? c.reasonError : undefined}
        />
        <Button type="submit">{c.save}</Button>
      </form>

      <section aria-labelledby="set-payment">
        <h2 id="set-payment">{c.setPayment}</h2>
        <p>{c.setPaymentIntro}</p>
        <dl className="admin-detail">
          <div>
            <dt>{c.payMode}</dt>
            <dd>
              <StatusPill
                tone={p.mode === 'live' ? 'success' : p.mode === 'test' ? 'warning' : 'neutral'}
              >
                {p.mode === 'live' ? c.payLive : p.mode === 'test' ? c.payTest : c.payNone}
              </StatusPill>
            </dd>
          </div>
          <div>
            <dt>{c.payKeyId}</dt>
            <dd>{p.keyId ?? '—'}</dd>
          </div>
          <div>
            <dt>{c.paySecret}</dt>
            <dd>{setText(p.keySecretSet)}</dd>
          </div>
          <div>
            <dt>{c.payWebhook}</dt>
            <dd>{setText(p.webhookSecretSet)}</dd>
          </div>
          <div>
            <dt>{c.payMonthly}</dt>
            <dd>{p.subscriptionsEnabled ? c.payOn : c.payOff}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
