import type { HTMLAttributes, ReactNode } from 'react';

type CardElement = 'div' | 'article' | 'section' | 'li';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement;
  /** Raised cards get a shadow; flat cards only a border. */
  elevation?: 'flat' | 'raised';
  children: ReactNode;
}

/** Light surface container. Inside a dark green band it restores the light role tokens (.surface). */
export function Card({
  as: Tag = 'div',
  elevation = 'raised',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      {...rest}
      className={['ui-card', 'surface', `ui-card--${elevation}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Tag>
  );
}

export interface BentoTileProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Heading text for the tile; rendered at the given level so page outlines stay correct. */
  title: ReactNode;
  headingLevel?: 2 | 3 | 4;
  /** How many columns the tile spans on wide screens (single column on phones). */
  span?: 1 | 2;
  /** Dark green feature tile. Text and focus tokens switch automatically. */
  tone?: 'light' | 'inverse';
  /** Optional call to action rendered at the bottom of the tile. */
  action?: ReactNode;
  children?: ReactNode;
}

/** A tile in the "ways we help" bento grid. Wrap tiles in <BentoGrid>. */
export function BentoTile({
  title,
  headingLevel = 3,
  span = 1,
  tone = 'light',
  action,
  className,
  children,
  ...rest
}: BentoTileProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article
      {...rest}
      className={[
        'ui-bento-tile',
        tone === 'inverse' ? 'surface-inverse' : 'surface',
        span === 2 && 'ui-bento-tile--wide',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Heading className="ui-bento-tile__title">{title}</Heading>
      {children && <div className="ui-bento-tile__body">{children}</div>}
      {action && <div className="ui-bento-tile__action">{action}</div>}
    </article>
  );
}

export function BentoGrid({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={['ui-bento-grid', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
