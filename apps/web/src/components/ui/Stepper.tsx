import type { ReactNode } from 'react';
import { useUiStrings } from './ui-strings.ts';

export interface StepperProps {
  steps: ReactNode[];
  /** Zero-based index of the current step. Clamped into range. */
  current: number;
  /** Accessible name for the list, e.g. "Donation progress". */
  label: string;
  className?: string;
}

/**
 * Progress through a multi-step flow (donate: amount → details → pay → acknowledgement).
 * Completed steps show a tick and the word "completed"; the current step has aria-current —
 * position is never shown by colour alone.
 */
export function Stepper({ steps, current, label, className }: StepperProps) {
  const strings = useUiStrings();
  const total = steps.length;
  const index = total === 0 ? 0 : Math.min(Math.max(Math.trunc(current), 0), total - 1);

  return (
    <div className={['ui-stepper', className].filter(Boolean).join(' ')}>
      {total > 0 && <p className="ui-stepper__count">{strings.stepOf(index + 1, total)}</p>}
      <ol className="ui-stepper__list" aria-label={label}>
        {steps.map((step, i) => {
          const state = i < index ? 'done' : i === index ? 'current' : 'upcoming';
          return (
            <li
              key={i}
              className={`ui-stepper__step ui-stepper__step--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="ui-stepper__marker" aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="ui-stepper__label">
                {step}
                {state === 'done' && (
                  <span className="visually-hidden"> ({strings.stepCompleted})</span>
                )}
                {state === 'current' && (
                  <span className="visually-hidden"> ({strings.stepCurrent})</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
