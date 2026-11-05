import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AdminOverview, OverviewTotals } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { errorText, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';
import { moneyFor } from './ledger-format.ts';
import { LEDGER_STRINGS, fillText } from './ledger-strings.ts';

/**
 * `/admin` overview (#31): verified totals for today, this month and all time (IST), refunds
 * shown apart from the gross amount, and what needs attention. Read-only.
 */
export function AdminHomePage() {
  const { api, t, lang } = useAdmin();
  const l = LEDGER_STRINGS[lang];
  const money = moneyFor(lang);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .overview()
      .then((d) => {
        if (cancelled) return;
        setData(d);
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

  if (!data) {
    return (
      <div className="admin-page">
        <h1>{t.overviewTitle}</h1>
        {error ? (
          <StateBlock
            state="error"
            title={t.loadErrorTitle}
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

  const period = (id: string, title: string, totals: OverviewTotals) => (
    <section className="admin-card" aria-labelledby={`ov-${id}`}>
      <h2 id={`ov-${id}`}>{title}</h2>
      <dl className="admin-figures">
        <div>
          <dt>{l.gross}</dt>
          <dd>{money(totals.grossPaise)}</dd>
        </div>
        <div>
          <dt>{l.refunded}</dt>
          <dd>{money(totals.refundedPaise)}</dd>
        </div>
        <div>
          <dt>{l.net}</dt>
          <dd>{money(totals.netPaise)}</dd>
        </div>
      </dl>
      <p className="admin-muted">{fillText(l.donationsCount, { count: totals.count })}</p>
    </section>
  );

  const attention: [string, string][] = [
    [l.pendingCard, `${data.pending.count} · ${money(data.pending.amountPaise)}`],
    [l.staleCard, String(data.stalePending)],
    [l.reviewCard, String(data.manualReview)],
    [l.exceptionsCard, String(data.openExceptions)],
    [l.failedCard, String(data.failed.count)],
    [l.refundsCard, `${data.refunds.count} · ${money(data.refunds.amountPaise)}`],
  ];

  return (
    <div className="admin-page admin-page--wide">
      <h1>{t.overviewTitle}</h1>
      <p>{l.overviewIntro}</p>
      <div className="admin-cards">
        {period('today', l.periodToday, data.today)}
        {period('month', l.periodMonth, data.month)}
        {period('lifetime', l.periodLifetime, data.lifetime)}
      </div>
      <section aria-labelledby="ov-attention">
        <h2 id="ov-attention">{l.attentionTitle}</h2>
        <dl className="admin-figures admin-figures--grid">
          {attention.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="admin-links">
          <Link to="/admin/donations">{l.openLedger}</Link>
          <Link to="/admin/exceptions">{l.openExceptions}</Link>
        </p>
      </section>
    </div>
  );
}
