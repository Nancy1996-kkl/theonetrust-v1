/**
 * Warm up the Tamil font while the visitor reads the English page (client, Nov 2026).
 *
 * The Noto Sans Tamil file only downloads when Tamil text first appears, so switching to
 * Tamil drew the page in a fallback font and then jumped when the real font arrived.
 * Loading it once the page is idle makes the switch land in its final shape.
 */
export const TAMIL_FONT = '400 1em "Noto Sans Tamil Variable"';
const TAMIL_SAMPLE = 'தமிழ்';

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void) => number };

export function preloadTamilFont(win: IdleWindow | undefined = globalThis.window): void {
  const fonts = win?.document?.fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const load = () => {
    fonts.load(TAMIL_FONT, TAMIL_SAMPLE).catch(() => {
      // Best effort only: the page still works in the fallback font.
    });
  };
  if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(load);
  else win.setTimeout(load, 1500);
}
