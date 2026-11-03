import { useContext, useState, type ReactNode } from 'react';
import { PAISE_PER_RUPEE, formatInr, rupeesToPaise, type Paise } from '@theonetrust/contracts';
import { FieldError, FieldHint, RequiredMark } from './Field.tsx';
import { useFieldIds } from './field-ids.ts';
import { parseRupees } from './amount.ts';
import { UiLangContext, useUiStrings } from './ui-strings.ts';

export interface AmountPickerProps {
  legend: ReactNode;
  /** Quick-pick amounts in whole rupees. Come from settings/config, never hard-coded here. */
  presetsRupees: readonly number[];
  /** Selected amount in integer paise, or null when nothing valid is chosen. */
  value: Paise | null;
  onChange: (value: Paise | null) => void;
  /** Smallest whole-rupee amount allowed (plan: ₹1). */
  minRupees?: number;
  /** Largest whole-rupee amount allowed by this form, if any. */
  maxRupees?: number;
  /** Message for an amount above `maxRupees` (required when `maxRupees` is set). */
  maxMessage?: ReactNode;
  hint?: ReactNode;
  /** Error from the caller (e.g. server rejection) — shown in addition to local validation. */
  error?: ReactNode;
  name?: string;
  id?: string;
  required?: boolean;
}

const CUSTOM = '__custom';

/**
 * Quick-pick amounts plus a free amount. Emits integer paise (via the shared contracts
 * helpers) so no floating-point rupees ever leave the component. The server re-validates.
 */
export function AmountPicker({
  legend,
  presetsRupees,
  value,
  onChange,
  minRupees = 1,
  maxRupees,
  maxMessage,
  hint,
  error,
  name = 'amount',
  id,
  required,
}: AmountPickerProps) {
  const strings = useUiStrings();
  const lang = useContext(UiLangContext);
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
  const presetPaise = presetsRupees.map((r) => rupeesToPaise(r));
  const [mode, setMode] = useState<'preset' | 'custom'>(
    value === null || presetPaise.includes(value) ? 'preset' : 'custom',
  );
  const [custom, setCustom] = useState(
    mode === 'custom' && value !== null ? String(value / PAISE_PER_RUPEE) : '',
  );
  const [touched, setTouched] = useState(false);

  const parsed = parseRupees(custom, minRupees, maxRupees);
  const localError =
    mode === 'custom' && touched && !parsed.ok && !(parsed.reason === 'empty' && !required)
      ? parsed.reason === 'max'
        ? (maxMessage ?? strings.amountInvalid)
        : strings.amountInvalid
      : undefined;
  const shownError = localError ?? error;
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, { hint, error: shownError });
  const customId = `${controlId}-custom`;

  function choosePreset(paise: Paise) {
    setMode('preset');
    setTouched(false);
    onChange(paise);
  }

  function changeCustom(raw: string) {
    setMode('custom');
    setCustom(raw);
    const result = parseRupees(raw, minRupees, maxRupees);
    onChange(result.ok ? rupeesToPaise(result.rupees) : null);
  }

  return (
    <fieldset
      id={controlId}
      className={['ui-amount', shownError && 'ui-field--invalid'].filter(Boolean).join(' ')}
      aria-describedby={describedBy}
    >
      <legend className="ui-field__label">
        {legend}
        <RequiredMark required={Boolean(required)} />
      </legend>
      <FieldHint id={hintId}>{hint}</FieldHint>
      <div className="ui-amount__presets">
        {presetPaise.map((paise) => {
          const optionId = `${controlId}-${paise}`;
          return (
            <div className="ui-radio-card ui-radio-card--compact" key={paise}>
              <input
                type="radio"
                id={optionId}
                name={name}
                value={paise}
                className="ui-radio-card__input"
                checked={mode === 'preset' && value === paise}
                onChange={() => choosePreset(paise)}
              />
              <label htmlFor={optionId} className="ui-radio-card__label">
                <span className="ui-radio-card__title">{formatInr(paise, locale)}</span>
              </label>
            </div>
          );
        })}
        <div className="ui-radio-card ui-radio-card--compact">
          <input
            type="radio"
            id={`${controlId}-${CUSTOM}`}
            name={name}
            value={CUSTOM}
            className="ui-radio-card__input"
            checked={mode === 'custom'}
            onChange={() => changeCustom(custom)}
          />
          <label htmlFor={`${controlId}-${CUSTOM}`} className="ui-radio-card__label">
            <span className="ui-radio-card__title">{strings.otherAmount}</span>
          </label>
        </div>
      </div>
      {mode === 'custom' && (
        <div className="ui-field ui-amount__custom">
          <label htmlFor={customId} className="ui-field__label">
            {strings.otherAmount}
          </label>
          <input
            id={customId}
            className="ui-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={custom}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={errorId}
            onChange={(event) => changeCustom(event.target.value)}
            onBlur={() => setTouched(true)}
          />
        </div>
      )}
      <FieldError id={errorId}>{shownError}</FieldError>
    </fieldset>
  );
}
