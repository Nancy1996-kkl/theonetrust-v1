import { useEffect, useState, type FormEvent } from 'react';
import type { AdminMetric } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { useAdmin } from './admin-context.ts';
import { cmsErrorText, reasonOk, statusLabel, statusTone } from './cms-format.ts';
import { CMS_STRINGS } from './cms-strings.ts';

const TEXT_FIELDS = ['labelTa', 'labelEn', 'sourceTa', 'sourceEn', 'periodTa', 'periodEn'] as const;
type Form = Record<(typeof TEXT_FIELDS)[number] | 'value' | 'asOf' | 'evidenceUrl', string> & {
  id: string | null;
  valueFormat: AdminMetric['valueFormat'];
};

const EMPTY: Form = {
  id: null,
  labelTa: '',
  labelEn: '',
  sourceTa: '',
  sourceEn: '',
  periodTa: '',
  periodEn: '',
  value: '',
  asOf: '',
  evidenceUrl: '',
  valueFormat: 'count',
};

const complete = (m: AdminMetric) =>
  Boolean(m.sourceTa && m.sourceEn && m.periodTa && m.periodEn && m.asOf);

/**
 * `/admin/metrics` (#36): impact figures. Published only with source, period and "as of" date
 * in both languages; editing a published figure takes it off the site until re-published.
 */
export function MetricsPage() {
  const { api, t, lang } = useAdmin();
  const c = CMS_STRINGS[lang];
  const [items, setItems] = useState<AdminMetric[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .metrics()
      .then((r) => !cancelled && setItems(r.items))
      .catch((e: unknown) => !cancelled && setError(cmsErrorText(t, c, e)));
    return () => {
      cancelled = true;
    };
  }, [api, t, c, attempt]);

  async function run(change: (reason: string) => Promise<unknown>) {
    if (!reasonOk(reason)) return setReasonError(true);
    setReasonError(false);
    setError(null);
    setMessage(null);
    try {
      await change(reason.trim());
      setMessage(c.saved);
      setReason('');
      setForm(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      setError(cmsErrorText(t, c, e));
    }
  }

  const labels: Record<(typeof TEXT_FIELDS)[number], string> = {
    labelTa: c.metricLabelTa,
    labelEn: c.metricLabelEn,
    sourceTa: c.metricSourceTa,
    sourceEn: c.metricSourceEn,
    periodTa: c.metricPeriodTa,
    periodEn: c.metricPeriodEn,
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const text = Object.fromEntries(
      TEXT_FIELDS.map((f) => [f, form[f].trim() || (f.startsWith('label') ? undefined : null)]),
    );
    const body = {
      ...text,
      value: form.value.trim(),
      valueFormat: form.valueFormat,
      asOf: form.asOf || null,
      evidenceUrl: form.evidenceUrl.trim() || null,
    };
    const id = form.id;
    void run((r) =>
      id ? api.updateMetric(id, { ...body, reason: r }) : api.createMetric({ ...body, reason: r }),
    );
  }

  const columns: Column<AdminMetric>[] = [
    {
      key: 'label',
      header: lang === 'ta' ? c.metricLabelTa : c.metricLabelEn,
      rowHeader: true,
      cell: (m) => (lang === 'ta' ? m.labelTa : m.labelEn),
    },
    { key: 'value', header: c.metricValue, align: 'end', cell: (m) => m.value },
    { key: 'asOf', header: c.metricAsOf, cell: (m) => m.asOf ?? '—' },
    {
      key: 'status',
      header: c.colStatus,
      cell: (m) => <StatusPill tone={statusTone(m.status)}>{statusLabel(c, m.status)}</StatusPill>,
    },
    {
      key: 'actions',
      header: c.colActions,
      cell: (m) => (
        <span className="admin-filters__actions">
          <Button
            variant="secondary"
            onClick={() =>
              setForm({
                id: m.id,
                labelTa: m.labelTa,
                labelEn: m.labelEn,
                sourceTa: m.sourceTa ?? '',
                sourceEn: m.sourceEn ?? '',
                periodTa: m.periodTa ?? '',
                periodEn: m.periodEn ?? '',
                value: m.value,
                asOf: m.asOf ?? '',
                evidenceUrl: m.evidenceUrl ?? '',
                valueFormat: m.valueFormat,
              })
            }
          >
            {c.edit} <span className="visually-hidden">{m.labelEn}</span>
          </Button>
          {m.status === 'PUBLISHED' ? (
            <Button
              variant="secondary"
              onClick={() => void run((r) => api.unpublishMetric(m.id, r))}
            >
              {c.unpublish} <span className="visually-hidden">{m.labelEn}</span>
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  complete(m)
                    ? void run((r) => api.publishMetric(m.id, r))
                    : setError(c.metricMissing)
                }
              >
                {c.publish} <span className="visually-hidden">{m.labelEn}</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => void run((r) => api.deleteMetric(m.id, r))}
              >
                {c.delete} <span className="visually-hidden">{m.labelEn}</span>
              </Button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <h1>{c.metricTitle}</h1>
      <p>{c.metricIntro}</p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="admin-form">
        <TextField
          label={c.reason}
          maxLength={400}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError ? c.reasonError : undefined}
        />
      </div>
      {form ? (
        <form className="admin-form admin-decision" onSubmit={submit} aria-labelledby="metric-form">
          <h2 id="metric-form">{form.id ? c.edit : c.metricNew}</h2>
          <div className="admin-bilingual">
            {TEXT_FIELDS.map((f) => (
              <TextField
                key={f}
                label={labels[f]}
                lang={f.endsWith('Ta') ? 'ta' : 'en'}
                maxLength={f.startsWith('source') ? 300 : 120}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              />
            ))}
          </div>
          <TextField
            label={c.metricValue}
            inputMode="numeric"
            maxLength={15}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
          <SelectField
            label={c.metricFormat}
            value={form.valueFormat}
            onChange={(e) =>
              setForm({ ...form, valueFormat: e.target.value as Form['valueFormat'] })
            }
            options={[
              { value: 'count', label: c.formatCount },
              { value: 'inr_paise', label: c.formatInr },
              { value: 'percent', label: c.formatPercent },
            ]}
          />
          <TextField
            label={c.metricAsOf}
            type="date"
            value={form.asOf}
            onChange={(e) => setForm({ ...form, asOf: e.target.value })}
          />
          <TextField
            label={c.metricEvidence}
            type="url"
            maxLength={500}
            value={form.evidenceUrl}
            onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })}
          />
          <div className="admin-filters__actions">
            <Button type="submit">{c.save}</Button>
            <Button variant="secondary" onClick={() => setForm(null)}>
              {c.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <p>
          <Button onClick={() => setForm(EMPTY)}>{c.metricNew}</Button>
        </p>
      )}
      {items && (
        <DataTable
          caption={c.metricCaption}
          columns={columns}
          rows={items}
          rowKey={(m) => m.id}
          empty={<p>{c.nothing}</p>}
        />
      )}
    </div>
  );
}
