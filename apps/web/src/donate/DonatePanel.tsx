import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  formatInr,
  normalizeIndianMobile,
  type DonationEstimateResponse,
  type DonationIntentResponse,
  type Paise,
} from '@theonetrust/contracts';
import { AmountPicker } from '../components/ui/AmountPicker.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Checkbox } from '../components/ui/Checkbox.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { StatusIcon } from '../components/ui/icons.tsx';
import { RadioCardGroup } from '../components/ui/RadioCardGroup.tsx';
import { Stepper } from '../components/ui/Stepper.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import type { Programme } from '../content/landing.ts';
import { usePublicContent } from '../content/use-public-content.ts';
import { useLang } from '../i18n/use-lang.ts';
import { PolicyNotice } from '../routes/policy/PolicyNotice.tsx';
import { useDonationDraft } from '../state/donation-draft.ts';
import { newIdempotencyKey, useDonateClient, type CheckoutOutcome } from './donate-client.ts';
import {
  DONATE_MESSAGES,
  DONATE_PRESETS_RUPEES,
  type DonateMessageKey,
} from './donate-messages.ts';

export const DONATE_HASH = '#donate';
/** While a payment is being confirmed, its public reference is kept in this tab only. */
export const PENDING_KEY = 'theonetrust:donation-pending';

type Step = 'need' | 'amount' | 'details' | 'review';
type Screen =
  'form' | 'confirming' | 'paid' | 'pending' | 'failed' | 'limit' | 'invalid' | 'wait' | 'network';
const STEPS: Step[] = ['need', 'amount', 'details', 'review'];
const STEP_LABELS: DonateMessageKey[] = ['stepNeed', 'stepAmount', 'stepDetails', 'stepPay'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Details {
  name: string;
  mobile: string;
  email: string;
  wantsReceipt: boolean;
  hideName: boolean;
  consent: boolean;
  coverFee: boolean;
}

type DetailError = 'name' | 'mobile' | 'email' | 'contact' | 'consent';

function session(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function Callout({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'info' | 'error' | 'success' | 'warning';
}) {
  return (
    <p className={`donate__callout donate__callout--${tone}`}>
      <StatusIcon tone={tone} />
      <span>{children}</span>
    </p>
  );
}

/**
 * Donate panel (#24, ADR 0005): opens on the single page at #donate (header, hero, "Ways we
 * help" cards, shared links). Need → amount → details → check and pay → Razorpay Checkout →
 * server verification. Results stay inside the panel and never change the URL. "Paid" is shown
 * only when the server has verified the payment.
 */
export function DonatePanel({ programmes: injected }: { programmes?: Programme[] }) {
  const lang = useLang();
  const t = DONATE_MESSAGES[lang];
  const client = useDonateClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { draft, updateDraft } = useDonationDraft();
  const live = usePublicContent(lang);
  const programmes = (injected ?? live.content.ways.programmes).filter((p) => p.confirmed);
  const open = location.hash === DONATE_HASH;
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
  const money = (paise: number) => formatInr(paise as Paise, locale);

  const [step, setStep] = useState<Step>('need');
  const [screen, setScreen] = useState<Screen>('form');
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<Details>({
    name: '',
    mobile: '',
    email: '',
    wantsReceipt: false,
    hideName: true,
    consent: false,
    coverFee: false,
  });
  const [errors, setErrors] = useState<Partial<Record<DetailError, true>>>({});
  const [amountError, setAmountError] = useState(false);
  const [needError, setNeedError] = useState(false);
  const [limits, setLimits] = useState<DonationEstimateResponse | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [intent, setIntent] = useState<DonationIntentResponse | null>(null);
  const [reference, setReference] = useState('');
  const attemptKey = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const programme =
    draft.programme ?? (programmes.some((p) => p.slug === 'general') ? 'general' : null);
  const chosen = programmes.find((p) => p.slug === programme);
  const gift = draft.amountPaise;

  // Limits and the fee estimate come from the server; nothing is assumed here.
  useEffect(() => {
    if (!open || !client.acceptsDonations) return;
    let cancelledLoad = false;
    void client.estimate(gift ?? undefined).then((result) => {
      if (cancelledLoad) return;
      setLimits(result);
      setFee(result?.feeCoverOffered && result.feePaise !== undefined ? result.feePaise : null);
    });
    return () => {
      cancelledLoad = true;
    };
  }, [open, client, gift]);

  // A payment still being confirmed in this tab (refresh, back) is re-checked, never re-paid.
  useEffect(() => {
    if (!open) return;
    const pendingRef = session()?.getItem(PENDING_KEY);
    if (!pendingRef || screen !== 'form') return;
    void client.status(pendingRef).then((status) => {
      setReference(pendingRef);
      settle(status, pendingRef);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the panel opens
  }, [open]);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, step, screen]);

  // Any change to what is being paid needs a new order (new idempotency key).
  const paySignature = `${gift ?? ''}|${programme ?? ''}|${details.coverFee && fee !== null}`;
  const attemptFor = useRef('');

  function close() {
    navigate({ pathname: location.pathname, search: location.search }, { replace: true });
    if (screen === 'paid') {
      setScreen('form');
      setStep('need');
      setCancelled(false);
    }
  }

  function settle(status: 'PAID' | 'PENDING' | 'FAILED' | 'UNKNOWN', ref: string) {
    if (status === 'PAID') {
      session()?.removeItem(PENDING_KEY);
      attemptKey.current = null;
      setIntent(null);
      setScreen('paid');
    } else if (status === 'FAILED') {
      session()?.removeItem(PENDING_KEY);
      attemptKey.current = null;
      setIntent(null);
      setScreen('failed');
    } else {
      session()?.setItem(PENDING_KEY, ref);
      setScreen('pending');
    }
  }

  async function recheck(ref = reference) {
    setBusy(true);
    const status = await client.status(ref);
    setBusy(false);
    settle(status, ref);
  }

  function validateDetails(): boolean {
    const found: Partial<Record<DetailError, true>> = {};
    if (!details.name.trim()) found.name = true;
    if (details.mobile.trim() && !normalizeIndianMobile(details.mobile)) found.mobile = true;
    if (details.email.trim() && !EMAIL.test(details.email.trim())) found.email = true;
    if (!details.mobile.trim() && !details.email.trim()) found.contact = true;
    if (!details.consent) found.consent = true;
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  function next(event?: FormEvent) {
    event?.preventDefault();
    if (step === 'need') {
      if (!programme) return setNeedError(true);
      setStep('amount');
    } else if (step === 'amount') {
      const max = limits?.maxPaise;
      if (!gift || (max !== undefined && gift > max)) return setAmountError(true);
      setStep('details');
    } else if (step === 'details' && validateDetails()) {
      setStep('review');
    }
  }

  function back() {
    const index = STEPS.indexOf(step);
    setCancelled(false);
    if (index > 0) setStep(STEPS[index - 1] ?? 'need');
  }

  async function pay() {
    if (busy || !gift || !programme) return;
    setBusy(true);
    setCancelled(false);
    if (attemptFor.current !== paySignature) {
      attemptFor.current = paySignature;
      attemptKey.current = null;
    }
    let current = intent && attemptKey.current ? intent : null;
    if (!current) {
      attemptKey.current ??= newIdempotencyKey();
      const mobile = details.mobile.trim() ? normalizeIndianMobile(details.mobile) : null;
      const started = await client.start(
        {
          giftPaise: gift,
          currency: 'INR',
          programme,
          donorName: details.name.trim(),
          donorEmail: details.email.trim() || null,
          donorPhone: mobile,
          hideNamePublicly: details.hideName,
          wantsReceipt: details.wantsReceipt,
          coverFee: details.coverFee && fee !== null,
          consent: true,
          locale: lang,
        },
        attemptKey.current,
      );
      if (!started.ok) {
        setBusy(false);
        setScreen(
          started.reason === 'invalid'
            ? 'invalid'
            : started.reason === 'rate_limited'
              ? 'wait'
              : 'network',
        );
        return;
      }
      current = started.intent;
      setIntent(current);
      setReference(current.publicReference);
    }
    const outcome: CheckoutOutcome = await client.checkout(current, {
      name: details.name.trim(),
      ...(details.email.trim() && { email: details.email.trim() }),
      ...(details.mobile.trim() && { contact: normalizeIndianMobile(details.mobile) ?? '' }),
      lang,
    });
    if (outcome.kind === 'dismissed') {
      // Back on the review step with the same need and amount; the same order is reused.
      setBusy(false);
      setCancelled(true);
      return;
    }
    if (outcome.kind === 'failed') {
      setBusy(false);
      attemptKey.current = null;
      setIntent(null);
      setScreen(outcome.reason === 'upi_limit' ? 'limit' : 'failed');
      return;
    }
    setScreen('confirming');
    session()?.setItem(PENDING_KEY, current.publicReference);
    const status = await client.verify(current, outcome);
    setBusy(false);
    settle(status, current.publicReference);
  }

  const heading = (text: string) => (
    <h3 ref={headingRef} tabIndex={-1} className="donate__heading">
      {text}
    </h3>
  );
  const amountLine =
    intent ?? (gift ? { giftPaise: gift, feePaise: details.coverFee && fee ? fee : 0 } : null);
  const total = amountLine ? amountLine.giftPaise + amountLine.feePaise : 0;
  const receiptMin = limits?.receiptMinPaise;

  let body: ReactNode;
  let footer: ReactNode = null;

  if (!client.acceptsDonations) {
    body = (
      <>
        {heading(t.closedTitle)}
        <p>{t.closedText}</p>
      </>
    );
  } else if (screen === 'confirming') {
    body = (
      <div role="status" aria-live="polite">
        {heading(t.confirming)}
        <p>{t.dontClose}</p>
      </div>
    );
  } else if (screen === 'paid' || screen === 'pending' || screen === 'failed') {
    const isPaid = screen === 'paid';
    body = (
      <>
        {heading(isPaid ? t.thanks : screen === 'pending' ? t.pending : t.failed)}
        <Callout tone={isPaid ? 'success' : screen === 'pending' ? 'warning' : 'error'}>
          {isPaid
            ? `${t.sumAmount}: ${money(total)}`
            : screen === 'pending'
              ? t.dontPayAgain
              : t.failedText}
        </Callout>
        {reference && (
          <dl className="donate__summary">
            <div>
              <dt>{t.reference}</dt>
              <dd>{reference}</dd>
            </div>
          </dl>
        )}
        {!isPaid && (
          <p className="donate__muted">{screen === 'pending' ? t.pendingHelp : t.failedHelp}</p>
        )}
      </>
    );
    footer = isPaid ? (
      <Button fullWidth onClick={close}>
        {t.backToPage}
      </Button>
    ) : screen === 'pending' ? (
      <Button fullWidth loading={busy} onClick={() => void recheck()}>
        {t.checkAgain}
      </Button>
    ) : (
      <Button
        fullWidth
        onClick={() => {
          setScreen('form');
          setStep('review');
        }}
      >
        {t.tryAgain}
      </Button>
    );
  } else if (screen === 'limit') {
    body = (
      <>
        {heading(t.limitTitle)}
        <Callout tone="warning">{t.limitText}</Callout>
        <p>{t.methodsText}</p>
      </>
    );
    footer = (
      <div className="donate__actions">
        <Button
          fullWidth
          onClick={() => {
            setScreen('form');
            setStep('review');
          }}
        >
          {t.payCard}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setScreen('form');
            setStep('amount');
          }}
        >
          {t.smaller}
        </Button>
      </div>
    );
  } else if (screen === 'invalid' || screen === 'wait' || screen === 'network') {
    const [title, text] =
      screen === 'invalid'
        ? [t.invalidTitle, t.invalidText]
        : screen === 'wait'
          ? [t.waitTitle, t.waitText]
          : [t.netTitle, t.netText];
    body = (
      <>
        {heading(title)}
        <Callout tone="error">{text}</Callout>
      </>
    );
    footer = (
      <Button
        fullWidth
        onClick={() => {
          setScreen('form');
          setStep(screen === 'invalid' ? 'details' : 'review');
        }}
      >
        {t.tryAgain}
      </Button>
    );
  } else {
    const stepper = (
      <Stepper
        steps={STEP_LABELS.map((k) => t[k])}
        current={STEPS.indexOf(step)}
        label={t.progress}
      />
    );
    if (step === 'need') {
      body = (
        <form id="donate-step" onSubmit={next} noValidate>
          {stepper}
          {heading(t.whereGo)}
          <RadioCardGroup
            legend={t.whereGo}
            name="donate-need"
            value={programme}
            onChange={(slug) => {
              setNeedError(false);
              updateDraft({ programme: slug });
            }}
            error={needError ? t.whereGo : undefined}
            options={programmes.map((p) => ({
              value: p.slug,
              label: p.title[lang],
              description:
                p.summary?.[lang] ?? (p.fund === 'general' ? t.generalText : t.earmarkedText),
            }))}
          />
        </form>
      );
    } else if (step === 'amount') {
      body = (
        <form id="donate-step" onSubmit={next} noValidate>
          {stepper}
          {heading(t.howMuch)}
          <AmountPicker
            legend={t.howMuch}
            // Its own radio group: the page's final call-to-action has an amount picker too.
            name="donate-amount"
            presetsRupees={DONATE_PRESETS_RUPEES}
            value={gift}
            onChange={(value) => {
              setAmountError(false);
              updateDraft({ amountPaise: value });
            }}
            hint={t.minAmount}
            {...(limits && {
              maxRupees: Math.floor(limits.maxPaise / 100),
              maxMessage: fill(t.maxAmount, { amount: money(limits.maxPaise) }),
            })}
            error={
              !amountError
                ? undefined
                : gift && limits && gift > limits.maxPaise
                  ? fill(t.maxAmount, { amount: money(limits.maxPaise) })
                  : t.minAmount
            }
            required
          />
          {fee !== null && fee > 0 && (
            <Checkbox
              label={fill(t.coverFee, { fee: money(fee) })}
              hint={t.coverFeeHint}
              checked={details.coverFee}
              onChange={(e) => setDetails({ ...details, coverFee: e.target.checked })}
            />
          )}
          <div className="donate__note">
            <strong>{t.methodsTitle}</strong>
            <p>{t.methodsText}</p>
          </div>
        </form>
      );
    } else if (step === 'details') {
      const set = (key: keyof Details) => (value: string | boolean) => {
        setDetails((d) => ({ ...d, [key]: value }));
        setErrors({});
      };
      body = (
        <form id="donate-step" onSubmit={next} noValidate>
          {stepper}
          {heading(t.yourDetails)}
          <p className="donate__muted">{t.detailsWhy}</p>
          {errors.contact && <Callout tone="error">{t.contactError}</Callout>}
          <TextField
            label={t.fullName}
            autoComplete="name"
            required
            value={details.name}
            onChange={(e) => set('name')(e.target.value)}
            error={errors.name ? t.nameError : undefined}
          />
          <TextField
            label={t.mobile}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={details.mobile}
            onChange={(e) => set('mobile')(e.target.value)}
            error={errors.mobile ? t.mobileError : undefined}
          />
          <TextField
            label={t.email}
            type="email"
            autoComplete="email"
            value={details.email}
            onChange={(e) => set('email')(e.target.value)}
            error={errors.email ? t.emailError : undefined}
          />
          {receiptMin !== undefined && gift !== null && gift >= receiptMin && (
            <Checkbox
              label={t.ackOpt}
              hint={fill(t.ackHint, { amount: money(receiptMin) })}
              checked={details.wantsReceipt}
              onChange={(e) => set('wantsReceipt')(e.target.checked)}
            />
          )}
          <Checkbox
            label={t.hideName}
            checked={details.hideName}
            onChange={(e) => set('hideName')(e.target.checked)}
          />
          <Checkbox
            label={t.consent}
            checked={details.consent}
            onChange={(e) => set('consent')(e.target.checked)}
            error={errors.consent ? t.consentError : undefined}
          />
          <PolicyNotice />
        </form>
      );
    } else {
      body = (
        <>
          {stepper}
          {heading(t.review)}
          {cancelled && (
            <Callout tone="info">
              <strong>{t.cancelled}.</strong> {t.cancelledText}
            </Callout>
          )}
          <dl className="donate__summary">
            <div>
              <dt>{t.sumNeed}</dt>
              <dd>{chosen?.title[lang] ?? programme}</dd>
            </div>
            <div>
              <dt>{t.sumGift}</dt>
              <dd>{money(amountLine?.giftPaise ?? 0)}</dd>
            </div>
            {amountLine && amountLine.feePaise > 0 && (
              <div>
                <dt>{t.sumFee}</dt>
                <dd>{money(amountLine.feePaise)}</dd>
              </div>
            )}
            <div>
              <dt>{t.sumAmount}</dt>
              <dd>
                <strong>{money(total)}</strong>
              </dd>
            </div>
            <div>
              <dt>{t.sumName}</dt>
              <dd>{details.name.trim()}</dd>
            </div>
          </dl>
          <p className="donate__muted">{t.trustLine}</p>
        </>
      );
    }
    footer = (
      <div className="donate__actions">
        {step === 'review' ? (
          <Button variant="donate" fullWidth loading={busy} onClick={() => void pay()}>
            {fill(t.payNow, { amount: money(total) })}
          </Button>
        ) : (
          <Button type="submit" form="donate-step" fullWidth>
            {t.continue}
          </Button>
        )}
        {step !== 'need' && (
          <Button variant="ghost" fullWidth onClick={back} disabled={busy}>
            {t.back}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t.title}
      variant="panel"
      dismissible={!busy && screen !== 'confirming'}
      footer={footer}
    >
      <div className="donate">{body}</div>
    </Dialog>
  );
}
