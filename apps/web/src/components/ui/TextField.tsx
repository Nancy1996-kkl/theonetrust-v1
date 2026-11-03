import type { Ref, InputHTMLAttributes, ReactNode } from 'react';
import { FieldError, FieldHint, RequiredMark } from './Field.tsx';
import { useFieldIds } from './field-ids.ts';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  label: ReactNode;
  /** Forwarded to the native control (e.g. for Dialog initialFocusRef). */
  ref?: Ref<HTMLInputElement>;
  hint?: ReactNode;
  error?: ReactNode;
  /** Show "(optional)" next to the label of a non-required field. */
  showOptional?: boolean;
}

/** Labelled text input with hint and error wired through aria-describedby. */
export function TextField({
  label,
  hint,
  error,
  showOptional,
  id,
  required,
  className,
  ...rest
}: TextFieldProps) {
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
      <input
        {...rest}
        id={controlId}
        required={required}
        className="ui-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
