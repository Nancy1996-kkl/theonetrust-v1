import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  CALL_TIMES,
  HELP_DESCRIPTION_MAX,
  HELP_FOR,
  HELP_KINDS,
  HELP_PERSON_MAX,
  normalizeIndianMobile,
  type CallTime,
  type CallbackRequest,
  type HelpFor,
  type HelpKind,
  type HelpRequest,
  type HelpWizardRequest,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { Checkbox } from '../components/ui/Checkbox.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { FieldError } from '../components/ui/Field.tsx';
import { useFieldIds } from '../components/ui/field-ids.ts';
import { StatusIcon } from '../components/ui/icons.tsx';
import { RadioCardGroup } from '../components/ui/RadioCardGroup.tsx';
import { Stepper } from '../components/ui/Stepper.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { LANGUAGE_NAMES, type UiLang } from '../components/ui/ui-strings.ts';
import { TRUST_FACTS, type TrustFacts } from '../config/trust-facts.ts';
import { useLang } from '../i18n/use-lang.ts';
import { PolicyNotice } from '../routes/policy/PolicyNotice.tsx';
import { useHelpClient } from './help-client.ts';
import {
  CALL_TIME_LABELS,
  HELP_FOR_LABELS,
  HELP_KIND_LABELS,
  HELP_MESSAGES,
  type HelpMessageKey,
} from './help-messages.ts';

export const GET_HELP_HASH = '#get-help';

type Screen = 'start' | 'wizard' | 'callback' | 'sent' | 'network' | 'rate_limited' | 'invalid';
type Step = 1 | 2 | 3 | 4 | 5;

interface Answers {
  helpFor: HelpFor | null;
  kinds: HelpKind[];
  description: string;
  phone: string;
  personNameOrVillage: string;
  callLanguage: UiLang;
  bestTime: CallTime;
  consentContact: boolean;
  consentThirdParty: boolean;
  website: string;
}

type ErrorKey = 'helpFor' | 'kinds' | 'phone' | 'consentContact' | 'consentThirdParty';

const STEP_LABELS: HelpMessageKey[] = [
  'stepWho',
  'stepKind',
  'stepDescribe',
  'stepContact',
  'stepSend',
];

function emptyAnswers(lang: UiLang): Answers {
  return {
    helpFor: null,
    kinds: [],
    description: '',
    phone: '',
    personNameOrVillage: '',
    callLanguage: lang,
    bestTime: 'anytime',
    consentContact: false,
    consentThirdParty: false,
    website: '',
  };
}

/** "I don't know how to explain" on its own skips the description step (wireframe C). */
const skipsDescription = (kinds: HelpKind[]) => kinds.length === 1 && kinds[0] === 'unsure';

/**
 * Get Help panel (issue #15, wireframe #8): opens on the single page at #get-help.
 * Start → 5-step wizard or one-field "call me back" → sent with a reference. Errors never lose
 * the answers. No field accepts documents, Aadhaar, medical records, income proof or photos.
 */
export function GetHelpPanel({ facts = TRUST_FACTS }: { facts?: TrustFacts }) {
  const lang = useLang();
  const t = HELP_MESSAGES[lang];
  const client = useHelpClient();
  const location = useLocation();
  const navigate = useNavigate();
  const open = location.hash === GET_HELP_HASH;

  const [screen, setScreen] = useState<Screen>('start');
  const [step, setStep] = useState<Step>(1);
  const [answers, setAnswers] = useState<Answers>(() => emptyAnswers(lang));
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, true>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const [lastMode, setLastMode] = useState<'wizard' | 'callback'>('wizard');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new heading whenever the screen or step changes (screen readers hear it).
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [screen, step, open]);

  const update = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function close() {
    navigate({ pathname: location.pathname, search: location.search }, { replace: true });
    if (screen === 'sent') {
      setScreen('start');
      setStep(1);
      setAnswers(emptyAnswers(lang));
    }
  }

  function validateStep(current: Step): Partial<Record<ErrorKey, true>> {
    const found: Partial<Record<ErrorKey, true>> = {};
    if (current === 1 && !answers.helpFor) found.helpFor = true;
    if (current === 2 && answers.kinds.length === 0) found.kinds = true;
    if (current === 4 && !normalizeIndianMobile(answers.phone)) found.phone = true;
    if (current === 5) {
      if (!answers.consentContact) found.consentContact = true;
      if (answers.helpFor !== 'self' && !answers.consentThirdParty) found.consentThirdParty = true;
    }
    return found;
  }

  function next() {
    const found = validateStep(step);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    if (step === 2 && skipsDescription(answers.kinds)) setStep(4);
    else setStep((s) => Math.min(5, s + 1) as Step);
  }

  function back() {
    if (screen !== 'wizard' || step === 1) {
      setScreen('start');
      return;
    }
    if (step === 4 && skipsDescription(answers.kinds)) setStep(2);
    else setStep((s) => Math.max(1, s - 1) as Step);
  }

  function buildRequest(mode: 'wizard' | 'callback'): HelpRequest {
    const phone = normalizeIndianMobile(answers.phone) ?? answers.phone;
    if (mode === 'callback') {
      const request: CallbackRequest = {
        mode,
        phone,
        consentContact: true,
        pageLanguage: lang,
        website: answers.website,
      };
      return request;
    }
    const request: HelpWizardRequest = {
      mode,
      helpFor: answers.helpFor ?? 'self',
      kinds: answers.kinds,
      description: skipsDescription(answers.kinds) ? '' : answers.description.trim(),
      phone,
      personNameOrVillage: answers.helpFor === 'self' ? '' : answers.personNameOrVillage.trim(),
      callLanguage: answers.callLanguage,
      bestTime: answers.bestTime,
      consentContact: true,
      consentThirdParty: answers.helpFor !== 'self' && answers.consentThirdParty,
      pageLanguage: lang,
      website: answers.website,
    };
    return request;
  }

  async function submit(mode: 'wizard' | 'callback') {
    const found: Partial<Record<ErrorKey, true>> =
      mode === 'wizard'
        ? validateStep(5)
        : {
            ...(normalizeIndianMobile(answers.phone) ? {} : { phone: true as const }),
            ...(answers.consentContact ? {} : { consentContact: true as const }),
          };
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setLastMode(mode);
    setSubmitting(true);
    let result;
    try {
      result = await client.submit(buildRequest(mode));
    } catch {
      result = { ok: false as const, reason: 'network' as const };
    }
    setSubmitting(false);
    if (result.ok) {
      setReference(result.reference);
      setScreen('sent');
    } else if (result.reason === 'rate_limited') setScreen('rate_limited');
    else if (result.reason === 'invalid') setScreen('invalid');
    else setScreen('network'); // network and unavailable: answers kept, human channels offered
  }

  const humanChannels = <HumanChannels facts={facts} lang={lang} t={t} />;
  const heading = (text: string) => (
    <h3 ref={headingRef} tabIndex={-1} className="help__heading">
      {text}
    </h3>
  );

  let body: ReactNode;
  let footer: ReactNode = null;

  if (screen === 'start') {
    body = (
      <>
        {heading(client.acceptsRequests ? t.startTitle : t.closedTitle)}
        <p className="help__muted">{client.acceptsRequests ? t.startWho : t.closedText}</p>
        {client.acceptsRequests && (
          <div className="help__actions">
            <Button
              fullWidth
              onClick={() => {
                setScreen('wizard');
                setStep(1);
              }}
            >
              {t.fillForm}
            </Button>
            <Button fullWidth variant="secondary" onClick={() => setScreen('callback')}>
              {t.callMeBack}
            </Button>
          </div>
        )}
        {humanChannels}
        <Callout>{t.noGuarantee}</Callout>
      </>
    );
  } else if (screen === 'wizard') {
    body = (
      <>
        <Stepper
          steps={STEP_LABELS.map((k) => t[k])}
          current={step - 1}
          label={t.progress}
          className="help__stepper"
        />
        {step === 1 && (
          <>
            {heading(t.whoTitle)}
            <RadioCardGroup
              legend={t.whoTitle}
              name="help-for"
              className="help__visually-legend"
              options={HELP_FOR.map((value) => ({ value, label: HELP_FOR_LABELS[value][lang] }))}
              value={answers.helpFor}
              onChange={(v) => update('helpFor', v as HelpFor)}
              {...(errors.helpFor ? { error: t.whoError } : {})}
            />
          </>
        )}
        {step === 2 && (
          <>
            {heading(t.kindTitle)}
            <KindTiles
              legend={t.kindTitle}
              hint={t.kindHint}
              lang={lang}
              value={answers.kinds}
              onChange={(kinds) => update('kinds', kinds)}
              error={errors.kinds ? t.kindError : undefined}
            />
            <Callout tone="error">{t.danger}</Callout>
          </>
        )}
        {step === 3 && (
          <>
            {heading(t.descTitle)}
            <DescriptionField
              label={t.descLabel}
              hint={t.descHint}
              counterLabel={t.counter}
              value={answers.description}
              onChange={(v) => update('description', v)}
            />
            <Callout>{t.noDocs}</Callout>
          </>
        )}
        {step === 4 && (
          <>
            {heading(t.contactTitle)}
            <TextField
              label={t.yourMobile}
              hint={t.mobileHint}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              value={answers.phone}
              onChange={(e) => update('phone', e.target.value)}
              {...(errors.phone ? { error: t.mobileError } : {})}
            />
            {answers.helpFor !== 'self' && (
              <TextField
                label={t.theirName}
                hint={t.theirNameHint}
                showOptional
                maxLength={HELP_PERSON_MAX}
                autoComplete="off"
                value={answers.personNameOrVillage}
                onChange={(e) => update('personNameOrVillage', e.target.value)}
              />
            )}
            <RadioCardGroup
              legend={t.language}
              name="help-language"
              options={(['ta', 'en'] as const).map((value) => ({
                value,
                label: <span lang={value}>{LANGUAGE_NAMES[value]}</span>,
              }))}
              value={answers.callLanguage}
              onChange={(v) => update('callLanguage', v as UiLang)}
            />
            <RadioCardGroup
              legend={t.bestTime}
              name="help-time"
              options={CALL_TIMES.map((value) => ({
                value,
                label: CALL_TIME_LABELS[value][lang],
              }))}
              value={answers.bestTime}
              onChange={(v) => update('bestTime', v as CallTime)}
            />
          </>
        )}
        {step === 5 && (
          <>
            {heading(t.consentTitle)}
            <fieldset className="help__consent">
              <legend className="visually-hidden">{t.consentLegend}</legend>
              <Checkbox
                label={t.consentContact}
                checked={answers.consentContact}
                onChange={(e) => update('consentContact', e.target.checked)}
                {...(errors.consentContact ? { error: t.consentContactError } : {})}
              />
              {answers.helpFor !== 'self' && (
                <Checkbox
                  label={t.consentOther}
                  checked={answers.consentThirdParty}
                  onChange={(e) => update('consentThirdParty', e.target.checked)}
                  {...(errors.consentThirdParty ? { error: t.consentOtherError } : {})}
                />
              )}
            </fieldset>
            <PolicyNotice refund={false} />
            <Callout>{t.noGuarantee}</Callout>
          </>
        )}
        <Honeypot value={answers.website} onChange={(v) => update('website', v)} />
      </>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={back}>
          {t.back}
        </Button>
        {step === 3 && (
          <Button
            variant="ghost"
            onClick={() => {
              update('description', '');
              setStep(4);
            }}
          >
            {t.skip}
          </Button>
        )}
        {step < 5 ? (
          <Button onClick={next}>{t.continue}</Button>
        ) : (
          <Button
            loading={submitting}
            loadingLabel={t.sending}
            onClick={() => void submit('wizard')}
          >
            {t.send}
          </Button>
        )}
      </>
    );
  } else if (screen === 'callback') {
    body = (
      <>
        {heading(t.cbTitle)}
        <TextField
          label={t.yourMobile}
          hint={t.mobileHint}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          value={answers.phone}
          onChange={(e) => update('phone', e.target.value)}
          {...(errors.phone ? { error: t.mobileError } : {})}
        />
        <Checkbox
          label={t.consentContact}
          checked={answers.consentContact}
          onChange={(e) => update('consentContact', e.target.checked)}
          {...(errors.consentContact ? { error: t.consentContactError } : {})}
        />
        <PolicyNotice refund={false} />
        <Honeypot value={answers.website} onChange={(v) => update('website', v)} />
      </>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={back}>
          {t.back}
        </Button>
        <Button
          loading={submitting}
          loadingLabel={t.sending}
          onClick={() => void submit('callback')}
        >
          {t.callMe}
        </Button>
      </>
    );
  } else if (screen === 'sent') {
    body = (
      <>
        <div className="help__result">
          <StatusIcon tone="success" />
          {heading(t.sentTitle)}
        </div>
        <p role="status">{t.sentText}</p>
        <dl className="help__reference">
          <dt>{t.reference}</dt>
          <dd>{reference}</dd>
        </dl>
        <p className="help__muted">{t.sentHelp}</p>
        {humanChannels}
      </>
    );
    footer = <Button onClick={close}>{t.backToPage}</Button>;
  } else {
    const titles = {
      network: [
        client.acceptsRequests ? t.netTitle : t.closedTitle,
        client.acceptsRequests ? t.netText : t.closedText,
      ],
      rate_limited: [t.waitTitle, t.waitText],
      invalid: [t.invalidTitle, t.invalidText],
    } as const;
    const [title, text] = titles[screen];
    body = (
      <>
        <div className="help__result">
          <StatusIcon tone={screen === 'network' ? 'error' : 'warning'} />
          {heading(title)}
        </div>
        <p role="alert">{text}</p>
        {humanChannels}
      </>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={() => setScreen(lastMode)}>
          {t.back}
        </Button>
        {screen === 'network' && client.acceptsRequests && (
          <Button
            loading={submitting}
            loadingLabel={t.sending}
            onClick={() => void submit(lastMode)}
          >
            {t.tryAgain}
          </Button>
        )}
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t.title}
      variant="panel"
      dismissible={!submitting}
      footer={footer}
    >
      <div className="help">{body}</div>
    </Dialog>
  );
}

function Callout({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <p className={`help__callout help__callout--${tone}`}>
      <StatusIcon tone={tone} />
      <span>{children}</span>
    </p>
  );
}

function HumanChannels({
  facts,
  lang,
  t,
}: {
  facts: TrustFacts;
  lang: UiLang;
  t: Record<HelpMessageKey, string>;
}) {
  return (
    <div className="help__channels">
      {facts.whatsappUrl && (
        <a
          className="ui-button ui-button--secondary ui-button--full"
          href={facts.whatsappUrl}
          rel="noopener noreferrer"
        >
          {t.whatsapp}
        </a>
      )}
      {facts.phone && (
        <a
          className="ui-button ui-button--secondary ui-button--full"
          href={`tel:${facts.phone.tel}`}
        >
          {t.call} {facts.phone.display}
        </a>
      )}
      {facts.callHours && (
        <p className="help__muted">
          {t.hours}: {facts.callHours[lang]}
        </p>
      )}
    </div>
  );
}

/** Multi-select tiles: native checkboxes, ✓ + thick border when chosen (never colour alone). */
function KindTiles({
  legend,
  hint,
  lang,
  value,
  onChange,
  error,
}: {
  legend: string;
  hint: string;
  lang: UiLang;
  value: HelpKind[];
  onChange: (kinds: HelpKind[]) => void;
  error: string | undefined;
}) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(undefined, { hint, error });
  return (
    <fieldset id={controlId} className="ui-radio-cards help__kinds" aria-describedby={describedBy}>
      <legend className="visually-hidden">{legend}</legend>
      <p id={hintId} className="ui-field__hint">
        {hint}
      </p>
      <div className="ui-radio-cards__grid help__kinds-grid">
        {HELP_KINDS.map((kind) => {
          const id = `${controlId}-${kind}`;
          const checked = value.includes(kind);
          return (
            <div
              key={kind}
              className={`ui-radio-card help__kind${kind === 'unsure' ? ' help__kind--wide' : ''}`}
            >
              <input
                type="checkbox"
                id={id}
                className="ui-radio-card__input"
                checked={checked}
                onChange={() =>
                  onChange(checked ? value.filter((k) => k !== kind) : [...value, kind])
                }
              />
              <label htmlFor={id} className="ui-radio-card__label">
                <span className="ui-radio-card__title">{HELP_KIND_LABELS[kind][lang]}</span>
              </label>
            </div>
          );
        })}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}

function DescriptionField({
  label,
  hint,
  counterLabel,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  counterLabel: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { controlId, hintId } = useFieldIds(undefined, { hint });
  const counterId = `${controlId}-count`;
  return (
    <div className="ui-field">
      <label htmlFor={controlId} className="ui-field__label">
        {label}
      </label>
      <p id={hintId} className="ui-field__hint">
        {hint}
      </p>
      <textarea
        id={controlId}
        className="ui-input help__textarea"
        rows={5}
        maxLength={HELP_DESCRIPTION_MAX}
        aria-describedby={`${hintId} ${counterId}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={counterId} className="help__counter">
        {value.length} / {HELP_DESCRIPTION_MAX} {counterLabel}
      </p>
    </div>
  );
}

/** Spam trap: hidden from people and assistive tech; bots tend to fill it. */
function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="help__trap" aria-hidden="true">
      <label>
        Website
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
