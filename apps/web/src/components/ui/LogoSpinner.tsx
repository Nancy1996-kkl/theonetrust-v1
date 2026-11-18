import emblemUrl from '../../assets/brand/emblem.webp';

export interface LogoSpinnerProps {
  /** `page` for a section or page that is loading; `splash` for the first-load screen. */
  size?: 'page' | 'splash';
  className?: string;
}

/**
 * The trust's emblem with a turning teal/orange ring: the loading mark for pages and the
 * first-load splash. Decorative — the surrounding status region carries the words
 * ("Loading…" in Tamil or English). Motion stops under prefers-reduced-motion.
 */
export function LogoSpinner({ size = 'page', className }: LogoSpinnerProps) {
  return (
    <span
      className={['ui-logo-spinner', `ui-logo-spinner--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
      data-testid="logo-spinner"
    >
      <span className="ui-logo-spinner__ring" />
      <img className="ui-logo-spinner__emblem" src={emblemUrl} alt="" width={131} height={112} />
    </span>
  );
}
