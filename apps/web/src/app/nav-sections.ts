import type { MessageKey } from '../i18n/messages.ts';

/** Section anchors on the single page (same English IDs in both languages, ADR 0004). */
export const NAV_SECTIONS: ReadonlyArray<{ id: string; label: MessageKey }> = [
  { id: 'about', label: 'navAbout' },
  { id: 'ways-we-help', label: 'navWays' },
  { id: 'services', label: 'navServices' },
  { id: 'impact', label: 'navImpact' },
  // Transparency is left out while the section is hidden (no approved documents yet, client
  // Nov 2026). Add it back here and in SiteFooter.tsx once documents are published.
  { id: 'contact', label: 'navContact' },
];
