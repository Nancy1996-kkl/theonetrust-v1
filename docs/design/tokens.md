# Design tokens

Source of truth: [`apps/web/src/styles/tokens.css`](../../apps/web/src/styles/tokens.css).
Brand direction: [`docs/ux-design-brief.md`](../ux-design-brief.md) §2–4 (Forest Green).

## Rules

1. **Components use role tokens** (`--color-text`, `--color-action-primary-bg`, …), never palette
   tokens (`--palette-*`) and never raw values. Raw colours and font sizes anywhere outside
   `tokens.css` fail `no-hardcoded-values.test.ts`.
2. **Every foreground/background combination must be listed** in `CONTRAST_PAIRS`
   (`apps/web/src/styles/design-tokens.ts`). The test enforces WCAG 2.2 AA and regenerates the
   table below: `UPDATE_TOKEN_DOCS=1 pnpm --filter @theonetrust/web test`.
3. **Status is never colour alone**: always pair with an icon and words.
4. **Gold is an accent**: the Donate button background, thin rules, and text on dark green only.
   Accent text on light surfaces is 2.1–2.3:1 and fails AA (`FORBIDDEN_PAIRS` keeps it that way).
5. **Warning orange** (`--color-status-warning`) is for icons and borders only (3.6:1). Warning
   text uses `--color-status-warning-text` (derived darker tone, 5.5:1).
6. **Focus ring**: info blue on light surfaces; gold inside `.surface-inverse` (blue is only 2.5:1 on dark green).

7. **Dark green bands** use `.surface-inverse`, which re-maps the role tokens (text, headings, links,
   focus ring) — never set only `color` on a dark container.
8. **Status text never sits on the muted band** (`--color-surface-muted`): success and warning
   text fail AA there. Put status messages on `--color-surface` or `--color-bg`.
9. **Interaction states** use the state tokens (`--color-action-*-bg-hover/-active`,
   `--color-text-placeholder`, `--color-text-disabled`, `--color-surface-disabled`). Disabled
   controls are exempt from WCAG contrast but stay readable.
10. **Tamil** re-maps `--font-heading`, `--font-body`, `--leading-body`, `--leading-heading` inside
    any `lang="ta"` element (zero specificity via `:where()`), so component classes that use the
    tokens get Tamil fonts and leading automatically. Long Tamil words break anywhere, including
    inside flex/grid items.
11. **Reading width** is opt-in: wrap long-form text in `.prose` (68ch); heroes, CTAs and admin
    tables are not narrowed.

## Colour

| Palette token            | Value   | Role                                                              |
| ------------------------ | ------- | ----------------------------------------------------------------- |
| `--palette-primary`      | #14532D | Dark green — primary brand, headings, primary buttons, dark bands |
| `--palette-accent`       | #9FD8AD | Light green — Donate CTA background, accents on dark green        |
| `--palette-mist`         | #E3F1E7 | Light green tint — muted bands, decorative dividers               |
| `--palette-canvas`       | #F6FAF7 | Near-white with a green hint — page background                    |
| `--palette-primary-soft` | #3D6B4F | Mid green — secondary text, form borders                          |
| `--palette-ink`          | #1F2D25 | Green-black — body text                                           |
| `--palette-white`        | #FFFFFF | Card surfaces, text on dark green                                 |
| `--palette-success`      | #287A55 | Success                                                           |
| `--palette-warning`      | #B7791F | Warning icons/borders                                             |
| `--palette-warning-dark` | #8F5E14 | Warning text (derived for AA)                                     |
| `--palette-error`        | #B42318 | Error                                                             |
| `--palette-info`         | #3568A8 | Information, focus ring                                           |
| `--palette-accent-light` | #B8E3C2 | Donate hover (derived; 6.4:1 with dark green text)                |
| `--palette-accent-dark`  | #86C997 | Donate pressed (derived; 4.7:1 with dark green text)              |
| `--palette-slate`        | #5C6E63 | Placeholder and disabled text (derived; 5.4:1 on white)           |

### Contrast (generated — do not edit by hand)

<!-- prettier-ignore-start -->
<!-- contrast-table:start -->
| Where | Foreground | Background | Use | Ratio | AA minimum | Result |
|---|---|---|---|---|---|---|
| Body text on page | `--color-text` #1F2D25 | `--color-bg` #F6FAF7 | text | 13.65:1 | 4.5:1 | ✔ AA |
| Body text on cards | `--color-text` #1F2D25 | `--color-surface` #FFFFFF | text | 14.38:1 | 4.5:1 | ✔ AA |
| Body text on muted band | `--color-text` #1F2D25 | `--color-surface-muted` #E3F1E7 | text | 12.32:1 | 4.5:1 | ✔ AA |
| Secondary text on page | `--color-text-muted` #3D6B4F | `--color-bg` #F6FAF7 | text | 5.83:1 | 4.5:1 | ✔ AA |
| Secondary text on cards | `--color-text-muted` #3D6B4F | `--color-surface` #FFFFFF | text | 6.15:1 | 4.5:1 | ✔ AA |
| Secondary text on muted band | `--color-text-muted` #3D6B4F | `--color-surface-muted` #E3F1E7 | text | 5.27:1 | 4.5:1 | ✔ AA |
| Headings on page | `--color-text-heading` #14532D | `--color-bg` #F6FAF7 | text | 8.64:1 | 4.5:1 | ✔ AA |
| Headings on cards | `--color-text-heading` #14532D | `--color-surface` #FFFFFF | text | 9.11:1 | 4.5:1 | ✔ AA |
| Headings on muted band | `--color-text-heading` #14532D | `--color-surface-muted` #E3F1E7 | text | 7.81:1 | 4.5:1 | ✔ AA |
| Links on page | `--color-link` #14532D | `--color-bg` #F6FAF7 | text | 8.64:1 | 4.5:1 | ✔ AA |
| Links on cards | `--color-link` #14532D | `--color-surface` #FFFFFF | text | 9.11:1 | 4.5:1 | ✔ AA |
| Links on muted band | `--color-link` #14532D | `--color-surface-muted` #E3F1E7 | text | 7.81:1 | 4.5:1 | ✔ AA |
| Text, headings, links on dark green band | `--color-text-inverse` #FFFFFF | `--color-surface-inverse` #14532D | text | 9.11:1 | 4.5:1 | ✔ AA |
| Accent label on dark green | `--color-text-accent-on-inverse` #9FD8AD | `--color-surface-inverse` #14532D | text | 5.59:1 | 4.5:1 | ✔ AA |
| Primary button | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg` #14532D | text | 9.11:1 | 4.5:1 | ✔ AA |
| Primary button hover | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg-hover` #3D6B4F | text | 6.15:1 | 4.5:1 | ✔ AA |
| Primary button pressed | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg-active` #1F2D25 | text | 14.38:1 | 4.5:1 | ✔ AA |
| Donate button | `--color-action-donate-text` #14532D | `--color-action-donate-bg` #9FD8AD | text | 5.59:1 | 4.5:1 | ✔ AA |
| Donate button hover | `--color-action-donate-text` #14532D | `--color-action-donate-bg-hover` #B8E3C2 | text | 6.42:1 | 4.5:1 | ✔ AA |
| Donate button pressed | `--color-action-donate-text` #14532D | `--color-action-donate-bg-active` #86C997 | text | 4.69:1 | 4.5:1 | ✔ AA |
| Secondary button label | `--color-action-secondary-text` #14532D | `--color-surface` #FFFFFF | text | 9.11:1 | 4.5:1 | ✔ AA |
| Secondary button hover | `--color-action-secondary-text` #14532D | `--color-action-secondary-bg-hover` #E3F1E7 | text | 7.81:1 | 4.5:1 | ✔ AA |
| Secondary button border | `--color-action-secondary-border` #14532D | `--color-bg` #F6FAF7 | ui | 8.64:1 | 3:1 | ✔ AA |
| Input placeholder | `--color-text-placeholder` #5C6E63 | `--color-surface` #FFFFFF | text | 5.43:1 | 4.5:1 | ✔ AA |
| Success message | `--color-status-success` #287A55 | `--color-surface` #FFFFFF | text | 5.24:1 | 4.5:1 | ✔ AA |
| Success message on page | `--color-status-success` #287A55 | `--color-bg` #F6FAF7 | text | 4.97:1 | 4.5:1 | ✔ AA |
| Error message | `--color-status-error` #B42318 | `--color-surface` #FFFFFF | text | 6.57:1 | 4.5:1 | ✔ AA |
| Error message on page | `--color-status-error` #B42318 | `--color-bg` #F6FAF7 | text | 6.24:1 | 4.5:1 | ✔ AA |
| Info message | `--color-status-info` #3568A8 | `--color-surface` #FFFFFF | text | 5.68:1 | 4.5:1 | ✔ AA |
| Info message on page | `--color-status-info` #3568A8 | `--color-bg` #F6FAF7 | text | 5.39:1 | 4.5:1 | ✔ AA |
| Warning message | `--color-status-warning-text` #8F5E14 | `--color-surface` #FFFFFF | text | 5.55:1 | 4.5:1 | ✔ AA |
| Warning message on page | `--color-status-warning-text` #8F5E14 | `--color-bg` #F6FAF7 | text | 5.27:1 | 4.5:1 | ✔ AA |
| Warning icon/border | `--color-status-warning` #B7791F | `--color-surface` #FFFFFF | ui | 3.64:1 | 3:1 | ✔ AA |
| Form field border | `--color-border-input` #3D6B4F | `--color-surface` #FFFFFF | ui | 6.15:1 | 3:1 | ✔ AA |
| Focus ring on page | `--color-focus` #3568A8 | `--color-bg` #F6FAF7 | ui | 5.39:1 | 3:1 | ✔ AA |
| Focus ring on cards | `--color-focus` #3568A8 | `--color-surface` #FFFFFF | ui | 5.68:1 | 3:1 | ✔ AA |
| Focus ring on muted band | `--color-focus` #3568A8 | `--color-surface-muted` #E3F1E7 | ui | 4.86:1 | 3:1 | ✔ AA |
| Focus ring on dark green | `--color-focus-on-inverse` #9FD8AD | `--color-surface-inverse` #14532D | ui | 5.59:1 | 3:1 | ✔ AA |
| Form field border on dark green | `--color-border-input-on-inverse` #E3F1E7 | `--color-surface-inverse` #14532D | ui | 7.81:1 | 3:1 | ✔ AA |
| Outline button hover on dark green | `--color-text-inverse` #FFFFFF | `--color-action-secondary-bg-hover-on-inverse` #3D6B4F | text | 6.15:1 | 4.5:1 | ✔ AA |
| Warning text on muted band (passes with the green palette) | `--color-status-warning-text` #8F5E14 | `--color-surface-muted` #E3F1E7 | text | 4.76:1 | 4.5:1 | ✔ AA |
<!-- contrast-table:end -->
<!-- prettier-ignore-end -->

## Typography

| Token          | Mobile (360px) | Desktop (1440px) | Font              |
| -------------- | -------------- | ---------------- | ----------------- |
| `--text-hero`  | 38px           | 64px             | Libre Baskerville |
| `--text-h1`    | 34px           | 48px             | Libre Baskerville |
| `--text-h2`    | 28px           | 38px             | Libre Baskerville |
| `--text-h3`    | 22px           | 26px             | Libre Baskerville |
| `--text-body`  | 16px           | 17px             | Inter             |
| `--text-small` | 13px           | 14px             | Inter             |

- Sizes are fluid `clamp()` values in `rem` + `vw`: exact at 360 and 1440 px, smooth in between,
  and they still scale with browser zoom and the user's font-size setting.
- Tamil **headings** use **Noto Serif Tamil** (classic printed-Tamil look, `--font-heading-ta`); Tamil
  body text and buttons use Noto Sans Tamil. Legacy non-Unicode fonts such as Bamini are not used:
  they break search, screen readers, mobile typing and copy-paste (#46).
- Tamil uses extra leading (`--leading-body-ta` 1.8, `--leading-heading-ta` 1.5);
  `:lang(ta)` switches to the Tamil body font, the Tamil heading font and Tamil leading automatically.
- Tamil headings load only the Tamil subset of Noto Serif Tamil. Latin letters, digits and ₹ inside a
  Tamil heading fall back to Noto Sans Tamil; add the Latin subset if headings start showing amounts.
- Weights: 400 / 500 / 600 / 700 only — no thin weights.
- Fonts are self-hosted (`@fontsource`), split by `unicode-range`, so Tamil glyphs download only on
  pages that show Tamil text and no request goes to a third party.

## Spacing, shape, controls, motion, layers

| Group              | Tokens                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Spacing (4px base) | `--space-1` 4px … `--space-24` 96px; `--space-section` 48→96px; `--gutter` 16→32px; `--content-max` 1200px      |
| Radius             | `--radius-sm` 4px, `--radius-md` 8px, `--radius-lg` 12px, `--radius-xl` 16px, `--radius-pill`                   |
| Shadow             | `--shadow-sm`, `--shadow-md`, `--shadow-lg` (green-tinted, subtle)                                              |
| Controls           | `--control-height` 48px, `--control-height-sm` 44px (touch minimum), `--focus-ring-width` 3px                   |
| Motion             | `--duration-fast` 150ms, `--duration-base` 200ms, `--duration-slow` 250ms; all 0 under `prefers-reduced-motion` |
| Layers             | `--z-header` 50, `--z-overlay` 90, `--z-modal` 100, `--z-toast` 110, `--z-skip-link` 120                        |
| Breakpoints        | 48em (768px), 64em (1024px), 90em (1440px) — literal values in media queries                                    |

## Verification

- Unit: `src/styles/tokens.test.ts` (contrast, references, scale, motion, touch size, docs sync),
  `src/styles/no-hardcoded-values.test.ts`, `src/styles/design-tokens.test.ts`.
- Browser: `e2e/design-tokens.spec.ts` checks the computed type scale, self-hosted fonts and the
  Tamil specimen (no clipping or overflow in headings, buttons, nav and cards) at all five widths,
  and attaches screenshots to the Playwright report.
