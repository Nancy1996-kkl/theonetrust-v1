import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PauseIcon, PlayIcon } from './hero-icons.tsx';
import { motionAllowed, motionServerSnapshot, subscribeMotion } from './hero-motion.ts';
import { HERO_SLIDES, nextPlayable, slideLabel, type HeroSlide } from './hero-slides.ts';

interface HeroCarouselProps {
  pauseLabel: string;
  playLabel: string;
  carouselLabel: string;
  /** Template with "{n}" and "{total}". */
  slideLabelTemplate: string;
  slides?: readonly HeroSlide[];
}

/**
 * Hero banner carousel: silent clips that advance when each one ends, crossfading over a still
 * frame (slide 1's still is the LCP image). Only the visible clip and the next one load.
 * - Reduced motion, Save-Data, SSR/no-JS: still frames only; the slide buttons still work.
 * - Pause button stops the clip and the rotation (WCAG 2.2.2); a blocked autoplay shows "Play".
 * - Off screen or in a background tab: paused automatically, resumes when visible again.
 * - A clip that fails to load is skipped; if all fail, the stills remain.
 * Purely decorative for screen readers: the meaning is in the headline next to it.
 */
export function HeroCarousel({
  pauseLabel,
  playLabel,
  carouselLabel,
  slideLabelTemplate,
  slides = HERO_SLIDES,
}: HeroCarouselProps) {
  const total = slides.length;
  const allowed = useSyncExternalStore(subscribeMotion, motionAllowed, motionServerSnapshot);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const [painting, setPainting] = useState(-1);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const fills = useRef<Array<HTMLSpanElement | null>>([]);

  const animate = allowed && failed.size < total;
  const running = animate && !paused && onScreen && tabVisible;
  const next = nextPlayable(active, total, failed);

  // Play only the active clip, and only while it can be seen.
  useEffect(() => {
    if (!animate) return;
    videos.current.forEach((video, i) => {
      if (!video) return;
      if (i === active && running) {
        void video.play()?.catch(() => setPaused(true));
      } else {
        video.pause();
      }
    });
  }, [active, running, animate]);

  // Pause while scrolled away or in a background tab: saves battery and data.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setOnScreen(entry.isIntersecting);
    });
    observer.observe(root);
    const onVisibility = () => setTabVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  function goTo(i: number) {
    if (i < 0 || i === active) return;
    const video = videos.current[i];
    if (video) video.currentTime = 0;
    fills.current.forEach((fill) => fill?.style.removeProperty('--progress'));
    setActive(i);
  }

  function markFailed(i: number) {
    const nextFailed = new Set(failed).add(i);
    setFailed(nextFailed);
    if (i === active) goTo(nextPlayable(active, total, nextFailed));
  }

  function onProgress(i: number) {
    const video = videos.current[i];
    const fill = fills.current[i];
    if (!video || !fill || !Number.isFinite(video.duration) || video.duration <= 0) return;
    fill.style.setProperty('--progress', String(Math.min(1, video.currentTime / video.duration)));
  }

  return (
    <div className="landing-hero__media hero-carousel" ref={rootRef}>
      {slides.map((slide, i) => {
        const isActive = i === active;
        const load = isActive || i === next;
        return (
          <div
            key={slide.id}
            className="hero-carousel__slide"
            data-slide={slide.id}
            data-active={isActive || undefined}
            data-painting={(animate && painting === i) || undefined}
          >
            <img
              className="landing-hero__poster"
              src={slide.poster}
              alt=""
              width={slide.width}
              height={slide.height}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'auto'}
              decoding="async"
            />
            {animate && !failed.has(i) && (
              <video
                ref={(el) => {
                  videos.current[i] = el;
                }}
                className="landing-hero__video"
                width={slide.width}
                height={slide.height}
                muted
                playsInline
                preload={load ? 'auto' : 'none'}
                aria-hidden="true"
                tabIndex={-1}
                disablePictureInPicture
                onPlaying={() => setPainting(i)}
                onTimeUpdate={() => onProgress(i)}
                onEnded={() => goTo(nextPlayable(i, total, failed))}
                onError={() => markFailed(i)}
              >
                <source src={slide.webm} type="video/webm" />
                <source src={slide.mp4} type="video/mp4" onError={() => markFailed(i)} />
              </video>
            )}
          </div>
        );
      })}

      <div className="hero-carousel__controls">
        {animate && (
          <button
            type="button"
            className="landing-hero__motion"
            aria-label={paused ? playLabel : pauseLabel}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        )}
        <div className="hero-carousel__dots" role="group" aria-label={carouselLabel}>
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              className="hero-carousel__dot"
              aria-label={slideLabel(slideLabelTemplate, i + 1, total)}
              aria-current={i === active ? 'true' : undefined}
              disabled={animate && failed.has(i)}
              onClick={() => goTo(i)}
            >
              <span className="hero-carousel__track" aria-hidden="true">
                <span
                  className="hero-carousel__fill"
                  ref={(el) => {
                    fills.current[i] = el;
                  }}
                />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
