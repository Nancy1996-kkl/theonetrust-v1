import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatInr, type Paise } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { homePath, localizedPath } from '../i18n/lang.ts';
import { useLang } from '../i18n/use-lang.ts';
import { RECEIPT_MESSAGES } from './receipt-messages.ts';
import { useReceiptClient, type ReceiptLookup } from './receipt-client.ts';

const SITE_NAME = 'Theonetrust.in';

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

/**
 * `/receipt/:token` and `/ta/receipt/:token` (#29): the donation acknowledgement behind a
 * private link. Minimal fields from the API; never indexed and never sent on as a referrer.
 */
export function ReceiptPage() {
  const lang = useLang();
  const t = RECEIPT_MESSAGES[lang];
  const { token = '' } = useParams();
  const client = useReceiptClient();
  const [result, setResult] = useState<{ token: string; lookup: ReceiptLookup } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';

  useEffect(() => {
    let cancelled = false;
    void client.get(token).then((lookup) => {
      if (!cancelled) setResult({ token, lookup });
    });
    return () => {
      cancelled = true;
    };
  }, [client, token, attempt]);

  const head = (
    <>
      <title>{`${t.pageTitle} · ${SITE_NAME}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
    </>
  );
  const lookup = result?.token === token ? result.lookup : null;

  if (!lookup) {
    return (
      <div className="page receipt">
        {head}
        <h1>{t.pageTitle}</h1>
        <StateBlock state="loading" title={t.loading} headingLevel={2} />
      </div>
    );
  }
  if (lookup.kind !== 'found') {
    const missing = lookup.kind === 'not-found';
    return (
      <div className="page receipt">
        {head}
        <h1>{t.pageTitle}</h1>
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
      </div>
    );
  }

  const view = lookup.view;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  const rows: [string, string][] = [
    [t.receiptNumber, view.receiptNumber],
    [t.reference, view.donationReference],
    [t.from, view.donorName],
    [t.date, date(view.issuedAt)],
    [t.amount, formatInr(view.amountPaise as Paise, locale)],
    [t.method, t.methods[view.method]],
    [t.purpose, view.purpose ? view.purpose[lang] : t.generalFund],
  ];
  const other = lang === 'ta' ? 'en' : 'ta';

  return (
    <article className="page receipt" aria-labelledby="receipt-title">
      {head}
      <p className="receipt__trust">{view.trust.legalName ?? SITE_NAME}</p>
      {view.trust.registration && <p className="receipt__muted">{view.trust.registration}</p>}
      <h1 id="receipt-title">{t.pageTitle}</h1>
      <p>
        {view.state === 'VALID' ? (
          <StatusPill tone="success">{t.valid}</StatusPill>
        ) : (
          <StatusPill tone="warning">
            {view.state === 'REFUNDED' ? t.refunded : t.replaced}
          </StatusPill>
        )}
      </p>
      {view.state === 'REPLACED' && view.replacementToken && (
        <p>
          <Link to={localizedPath(`/receipt/${view.replacementToken}`, lang)}>{t.openCurrent}</Link>
        </p>
      )}
      <p>{t.intro}</p>
      <dl className="receipt__fields">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {view.approval && (
        <p>
          {fill(t.approval, {
            reference: view.approval.reference,
            date: date(`${view.approval.validUntil}T12:00:00Z`),
          })}
        </p>
      )}
      <p className="receipt__note">{t.note}</p>
      <div className="receipt__actions">
        <a
          className="ui-button ui-button--primary"
          href={client.pdfUrl(token, lang)}
          download
          rel="noreferrer"
        >
          {t.download}
        </a>
        <a
          className="ui-button ui-button--secondary"
          href={client.pdfUrl(token, other)}
          download
          rel="noreferrer"
        >
          {t.downloadOther}
        </a>
      </div>
      <p className="receipt__muted">{t.privacy}</p>
    </article>
  );
}
