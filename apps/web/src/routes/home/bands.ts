/**
 * Section bands (brand brief): forest hero → ivory → forest impact → champagne stories.
 * Ivory is the page background, so it needs no class. Forest uses `.surface-inverse`, which
 * re-maps text, links, outline buttons and focus to the dark set.
 */
export type Band = 'ivory' | 'white' | 'champagne' | 'forest';

const CLASS: Record<Band, string> = {
  ivory: 'landing-section',
  white: 'landing-section landing-section--white',
  champagne: 'landing-section landing-section--champagne',
  forest: 'landing-section landing-section--forest surface-inverse',
};

export function bandClass(band: Band = 'ivory'): string {
  return CLASS[band];
}
