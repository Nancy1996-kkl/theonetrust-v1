import type { ReactNode } from 'react';
import { FieldError, FieldHint, RequiredMark } from './Field.tsx';
import { useFieldIds } from './field-ids.ts';

export interface RadioCardOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardGroupProps {
  legend: ReactNode;
  name: string;
  options: RadioCardOption[];
  value: string | null;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
}

/**
 * Native radio inputs styled as cards. Arrow keys move between options and Tab leaves the
 * group (browser behaviour). The selected card shows a tick and a heavier border, not only a
 * colour change.
 */
export function RadioCardGroup({
  legend,
  name,
  options,
  value,
  onChange,
  hint,
  error,
  required,
  id,
  className,
}: RadioCardGroupProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, { hint, error });
  return (
    <fieldset
      id={controlId}
      className={['ui-radio-cards', error && 'ui-field--invalid', className]
        .filter(Boolean)
        .join(' ')}
      aria-describedby={describedBy}
    >
      <legend className="ui-field__label">
        {legend}
        <RequiredMark required={Boolean(required)} />
      </legend>
      <FieldHint id={hintId}>{hint}</FieldHint>
      <div className="ui-radio-cards__grid">
        {options.map((option) => {
          const optionId = `${controlId}-${option.value}`;
          const titleId = `${optionId}-title`;
          const descId = option.description ? `${optionId}-desc` : undefined;
          return (
            <div className="ui-radio-card" key={option.value}>
              <input
                type="radio"
                id={optionId}
                name={name}
                value={option.value}
                checked={value === option.value}
                disabled={option.disabled}
                required={required}
                aria-labelledby={titleId}
                aria-describedby={descId}
                className="ui-radio-card__input"
                onChange={() => onChange(option.value)}
              />
              <label htmlFor={optionId} className="ui-radio-card__label">
                <span id={titleId} className="ui-radio-card__title">
                  {option.label}
                </span>
                {option.description && (
                  <span id={descId} className="ui-radio-card__desc">
                    {option.description}
                  </span>
                )}
              </label>
            </div>
          );
        })}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}
