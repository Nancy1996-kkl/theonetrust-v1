/**
 * Pure helpers for reading CSS custom properties and checking WCAG contrast.
 * Used by unit tests and the token documentation; no runtime/browser dependency.
 */

/** Extracts `--name: value;` declarations from the first `:root { … }` block. */
export function parseRootTokens(css: string): Map<string, string> {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  const tokens = new Map<string, string>();
  if (!root?.[1]) return tokens;
  for (const [, name = '', value = ''] of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

/** Follows `var(--x)` chains to a final value. Throws on unknown or circular references. */
export function resolveToken(
  tokens: Map<string, string>,
  name: string,
  seen = new Set<string>(),
): string {
  if (seen.has(name)) throw new Error(`Circular token reference: ${[...seen, name].join(' → ')}`);
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Unknown token: ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return ref ? resolveToken(tokens, ref, new Set([...seen, name])) : value;
}

/** Every `var(--name…)` referenced in a stylesheet. */
export function referencedTokens(css: string): string[] {
  return [...new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name = '']) => name))];
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHex(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`Not a hex colour: ${hex}`);
  const full = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
  return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, rounded down to 2 decimals so a borderline pair never rounds up into a pass. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return Math.floor(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

export type ContrastUse = 'text' | 'large-text' | 'ui';

/** WCAG 2.2 AA minimums: 1.4.3 (text 4.5, large 3) and 1.4.11 (non-text UI 3). */
export const AA_MINIMUM: Record<ContrastUse, number> = { text: 4.5, 'large-text': 3, ui: 3 };

export interface ContrastPair {
  fg: string;
  bg: string;
  use: ContrastUse;
  where: string;
}

/**
 * Every foreground/background combination the design system allows.
 * Adding a new combination in components means adding it here first — the test enforces AA.
 */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { fg: '--color-text', bg: '--color-bg', use: 'text', where: 'Body text on page' },
  { fg: '--color-text', bg: '--color-surface', use: 'text', where: 'Body text on cards' },
  {
    fg: '--color-text',
    bg: '--color-surface-muted',
    use: 'text',
    where: 'Body text on muted band',
  },
  { fg: '--color-text-muted', bg: '--color-bg', use: 'text', where: 'Secondary text on page' },
  {
    fg: '--color-text-muted',
    bg: '--color-surface',
    use: 'text',
    where: 'Secondary text on cards',
  },
  {
    fg: '--color-text-muted',
    bg: '--color-surface-muted',
    use: 'text',
    where: 'Secondary text on muted band',
  },
  { fg: '--color-text-heading', bg: '--color-bg', use: 'text', where: 'Headings on page' },
  { fg: '--color-text-heading', bg: '--color-surface', use: 'text', where: 'Headings on cards' },
  {
    fg: '--color-text-heading',
    bg: '--color-surface-muted',
    use: 'text',
    where: 'Headings on muted band',
  },
  { fg: '--color-link', bg: '--color-bg', use: 'text', where: 'Links on page' },
  { fg: '--color-link', bg: '--color-surface', use: 'text', where: 'Links on cards' },
  { fg: '--color-link', bg: '--color-surface-muted', use: 'text', where: 'Links on muted band' },
  {
    fg: '--color-text-inverse',
    bg: '--color-surface-inverse',
    use: 'text',
    where: 'Text, headings, links on dark green band',
  },
  {
    fg: '--color-text-accent-on-inverse',
    bg: '--color-surface-inverse',
    use: 'text',
    where: 'Accent label on dark green',
  },
  {
    fg: '--color-action-primary-text',
    bg: '--color-action-primary-bg',
    use: 'text',
    where: 'Primary button',
  },
  {
    fg: '--color-action-primary-text',
    bg: '--color-action-primary-bg-hover',
    use: 'text',
    where: 'Primary button hover',
  },
  {
    fg: '--color-action-primary-text',
    bg: '--color-action-primary-bg-active',
    use: 'text',
    where: 'Primary button pressed',
  },
  {
    fg: '--color-action-donate-text',
    bg: '--color-action-donate-bg',
    use: 'text',
    where: 'Donate button',
  },
  {
    fg: '--color-action-donate-text',
    bg: '--color-action-donate-bg-hover',
    use: 'text',
    where: 'Donate button hover',
  },
  {
    fg: '--color-action-donate-text',
    bg: '--color-action-donate-bg-active',
    use: 'text',
    where: 'Donate button pressed',
  },
  {
    fg: '--color-action-secondary-text',
    bg: '--color-surface',
    use: 'text',
    where: 'Secondary button label',
  },
  {
    fg: '--color-action-secondary-text',
    bg: '--color-action-secondary-bg-hover',
    use: 'text',
    where: 'Secondary button hover',
  },
  {
    fg: '--color-action-secondary-border',
    bg: '--color-bg',
    use: 'ui',
    where: 'Secondary button border',
  },
  {
    fg: '--color-text-placeholder',
    bg: '--color-surface',
    use: 'text',
    where: 'Input placeholder',
  },
  { fg: '--color-status-success', bg: '--color-surface', use: 'text', where: 'Success message' },
  { fg: '--color-status-success', bg: '--color-bg', use: 'text', where: 'Success message on page' },
  { fg: '--color-status-error', bg: '--color-surface', use: 'text', where: 'Error message' },
  { fg: '--color-status-error', bg: '--color-bg', use: 'text', where: 'Error message on page' },
  { fg: '--color-status-info', bg: '--color-surface', use: 'text', where: 'Info message' },
  { fg: '--color-status-info', bg: '--color-bg', use: 'text', where: 'Info message on page' },
  {
    fg: '--color-status-warning-text',
    bg: '--color-surface',
    use: 'text',
    where: 'Warning message',
  },
  {
    fg: '--color-status-warning-text',
    bg: '--color-bg',
    use: 'text',
    where: 'Warning message on page',
  },
  { fg: '--color-status-warning', bg: '--color-surface', use: 'ui', where: 'Warning icon/border' },
  { fg: '--color-border-input', bg: '--color-surface', use: 'ui', where: 'Form field border' },
  { fg: '--color-focus', bg: '--color-bg', use: 'ui', where: 'Focus ring on page' },
  { fg: '--color-focus', bg: '--color-surface', use: 'ui', where: 'Focus ring on cards' },
  {
    fg: '--color-focus',
    bg: '--color-surface-muted',
    use: 'ui',
    where: 'Focus ring on muted band',
  },
  {
    fg: '--color-focus-on-inverse',
    bg: '--color-surface-inverse',
    use: 'ui',
    where: 'Focus ring on dark green',
  },
  {
    fg: '--color-border-input-on-inverse',
    bg: '--color-surface-inverse',
    use: 'ui',
    where: 'Form field border on dark green',
  },
  {
    fg: '--color-text-inverse',
    bg: '--color-action-secondary-bg-hover-on-inverse',
    use: 'text',
    where: 'Outline button hover on dark green',
  },
  {
    fg: '--color-status-warning-text',
    bg: '--color-surface-muted',
    use: 'text',
    where: 'Warning text on muted band (passes with the green palette)',
  },
  {
    fg: '--color-status-success',
    bg: '--color-surface-muted',
    use: 'text',
    where: 'Success text on muted band (passes with the medium-green palette)',
  },
];

/**
 * Combinations that FAIL AA and must never be used. Tests assert they keep failing, so the
 * rule stays documented and nobody quietly moves them into CONTRAST_PAIRS.
 */
export const FORBIDDEN_PAIRS: ContrastPair[] = [
  { fg: '--palette-accent', bg: '--color-bg', use: 'text', where: 'Accent text on page' },
  { fg: '--palette-accent', bg: '--color-surface', use: 'text', where: 'Accent text on cards' },
  {
    fg: '--color-status-warning',
    bg: '--color-surface',
    use: 'text',
    where: 'Warning orange as text',
  },
  {
    fg: '--color-focus',
    bg: '--color-surface-inverse',
    use: 'ui',
    where: 'Blue focus ring on dark green',
  },
  {
    fg: '--color-border-input',
    bg: '--color-surface-inverse',
    use: 'ui',
    where: 'Steel input border on dark green',
  },
  {
    fg: '--color-action-secondary-text',
    bg: '--color-surface-inverse',
    use: 'text',
    where: 'Dark green outline button on dark green',
  },
];

export interface ContrastResult extends ContrastPair {
  fgHex: string;
  bgHex: string;
  ratio: number;
  minimum: number;
  passes: boolean;
}

export function evaluateContrast(
  tokens: Map<string, string>,
  pairs = CONTRAST_PAIRS,
): ContrastResult[] {
  return pairs.map((pair) => {
    const fgHex = resolveToken(tokens, pair.fg);
    const bgHex = resolveToken(tokens, pair.bg);
    const ratio = contrastRatio(fgHex, bgHex);
    const minimum = AA_MINIMUM[pair.use];
    return { ...pair, fgHex, bgHex, ratio, minimum, passes: ratio >= minimum };
  });
}

/** Markdown table for docs/design/tokens.md. */
export function contrastTableMarkdown(results: ContrastResult[]): string {
  const rows = results.map(
    (r) =>
      `| ${r.where} | \`${r.fg}\` ${r.fgHex.toUpperCase()} | \`${r.bg}\` ${r.bgHex.toUpperCase()} | ${r.use} | ${r.ratio.toFixed(2)}:1 | ${r.minimum}:1 | ${r.passes ? '✔ AA' : '✖ FAIL'} |`,
  );
  return [
    '| Where | Foreground | Background | Use | Ratio | AA minimum | Result |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}
