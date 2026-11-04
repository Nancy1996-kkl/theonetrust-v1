import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  HELP_REQUEST_STATUSES,
  type HelpCaseDetail,
  type HelpRequestStatus,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { CALL_TIME_LABELS, HELP_FOR_LABELS, HELP_KIND_LABELS } from '../help/help-messages.ts';
import { errorText, statusLabel, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { auditActionLabel, formatAuditTime } from './audit-labels.ts';

interface EditState {
  status: HelpRequestStatus;
  assigneeId: string;
  remindOn: string;
  reason: string;
}

/** `/admin/help-requests/:id` — one case: details, status/assignee/reminder, private notes, history. */
export function HelpRequestPage() {
  const { id = '' } = useParams();
  const { api, t, lang } = useAdmin();
  const [detail, setDetail] = useState<HelpCaseDetail | null>(null);
  const [team, setTeam] = useState<Array<{ id: string; email: string }>>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  function fail(e: unknown) {
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.helpCase(id), api.team()])
      .then(([d, members]) => {
        if (cancelled) return;
        setDetail(d);
        setTeam(members.users);
        setEdit({ status: d.status, assigneeId: '', remindOn: d.remindOn ?? '', reason: '' });
      })
      .catch((e: unknown) => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fail only formats text
  }, [api, id, attempt]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(t.helpSaved);
      setAttempt((n) => n + 1); // reload details, notes and history
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!detail || !edit) return;
    const assignee = team.find((m) => m.email === detail.assigneeEmail)?.id ?? '';
    void run(async () => {
      await api.updateHelpCase(detail.id, {
        status: edit.status,
        ...(edit.assigneeId !== '' &&
          edit.assigneeId !== assignee && {
            assigneeId: edit.assigneeId === 'none' ? null : edit.assigneeId,
          }),
        remindOn: edit.remindOn || null,
        ...(edit.reason.trim() && { reason: edit.reason.trim() }),
      });
    });
  }

  function addNote(event: FormEvent) {
    event.preventDefault();
    if (!detail || !note.trim()) return;
    void run(async () => {
      await api.addHelpNote(detail.id, note.trim());
      setNote('');
    });
  }

  if (!detail || !edit) {
    return (
      <div className="admin-page">
        <h1>{t.navHelp}</h1>
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

  const assigneeId = team.find((m) => m.email === detail.assigneeEmail)?.id ?? 'none';
  const rows: Array<[string, string]> = [
    [t.helpStatus, statusLabel(t, detail.status)],
    [t.helpReceived, formatAuditTime(detail.createdAt, lang)],
    [
      t.helpType,
      detail.kind === 'CALLBACK'
        ? t.helpKindCallback
        : detail.helpTypes
            .map((k) => HELP_KIND_LABELS[k as keyof typeof HELP_KIND_LABELS]?.[lang] ?? k)
            .join(', '),
    ],
    ...(detail.forWhom
      ? ([
          [
            t.helpForWhom,
            HELP_FOR_LABELS[detail.forWhom as keyof typeof HELP_FOR_LABELS]?.[lang] ??
              detail.forWhom,
          ],
        ] as Array<[string, string]>)
      : []),
    ...(detail.personNameOrVillage
      ? ([[t.helpPerson, detail.personNameOrVillage]] as Array<[string, string]>)
      : []),
    ...(detail.description
      ? ([[t.helpDescription, detail.description]] as Array<[string, string]>)
      : []),
    [t.helpLanguage, detail.callLanguage === 'ta' ? 'தமிழ்' : 'English'],
    ...(detail.bestTime
      ? ([
          [
            t.helpBestTime,
            CALL_TIME_LABELS[detail.bestTime as keyof typeof CALL_TIME_LABELS]?.[lang] ??
              detail.bestTime,
          ],
        ] as Array<[string, string]>)
      : []),
    [t.helpPageLanguage, detail.pageLanguage === 'ta' ? 'தமிழ்' : 'English'],
  ];

  return (
    <div className="admin-page">
      <p>
        <Link to="/admin/help-requests">← {t.helpBack}</Link>
      </p>
      <h1>{detail.reference}</h1>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}

      <section aria-labelledby="help-details">
        <h2 id="help-details">{t.helpDetails}</h2>
        <dl className="admin-facts">
          <div>
            <dt>{t.helpPhone}</dt>
            <dd>
              {detail.phone} · <a href={`tel:${detail.phone}`}>{t.helpCallNow}</a>
            </dd>
          </div>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="help-update">
        <h2 id="help-update">{t.helpUpdate}</h2>
        <form className="admin-form" onSubmit={save}>
          <SelectField
            label={t.helpStatus}
            value={edit.status}
            onChange={(e) => setEdit({ ...edit, status: e.target.value as HelpRequestStatus })}
            options={HELP_REQUEST_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) }))}
          />
          <SelectField
            label={t.helpAssignee}
            value={edit.assigneeId || assigneeId}
            onChange={(e) => setEdit({ ...edit, assigneeId: e.target.value })}
            options={[
              { value: 'none', label: t.helpUnassigned },
              ...team.map((m) => ({ value: m.id, label: m.email })),
            ]}
          />
          <TextField
            label={t.helpRemind}
            type="date"
            value={edit.remindOn}
            onChange={(e) => setEdit({ ...edit, remindOn: e.target.value })}
          />
          <TextField
            label={t.helpReason}
            maxLength={500}
            value={edit.reason}
            onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
          />
          <Button type="submit" loading={busy}>
            {t.helpSave}
          </Button>
        </form>
      </section>

      <section aria-labelledby="help-notes">
        <h2 id="help-notes">{t.helpNotes}</h2>
        {detail.notes.length === 0 ? (
          <p>{t.helpNotesEmpty}</p>
        ) : (
          <ol className="admin-notes">
            {detail.notes.map((n) => (
              <li key={n.id}>
                <p>{n.body}</p>
                <p className="admin-audit__code">
                  {n.authorEmail} ·{' '}
                  <time dateTime={n.createdAt}>{formatAuditTime(n.createdAt, lang)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
        <form className="admin-form" onSubmit={addNote}>
          <TextField
            label={t.helpNoteLabel}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" variant="secondary" loading={busy}>
            {t.helpAddNote}
          </Button>
        </form>
      </section>

      <section aria-labelledby="help-history">
        <h2 id="help-history">{t.helpHistory}</h2>
        <ol className="admin-notes">
          {detail.history.map((h, i) => (
            <li key={`${h.createdAt}-${i}`}>
              {auditActionLabel(h.action, lang)}
              {h.changedFields.length > 0 && ` (${h.changedFields.join(', ')})`}
              {h.reason && ` — ${h.reason}`}
              <span className="admin-audit__code">
                {h.actorEmail ?? t.auditSystem} ·{' '}
                <time dateTime={h.createdAt}>{formatAuditTime(h.createdAt, lang)}</time>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
