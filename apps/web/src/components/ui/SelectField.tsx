import type { Ref, ReactNode, SelectHTMLAttributes } from 'react';
import { FieldError, FieldHint, RequiredMark } from './Field.tsx';
import { useFieldIds } from './field-ids.ts';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children'
> {
  label: ReactNode;
  /** Forwarded to the native control (e.g. for Dialog initialFocusRef). */
  ref?: Ref<HTMLSelectElement>;
  options: SelectOption[];
  /** Optional first, empty choice such as "Choose one". */
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
  showOptional?: boolean;
}

/** Native select (best keyboard, screen-reader and mobile support) with the field chrome. */
export function SelectField({
  label,
  options,
  placeholder,
  hint,
  error,
  showOptional,
  id,
  required,
  className,
  ...rest
}: SelectFieldProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, { hint, error });
  return (
    <div
      className={['ui-field', error && 'ui-field--invalid', className].filter(Boolean).join(' ')}
    >
      <label htmlFor={controlId} className="ui-field__label">
        {label}
        <RequiredMark required={Boolean(required)} showOptional={Boolean(showOptional)} />
      </label>
      <FieldHint id={hintId}>{hint}</FieldHint>
      <div className="ui-select">
        <select
          {...rest}
          id={controlId}
          required={required}
          className="ui-input ui-select__control"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
