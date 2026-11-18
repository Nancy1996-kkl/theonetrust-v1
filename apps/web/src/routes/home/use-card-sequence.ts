import { useEffect, useState, type RefObject } from 'react';

/** Gap between cards lighting up — the same rhythm as the gift-journey steps. */
export const CARD_SEQUENCE_STEP_MS = 900;

/** Motion only when the browser can tell us the section is on screen and motion is allowed. */
function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lights a row of cards one by one when their section scrolls into view (the gift-journey
 * rhythm, client Nov 2026), then settles with none highlighted. Replays each time the section
 * comes back into view. Returns `animate` (false = static: prerender, reduced motion, already on
 * screen at load) and the index of the card currently lit (-1 = none).
 */
export function useCardSequence(
  ref: RefObject<HTMLElement | null>,
  count: number,
): { animate: boolean; current: number } {
  const [animate, setAnimate] = useState(false);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(-1);

  useEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate()) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // on screen at load: stay still
    setAnimate(true);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        setStarted(entry.isIntersecting);
        if (!entry.isIntersecting) setCurrent(-1);
      },
      { rootMargin: '0px 0px -25% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    if (!started || current >= count) return;
    const id = window.setTimeout(
      () => setCurrent((n) => n + 1),
      current < 0 ? CARD_SEQUENCE_STEP_MS / 3 : CARD_SEQUENCE_STEP_MS,
    );
    return () => window.clearTimeout(id);
  }, [started, current, count]);

  return { animate, current: current < count ? current : -1 };
}
