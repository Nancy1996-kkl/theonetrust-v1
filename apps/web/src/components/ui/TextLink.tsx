import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

export interface TextLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Internal path (client-side navigation) or absolute URL. */
  to: string;
  /** Opens in a new tab; adds rel="noopener noreferrer" and an announced hint. */
  newTab?: boolean;
  /** Announced after the label when `newTab` is set, e.g. "(opens in a new tab)". */
  newTabLabel?: string;
  children: ReactNode;
}

const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** Underlined text link. Internal paths use the router; anything with a scheme is a plain <a>. */
export function TextLink({
  to,
  newTab = false,
  newTabLabel,
  className,
  children,
  ...rest
}: TextLinkProps) {
  const classes = ['ui-link', className].filter(Boolean).join(' ');
  const tabProps = newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  const content = (
    <>
      {children}
      {newTab && newTabLabel && (
        <>
          {' '}
          <span className="visually-hidden">{newTabLabel}</span>
        </>
      )}
    </>
  );

  if (EXTERNAL.test(to)) {
    return (
      <a {...rest} {...tabProps} href={to} className={classes}>
        {content}
      </a>
    );
  }
  return (
    <Link {...rest} {...tabProps} to={to} className={classes}>
      {content}
    </Link>
  );
}
