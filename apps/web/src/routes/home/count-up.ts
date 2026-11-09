/** Splits a formatted figure ("₹1,20,000", "12,000+", "85%") into prefix, number and suffix. */
export interface FigureParts {
  prefix: string;
  value: number;
  decimals: number;
  suffix: string;
}

const NUMBER = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s;

export function parseFigure(text: string): FigureParts | null {
  const match = NUMBER.exec(text);
  if (!match) return null;
  const [, prefix = '', digits = '', suffix = ''] = match;
  const value = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const decimals = digits.split('.')[1]?.length ?? 0;
  return { prefix, value, decimals, suffix };
}

/** Ease-out cubic: fast start, gentle landing. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/**
 * The text to show at progress t (0–1). At t = 1 it always returns the original text exactly,
 * so the final figure never differs from what the trust published.
 */
export function figureAt(text: string, parts: FigureParts, t: number, locale: string): string {
  if (t >= 1) return text;
  const n = parts.value * easeOut(t);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: parts.decimals,
    maximumFractionDigits: parts.decimals,
  }).format(parts.decimals ? n : Math.round(n));
  return `${parts.prefix}${formatted}${parts.suffix}`;
}

/** Counting duration: long enough to notice, short enough not to wait for. */
export const COUNT_DURATION_MS = 1400;
