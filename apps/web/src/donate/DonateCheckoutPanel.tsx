import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PAISE_PER_RUPEE, formatInr, rupeesToPaise, type Paise } from '@theonetrust/contracts';
import { AmountPicker, Button, Dialog, LogoSpinner, Stepper } from '../components/ui/index.ts';
import { useLang } from '../i18n/use-lang.ts';
import { PolicyNotice } from '../routes/policy/PolicyNotice.tsx';
import { DonationDraftContext } from '../state/donation-draft.ts';
import { BankIcon, CardIcon, LockIcon, MailIcon, ShieldIcon, UpiIcon } from './checkout-icons.tsx';
import { DONATE_HASH } from './DonatePanel.tsx';
import { DONATE_MESSAGES, DONATE_PRESETS_RUPEES } from './donate-messages.ts';
import emblemUrl from '../assets/brand/emblem.webp';
import {
  DONATE_THANKS_HASH,
  buttonFallbackUrl,
  isRazorpayCloseMessage,
  openRazorpayButton,
  type DonateButtonConfig,
} from './razorpay-button.ts';

type Step = 'amount' | 'opening' | 'paying' | 'failed' | 'after' | 'thanks';

/** Default when no amount came from a home-page chip: a mid preset, editable. */
const DEFAULT_RUPEES = DONATE_PRESETS_RUPEES[2];

/**
 * Donate pop-up in Razorpay Payment Button mode (see razorpay-button.ts): a checkout-style flow
 * with a progress bar. 1 Amount (here) → 2 Pay securely (Razorpay's window over this pop-up:
 * donor details, then UPI apps / QR / card / netbanking) → 3 Receipt (Razorpay emails it).
 *
 * This site cannot tell whether a payment succeeded — no API, no webhook — so step 3 says what
 * happens in both cases and never shows "paid".
 */
export function DonateCheckoutPanel({ config }: { config: DonateButtonConfig }) {
  const lang = useLang();
  const t = DONATE_MESSAGES[lang];
  const location = useLocation();
  const navigate = useNavigate();
  const thanks = location.hash === DONATE_THANKS_HASH;
  const open = location.hash === DONATE_HASH || thanks;

  function close() {
    navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }

  // The Dialog renders nothing while closed, so the flow starts fresh (step 1, latest amount)
  // every time the pop-up opens.
  return (
    <Dialog open={open} onClose={close} title={t.title} variant="modal" size="wide">
      <CheckoutFlow
        key={thanks ? 'thanks' : 'donate'}
        config={config}
        onClose={close}
        initialStep={thanks ? 'thanks' : 'amount'}
      />
    </Dialog>
  );
}

function CheckoutFlow({
  config,
  onClose,
  initialStep,
}: {
  config: DonateButtonConfig;
  onClose: () => void;
  initialStep: Step;
}) {
  const lang = useLang();
  const t = DONATE_MESSAGES[lang];
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
  const draftApi = useContext(DonationDraftContext);

  // A chip on the home page sets the draft amount just before opening #donate.
  const [amount, setAmount] = useState<Paise | null>(
    draftApi?.draft.amountPaise ?? rupeesToPaise(DEFAULT_RUPEES),
  );
  const [step, setStep] = useState<Step>(initialStep);
  const [showError, setShowError] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  // Razorpay's window tells the page when the donor closes it (paid or not).
  useEffect(() => {
    if (step !== 'paying') return;
    function onMessage(event: MessageEvent) {
      if (isRazorpayCloseMessage(event)) setStep('after');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [step]);

  function changeAmount(value: Paise | null) {
    setAmount(value);
    setShowError(false);
    draftApi?.updateDraft({ amountPaise: value });
  }

  async function pay() {
    if (amount === null || !hostRef.current) {
      setShowError(true);
      return;
    }
    setStep('opening');
    const result = await openRazorpayButton(
      hostRef.current,
      config,
      Math.round(amount / PAISE_PER_RUPEE),
    );
    setStep(result === 'opened' ? 'paying' : 'failed');
  }

  const stepIndex = step === 'amount' ? 0 : step === 'after' || step === 'thanks' ? 2 : 1;
  const amountText = amount === null ? '' : formatInr(amount, locale);
  const fallback = (
    <a
      className="ui-link donate-checkout__fallback"
      href={buttonFallbackUrl(config.buttonId)}
      rel="noopener"
      data-testid="donate-checkout-fallback"
    >
      {t.checkoutFallback}
    </a>
  );

  return (
    <div className="donate donate-checkout" data-testid="donate-checkout">
      <Stepper
        label={t.checkoutProgress}
        current={stepIndex}
        steps={[t.checkoutStepAmount, t.checkoutStepPay, t.checkoutStepReceipt]}
        className="donate-checkout__stepper"
      />

      {step === 'amount' && (
        <>
          <AmountPicker
            legend={t.checkoutAmountLegend}
            presetsRupees={DONATE_PRESETS_RUPEES}
            value={amount}
            onChange={changeAmount}
            required
            error={showError ? t.checkoutAmountMissing : undefined}
          />
          <div className="donate-checkout__methods">
            <p className="donate-checkout__methods-title">{t.checkoutMethodsTitle}</p>
            <ul>
              <li>
                <UpiIcon />
                {t.checkoutMethodUpi}
              </li>
              <li>
                <CardIcon />
                {t.checkoutMethodCard}
              </li>
              <li>
                <BankIcon />
                {t.checkoutMethodNetbanking}
              </li>
            </ul>
          </div>
          <Button
            variant="donate"
            fullWidth
            onClick={pay}
            className="donate-checkout__pay"
            data-testid="donate-checkout-pay"
          >
            <LockIcon />
            {amount === null ? t.checkoutStepPay : t.checkoutPay.replace('{amount}', amountText)}
          </Button>
          <p className="donate-checkout__assure">
            <ShieldIcon />
            <span>{t.checkoutSecure}</span>
          </p>
          <p className="donate-checkout__assure">
            <MailIcon />
            <span>{t.checkoutPrivacy}</span>
          </p>
        </>
      )}

      {(step === 'opening' || step === 'paying') && (
        <div className="donate-checkout__status" role="status">
          {step === 'opening' ? (
            <>
              <LogoSpinner />
              <p>{t.checkoutOpening}</p>
            </>
          ) : (
            <>
              <h3 className="donate__heading">{t.checkoutPayingTitle}</h3>
              <p className="donate-checkout__amount">{amountText}</p>
              <p>{t.checkoutPayingText}</p>
            </>
          )}
          {fallback}
          <Button variant="ghost" onClick={() => setStep('amount')}>
            {t.checkoutChangeAmount}
          </Button>
        </div>
      )}

      {step === 'failed' && (
        <div className="donate-checkout__status" role="alert">
          <p>{t.checkoutFailed}</p>
          {fallback}
          <Button variant="ghost" onClick={() => setStep('amount')}>
            {t.checkoutChangeAmount}
          </Button>
        </div>
      )}

      {step === 'after' && (
        <div className="donate-checkout__status" role="status">
          <h3 className="donate__heading">{t.checkoutAfterTitle}</h3>
          <p className="donate-checkout__assure">
            <MailIcon />
            <span>{t.checkoutAfterPaid}</span>
          </p>
          <p>{t.checkoutAfterCancelled}</p>
          <div className="donate__actions">
            <Button variant="secondary" onClick={() => setStep('amount')}>
              {t.checkoutAgain}
            </Button>
            <Button variant="primary" onClick={onClose}>
              {t.checkoutClose}
            </Button>
          </div>
        </div>
      )}

      {step === 'thanks' && (
        <div className="donate-thanks" role="status" data-testid="donate-thanks">
          <div className="donate-thanks__mark" aria-hidden="true">
            <span className="donate-thanks__wave" />
            <span className="donate-thanks__wave donate-thanks__wave--late" />
            <img src={emblemUrl} alt="" width={131} height={112} />
            <span className="donate-thanks__heart donate-thanks__heart--a">♥</span>
            <span className="donate-thanks__heart donate-thanks__heart--b">♥</span>
            <span className="donate-thanks__heart donate-thanks__heart--c">♥</span>
          </div>
          <h3 className="donate-thanks__title">{t.thanksTitle}</h3>
          <p className="donate-thanks__lead">{t.thanksText}</p>
          <p className="donate-checkout__assure">
            <MailIcon />
            <span>{t.thanksReceipt}</span>
          </p>
          <p className="donate__muted">{t.thanksSpam}</p>
          <Button variant="primary" fullWidth onClick={onClose}>
            {t.checkoutClose}
          </Button>
        </div>
      )}

      {step !== 'thanks' && <PolicyNotice />}
      {/* Razorpay's (hidden) button renders here; its window opens over the whole page. */}
      <div ref={hostRef} className="donate-checkout__host" />
    </div>
  );
}
