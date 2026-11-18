/**
 * The "×" of close/dismiss buttons, drawn as a centred SVG. The "×" text glyph sits off-centre
 * in its box (font metrics differ between Latin and Tamil fonts), so the mark looked misaligned.
 */
export function CloseIcon() {
  return (
    <svg
      className="ui-close-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
