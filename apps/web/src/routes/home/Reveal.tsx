import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Gentle scroll reveal (plan §4). Content is visible by default; it only starts hidden when the
 * browser supports IntersectionObserver, and the CSS animates it only under
 * `prefers-reduced-motion: no-preference`. So no JS, old browsers and reduced motion all see
 * the content immediately.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'static' | 'waiting' | 'shown'>('static');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    setState('waiting');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('shown');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={['reveal', className].filter(Boolean).join(' ')} data-reveal={state}>
      {children}
    </div>
  );
}
