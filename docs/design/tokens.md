# Design tokens

Source of truth: [`apps/web/src/styles/tokens.css`](../../apps/web/src/styles/tokens.css).
Brand direction: [`docs/ux-design-brief.md`](../ux-design-brief.md) §2–4 (Forest & Gold, owner brief 5 Nov 2026).

## Rules

1. **Components use role tokens** (`--color-text`, `--color-action-primary-bg`, …), never palette
   tokens (`--palette-*`) and never raw values. Raw colours and font sizes anywhere outside
   `tokens.css` fail `no-hardcoded-values.test.ts`.
2. **Every foreground/background combination must be listed** in `CONTRAST_PAIRS`
   (`apps/web/src/styles/design-tokens.ts`). The test enforces WCAG 2.2 AA and regenerates the
   table below: `UPDATE_TOKEN_DOCS=1 pnpm --filter @theonetrust/web test`.
3. **Status is never colour alone**: always pair with an icon and words.
4. **Gold is an accent — never paragraphs**: the Donate button, thin 1px rules
   (`--color-rule-accent`), impact numbers and small icons. Bright gold text is allowed only on
   forest (7.3:1); on light surfaces it is ~2:1 and fails AA. Small gold labels on ivory/white use
   `--color-text-accent` (#8A6D1F, 4.8:1), which fails on champagne (4.0:1) — `FORBIDDEN_PAIRS`
   keeps both rules enforced.
5. **Warning orange** (`--color-status-warning`) is for icons and borders only (3.6:1). Warning
   text uses `--color-status-warning-text` (derived darker tone, 5.5:1).
6. **Focus ring**: trust green on light surfaces; gold inside `.surface-inverse` (green is only 2.8:1 on forest).

7. **Forest bands** use `.surface-inverse`, which re-maps the role tokens (text, headings, links,
   focus ring) — never set only `color` on a dark container.
8. **Success text never sits on the champagne band** (`--color-surface-muted`, 4.3:1). Brand green
   `#3C763A` is also 4.49:1 there, so links use `--palette-green-deep`. Secondary text never sits
   on mint cards (`--color-surface-accent`) — use body text there.
9. **Section rhythm**: forest hero → ivory sections → forest impact band → champagne stories,
   with mint story cards. The Donate button appears in the sticky header and every forest band.
10. **Interaction states** use the state tokens (`--color-action-*-bg-hover/-active`,
    `--color-text-placeholder`, `--color-text-disabled`, `--color-surface-disabled`). Disabled
    controls are exempt from WCAG contrast but stay readable.
11. **Tamil** re-maps `--font-heading`, `--font-body`, `--leading-body`, `--leading-heading` inside
    any `lang="ta"` element (zero specificity via `:where()`), so component classes that use the
    tokens get Tamil fonts and leading automatically. Long Tamil words break anywhere, including
    inside flex/grid items.
12. **Reading width** is opt-in: wrap long-form text in `.prose` (68ch); heroes, CTAs and admin
    tables are not narrowed.

## Colour

| Palette token            | Value   | Role                                                                  |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `--palette-forest`       | #0F2A1D | Deep Forest — primary brand, headings, primary buttons, inverse bands |
| `--palette-green`        | #3C763A | Trust Green — focus ring, icons, primary hover                        |
| `--palette-mint`         | #B7E4C7 | Mint — story cards, lead text on forest                               |
| `--palette-sage`         | #A8D5BA | Sage — form borders and quiet accents on forest                       |
| `--palette-gold`         | #D4AF37 | Gold — Donate background, 1px rules, impact numbers on forest         |
| `--palette-gold-text`    | #8A6D1F | Gold for small labels on ivory/white only (4.8:1)                     |
| `--palette-champagne`    | #F7E7CE | Champagne — stories and muted bands                                   |
| `--palette-ivory`        | #FFFDF8 | Ivory — page background                                               |
| `--palette-body`         | #4A5A50 | Body text, form borders                                               |
| `--palette-sage-tint`    | #E6EEE9 | Home page — soft sage band                                            |
| `--palette-peach`        | #FCF1E5 | Home page — warm section background                                   |
| `--palette-home-ivory`   | #F7F5EF | Home page — page background                                           |
| `--palette-home-sage`    | #76968A | Home page — shapes, frames, icons (never body text)                   |
| `--palette-white`        | #FFFFFF | Card surfaces, text on forest                                         |
| `--palette-success`      | #287A55 | Success                                                               |
| `--palette-warning`      | #B7791F | Warning icons/borders                                                 |
| `--palette-warning-dark` | #8F5E14 | Warning text (derived for AA)                                         |
| `--palette-error`        | #B42318 | Error                                                                 |
| `--palette-info`         | #3568A8 | Information                                                           |
| `--palette-green-deep`   | #2F5E2E | Links (derived; 6.2:1 on champagne)                                   |
| `--palette-moss`         | #556659 | Secondary text (derived; 5.0:1 on champagne)                          |
| `--palette-forest-deep`  | #081A11 | Primary button pressed (derived)                                      |
| `--palette-forest-soft`  | #1D4430 | Outline button hover on forest (derived)                              |
| `--palette-gold-light`   | #E2C25A | Donate hover (derived; 8.8:1 with forest text)                        |
| `--palette-gold-dark`    | #B8962A | Donate pressed (derived; 5.4:1 with forest text)                      |
| `--palette-linen`        | #EDE8DD | Disabled surfaces, decorative dividers (derived)                      |
| `--palette-slate`        | #5C6B61 | Placeholder and disabled text (derived; 5.6:1 on white)               |

### Contrast (generated — do not edit by hand)

<!-- prettier-ignore-start -->
<!-- contrast-table:start -->
| Where | Foreground | Background | Use | Ratio | AA minimum | Result |
|---|---|---|---|---|---|---|
| Body text on page | `--color-text` #4A5A50 | `--color-bg` #FFFDF8 | text | 7.19:1 | 4.5:1 | ✔ AA |
| Body text on cards | `--color-text` #4A5A50 | `--color-surface` #FFFFFF | text | 7.31:1 | 4.5:1 | ✔ AA |
| Body text on muted band | `--color-text` #4A5A50 | `--color-surface-muted` #F7E7CE | text | 6.02:1 | 4.5:1 | ✔ AA |
| Secondary text on page | `--color-text-muted` #556659 | `--color-bg` #FFFDF8 | text | 6.02:1 | 4.5:1 | ✔ AA |
| Secondary text on cards | `--color-text-muted` #556659 | `--color-surface` #FFFFFF | text | 6.12:1 | 4.5:1 | ✔ AA |
| Secondary text on muted band | `--color-text-muted` #556659 | `--color-surface-muted` #F7E7CE | text | 5.03:1 | 4.5:1 | ✔ AA |
| Headings on page | `--color-text-heading` #0F2A1D | `--color-bg` #FFFDF8 | text | 15.08:1 | 4.5:1 | ✔ AA |
| Headings on cards | `--color-text-heading` #0F2A1D | `--color-surface` #FFFFFF | text | 15.33:1 | 4.5:1 | ✔ AA |
| Headings on muted band | `--color-text-heading` #0F2A1D | `--color-surface-muted` #F7E7CE | text | 12.61:1 | 4.5:1 | ✔ AA |
| Links on page | `--color-link` #2F5E2E | `--color-bg` #FFFDF8 | text | 7.48:1 | 4.5:1 | ✔ AA |
| Links on cards | `--color-link` #2F5E2E | `--color-surface` #FFFFFF | text | 7.60:1 | 4.5:1 | ✔ AA |
| Links on muted band | `--color-link` #2F5E2E | `--color-surface-muted` #F7E7CE | text | 6.25:1 | 4.5:1 | ✔ AA |
| Text, headings, links on forest band | `--color-text-inverse` #FFFFFF | `--color-surface-inverse` #0F2A1D | text | 15.33:1 | 4.5:1 | ✔ AA |
| Gold label on forest | `--color-text-accent-on-inverse` #D4AF37 | `--color-surface-inverse` #0F2A1D | text | 7.29:1 | 4.5:1 | ✔ AA |
| Lead text on forest band | `--color-text-inverse-muted` #B7E4C7 | `--color-surface-inverse` #0F2A1D | text | 10.90:1 | 4.5:1 | ✔ AA |
| Gold label on page | `--color-text-accent` #8A6D1F | `--color-bg` #FFFDF8 | text | 4.81:1 | 4.5:1 | ✔ AA |
| Gold label on cards | `--color-text-accent` #8A6D1F | `--color-surface` #FFFFFF | text | 4.89:1 | 4.5:1 | ✔ AA |
| Body text on mint card | `--color-text` #4A5A50 | `--color-surface-accent` #B7E4C7 | text | 5.20:1 | 4.5:1 | ✔ AA |
| Headings on mint card | `--color-text-heading` #0F2A1D | `--color-surface-accent` #B7E4C7 | text | 10.90:1 | 4.5:1 | ✔ AA |
| Links on mint card | `--color-link` #2F5E2E | `--color-surface-accent` #B7E4C7 | text | 5.40:1 | 4.5:1 | ✔ AA |
| Focus ring on mint card | `--color-focus` #3C763A | `--color-surface-accent` #B7E4C7 | ui | 3.88:1 | 3:1 | ✔ AA |
| Warning message on muted band | `--color-status-warning-text` #8F5E14 | `--color-surface-muted` #F7E7CE | text | 4.57:1 | 4.5:1 | ✔ AA |
| Primary button | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg` #0F2A1D | text | 15.33:1 | 4.5:1 | ✔ AA |
| Primary button hover | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg-hover` #3C763A | text | 5.46:1 | 4.5:1 | ✔ AA |
| Primary button pressed | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg-active` #081A11 | text | 18.00:1 | 4.5:1 | ✔ AA |
| Donate button | `--color-action-donate-text` #0F2A1D | `--color-action-donate-bg` #D4AF37 | text | 7.29:1 | 4.5:1 | ✔ AA |
| Donate button hover | `--color-action-donate-text` #0F2A1D | `--color-action-donate-bg-hover` #E2C25A | text | 8.83:1 | 4.5:1 | ✔ AA |
| Donate button pressed | `--color-action-donate-text` #0F2A1D | `--color-action-donate-bg-active` #B8962A | text | 5.42:1 | 4.5:1 | ✔ AA |
| Secondary button label | `--color-action-secondary-text` #0F2A1D | `--color-surface` #FFFFFF | text | 15.33:1 | 4.5:1 | ✔ AA |
| Secondary button hover | `--color-action-secondary-text` #0F2A1D | `--color-action-secondary-bg-hover` #B7E4C7 | text | 10.90:1 | 4.5:1 | ✔ AA |
| Secondary button border | `--color-action-secondary-border` #0F2A1D | `--color-bg` #FFFDF8 | ui | 15.08:1 | 3:1 | ✔ AA |
| Input placeholder | `--color-text-placeholder` #5C6B61 | `--color-surface` #FFFFFF | text | 5.62:1 | 4.5:1 | ✔ AA |
| Success message | `--color-status-success` #287A55 | `--color-surface` #FFFFFF | text | 5.24:1 | 4.5:1 | ✔ AA |
| Success message on page | `--color-status-success` #287A55 | `--color-bg` #FFFDF8 | text | 5.15:1 | 4.5:1 | ✔ AA |
| Error message | `--color-status-error` #B42318 | `--color-surface` #FFFFFF | text | 6.57:1 | 4.5:1 | ✔ AA |
| Error message on page | `--color-status-error` #B42318 | `--color-bg` #FFFDF8 | text | 6.46:1 | 4.5:1 | ✔ AA |
| Info message | `--color-status-info` #3568A8 | `--color-surface` #FFFFFF | text | 5.68:1 | 4.5:1 | ✔ AA |
| Info message on page | `--color-status-info` #3568A8 | `--color-bg` #FFFDF8 | text | 5.58:1 | 4.5:1 | ✔ AA |
| Warning message | `--color-status-warning-text` #8F5E14 | `--color-surface` #FFFFFF | text | 5.55:1 | 4.5:1 | ✔ AA |
| Warning message on page | `--color-status-warning-text` #8F5E14 | `--color-bg` #FFFDF8 | text | 5.46:1 | 4.5:1 | ✔ AA |
| Warning icon/border | `--color-status-warning` #B7791F | `--color-surface` #FFFFFF | ui | 3.64:1 | 3:1 | ✔ AA |
| Form field border | `--color-border-input` #4A5A50 | `--color-surface` #FFFFFF | ui | 7.31:1 | 3:1 | ✔ AA |
| Focus ring on page | `--color-focus` #3C763A | `--color-bg` #FFFDF8 | ui | 5.37:1 | 3:1 | ✔ AA |
| Focus ring on cards | `--color-focus` #3C763A | `--color-surface` #FFFFFF | ui | 5.46:1 | 3:1 | ✔ AA |
| Focus ring on muted band | `--color-focus` #3C763A | `--color-surface-muted` #F7E7CE | ui | 4.49:1 | 3:1 | ✔ AA |
| Focus ring on forest | `--color-focus-on-inverse` #D4AF37 | `--color-surface-inverse` #0F2A1D | ui | 7.29:1 | 3:1 | ✔ AA |
| Form field border on forest | `--color-border-input-on-inverse` #A8D5BA | `--color-surface-inverse` #0F2A1D | ui | 9.41:1 | 3:1 | ✔ AA |
| Outline button hover on forest | `--color-text-inverse` #FFFFFF | `--color-action-secondary-bg-hover-on-inverse` #1D4430 | text | 10.92:1 | 4.5:1 | ✔ AA |
<!-- contrast-table:end -->
<!-- prettier-ignore-end -->

## Typography

| Token               | Mobile (360px) | Desktop (1440px) | Font              |
| ------------------- | -------------- | ---------------- | ----------------- |
| `--text-hero`       | 38px           | 64px             | Plus Jakarta Sans |
| `--text-h1`         | 34px           | 48px             | Plus Jakarta Sans |
| `--text-h2`         | 28px           | 38px             | Plus Jakarta Sans |
| `--text-h3`         | 22px           | 26px             | Plus Jakarta Sans |
| `--text-card-title` | 18px           | 20px             | Plus Jakarta Sans |
| `--text-body`       | 16px           | 17px             | Plus Jakarta Sans |
| `--text-small`      | 13px           | 14px             | Plus Jakarta Sans |

- Sizes are fluid `clamp()` values in `rem` + `vw`: exact at 360 and 1440 px, smooth in between,
  and they still scale with browser zoom and the user's font-size setting.
- Tamil **headings, body text and buttons** use **Noto Sans Tamil** (`--font-heading-ta`). Headings are
  semi-bold and one size step calmer than English (`--text-h2-ta`, `--text-h3-ta`); the serif
  heading face was dropped after the client review (Nov 2026) as too heavy. Legacy non-Unicode fonts such as Bamini are not used:
  they break search, screen readers, mobile typing and copy-paste (#46).
- Tamil uses extra leading (`--leading-body-ta` 1.8, `--leading-heading-ta` 1.5);
  `:lang(ta)` switches to the Tamil body font, the Tamil heading font and Tamil leading automatically.
- Weights: 400 / 500 / 600 / 700 only — no thin weights.
- Fonts are self-hosted (`@fontsource`), split by `unicode-range`, so Tamil glyphs download only on
  pages that show Tamil text and no request goes to a third party.

## Spacing, shape, controls, motion, layers

| Group              | Tokens                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Spacing (4px base) | `--space-1` 4px … `--space-24` 96px; `--space-section` 48→96px; `--gutter` 16→32px; `--content-max` 1200px      |
| Radius             | `--radius-sm` 4px, `--radius-md` 8px, `--radius-lg` 12px, `--radius-xl` 16px, `--radius-pill`                   |
| Shadow             | `--shadow-sm`, `--shadow-md`, `--shadow-lg` (forest-tinted, subtle); `--shadow-glow-gold` for the Donate hover  |
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
