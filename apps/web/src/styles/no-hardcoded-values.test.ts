// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRootTokens } from './design-tokens.ts';

/**
 * Guards the "no hard-coded values" rule: raw colours and font sizes may only live in
 * tokens.css. Everything else must use var(--token) or a CSS-wide keyword.
 */

const webRoot = resolve(import.meta.dirname, '../..');
const TOKEN_FILE = 'src/styles/tokens.css';

/** All CSS named colours (CSS Color 4), so `tomato` or `teal` cannot sneak in. */
const NAMED_COLOURS =
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink
indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta
maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen`.split(/\s+/);

const COLOUR_FUNCTION_OR_HEX =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const ALLOWED_KEYWORD = /^(?:var\(|transparent|currentcolor|inherit|initial|unset|revert|none\b)/i;
const NAMED = new RegExp(`(?:^|[\\s,(])(?:${NAMED_COLOURS.join('|')})(?=$|[\\s,);])`, 'i');
const COLOUR_PROPERTY = /(^|-)color$|^(fill|stroke)$/;
const SHORTHAND_WITH_COLOUR =
  /^(background|border(-[a-z]+)?|outline|box-shadow|text-shadow|text-decoration)$/;

/** Every `property: value;` declaration in a stylesheet. */
function declarations(css: string): Array<{ property: string; value: string }> {
  return [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/gi)].map(([, property = '', value = '']) => ({
    property: property.toLowerCase(),
    value: value.trim(),
  }));
}

/** Pure check used by the file scan below and by the self-test. */
function cssFindings(css: string): string[] {
  const findings: string[] = [...(css.match(COLOUR_FUNCTION_OR_HEX) ?? [])];
  for (const { property, value } of declarations(css)) {
    if (property.startsWith('--')) continue;
    const decl = `${property}: ${value}`;
    if (COLOUR_PROPERTY.test(property) && !ALLOWED_KEYWORD.test(value)) findings.push(decl);
    else if (SHORTHAND_WITH_COLOUR.test(property) && NAMED.test(value)) findings.push(decl);
    if (property === 'font-size' && !ALLOWED_KEYWORD.test(value) && value !== '100%') {
      findings.push(decl);
    }
    if (property === 'font' && /\d(px|rem|em|pt)\b/.test(value)) findings.push(decl);
  }
  return findings;
}

/** Inline React styles: `style={{ color: '#fff' }}` / `fontSize: 14`. */
function tsxFindings(code: string): string[] {
  const findings: string[] = [...(code.match(COLOUR_FUNCTION_OR_HEX) ?? [])];
  for (const [match, , value = ''] of code.matchAll(
    /\b(color|backgroundColor|background|borderColor|outlineColor|fill|stroke|fontSize)\s*:\s*([^,}\n]+)/g,
  )) {
    const literal = value.trim().replace(/^['"`]|['"`]$/g, '');
    if (!ALLOWED_KEYWORD.test(literal)) findings.push(match.trim());
  }
  return findings;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'test' ? [] : sourceFiles(path);
    if (/\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return /\.(css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const files = sourceFiles(join(webRoot, 'src'))
  .map((f) => relative(webRoot, f))
  .filter((f) => f !== TOKEN_FILE);

describe('no hard-coded colours or font sizes outside tokens.css', () => {
  it.each(files)('%s', (file) => {
    const code = stripComments(readFileSync(join(webRoot, file), 'utf8'));
    expect(file.endsWith('.css') ? cssFindings(code) : tsxFindings(code)).toEqual([]);
  });
});

describe('guard self-test: catches what it claims to catch', () => {
  it.each([
    'a { color: #fff; }',
    'a { background: rgb(0 0 0); }',
    'a { border-color: tomato; }',
    'a { border: 1px solid teal; }',
    'a { outline: 2px solid rebeccapurple; }',
    'a { color: red; }',
    'a { font-size: 14px; }',
    'a { font: 700 14px Inter; }',
    'a { fill: black; }',
    'a { text-decoration-color: navy; }',
  ])('flags %s', (css) => {
    expect(cssFindings(css)).not.toEqual([]);
  });

  it.each([
    'a { color: var(--color-text); }',
    'a { background: var(--color-surface); border: 1px solid var(--color-border-input); }',
    'a { font-size: var(--text-body); font: inherit; }',
    'a { color: currentColor; background: transparent; outline-color: inherit; }',
    "a { font-family: 'Noto Sans Tamil', Latha; }",
  ])('allows %s', (css) => {
    expect(cssFindings(css)).toEqual([]);
  });

  it.each([
    "<p style={{ color: '#fff' }} />",
    '<p style={{ fontSize: 14 }} />',
    "<p style={{ backgroundColor: 'teal' }} />",
  ])('flags inline style %s', (tsx) => {
    expect(tsxFindings(tsx)).not.toEqual([]);
  });

  it('allows token-based inline styles', () => {
    const tsx = "<p style={{ color: 'var(--color-text)', fontSize: 'var(--text-small)' }} />";
    expect(tsxFindings(tsx)).toEqual([]);
  });
});

describe('documented exceptions', () => {
  it('index.html theme-color equals --palette-forest (meta tags cannot read CSS variables)', () => {
    const html = readFileSync(join(webRoot, 'index.html'), 'utf8');
    const themeColor = /<meta name="theme-color" content="(#[0-9a-f]{6})"/i.exec(html)?.[1];
    const tokens = parseRootTokens(readFileSync(join(webRoot, TOKEN_FILE), 'utf8'));
    expect(themeColor?.toLowerCase()).toBe(tokens.get('--palette-forest'));
    const otherColours = html.match(/#[0-9a-f]{6}\b/gi) ?? [];
    expect(otherColours).toHaveLength(1);
  });
});
