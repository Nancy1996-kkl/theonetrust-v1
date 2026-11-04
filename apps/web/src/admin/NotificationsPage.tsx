import { useEffect, useState } from 'react';
import {
  NOTIFICATION_STATUSES,
  type NotificationDto,
  type NotificationListResponse,
  type NotificationStatusDto,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import type { StatusTone } from '../components/ui/icons.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';

const TONE: Record<NotificationStatusDto, StatusTone> = {
  PENDING: 'info',
  SENT: 'success',
  FAILED: 'error',
  CANCELLED: 'neutral',
};

/**
 * `/admin/notifications` (#30): what was emailed, what is queued or retrying, and what failed —
 * with a short reason and a "send again" button. No addresses or message bodies are shown.
 */
export function NotificationsPage() {
  const { api, t, lang } = useAdmin();
  const [status, setStatus] = useState<NotificationStatusDto | ''>('');
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fmt = new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const fail = (e: unknown) =>
    setError(errorText(t, e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR')));

  useEffect(() => {
    let cancelled = false;
    api
      .notifications(status || undefined)
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
  }, [api, status, attempt]);

  async function retry(row: NotificationDto) {
    setBusy(row.id);
    setMessage(null);
    try {
      await api.retryNotification(row.id);
      setMessage(t.emailRetried);
      setAttempt((n) => n + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
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

  const columns: Column<NotificationDto>[] = [
    {
      key: 'template',
      header: t.emailTemplate,
      rowHeader: true,
      cell: (n) => t[`emailTpl${n.template}`],
    },
    {
      key: 'status',
      header: t.emailState,
      // The action sits next to the status so it is reachable without scrolling on a phone.
      cell: (n) => (
        <span className="admin-email__status">
          <StatusPill tone={TONE[n.status]}>{t[`emailStatus${n.status}`]}</StatusPill>
          {(n.status === 'FAILED' || n.status === 'CANCELLED') && (
            <Button variant="secondary" loading={busy === n.id} onClick={() => void retry(n)}>
              {t.emailRetry}
              <span className="visually-hidden"> {n.reference ?? ''}</span>
            </Button>
          )}
        </span>
      ),
    },
    {
      key: 'to',
      header: t.emailTo,
      cell: (n) => (n.audience === 'donor' ? t.emailDonor : t.emailOwner),
    },
    { key: 'reference', header: t.emailReference, cell: (n) => n.reference ?? '—' },
    { key: 'attempts', header: t.emailAttempts, align: 'end', cell: (n) => String(n.attempts) },
    { key: 'problem', header: t.emailProblem, cell: (n) => n.lastError ?? '—' },
    { key: 'created', header: t.emailCreated, cell: (n) => fmt.format(new Date(n.createdAt)) },
  ];

  return (
    <div className="admin-page admin-page--wide">
      <h1>{t.emailTitle}</h1>
      <p>{t.emailIntro}</p>
      {!data.sendingEnabled && (
        <p>
          <StatusPill tone="warning">{t.emailDisabled}</StatusPill>
        </p>
      )}
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <ul className="admin-email__counts">
        {NOTIFICATION_STATUSES.map((s) => (
          <li key={s}>
            {t[`emailStatus${s}`]}: <strong>{data.counts[s]}</strong>
          </li>
        ))}
      </ul>
      <SelectField
        label={t.emailState}
        value={status}
        onChange={(e) => setStatus(e.target.value as NotificationStatusDto | '')}
        options={[
          { value: '', label: t.helpAny },
          ...NOTIFICATION_STATUSES.map((s) => ({ value: s, label: t[`emailStatus${s}`] })),
        ]}
      />
      <DataTable
        caption={t.emailCaption}
        columns={columns}
        rows={data.items}
        rowKey={(n) => n.id}
        empty={<p>{t.emailNone}</p>}
      />
    </div>
  );
}
