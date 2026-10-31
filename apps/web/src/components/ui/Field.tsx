import type { ReactNode } from 'react';
import { StatusIcon } from './icons.tsx';
import { useUiStrings } from './ui-strings.ts';

export interface FieldMessages {
  /** Help text shown under the label. */
  hint?: ReactNode;
  /** Error text. Presence switches the control to its invalid state. */
  error?: ReactNode;
}

/** "(required)" / "(optional)" marker written in words, never only an asterisk. */
export function RequiredMark({
  required,
  showOptional,
}: {
  required?: boolean;
  showOptional?: boolean;
}) {
  const strings = useUiStrings();
  const word = required ? strings.required : showOptional ? strings.optional : null;
  if (!word) return null;
  return (
    <>
      {' '}
      <span className="ui-field__marker">({word})</span>
    </>
  );
  return null;
}

export function FieldHint({ id, children }: { id: string | undefined; children: ReactNode }) {
  if (!id || !children) return null;
  return (
    <p id={id} className="ui-field__hint">
      {children}
    </p>
  );
}

/** Error message with an icon and a spoken "Error:" prefix (not colour alone). */
export function FieldError({ id, children }: { id: string | undefined; children: ReactNode }) {
  const strings = useUiStrings();
  if (!id || !children) return null;
  return (
    <p id={id} className="ui-field__error">
      <StatusIcon tone="error" />
      <span>
        <span className="visually-hidden">{strings.errorPrefix}</span> {children}
      </span>
    </p>
  );
}
