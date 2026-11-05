/** Intrinsic size of the banner frames (keeps layout stable before the image loads). */
export const BANNER_SIZE = { width: 878, height: 434 } as const;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

interface NetworkInformationLike {
  saveData?: boolean;
}

/**
 * Whether the animated banner may play: not when the visitor asked for reduced motion or for
 * less data. Server render, no-JS visitors and browsers that cannot report the motion setting
 * always get the still image (when in doubt, don't move).
 */
export function motionAllowed(
  win: Window | null = typeof window === 'undefined' ? null : window,
): boolean {
  if (!win || typeof win.matchMedia !== 'function') return false;
  if (win.matchMedia(REDUCE_QUERY).matches) return false;
  const conn = (win.navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return conn?.saveData !== true;
}

/** useSyncExternalStore subscription: re-check when the OS motion setting changes mid-visit. */
export function subscribeMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Server and hydration snapshot: always the still image, so markup matches the prerender. */
export const motionServerSnapshot = (): boolean => false;
