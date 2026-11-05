import { useRef, useState, useSyncExternalStore } from 'react';
import posterUrl from '../../assets/hero/hero-poster.webp';
import mp4Url from '../../assets/hero/hero.mp4';
import webmUrl from '../../assets/hero/hero.webm';
import { PauseIcon, PlayIcon } from './hero-icons.tsx';
import {
  BANNER_SIZE,
  motionAllowed,
  motionServerSnapshot,
  subscribeMotion,
} from './hero-motion.ts';

interface HeroBannerProps {
  pauseLabel: string;
  playLabel: string;
}

/**
 * The hero banner: a still frame that paints immediately (it is the LCP image), then a short,
 * silent looping video made from the approved banner GIF (WebM/MP4: ~4× smaller than the GIF)
 * fades in over it. A visible pause button satisfies WCAG 2.2.2 for motion longer than 5 s.
 * Purely decorative for screen readers: the meaning is in the headline next to it.
 */
export function HeroBanner({ pauseLabel, playLabel }: HeroBannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const allowed = useSyncExternalStore(subscribeMotion, motionAllowed, motionServerSnapshot);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const animate = allowed && !failed;

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  }

  return (
    <div className="landing-hero__media" data-playing={playing || undefined}>
      <img
        className="landing-hero__poster"
        src={posterUrl}
        alt=""
        width={BANNER_SIZE.width}
        height={BANNER_SIZE.height}
        fetchPriority="high"
        decoding="async"
      />
      {animate && (
        <>
          <video
            ref={videoRef}
            className="landing-hero__video"
            width={BANNER_SIZE.width}
            height={BANNER_SIZE.height}
            poster={posterUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            disablePictureInPicture
            onPlaying={() => setPlaying(true)}
            onError={() => setFailed(true)}
          >
            <source src={webmUrl} type="video/webm" />
            <source src={mp4Url} type="video/mp4" />
          </video>
          <button
            type="button"
            className="landing-hero__motion"
            aria-label={paused ? playLabel : pauseLabel}
            onClick={toggle}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        </>
      )}
    </div>
  );
}
