import { useEffect, useState, type FormEvent } from 'react';
import type { AdminProgramme } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { Checkbox } from '../components/ui/Checkbox.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { AreaField } from './AreaField.tsx';
import { useAdmin } from './admin-context.ts';
import { cmsErrorText, reasonOk } from './cms-format.ts';
import { CMS_STRINGS } from './cms-strings.ts';

type Form = {
  id: string | null;
  slug: string;
  titleTa: string;
  titleEn: string;
  descriptionTa: string;
  descriptionEn: string;
  designation: 'GENERAL' | 'RESTRICTED';
  active: boolean;
  sortOrder: string;
};

const EMPTY: Form = {
  id: null,
  slug: '',
  titleTa: '',
  titleEn: '',
  descriptionTa: '',
  descriptionEn: '',
  designation: 'GENERAL',
  active: false,
  sortOrder: '0',
};

/** `/admin/programmes` (#36): bilingual programmes — create, edit, pause, delete (if unused). */
export function ProgrammesPage() {
  const { api, t, lang } = useAdmin();
  const c = CMS_STRINGS[lang];
  const [items, setItems] = useState<AdminProgramme[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .programmes()
      .then((r) => !cancelled && setItems(r.items))
      .catch((e: unknown) => !cancelled && setError(cmsErrorText(t, c, e)));
    return () => {
      cancelled = true;
    };
  }, [api, t, c, attempt]);

  /** Runs an audited change: needs a reason, reports the outcome, reloads the list. */
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

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const body = {
      slug: form.slug.trim(),
      titleTa: form.titleTa.trim(),
      titleEn: form.titleEn.trim(),
      descriptionTa: form.descriptionTa.trim() || null,
      descriptionEn: form.descriptionEn.trim() || null,
      designation: form.designation,
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
    };
    const id = form.id;
    void run((r) =>
      id
        ? api.updateProgramme(id, { ...body, reason: r })
        : api.createProgramme({ ...body, reason: r }),
    );
  }

  const columns: Column<AdminProgramme>[] = [
    {
      key: 'title',
      header: lang === 'ta' ? c.progTitleTa : c.progTitleEn,
      rowHeader: true,
      cell: (p) => (lang === 'ta' ? p.titleTa : p.titleEn),
    },
    {
      key: 'designation',
      header: c.progDesignation,
      cell: (p) => (p.designation === 'RESTRICTED' ? c.progRestricted : c.progGeneral),
    },
    {
      key: 'status',
      header: c.colStatus,
      cell: (p) => (
        <StatusPill tone={p.active ? 'success' : 'neutral'}>
          {p.active ? c.progActiveYes : c.progActiveNo}
        </StatusPill>
      ),
    },
    { key: 'gifts', header: c.progGifts, align: 'end', cell: (p) => p.donations },
    {
      key: 'actions',
      header: c.colActions,
      cell: (p) => (
        <span className="admin-filters__actions">
          <Button
            variant="secondary"
            onClick={() =>
              setForm({
                id: p.id,
                slug: p.slug,
                titleTa: p.titleTa,
                titleEn: p.titleEn,
                descriptionTa: p.descriptionTa ?? '',
                descriptionEn: p.descriptionEn ?? '',
                designation: p.designation,
                active: p.active,
                sortOrder: String(p.sortOrder),
              })
            }
          >
            {c.edit} <span className="visually-hidden">{p.slug}</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void run((r) => api.updateProgramme(p.id, { active: !p.active, reason: r }))
            }
          >
            {p.active ? c.progPause : c.progActivate}{' '}
            <span className="visually-hidden">{p.slug}</span>
          </Button>
          {p.donations === 0 && (
            <Button
              variant="secondary"
              onClick={() => void run((r) => api.deleteProgramme(p.id, r))}
            >
              {c.delete} <span className="visually-hidden">{p.slug}</span>
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <h1>{c.progTitle}</h1>
      <p>{c.progIntro}</p>
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
        <form className="admin-form admin-decision" onSubmit={submit} aria-labelledby="prog-form">
          <h2 id="prog-form">{form.id ? c.edit : c.progNew}</h2>
          <TextField
            label={c.progSlug}
            maxLength={60}
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <div className="admin-bilingual">
            <TextField
              label={c.progTitleTa}
              lang="ta"
              maxLength={120}
              value={form.titleTa}
              onChange={(e) => setForm({ ...form, titleTa: e.target.value })}
            />
            <TextField
              label={c.progTitleEn}
              lang="en"
              maxLength={120}
              value={form.titleEn}
              onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
            />
            <AreaField
              label={c.progDescTa}
              lang="ta"
              maxLength={1000}
              value={form.descriptionTa}
              onChange={(e) => setForm({ ...form, descriptionTa: e.target.value })}
            />
            <AreaField
              label={c.progDescEn}
              lang="en"
              maxLength={1000}
              value={form.descriptionEn}
              onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
            />
          </div>
          <SelectField
            label={c.progDesignation}
            value={form.designation}
            onChange={(e) =>
              setForm({ ...form, designation: e.target.value as Form['designation'] })
            }
            options={[
              { value: 'GENERAL', label: c.progGeneral },
              { value: 'RESTRICTED', label: c.progRestricted },
            ]}
          />
          <TextField
            label={c.progOrder}
            type="number"
            min={0}
            max={999}
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
          <Checkbox
            label={c.progActive}
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
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
          <Button onClick={() => setForm(EMPTY)}>{c.progNew}</Button>
        </p>
      )}
      {items && (
        <DataTable
          caption={c.progCaption}
          columns={columns}
          rows={items}
          rowKey={(p) => p.id}
          empty={<p>{c.nothing}</p>}
        />
      )}
    </div>
  );
}
