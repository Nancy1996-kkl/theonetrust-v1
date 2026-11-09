import { useEffect, useRef, useState } from 'react';
import { useLang } from '../../i18n/use-lang.ts';
import { COUNT_DURATION_MS, figureAt, parseFigure } from './count-up.ts';
import { motionAllowed } from './hero-motion.ts';

/**
 * A published figure that counts up once when it scrolls into view. Screen readers, search
 * engines, no-JS and reduced-motion visitors always get the exact final text; the moving
 * digits are aria-hidden. Non-numeric values are shown as they are.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const lang = useLang();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    const parts = parseFigure(value);
    if (!el || !parts || !motionAllowed() || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (!entry.isIntersecting) {
          // Still off screen: park at zero so it counts up when the visitor arrives.
          setShown(figureAt(value, parts, 0, locale));
          return;
        }
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = (now - start) / COUNT_DURATION_MS;
          setShown(figureAt(value, parts, t, locale));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, lang]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="count-up__digits">
        {shown}
      </span>
      <span className="visually-hidden">{value}</span>
    </span>
  );
}
