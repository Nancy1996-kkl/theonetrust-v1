import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './icons.tsx';
import { useUiStrings } from './ui-strings.ts';

export type ButtonVariant = 'primary' | 'donate' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Busy state: keeps the label visible, adds a spinner and blocks repeat clicks. */
  loading?: boolean;
  /** Text announced while loading (defaults to "Loading…" in the current language). */
  loadingLabel?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

/**
 * The one button. `donate` is the single accent call to action — use it once per view.
 * While loading the button stays focusable (aria-disabled, not disabled) so keyboard users
 * do not lose their place, but clicks are ignored.
 */
export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  fullWidth = false,
  type = 'button',
  className,
  disabled,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const strings = useUiStrings();
  const classes = ['ui-button', `ui-button--${variant}`, fullWidth && 'ui-button--full', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {loading && <Spinner />}
      <span className="ui-button__label">{children}</span>
      {loading && (
        <>
          {' '}
          <span className="visually-hidden">{loadingLabel ?? strings.loading}</span>
        </>
      )}
    </button>
  );
}
