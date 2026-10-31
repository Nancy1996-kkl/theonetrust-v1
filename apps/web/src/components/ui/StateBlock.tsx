import type { ReactNode } from 'react';
import { Spinner, StatusIcon, type StatusTone } from './icons.tsx';
import { useUiStrings } from './ui-strings.ts';

export type BlockState = 'empty' | 'no-results' | 'loading' | 'error' | 'success';

export interface StateBlockProps {
  state: BlockState;
  title: ReactNode;
  children?: ReactNode;
  /** Recovery or next step, e.g. "Try again" / "Clear filters". */
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

const TONE: Record<Exclude<BlockState, 'loading'>, StatusTone> = {
  empty: 'neutral',
  'no-results': 'info',
  error: 'error',
  success: 'success',
};

/**
 * Full-width message for a section that has nothing, is loading, failed or finished.
 * Loading uses role="status" (polite); errors use role="alert" so they are announced at once.
 */
export function StateBlock({
  state,
  title,
  children,
  action,
  headingLevel = 3,
  className,
}: StateBlockProps) {
  const strings = useUiStrings();
  const Heading = `h${headingLevel}` as const;
  const role =
    state === 'error' ? 'alert' : state === 'loading' || state === 'success' ? 'status' : undefined;

  return (
    <div
      className={['ui-state', `ui-state--${state}`, className].filter(Boolean).join(' ')}
      data-state={state}
      role={role}
      aria-busy={state === 'loading' || undefined}
    >
      <span className="ui-state__icon">
        {state === 'loading' ? <Spinner /> : <StatusIcon tone={TONE[state]} />}
      </span>
      <Heading className="ui-state__title">
        {state === 'error' && <span className="visually-hidden">{strings.errorPrefix}</span>}
        {state === 'error' && ' '}
        {title}
      </Heading>
      {children && <div className="ui-state__body">{children}</div>}
      {action && <div className="ui-state__action">{action}</div>}
    </div>
  );
}
