import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CountUp } from './CountUp.tsx';
import { easeOut, figureAt, parseFigure } from './count-up.ts';

describe('parseFigure', () => {
  it.each([
    ['12,000', { prefix: '', value: 12000, decimals: 0, suffix: '' }],
    ['₹4,50,000', { prefix: '₹', value: 450000, decimals: 0, suffix: '' }],
    ['85%', { prefix: '', value: 85, decimals: 0, suffix: '%' }],
    ['3.5 lakh', { prefix: '', value: 3.5, decimals: 1, suffix: ' lakh' }],
    ['About 40 families', { prefix: 'About ', value: 40, decimals: 0, suffix: ' families' }],
  ])('%s', (text, parts) => {
    expect(parseFigure(text)).toEqual(parts);
  });

  it('returns null when there is no number', () => {
    expect(parseFigure('Many')).toBeNull();
    expect(parseFigure('')).toBeNull();
  });
});

describe('figureAt', () => {
  const parts = parseFigure('₹4,50,000')!;

  it('starts at zero and always ends on the exact published text', () => {
    expect(figureAt('₹4,50,000', parts, 0, 'en-IN')).toBe('₹0');
    expect(figureAt('₹4,50,000', parts, 1, 'en-IN')).toBe('₹4,50,000');
    expect(figureAt('₹4,50,000', parts, 5, 'en-IN')).toBe('₹4,50,000');
  });

  it('uses Indian digit grouping mid-way and keeps decimals', () => {
    expect(figureAt('₹4,50,000', parts, 0.5, 'en-IN')).toMatch(/^₹\d{1,2},\d{2},\d{3}$/);
    const dec = parseFigure('3.5 lakh')!;
    expect(figureAt('3.5 lakh', dec, 0.5, 'en-IN')).toMatch(/^\d\.\d lakh$/);
  });

  it('eases out and is clamped', () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

describe('CountUp', () => {
  let observers: Array<{ cb: IOCallback; disconnect: ReturnType<typeof vi.fn> }>;
  let frames: FrameRequestCallback[];
  let now: number;

  function allowMotion(allowed: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: !allowed,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }

  function runFrames(ms: number) {
    now += ms;
    const queued = frames;
    frames = [];
    act(() => queued.forEach((f) => f(now)));
  }

  beforeEach(() => {
    observers = [];
    frames = [];
    now = 0;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        constructor(cb: IOCallback) {
          observers.push({ cb, disconnect: this.disconnect });
        }
        observe() {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const digits = (c: HTMLElement) => c.querySelector('.count-up__digits')!.textContent;

  it('renders the exact figure for screen readers at every moment', () => {
    allowMotion(true);
    const { container } = render(<CountUp value="12,000" />);
    act(() => observers[0]!.cb([{ isIntersecting: false }]));
    expect(digits(container)).toBe('0');
    expect(container.querySelector('.visually-hidden')).toHaveTextContent('12,000');
    expect(container.querySelector('.count-up__digits')).toHaveAttribute('aria-hidden', 'true');
  });

  it('counts up once it scrolls into view, then stops on the published text', () => {
    allowMotion(true);
    const { container } = render(<CountUp value="12,000" />);
    act(() => observers[0]!.cb([{ isIntersecting: false }]));
    act(() => observers[0]!.cb([{ isIntersecting: true }]));
    expect(observers[0]!.disconnect).toHaveBeenCalled();
    runFrames(700);
    const mid = Number(digits(container)!.replace(/,/g, ''));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(12000);
    runFrames(800);
    expect(digits(container)).toBe('12,000');
    expect(frames).toHaveLength(0);
  });

  it('reduced motion: no observer, the final figure only', () => {
    allowMotion(false);
    const { container } = render(<CountUp value="12,000" />);
    expect(observers).toHaveLength(0);
    expect(digits(container)).toBe('12,000');
  });

  it('a value without a number is shown unchanged and never animated', () => {
    allowMotion(true);
    const { container } = render(<CountUp value="Many" />);
    expect(observers).toHaveLength(0);
    expect(digits(container)).toBe('Many');
  });

  it('without IntersectionObserver the figure is shown as is', () => {
    allowMotion(true);
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<CountUp value="340" />);
    expect(digits(container)).toBe('340');
  });

  it('cleans up the observer and any running frame on unmount', () => {
    allowMotion(true);
    const { unmount } = render(<CountUp value="340" />);
    act(() => observers[0]!.cb([{ isIntersecting: true }]));
    unmount();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
