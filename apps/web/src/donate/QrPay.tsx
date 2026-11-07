import { useEffect, useRef, useState } from 'react';
import type { DonationIntentRequest, DonationQrResponse } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { newIdempotencyKey, type DonateClient, type VerifiedStatus } from './donate-client.ts';
import type { DonateMessageKey } from './donate-messages.ts';

/** Status re-check every 10 s: well inside the API's per-hour limit for a 15-minute QR. */
export const QR_POLL_MS = 10_000;

type Started = { intent: DonationQrResponse; imageUrl: string };
type StartFailure = 'invalid' | 'rate_limited' | 'unavailable' | 'network';

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}

/** The amount buttons on the review step: ₹200 … ₹2,000, only up to the server's QR cap. */
export function QrAmounts({
  amounts,
  maxPaise,
  expiryMinutes,
  t,
  money,
  disabled,
  onPick,
}: {
  amounts: readonly number[];
  maxPaise: number;
  expiryMinutes: number;
  t: Record<DonateMessageKey, string>;
  money: (paise: number) => string;
  disabled: boolean;
  onPick: (amountPaise: number) => void;
}) {
  const offered = amounts.map((r) => r * 100).filter((p) => p <= maxPaise);
  if (offered.length === 0) return null;
  return (
    <section className="donate__qr" aria-labelledby="donate-qr-title">
      <h4 id="donate-qr-title" className="donate__qr-title">
        {t.qrTitle}
      </h4>
      <p className="donate__muted">{fill(t.qrIntro, { minutes: String(expiryMinutes) })}</p>
      <ul className="donate__qr-amounts">
        {offered.map((paise) => (
          <li key={paise}>
            <Button variant="secondary" disabled={disabled} onClick={() => onPick(paise)}>
              {fill(t.qrChoose, { amount: money(paise) })}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The QR screen inside the pop-up (client, Nov 2026). A one-time UPI QR for exactly the chosen
 * amount; the panel says "paid" ONLY when the server's status says PAID (signed webhook or the
 * server's own check with Razorpay) — never because a QR was shown, scanned or downloaded.
 */
export function QrPay({
  client,
  request,
  t,
  money,
  locale,
  headingRef,
  onSettled,
  onFailed,
  pollMs = QR_POLL_MS,
}: {
  client: Pick<DonateClient, 'status'> & Required<Pick<DonateClient, 'startQr'>>;
  request: DonationIntentRequest;
  t: Record<DonateMessageKey, string>;
  money: (paise: number) => string;
  locale: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onSettled: (status: 'PAID' | 'FAILED', reference: string) => void;
  onFailed: (reason: StartFailure) => void;
  pollMs?: number;
}) {
  const [started, setStarted] = useState<Started | null>(null);
  const [expired, setExpired] = useState(false);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = useRef<string | null>(null);
  const settled = useRef(false);

  // One QR per attempt; a re-render or double effect reuses the same idempotency key.
  useEffect(() => {
    let cancelled = false;
    key.current ??= newIdempotencyKey();
    void client.startQr(request, key.current).then((result) => {
      if (cancelled) return;
      if (!result.ok) return onFailed(result.reason);
      setStarted({ intent: result.intent, imageUrl: result.imageUrl });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new QR only on "Make a new QR"
  }, [attempt]);

  async function check(): Promise<VerifiedStatus> {
    if (!started || settled.current) return 'UNKNOWN';
    const status = await client.status(started.intent.publicReference);
    if ((status === 'PAID' || status === 'FAILED') && !settled.current) {
      settled.current = true;
      onSettled(status, started.intent.publicReference);
    }
    return status;
  }

  // Poll until paid, failed or expired. Expiry is the server's time, not a guess.
  useEffect(() => {
    if (!started) return;
    const expiresAt = Date.parse(started.intent.qr.expiresAt);
    const timer = setInterval(() => {
      if (Date.now() >= expiresAt) {
        clearInterval(timer);
        setExpired(true);
        void check();
        return;
      }
      void check();
    }, pollMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restarts only with a new QR
  }, [started, pollMs]);

  useEffect(() => {
    if (started || expired) headingRef.current?.focus();
  }, [started, expired, headingRef]);

  if (!started) {
    return (
      <div role="status" aria-live="polite">
        <h3 ref={headingRef} tabIndex={-1} className="donate__heading">
          {fill(t.qrHeading, { amount: money(request.giftPaise) })}
        </h3>
        <p>{t.qrWaiting}</p>
      </div>
    );
  }

  const amount = money(started.intent.amountPaise);
  const until = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(started.intent.qr.expiresAt),
  );

  if (expired) {
    return (
      <>
        <h3 ref={headingRef} tabIndex={-1} className="donate__heading">
          {t.qrExpiredTitle}
        </h3>
        <p>{t.qrExpiredText}</p>
        <div className="donate__actions">
          <Button
            fullWidth
            onClick={() => {
              key.current = null;
              setStarted(null);
              setExpired(false);
              setAttempt((n) => n + 1);
            }}
          >
            {t.qrNew}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h3 ref={headingRef} tabIndex={-1} className="donate__heading">
        {fill(t.qrHeading, { amount })}
      </h3>
      <figure className="donate__qr-figure">
        <img
          className="donate__qr-image"
          src={started.imageUrl}
          alt={fill(t.qrAlt, { amount })}
          width={240}
          height={240}
        />
        <figcaption className="donate__muted">{fill(t.qrExpires, { time: until })}</figcaption>
      </figure>
      <p>{t.qrHow}</p>
      <p role="status" aria-live="polite">
        {t.qrWaiting}
      </p>
      <p className="donate__muted">{t.qrNotProof}</p>
      <div className="donate__actions">
        <a
          className="ui-button ui-button--secondary ui-button--full"
          href={started.imageUrl}
          download={`${started.intent.publicReference}-upi-qr.png`}
        >
          {t.qrDownload}
        </a>
        <Button
          variant="ghost"
          fullWidth
          loading={checking}
          onClick={() => {
            setChecking(true);
            void check().finally(() => setChecking(false));
          }}
        >
          {t.qrPaid}
        </Button>
      </div>
    </>
  );
}
