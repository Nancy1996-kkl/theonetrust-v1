import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { HeroBanner } from './HeroBanner.tsx';
import { BANNER_SIZE, motionAllowed, subscribeMotion } from './hero-motion.ts';

const LABELS = { pauseLabel: 'Pause banner animation', playLabel: 'Play banner animation' };

type Listener = () => void;

/** Fake matchMedia whose "reduce" answer can flip at runtime, like a real OS setting change. */
function stubMotion(reduce: boolean) {
  const listeners = new Set<Listener>();
  const state = { reduce };
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query.includes('reduce') && state.reduce;
      },
      media: query,
      addEventListener: (_: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    })),
  );
  return {
    set(next: boolean) {
      state.reduce = next;
      act(() => listeners.forEach((fn) => fn()));
    },
    listeners,
  };
}

function stubSaveData(saveData: boolean | undefined) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: saveData === undefined ? undefined : { saveData },
  });
}

/** jsdom has no media playback; record calls instead of logging "not implemented". */
let playSpy: ReturnType<typeof vi.fn>;
let pauseSpy: ReturnType<typeof vi.fn>;
let pausedState = false;

beforeEach(() => {
  pausedState = false;
  playSpy = vi.fn(() => {
    pausedState = false;
    return Promise.resolve();
  });
  pauseSpy = vi.fn(() => {
    pausedState = true;
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: playSpy });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: pauseSpy,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get: () => pausedState,
  });
  stubSaveData(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  stubSaveData(undefined);
});

describe('motionAllowed', () => {
  it('allows motion when nothing asks for less', () => {
    stubMotion(false);
    expect(motionAllowed()).toBe(true);
  });

  it('refuses motion under prefers-reduced-motion', () => {
    stubMotion(true);
    expect(motionAllowed()).toBe(false);
  });

  it('refuses motion when the visitor turned on data saver', () => {
    stubMotion(false);
    stubSaveData(true);
    expect(motionAllowed()).toBe(false);
  });

  it('allows motion when the browser has no Network Information API', () => {
    stubMotion(false);
    stubSaveData(undefined);
    expect(motionAllowed()).toBe(true);
  });

  it('stays still when the browser cannot report the motion setting', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(motionAllowed()).toBe(false);
  });

  it('is off during server rendering (no window)', () => {
    expect(motionAllowed(null)).toBe(false);
  });

  it('subscribing without matchMedia is a safe no-op', () => {
    vi.stubGlobal('matchMedia', undefined);
    const unsubscribe = subscribeMotion(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('HeroBanner', () => {
  it('always renders the still frame, decorative and sized to prevent layout shift', () => {
    stubMotion(true);
    const { container } = render(<HeroBanner {...LABELS} />);
    const img = container.querySelector('img.landing-hero__poster')!;
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('width', String(BANNER_SIZE.width));
    expect(img).toHaveAttribute('height', String(BANNER_SIZE.height));
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('shows no video and no pause button under reduced motion', () => {
    stubMotion(true);
    const { container } = render(<HeroBanner {...LABELS} />);
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('plays a muted, looping, inline, hidden-from-AT video with WebM first and MP4 fallback', () => {
    stubMotion(false);
    const { container } = render(<HeroBanner {...LABELS} />);
    const video = container.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('aria-hidden', 'true');
    const types = [...video.querySelectorAll('source')].map((s) => s.getAttribute('type'));
    expect(types).toEqual(['video/webm', 'video/mp4']);
  });

  it('fades the video in only once it is actually playing', () => {
    stubMotion(false);
    const { container } = render(<HeroBanner {...LABELS} />);
    const media = container.querySelector('.landing-hero__media')!;
    expect(media).not.toHaveAttribute('data-playing');
    fireEvent.playing(container.querySelector('video')!);
    expect(media).toHaveAttribute('data-playing');
  });

  it('pause button stops and restarts the animation and swaps its label (WCAG 2.2.2)', async () => {
    stubMotion(false);
    const user = userEvent.setup();
    render(<HeroBanner {...LABELS} />);
    await user.click(screen.getByRole('button', { name: LABELS.pauseLabel }));
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: LABELS.playLabel }));
    expect(playSpy).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: LABELS.pauseLabel })).toBeVisible();
  });

  it('a refused play() (autoplay policy) does not throw or log', async () => {
    stubMotion(false);
    const user = userEvent.setup();
    render(<HeroBanner {...LABELS} />);
    await user.click(screen.getByRole('button', { name: LABELS.pauseLabel }));
    playSpy.mockImplementationOnce(() => Promise.reject(new Error('NotAllowedError')));
    await user.click(screen.getByRole('button', { name: LABELS.playLabel }));
    expect(playSpy).toHaveBeenCalled();
  });

  it('falls back to the still frame if the video cannot load', () => {
    stubMotion(false);
    const { container } = render(<HeroBanner {...LABELS} />);
    fireEvent.error(container.querySelector('video')!);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img.landing-hero__poster')).not.toBeNull();
  });

  it('stops the video when the visitor turns on reduced motion mid-visit', () => {
    const motion = stubMotion(false);
    const { container, unmount } = render(<HeroBanner {...LABELS} />);
    expect(container.querySelector('video')).not.toBeNull();
    motion.set(true);
    expect(container.querySelector('video')).toBeNull();
    unmount();
    expect(motion.listeners.size).toBe(0);
  });

  it('has no WCAG 2.2 AA violations', async () => {
    stubMotion(false);
    // axe waits for media metadata before its autoplay-audio check; jsdom never loads media.
    const original = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4,
    });
    try {
      const { container } = render(<HeroBanner {...LABELS} />);
      await expectNoA11yViolations(container);
    } finally {
      Object.defineProperty(HTMLMediaElement.prototype, 'readyState', original);
    }
  });
});
