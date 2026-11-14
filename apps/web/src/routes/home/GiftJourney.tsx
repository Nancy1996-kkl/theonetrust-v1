import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { LandingContent } from '../../content/landing.ts';
import { localizedPath } from '../../i18n/lang.ts';
import { useLang } from '../../i18n/use-lang.ts';
import { HOME_TEXT as T, STEPS } from './home-content.ts';

/** Index of the payment step: the confetti bursts there. */
const PAY_STEP = 2;
const TYPE_MS = 45;
const STEP_MS = 900;
const CONFETTI = 24;

/** Motion is allowed only when the browser can tell us when the section is on screen. */
function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * "How your gift reaches people" (client, Nov 2026): when the section scrolls into view the
 * title types itself, then each step lights up in turn while a gold line runs between them; at
 * "Pay securely" a "Payment successful" tick appears with a burst of confetti above the card, and
 * the last step shows a folded-hands "thank you" (vanakkam) icon beside its title. Without motion (or without
 * IntersectionObserver) everything is shown at once. Screen readers always get the full title.
 */
export function GiftJourney({ content }: { content: LandingContent }) {
  const lang = useLang();
  const title = T.howTitle[lang];
  const ref = useRef<HTMLElement>(null);
  // The first render (also the prerendered HTML) shows everything; the animation is set up
  // after mounting, while the section is still off screen, so hydration always matches.
  const [animate, setAnimate] = useState(false);
  const [started, setStarted] = useState(false);
  const [typed, setTyped] = useState(Number.MAX_SAFE_INTEGER);
  const [active, setActive] = useState(STEPS.length - 1);

  useEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate()) return;
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight) return; // already on screen: keep it still
    setAnimate(true);
    setTyped(0);
    setActive(-1);
    // Plays every time the section comes into view; resets once it has fully left.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        if (entry.isIntersecting) {
          setStarted(true);
        } else {
          setStarted(false);
          setTyped(0);
          setActive(-1);
        }
      },
      { rootMargin: '0px 0px -25% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Type the title, one character at a time.
  useEffect(() => {
    if (!started || typed >= title.length) return;
    const id = window.setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => window.clearTimeout(id);
  }, [started, typed, title.length]);

  // Then light the steps one by one.
  const typingDone = typed >= title.length;
  useEffect(() => {
    if (!started || !typingDone || active >= STEPS.length - 1) return;
    const id = window.setTimeout(() => setActive((n) => n + 1), active < 0 ? 300 : STEP_MS);
    return () => window.clearTimeout(id);
  }, [started, typingDone, active]);

  const progress = Math.max(0, active) / (STEPS.length - 1);
  return (
    <section
      ref={ref}
      id="how-it-works"
      className="hp-section"
      aria-labelledby="hp-how-title"
      data-journey={animate ? 'animated' : 'static'}
    >
      <div className="hp-wrap">
        <div className="hp-head">
          <p className="hp-kicker">{T.howKicker[lang]}</p>
          <h2 id="hp-how-title" className="hp-journey__title" aria-label={title}>
            {/* The untyped rest keeps its place (hidden), so the layout never jumps; the
                aria-label gives screen readers the whole title at every moment. */}
            {title.slice(0, typed)}
            {animate && !typingDone && <span className="hp-journey__caret" aria-hidden="true" />}
            <span className="hp-journey__rest">{title.slice(typed)}</span>
          </h2>
        </div>
        <ol
          className="hp-steps hp-journey"
          style={{ '--journey-progress': progress } as CSSProperties}
        >
          {STEPS.map((s, i) => {
            const on = i <= active;
            const current = i === active;
            return (
              <li
                key={s.title.en}
                className={['hp-step', on && 'is-on', current && 'is-current']
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="hp-step__num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {i === PAY_STEP && animate && on && (
                  <span className="hp-confetti" aria-hidden="true">
                    {Array.from({ length: CONFETTI }, (_, n) => (
                      <i
                        key={n}
                        style={
                          {
                            '--a': `${-75 + (150 / (CONFETTI - 1)) * n}deg`,
                            '--d': `${3.5 + (n % 4) * 1.25}rem`,
                            '--c': n % 4,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </span>
                )}
                {i === PAY_STEP && (
                  <span className="hp-step__paid" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
                      <path d="M5 12.5 10 17 19 7" />
                    </svg>
                    {T.paySuccess[lang]}
                  </span>
                )}
                <h3 className="hp-step__title">
                  {s.title[lang]}
                  {i === STEPS.length - 1 && (
                    <span className="hp-step__thanks" aria-hidden="true">
                      <ThanksIcon />
                    </span>
                  )}
                </h3>
                <p>{s.body[lang]}</p>
              </li>
            );
          })}
        </ol>
        <p className="hp-note">
          <Link to={localizedPath('/refund-policy', lang)}>
            {content.howItWorks.policyLink[lang]}
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Folded hands — "vanakkam / thank you". Drawn by hand; not an emoji, so it looks the same everywhere. */
function ThanksIcon() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" focusable="false">
      <path d="M15.5 4.5c-1.6 1.4-3.3 4.6-3.8 8.3l-.7 5.3-3.2 4.4a1.6 1.6 0 0 0 .3 2.2l2.6 2a1.6 1.6 0 0 0 2.2-.3l2.6-3.6c.6-.8 1-1.8 1-2.8V6c0-1.3-.6-1.9-1-1.5Z" />
      <path d="M16.5 4.5c1.6 1.4 3.3 4.6 3.8 8.3l.7 5.3 3.2 4.4a1.6 1.6 0 0 1-.3 2.2l-2.6 2a1.6 1.6 0 0 1-2.2-.3l-2.6-3.6c-.6-.8-1-1.8-1-2.8V6c0-1.3.6-1.9 1-1.5Z" />
      <path className="hp-thanks__spark" d="M6 7l1.5 1.5M4.5 12h2M26 7l-1.5 1.5M27.5 12h-2" />
    </svg>
  );
}
