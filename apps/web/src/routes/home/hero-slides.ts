import notebookPoster from '../../assets/hero/slides/notebook-poster.webp';
import notebookMp4 from '../../assets/hero/slides/notebook.mp4';
import notebookWebm from '../../assets/hero/slides/notebook.webm';
import smilePoster from '../../assets/hero/slides/smile-poster.webp';
import smileMp4 from '../../assets/hero/slides/smile.mp4';
import smileWebm from '../../assets/hero/slides/smile.webm';
import suppliesPoster from '../../assets/hero/slides/supplies-poster.webp';
import suppliesMp4 from '../../assets/hero/slides/supplies.mp4';
import suppliesWebm from '../../assets/hero/slides/supplies.webm';
import wheelchairPoster from '../../assets/hero/slides/wheelchair-poster.webp';
import wheelchairMp4 from '../../assets/hero/slides/wheelchair.mp4';
import wheelchairWebm from '../../assets/hero/slides/wheelchair.webm';

/**
 * Hero banner clips, in play order. Supplied by the site owner (images/videos, Nov 2026).
 * The three 1280×720 clips were cropped to their scene (their dark left panel is replaced by
 * the forest scrim), re-encoded to WebM + MP4 without audio, ~4× smaller than the originals.
 * Framing per screen size lives in landing.css (`[data-slide]`).
 */
export interface HeroSlide {
  id: string;
  webm: string;
  mp4: string;
  poster: string;
  width: number;
  height: number;
  /** Fallback length in ms if the clip cannot report its own (autoplay blocked, error). */
  durationMs: number;
}

export const HERO_SLIDES: readonly HeroSlide[] = [
  {
    id: 'smile',
    webm: smileWebm,
    mp4: smileMp4,
    poster: smilePoster,
    width: 878,
    height: 434,
    durationMs: 11_200,
  },
  {
    id: 'notebook',
    webm: notebookWebm,
    mp4: notebookMp4,
    poster: notebookPoster,
    width: 880,
    height: 720,
    durationMs: 7_930,
  },
  {
    id: 'supplies',
    webm: suppliesWebm,
    mp4: suppliesMp4,
    poster: suppliesPoster,
    width: 880,
    height: 720,
    durationMs: 7_930,
  },
  {
    id: 'wheelchair',
    webm: wheelchairWebm,
    mp4: wheelchairMp4,
    poster: wheelchairPoster,
    width: 880,
    height: 720,
    durationMs: 7_930,
  },
];

/** Fills "{n}" and "{total}" in a bilingual label template. */
export function slideLabel(template: string, n: number, total: number): string {
  return template.replace('{n}', String(n)).replace('{total}', String(total));
}

/** The next slide index, skipping slides whose video failed. Returns -1 if none can play. */
export function nextPlayable(from: number, total: number, failed: ReadonlySet<number>): number {
  for (let step = 1; step <= total; step += 1) {
    const i = (from + step) % total;
    if (!failed.has(i)) return i;
  }
  return -1;
}
