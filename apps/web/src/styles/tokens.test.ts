// @vitest-environment node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_PAIRS,
  contrastTableMarkdown,
  evaluateContrast,
  parseRootTokens,
  referencedTokens,
  resolveToken,
} from './design-tokens.ts';

/* Tests against the REAL token file, global styles and design documentation. */

const webRoot = resolve(import.meta.dirname, '../..');
const repoRoot = resolve(webRoot, '../..');
const tokensCss = readFileSync(join(webRoot, 'src/styles/tokens.css'), 'utf8');
const tokens = parseRootTokens(tokensCss);
const docsPath = join(repoRoot, 'docs/design/tokens.md');

/** Files that may reference tokens: stylesheets, components (inline styles) and e2e fixtures. */
function styledFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? styledFiles(join(dir, entry.name))
      : /\.(css|tsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

function px(value: string): number {
  const rem = /^([\d.]+)rem$/.exec(value);
  if (rem) return Number(rem[1]) * 16;
  const plain = /^([\d.]+)px$/.exec(value);
  if (plain) return Number(plain[1]);
  throw new Error(`Expected a rem/px length, got ${value}`);
}

describe('colour contrast (WCAG 2.2 AA)', () => {
  const results = evaluateContrast(tokens);

  it.each(results.map((r) => [r.where, r]))('%s meets its AA minimum', (_where, result) => {
    expect(result.ratio, `${result.fg} on ${result.bg}`).toBeGreaterThanOrEqual(result.minimum);
  });

  it.each(evaluateContrast(tokens, FORBIDDEN_PAIRS).map((r) => [r.where, r]))(
    'forbidden pair "%s" really fails AA (keep it out of CONTRAST_PAIRS)',
    (_where, result) => {
      expect(result.passes, `${result.fg} on ${result.bg} = ${result.ratio}:1`).toBe(false);
    },
  );

  it('never lists a forbidden combination as allowed', () => {
    const allowed = new Set(results.map((r) => `${r.fgHex}|${r.bgHex}|${r.use}`));
    for (const r of evaluateContrast(tokens, FORBIDDEN_PAIRS)) {
      expect(allowed.has(`${r.fgHex}|${r.bgHex}|${r.use}`), r.where).toBe(false);
    }
  });

  it('only uses bright gold as a text colour on forest', () => {
    const goldForegrounds = results.filter((r) => r.fgHex === tokens.get('--palette-gold'));
    expect(goldForegrounds.length).toBeGreaterThan(0);
    for (const pair of goldForegrounds) expect(pair.bg).toBe('--color-surface-inverse');
  });

  it('keeps the documented contrast table in sync with the tokens', () => {
    const expected = contrastTableMarkdown(results);
    const docs = readFileSync(docsPath, 'utf8');
    const start = '<!-- contrast-table:start -->';
    const end = '<!-- contrast-table:end -->';
    const [from, to] = [docs.indexOf(start), docs.indexOf(end)];
    expect(from, 'contrast-table markers missing in docs/design/tokens.md').toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const current = docs.slice(from + start.length, to).trim();
    if (process.env.UPDATE_TOKEN_DOCS && process.env.CI) {
      throw new Error('UPDATE_TOKEN_DOCS must never run in CI — regenerate locally and commit.');
    }
    if (process.env.UPDATE_TOKEN_DOCS && current !== expected) {
      // Rebuild by position (never string.replace: an empty section would match at index 0).
      writeFileSync(
        docsPath,
        `${docs.slice(0, from + start.length)}\n${expected}\n${docs.slice(to)}`,
      );
      return;
    }
    expect(current, 'Run: UPDATE_TOKEN_DOCS=1 pnpm --filter @theonetrust/web test').toBe(expected);
  });

  it('documents every palette colour with its exact value', () => {
    const docs = readFileSync(docsPath, 'utf8');
    const documented = new Map(
      // Prettier pads table cells, so allow any spacing around the pipes.
      [...docs.matchAll(/\|\s*`(--palette-[\w-]+)`\s*\|\s*(#[0-9A-Fa-f]{6})\s*\|/g)].map(
        ([, n = '', v = '']) => [n, v.toLowerCase()],
      ),
    );
    const palette = [...tokens].filter(([name]) => name.startsWith('--palette-'));
    for (const [name, value] of palette) expect(documented.get(name), name).toBe(value);
    expect(documented.size).toBe(palette.length);
  });
});

describe('token references', () => {
  it('resolves every token without broken or circular references', () => {
    for (const name of tokens.keys()) expect(() => resolveToken(tokens, name)).not.toThrow();
  });

  it.each(
    [...styledFiles(join(webRoot, 'src')), ...styledFiles(join(webRoot, 'e2e/fixtures'))].map(
      (f) => [relative(webRoot, f), f],
    ),
  )('%s only uses tokens that exist', (_name, file) => {
    // Comments may show examples such as var(--x); only real code counts.
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const localDefinitions = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const undefinedRefs = referencedTokens(css).filter(
      (name) => !tokens.has(name) && !localDefinitions.has(name),
    );
    expect(undefinedRefs).toEqual([]);
  });
});

describe('surface classes', () => {
  const globalCss = readFileSync(join(webRoot, 'src/styles/global.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const block = (selector: string) =>
    new Map(
      [
        ...(
          new RegExp(`\\n${selector.replace('.', '\\.')} \\{([^}]*)\\}`).exec(globalCss)?.[1] ?? ''
        ).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g),
      ].map(([, name = '', value = '']) => [name, value.trim()]),
    );

  it('.surface restores exactly the :root light values for every token .surface-inverse changes', () => {
    const inverse = block('.surface-inverse');
    const light = block('.surface');
    expect(inverse.size).toBeGreaterThan(0);
    expect([...light.keys()].sort()).toEqual([...inverse.keys()].sort());
    for (const [name, value] of light) {
      const lightResolved = resolveToken(new Map([...tokens, [name, value]]), name);
      expect(lightResolved, name).toBe(resolveToken(tokens, name));
    }
  });

  it('.surface-inverse only re-maps to tokens that exist', () => {
    for (const [name, value] of block('.surface-inverse')) {
      expect(() => resolveToken(new Map([...tokens, [name, value]]), name), name).not.toThrow();
    }
  });
});

describe('type scale (UX brief §4: mobile @360 → desktop @1440)', () => {
  const expected: Record<string, [number, number]> = {
    '--text-hero': [34, 52], // client, Nov 2026: headline in two lines
    '--text-h1': [34, 48],
    '--text-h2': [28, 38],
    '--text-h3': [22, 26],
    '--text-body': [16, 17],
    '--text-small': [13, 14],
  };

  it.each(Object.entries(expected))('%s clamps between %j px', (name, [min, max]) => {
    const match = /^clamp\(([\d.]+rem), ([\d.]+)rem \+ ([\d.]+)vw, ([\d.]+rem)\)$/.exec(
      tokens.get(name) ?? '',
    );
    expect(match, `${name} must be a rem-based clamp()`).not.toBeNull();
    const [, lo, interceptRem, vw, hi] = match!;
    expect(px(lo!)).toBe(min);
    expect(px(hi!)).toBe(max);
    // The fluid middle term must hit the exact values at the two design widths.
    const at = (width: number) => Number(interceptRem) * 16 + (Number(vw) / 100) * width;
    expect(at(360)).toBeCloseTo(min, 1);
    expect(at(1440)).toBeCloseTo(max, 1);
  });

  it('never uses thin font weights', () => {
    const weights = [...tokens]
      .filter(([k]) => k.startsWith('--weight-'))
      .map(([, v]) => Number(v));
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(400);
  });

  it('Tamil headings use a Unicode serif face, falling back to the Tamil body font', () => {
    // Legacy non-Unicode fonts such as Bamini break SEO, screen readers and typing (#46).
    expect(tokens.get('--font-heading-ta')).toBe("'Noto Serif Tamil', var(--font-tamil)");
    expect(tokens.get('--font-heading-ta')).not.toMatch(/bamini/i);
  });

  it('gives Tamil more line height than English', () => {
    expect(Number(tokens.get('--leading-body-ta'))).toBeGreaterThan(
      Number(tokens.get('--leading-body')),
    );
    expect(Number(tokens.get('--leading-heading-ta'))).toBeGreaterThan(
      Number(tokens.get('--leading-heading')),
    );
  });
});

describe('controls and motion', () => {
  it('keeps every control height at or above the 44px touch target', () => {
    expect(px(tokens.get('--control-height')!)).toBeGreaterThanOrEqual(44);
    expect(px(tokens.get('--control-height-sm')!)).toBeGreaterThanOrEqual(44);
  });

  it('keeps ordinary transitions within 150–250ms', () => {
    for (const name of ['--duration-fast', '--duration-base', '--duration-slow']) {
      const ms = Number(/^(\d+)ms$/.exec(tokens.get(name)!)![1]);
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(250);
    }
  });

  it('collapses every duration token to 0.01ms under prefers-reduced-motion', () => {
    // 0.01ms rather than 0 so transitionend still fires for components that wait for it.
    const block =
      /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([\s\S]*?)\}/.exec(tokensCss)?.[1] ?? '';
    const durations = [...tokens.keys()].filter((k) => k.startsWith('--duration-'));
    expect(durations.length).toBeGreaterThan(0);
    for (const name of durations) expect(block).toMatch(new RegExp(`${name}:\\s*0\\.01ms`));
  });

  it('keeps the focus ring at least 2px', () => {
    expect(px(tokens.get('--focus-ring-width')!)).toBeGreaterThanOrEqual(2);
  });
});
