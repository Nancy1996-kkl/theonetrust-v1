import { useId, type ReactNode } from 'react';

interface FieldIds {
  controlId: string;
  hintId: string | undefined;
  errorId: string | undefined;
  /** Value for aria-describedby on the control (hint first, then error). */
  describedBy: string | undefined;
}

/** Stable ids that tie a control to its label, hint and error. */
export function useFieldIds(
  id: string | undefined,
  { hint, error }: { hint?: ReactNode; error?: ReactNode },
): FieldIds {
  const generated = useId();
  const controlId = id ?? `field${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return { controlId, hintId, errorId, describedBy };
}
