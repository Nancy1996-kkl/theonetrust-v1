import type { InputHTMLAttributes, ReactNode } from 'react';
import { FieldError, FieldHint } from './Field.tsx';
import { useFieldIds } from './field-ids.ts';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

/** Native checkbox with a 44px tap area that covers the label. */
export function Checkbox({ label, hint, error, id, className, ...rest }: CheckboxProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, { hint, error });
  return (
    <div
      className={['ui-check', error && 'ui-field--invalid', className].filter(Boolean).join(' ')}
    >
      <input
        {...rest}
        id={controlId}
        type="checkbox"
        className="ui-check__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <div className="ui-check__text">
        <label htmlFor={controlId} className="ui-check__label">
          {label}
        </label>
        <FieldHint id={hintId}>{hint}</FieldHint>
        <FieldError id={errorId}>{error}</FieldError>
      </div>
    </div>
  );
}
