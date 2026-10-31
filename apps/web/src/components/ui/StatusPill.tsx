import type { ReactNode } from 'react';
import { StatusIcon, type StatusTone } from './icons.tsx';

export interface StatusPillProps {
  tone?: StatusTone;
  children: ReactNode;
  /** Hide the icon (only for plain neutral badges such as counts). */
  plain?: boolean;
  className?: string;
}

/** Badge / status pill: icon + words, so the state is never carried by colour alone. */
export function StatusPill({
  tone = 'neutral',
  plain = false,
  className,
  children,
}: StatusPillProps) {
  return (
    <span
      className={['ui-pill', `ui-pill--${tone}`, className].filter(Boolean).join(' ')}
      data-tone={tone}
    >
      {!plain && <StatusIcon tone={tone} />}
      <span>{children}</span>
    </span>
  );
}
