import type { MessageKey } from '../i18n/messages.ts';

/** Section anchors on the single page (same English IDs in both languages, ADR 0004). */
export const NAV_SECTIONS: ReadonlyArray<{ id: string; label: MessageKey }> = [
  { id: 'about', label: 'navAbout' },
  { id: 'ways-we-help', label: 'navWays' },
  { id: 'impact', label: 'navImpact' },
  { id: 'transparency', label: 'navTransparency' },
  { id: 'contact', label: 'navContact' },
];
