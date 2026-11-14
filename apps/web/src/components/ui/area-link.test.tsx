import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TRUST_FACTS } from '../../config/trust-facts.ts';
import { AreaLink } from './AreaLink.tsx';

describe('AreaLink (client, Nov 2026)', () => {
  it('links the area to Google Maps in a new tab, safely', () => {
    render(<AreaLink facts={TRUST_FACTS} lang="en" />);
    const link = screen.getByRole('link', { name: /Kanchipuram, Tamil Nadu/ });
    expect(link).toHaveAttribute('href', TRUST_FACTS.mapUrl);
    expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\//);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName(/^Kanchipuram, Tamil Nadu ?\(map, opens in a new tab\)$/);
  });

  it('Tamil label and new-tab note', () => {
    render(<AreaLink facts={TRUST_FACTS} lang="ta" />);
    expect(screen.getByRole('link')).toHaveAccessibleName(
      /^காஞ்சிபுரம், தமிழ்நாடு ?\(வரைபடம், புதிய தாவலில் திறக்கும்\)$/,
    );
  });

  it('plain text without a map link, nothing without an area', () => {
    const { container, rerender } = render(
      <AreaLink facts={{ ...TRUST_FACTS, mapUrl: null }} lang="en" />,
    );
    expect(container).toHaveTextContent('Kanchipuram, Tamil Nadu');
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<AreaLink facts={{ ...TRUST_FACTS, area: null }} lang="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});
