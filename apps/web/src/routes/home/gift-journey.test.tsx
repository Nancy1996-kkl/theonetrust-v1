import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDING_CONTENT } from '../../content/landing.ts';
import { UiLangContext } from '../../components/ui/ui-strings.ts';
import { GiftJourney } from './GiftJourney.tsx';
import { HOME_TEXT, STEPS } from './home-content.ts';

const TITLE = HOME_TEXT.howTitle.en;

function renderJourney(lang: 'en' | 'ta' = 'en') {
  return render(
    <MemoryRouter>
      <UiLangContext.Provider value={lang}>
        <GiftJourney content={LANDING_CONTENT} />
      </UiLangContext.Provider>
    </MemoryRouter>,
  );
}

const steps = () => [...document.querySelectorAll('#how-it-works .hp-step')];
const title = () => document.getElementById('hp-how-title')!;
const typedText = () =>
  [...title().childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');

/** Section starts below the fold, motion allowed, and we control when it scrolls into view. */
function setUpMotion() {
  let fire: (visible: boolean) => void = () => {};
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        fire = (visible) =>
          cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as never);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: window.innerHeight + 500,
  } as DOMRect);
  return { show: () => act(() => fire(true)) };
}

/** Timers are re-armed after each render, so advance in small steps. */
function tick(ms: number, step = 45) {
  for (let t = 0; t < ms; t += step) act(() => void vi.advanceTimersByTime(step));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('gift journey (client, Nov 2026)', () => {
  it('without motion support shows the whole title, every step lit, the paid tick and the thank-you icon', () => {
    renderJourney();
    expect(screen.getByRole('heading', { level: 2, name: TITLE })).toBeVisible();
    expect(steps()).toHaveLength(STEPS.length);
    for (const step of steps()) expect(step).toHaveClass('is-on');
    expect(steps()[3]!.querySelector('h3 .hp-step__thanks')).not.toBeNull();
    expect(steps()[2]).toHaveTextContent(HOME_TEXT.paySuccess.en);
    expect(steps()[2]!.querySelector('.hp-step__paid')).toHaveAttribute('aria-hidden', 'true');
    // The decorative tick and icon never change the step headings screen readers hear.
    expect(screen.getByRole('heading', { level: 3, name: STEPS[3]!.title.en })).toBeVisible();
    expect(document.querySelector('.hp-confetti')).toBeNull();
    expect(document.getElementById('how-it-works')).toHaveAttribute('data-journey', 'static');
  });

  it('Tamil title and steps', () => {
    renderJourney('ta');
    expect(screen.getByRole('heading', { level: 2, name: HOME_TEXT.howTitle.ta })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: STEPS[0]!.title.ta })).toBeVisible();
  });

  it('types the title, then lights the steps in order with confetti on the payment step', () => {
    vi.useFakeTimers();
    const { show } = setUpMotion();
    renderJourney();
    const section = document.getElementById('how-it-works')!;
    expect(section).toHaveAttribute('data-journey', 'animated');
    // Before it is on screen: nothing typed, nothing lit — but the full title is still there.
    expect(typedText()).toBe('');
    expect(title()).toHaveTextContent(TITLE);
    expect(steps().filter((s) => s.classList.contains('is-on'))).toHaveLength(0);

    show();
    tick(45 * 5);
    expect(typedText()).toBe(TITLE.slice(0, 5));
    tick(45 * TITLE.length);
    expect(typedText()).toBe(TITLE);

    tick(300);
    expect(steps()[0]).toHaveClass('is-on', 'is-current');
    expect(steps()[1]).not.toHaveClass('is-on');
    tick(900);
    expect(steps()[1]).toHaveClass('is-on', 'is-current');
    expect(document.querySelector('.hp-confetti')).toBeNull();
    tick(900);
    expect(steps()[2]).toHaveClass('is-current');
    expect(steps()[2]!.querySelectorAll('.hp-confetti i').length).toBeGreaterThan(0);
    tick(900);
    expect(steps()[3]).toHaveClass('is-on', 'is-current');
    expect(steps()[3]!.querySelector('.hp-step__thanks')).not.toBeNull();
    tick(5000);
    expect(steps().filter((s) => s.classList.contains('is-on'))).toHaveLength(STEPS.length);
  });

  it('plays again when the visitor scrolls away and comes back', () => {
    vi.useFakeTimers();
    let fire: (visible: boolean) => void = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          fire = (visible) =>
            cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as never);
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: window.innerHeight + 500,
    } as DOMRect);
    renderJourney();
    act(() => fire(true));
    tick(45 * TITLE.length + 300 + 900 * 4);
    expect(steps().filter((s) => s.classList.contains('is-on'))).toHaveLength(STEPS.length);
    act(() => fire(false));
    expect(typedText()).toBe('');
    expect(steps().filter((s) => s.classList.contains('is-on'))).toHaveLength(0);
    act(() => fire(true));
    tick(45 * 3);
    expect(typedText()).toBe(TITLE.slice(0, 3));
  });

  it('stays still when the section is already on screen at load', () => {
    setUpMotion();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10,
    } as DOMRect);
    renderJourney();
    expect(document.getElementById('how-it-works')).toHaveAttribute('data-journey', 'static');
    expect(typedText()).toBe(TITLE);
  });

  it('respects reduced motion', () => {
    setUpMotion();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    renderJourney();
    expect(document.getElementById('how-it-works')).toHaveAttribute('data-journey', 'static');
  });
});
