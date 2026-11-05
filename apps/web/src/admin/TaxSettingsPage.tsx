import { useEffect, useState, type FormEvent } from 'react';
import type { TaxSettings } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { Checkbox } from '../components/ui/Checkbox.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { LEDGER_STRINGS } from './ledger-strings.ts';
import { TaxFilingSection } from './TaxFilingSection.tsx';

/**
 * `/admin/tax` (#34): the trust's tax profile. Off by default; switching on needs the RNPO
 * reference, the Section 354 approval and a validity date that has not passed (the API refuses
 * otherwise). Every change needs a reason and is audited.
 */
export function TaxSettingsPage() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const [data, setData] = useState<TaxSettings | null>(null);
  const [form, setForm] = useState({
    rnpo: '',
    approval: '',
    until: '',
    enabled: false,
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .taxSettings()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setForm({
          rnpo: d.rnpoReference ?? '',
          approval: d.section354Approval ?? '',
          until: d.approvalValidUntil ?? '',
          enabled: d.taxBenefitEnabled,
          reason: '',
        });
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
  }, [api, t, attempt]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (form.reason.trim().length < 5) return setReasonError(true);
    setReasonError(false);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const d = await api.updateTaxSettings({
        rnpoReference: form.rnpo.trim() || null,
        section354Approval: form.approval.trim() || null,
        approvalValidUntil: form.until || null,
        taxBenefitEnabled: form.enabled,
        reason: form.reason.trim(),
      });
      setData(d);
      setForm((f) => ({ ...f, reason: '' }));
      setMessage(l.taxSaved);
    } catch (e) {
      const err = e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR');
      setError(err.code === 'VALIDATION_ERROR' ? l.taxIncomplete : errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="admin-page">
        <h1>{l.taxTitle}</h1>
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

  return (
    <div className="admin-page">
      <h1>{l.taxTitle}</h1>
      <p>{l.taxIntro}</p>
      <p>
        <StatusPill tone={data.offeredNow ? 'success' : 'neutral'}>
          {data.offeredNow ? l.taxStateOn : l.taxStateOff}
        </StatusPill>
      </p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <form className="admin-form" onSubmit={save}>
        <TextField
          label={l.taxRnpo}
          maxLength={80}
          value={form.rnpo}
          onChange={(e) => setForm({ ...form, rnpo: e.target.value })}
        />
        <TextField
          label={l.taxApproval}
          maxLength={80}
          value={form.approval}
          onChange={(e) => setForm({ ...form, approval: e.target.value })}
        />
        <TextField
          label={l.taxValidUntil}
          type="date"
          value={form.until}
          onChange={(e) => setForm({ ...form, until: e.target.value })}
        />
        <Checkbox
          label={l.taxEnable}
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        <TextField
          label={l.reason}
          maxLength={400}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          error={reasonError ? l.reasonError : undefined}
        />
        <Button type="submit" loading={busy}>
          {l.taxSave}
        </Button>
      </form>
      <TaxFilingSection />
    </div>
  );
}
