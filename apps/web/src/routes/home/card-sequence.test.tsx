import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD_SEQUENCE_STEP_MS, useCardSequence } from './use-card-sequence.ts';

const COUNT = 4;

function Cards() {
  const ref = useRef<HTMLElement>(null);
  const { animate, current } = useCardSequence(ref, COUNT);
  return (
    <section ref={ref} data-testid="section" data-sequence={animate ? 'animated' : 'static'}>
      {Array.from({ length: COUNT }, (_, i) => (
        <div key={i} data-testid="card" className={i === current ? 'is-current' : ''} />
      ))}
    </section>
  );
}

function setup({ reducedMotion = false, onScreen = false } = {}) {
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
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: onScreen ? 0 : window.innerHeight + 500,
  } as DOMRect);
  render(<Cards />);
  return { show: (visible = true) => act(() => fire(visible)) };
}

const lit = () =>
  screen.getAllByTestId('card').findIndex((c) => c.classList.contains('is-current'));
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCardSequence ("Four ways we stand with families" cards)', () => {
  it('lights each card in turn once the section is in view, then settles with none lit', () => {
    const { show } = setup();
    expect(screen.getByTestId('section')).toHaveAttribute('data-sequence', 'animated');
    expect(lit()).toBe(-1);
    show();
    wait(CARD_SEQUENCE_STEP_MS / 3);
    expect(lit()).toBe(0);
    for (let i = 1; i < COUNT; i++) {
      wait(CARD_SEQUENCE_STEP_MS);
      expect(lit()).toBe(i);
    }
    wait(CARD_SEQUENCE_STEP_MS);
    expect(lit()).toBe(-1);
  });

  it('resets when the section leaves and plays again when it returns', () => {
    const { show } = setup();
    show();
    wait(CARD_SEQUENCE_STEP_MS / 3);
    wait(CARD_SEQUENCE_STEP_MS);
    expect(lit()).toBe(1);
    show(false);
    expect(lit()).toBe(-1);
    show();
    wait(CARD_SEQUENCE_STEP_MS / 3);
    expect(lit()).toBe(0);
  });

  it('stays still with reduced motion', () => {
    const { show } = setup({ reducedMotion: true });
    show();
    wait(CARD_SEQUENCE_STEP_MS * 2);
    expect(screen.getByTestId('section')).toHaveAttribute('data-sequence', 'static');
    expect(lit()).toBe(-1);
  });

  it('stays still when the section is already on screen at load', () => {
    setup({ onScreen: true });
    wait(CARD_SEQUENCE_STEP_MS * 2);
    expect(screen.getByTestId('section')).toHaveAttribute('data-sequence', 'static');
    expect(lit()).toBe(-1);
  });
});
