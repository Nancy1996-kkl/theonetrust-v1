import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  MANAGE_TOKEN_PATTERN,
  formatInr,
  type ManageView,
  type Paise,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { useMonthlyClient } from '../donate/monthly-client.ts';
import { homePath } from '../i18n/lang.ts';
import { useLang } from '../i18n/use-lang.ts';
import { MANAGE_MESSAGES } from './manage-messages.ts';

const SITE_NAME = 'Theonetrust.in';
type Lookup = { kind: 'found'; view: ManageView } | { kind: 'not-found' | 'unavailable' };

/**
 * `/manage/:token` and `/ta/manage/:token` (#32): see and cancel monthly giving without logging
 * in. Cancelling happens at Razorpay first; the page says "cancelled" only when it is.
 */
export function ManagePage() {
  const lang = useLang();
  const t = MANAGE_MESSAGES[lang];
  const { token = '' } = useParams();
  const client = useMonthlyClient();
  const [result, setResult] = useState<{ token: string; lookup: Lookup } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';

  useEffect(() => {
    let cancelled = false;
    const lookup = MANAGE_TOKEN_PATTERN.test(token)
      ? client.manage(token)
      : Promise.resolve({ kind: 'not-found' as const });
    void lookup.then((l) => {
      if (!cancelled) setResult({ token, lookup: l });
    });
    return () => {
      cancelled = true;
    };
  }, [client, token, attempt]);

  async function cancel() {
    setBusy(true);
    setMessage(null);
    const r = await client.cancel(token);
    setBusy(false);
    setConfirming(false);
    if (r.kind === 'cancelled') {
      setResult({ token, lookup: { kind: 'found', view: r.view } });
      setMessage({ tone: 'success', text: t.cancelled });
    } else {
      setMessage({ tone: 'error', text: t.cancelFailed });
    }
  }

  const head = (
    <>
      <title>{`${t.pageTitle} · ${SITE_NAME}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
    </>
  );
  const lookup = result?.token === token ? result.lookup : null;

  if (!lookup || lookup.kind !== 'found') {
    const missing = lookup?.kind === 'not-found';
    return (
      <div className="page receipt">
        {head}
        <h1>{t.pageTitle}</h1>
        {!lookup ? (
          <StateBlock state="loading" title={t.loading} headingLevel={2} />
        ) : (
          <StateBlock
            state="error"
            headingLevel={2}
            title={missing ? t.notFoundTitle : t.unavailableTitle}
            action={
              missing ? (
                <Link to={homePath(lang)}>{t.home}</Link>
              ) : (
                <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                  {t.tryAgain}
                </Button>
              )
            }
          >
            <p>{missing ? t.notFoundText : t.unavailableText}</p>
          </StateBlock>
        )}
      </div>
    );
  }

  const view = lookup.view;
  const amount = formatInr(view.amountPaise as Paise, locale);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso));
  const canCancel =
    view.status === 'ACTIVE' || view.status === 'PENDING' || view.status === 'PAUSED';
  const rows: [string, string][] = [
    [t.reference, view.publicReference],
    [t.amount, t.perMonth.replace('{amount}', amount)],
    [t.since, date(view.startDate ?? view.createdAt)],
    [t.method, t.routes[view.methodRoute]],
    [t.purpose, view.programme ? view.programme[lang] : t.generalFund],
  ];

  return (
    <article className="page receipt" aria-labelledby="manage-title">
      {head}
      <h1 id="manage-title">{t.pageTitle}</h1>
      <p>
        <StatusPill
          tone={
            view.status === 'ACTIVE'
              ? 'success'
              : view.status === 'CANCELLED' || view.status === 'ENDED'
                ? 'neutral'
                : 'warning'
          }
        >
          {t.statuses[view.status]}
        </StatusPill>
      </p>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'}>
          <StatusPill tone={message.tone}>{message.text}</StatusPill>
        </p>
      )}
      <dl className="receipt__fields">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {canCancel && (
        <section aria-labelledby="manage-cancel">
          <h2 id="manage-cancel">{t.cancelTitle}</h2>
          <p>{t.cancelText}</p>
          {confirming ? (
            <div className="receipt__actions">
              <Button loading={busy} loadingLabel={t.cancelling} onClick={() => void cancel()}>
                {t.confirm}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                {t.keep}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              {t.cancel}
            </Button>
          )}
          <p className="receipt__muted">{t.pauseNote}</p>
          <p className="receipt__muted">{t.changeNote}</p>
        </section>
      )}
      <p className="receipt__muted">{t.privacy}</p>
    </article>
  );
}
