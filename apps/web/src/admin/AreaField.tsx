import type { TextareaHTMLAttributes } from 'react';
import { FieldHint } from '../components/ui/Field.tsx';
import { useFieldIds } from '../components/ui/field-ids.ts';

/** A labelled multi-line text box for the owner content forms (#36). */
export function AreaField({
  label,
  hint,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { label: string; hint?: string }) {
  const { controlId, hintId, describedBy } = useFieldIds(undefined, { hint });
  return (
    <div className="ui-field">
      <label htmlFor={controlId} className="ui-field__label">
        {label}
      </label>
      <FieldHint id={hintId}>{hint}</FieldHint>
      <textarea
        id={controlId}
        className="ui-input admin-textarea"
        rows={4}
        aria-describedby={describedBy}
        {...props}
      />
    </div>
  );
}
