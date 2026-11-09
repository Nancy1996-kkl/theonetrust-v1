import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { HeroCarousel } from './HeroCarousel.tsx';
import { HERO_SLIDES, nextPlayable, slideLabel } from './hero-slides.ts';

const LABELS = {
  pauseLabel: 'Pause banner videos',
  playLabel: 'Play banner videos',
  carouselLabel: 'Banner videos',
  slideLabelTemplate: 'Show video {n} of {total}',
};
const TOTAL = HERO_SLIDES.length;

type Listener = () => void;
type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

function stubMotion(reduce: boolean) {
  const listeners = new Set<Listener>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('reduce') && reduce,
      addEventListener: (_: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    })),
  );
}

/** jsdom has no media playback: record calls per element instead. */
let played: HTMLMediaElement[];
let pausedEls: HTMLMediaElement[];
let playResult: () => Promise<void>;
let observers: IOCallback[];

beforeEach(() => {
  played = [];
  pausedEls = [];
  playResult = () => Promise.resolve();
  observers = [];
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value(this: HTMLMediaElement) {
      played.push(this);
      return playResult();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value(this: HTMLMediaElement) {
      pausedEls.push(this);
    },
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IOCallback) {
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

const slides = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.hero-carousel__slide')];
const videos = (c: HTMLElement) => [...c.querySelectorAll('video')];
const activeIndex = (c: HTMLElement) => slides(c).findIndex((s) => s.hasAttribute('data-active'));
const dot = (n: number) => screen.getByRole('button', { name: `Show video ${n} of ${TOTAL}` });

describe('slide helpers', () => {
  it('fills the label template', () => {
    expect(slideLabel('Show video {n} of {total}', 2, 4)).toBe('Show video 2 of 4');
    expect(slideLabel('{total} வீடியோக்களில் {n}-வது வீடியோவைக் காட்டு', 3, 4)).toBe(
      '4 வீடியோக்களில் 3-வது வீடியோவைக் காட்டு',
    );
  });

  it('finds the next playable slide, wrapping and skipping failures', () => {
    expect(nextPlayable(0, 4, new Set())).toBe(1);
    expect(nextPlayable(3, 4, new Set())).toBe(0);
    expect(nextPlayable(0, 4, new Set([1, 2]))).toBe(3);
    expect(nextPlayable(1, 4, new Set([0, 1, 2, 3]))).toBe(-1);
  });

  it('every slide has a WebM, an MP4 and a still', () => {
    for (const s of HERO_SLIDES) {
      expect(s.webm).toBeTruthy();
      expect(s.mp4).toBeTruthy();
      expect(s.poster).toBeTruthy();
    }
    expect(new Set(HERO_SLIDES.map((s) => s.id)).size).toBe(TOTAL);
  });
});

describe('HeroCarousel — still mode (reduced motion, data saver, no JS)', () => {
  it('shows stills only: no video, no pause button; slide 1 is the eager LCP image', () => {
    stubMotion(true);
    const { container } = render(<HeroCarousel {...LABELS} />);
    expect(videos(container)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: LABELS.pauseLabel })).toBeNull();
    const imgs = container.querySelectorAll('img.landing-hero__poster');
    expect(imgs).toHaveLength(TOTAL);
    expect(imgs[0]).toHaveAttribute('fetchpriority', 'high');
    expect(imgs[0]).toHaveAttribute('loading', 'eager');
    expect(imgs[1]).toHaveAttribute('loading', 'lazy');
    for (const img of imgs) expect(img).toHaveAttribute('alt', '');
  });

  it('slide buttons still switch the still image', async () => {
    stubMotion(true);
    const user = userEvent.setup();
    const { container } = render(<HeroCarousel {...LABELS} />);
    expect(dot(1)).toHaveAttribute('aria-current', 'true');
    await user.click(dot(3));
    expect(activeIndex(container)).toBe(2);
    expect(dot(3)).toHaveAttribute('aria-current', 'true');
    expect(dot(1)).not.toHaveAttribute('aria-current');
  });
});

describe('HeroCarousel — playing', () => {
  it('renders muted, inline, hidden-from-AT clips with WebM first and MP4 fallback', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    expect(videos(container)).toHaveLength(TOTAL);
    for (const v of videos(container)) {
      expect(v.muted).toBe(true);
      expect(v).toHaveAttribute('playsinline');
      expect(v).toHaveAttribute('aria-hidden', 'true');
      expect([...v.querySelectorAll('source')].map((s) => s.type)).toEqual([
        'video/webm',
        'video/mp4',
      ]);
    }
  });

  it('loads only the visible clip and the next one', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    expect(videos(container).map((v) => v.getAttribute('preload'))).toEqual([
      'auto',
      'auto',
      ...Array(TOTAL - 2).fill('none'),
    ]);
  });

  it('plays only the active clip', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    expect(played).toEqual([videos(container)[0]]);
  });

  it('advances when a clip ends and wraps from the last to the first', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    for (let i = 0; i < TOTAL; i += 1) {
      fireEvent.ended(videos(container)[i]!);
      expect(activeIndex(container)).toBe((i + 1) % TOTAL);
    }
  });

  it('a clip fades in over its still only once it is painting', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    expect(slides(container)[0]).not.toHaveAttribute('data-painting');
    fireEvent.playing(videos(container)[0]!);
    expect(slides(container)[0]).toHaveAttribute('data-painting');
  });

  it('shows playback progress on the current segment', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    const v = videos(container)[0]!;
    Object.defineProperty(v, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(v, 'currentTime', { configurable: true, writable: true, value: 2 });
    fireEvent.timeUpdate(v);
    const fill = container.querySelectorAll<HTMLElement>('.hero-carousel__fill')[0]!;
    expect(fill.style.getPropertyValue('--progress')).toBe('0.25');
  });

  it('ignores progress while the duration is unknown', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    fireEvent.timeUpdate(videos(container)[0]!);
    const fill = container.querySelectorAll<HTMLElement>('.hero-carousel__fill')[0]!;
    expect(fill.style.getPropertyValue('--progress')).toBe('');
  });

  it('a slide button jumps to that clip and restarts it', async () => {
    stubMotion(false);
    const user = userEvent.setup();
    const { container } = render(<HeroCarousel {...LABELS} />);
    await user.click(dot(4));
    expect(activeIndex(container)).toBe(3);
    expect(played.at(-1)).toBe(videos(container)[3]);
    expect(videos(container)[3]!.currentTime).toBe(0);
  });

  it('pause stops the clip and the rotation; play resumes (WCAG 2.2.2)', async () => {
    stubMotion(false);
    const user = userEvent.setup();
    const { container } = render(<HeroCarousel {...LABELS} />);
    await user.click(screen.getByRole('button', { name: LABELS.pauseLabel }));
    expect(pausedEls).toContain(videos(container)[0]);
    played = [];
    await user.click(screen.getByRole('button', { name: LABELS.playLabel }));
    expect(played).toEqual([videos(container)[0]]);
  });

  it('a blocked autoplay leaves the still and offers "Play"', async () => {
    stubMotion(false);
    playResult = () => Promise.reject(new Error('NotAllowedError'));
    render(<HeroCarousel {...LABELS} />);
    expect(await screen.findByRole('button', { name: LABELS.playLabel })).toBeVisible();
  });

  it('pauses while scrolled off screen and resumes when back', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    act(() => observers[0]!([{ isIntersecting: false }]));
    expect(pausedEls).toContain(videos(container)[0]);
    played = [];
    act(() => observers[0]!([{ isIntersecting: true }]));
    expect(played).toEqual([videos(container)[0]]);
  });

  it('pauses in a background tab', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    pausedEls = [];
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(pausedEls).toContain(videos(container)[0]);
  });

  it('skips a clip that fails to load and disables its button', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    fireEvent.error(videos(container)[1]!);
    expect(dot(2)).toBeDisabled();
    fireEvent.ended(videos(container)[0]!);
    expect(activeIndex(container)).toBe(2);
  });

  it('a failing active clip moves straight on (MP4 fallback error too)', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    fireEvent.error(videos(container)[0]!.querySelector('source[type="video/mp4"]')!);
    expect(activeIndex(container)).toBe(1);
  });

  it('if every clip fails, the stills remain and the pause button goes away', () => {
    stubMotion(false);
    const { container } = render(<HeroCarousel {...LABELS} />);
    for (let i = 0; i < TOTAL; i += 1) {
      const v = container.querySelectorAll('video')[0];
      if (v) fireEvent.error(v);
    }
    expect(videos(container)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: LABELS.pauseLabel })).toBeNull();
    expect(container.querySelectorAll('img.landing-hero__poster')).toHaveLength(TOTAL);
  });

  it('has no WCAG 2.2 AA violations', async () => {
    stubMotion(false);
    const original = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4,
    });
    try {
      const { container } = render(<HeroCarousel {...LABELS} />);
      await expectNoA11yViolations(container);
    } finally {
      Object.defineProperty(HTMLMediaElement.prototype, 'readyState', original);
    }
  });
});
