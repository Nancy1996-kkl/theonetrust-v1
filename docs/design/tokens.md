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
4. **Orange is the action colour**: the Donate button (burnt-orange gradient `#BC5400 → #9C4600`
   with a white label, 4.77–6.38:1), thin 1px rules (`--color-rule-accent`) and the hover glow.
   Small orange labels use `--color-text-accent` (`#B04F00`, ≥ 4.68:1 on every light surface).
   Numbers and accents on teal bands use peach (`--color-text-accent-on-inverse`, 6.95:1).
5. **Warning orange** (`--color-status-warning`) is for icons and borders only (3.6:1). Warning
   text uses `--color-status-warning-text` (derived darker tone, 5.5:1).
6. **Focus ring**: turquoise-ink on light surfaces; peach inside `.surface-inverse` and the dark home bands (turquoise-ink is only 1.4:1 on teal).

7. **Teal bands** use `.surface-inverse`, which re-maps the role tokens (text, headings, links,
   focus ring) — never set only `color` on a dark container.
8. **Bright logo colours are never text.** Orange, turquoise and green fail AA as text on every
   light surface; text uses the derived ink tones (`--palette-*-ink`). `tokens.test.ts` enforces it.
9. **Section rhythm**: teal hero → cloud sections → mint and peach bands → teal impact band, with
   leaf tiles. The Donate button (burnt-orange gradient, white label) appears in the sticky header
   and every teal band, where it gets a 2px peach edge.
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

| Palette token                  | Value   | Role                                                                 |
| ------------------------------ | ------- | -------------------------------------------------------------------- |
| `--palette-teal`               | #025D62 | Deep Teal — primary brand, links, primary buttons, teal bands        |
| `--palette-turquoise`          | #00AEB4 | Bright Turquoise — fills and icons only (2.7:1 on white, never text) |
| `--palette-orange`             | #F07800 | Warm Orange — Donate glow, 1px rules, fills only (never text)        |
| `--palette-green`              | #4A9200 | Natural Green — icons and fills only (never text)                    |
| `--palette-cloud`              | #F7FAF8 | Cloud White — page background                                        |
| `--palette-mint`               | #EAF3EF | Soft Mint — muted bands, tablist, lead text on teal                  |
| `--palette-charcoal`           | #263B3B | Charcoal — body text; primary pressed                                |
| `--palette-peach`              | #FFF2E5 | Peach — warm bands; accent text, focus ring and Donate edge on teal  |
| `--palette-leaf`               | #F0F6E8 | Leaf Tint — story and growth tiles                                   |
| `--palette-white`              | #FFFFFF | Card surfaces, text on teal                                          |
| `--palette-border`             | #DFE9E5 | Decorative dividers and disabled surfaces only                       |
| `--palette-teal-deep`          | #014246 | Headings, hero scrim, primary hover (derived; 11.2:1 on white)       |
| `--palette-turquoise-ink`      | #00777B | Focus ring and info labels on light (derived; ≥ 4.3:1)               |
| `--palette-orange-ink`         | #B04F00 | Donate fill and orange labels (derived; white 5.3:1)                 |
| `--palette-orange-ink-light`   | #BC5400 | Donate gradient start (derived; white 4.77:1)                        |
| `--palette-orange-ink-hover`   | #9C4600 | Donate hover and gradient end (derived; white 6.38:1)                |
| `--palette-orange-ink-pressed` | #863C00 | Donate pressed (derived; white 7.89:1)                               |
| `--palette-green-ink`          | #3A7300 | Growth labels (derived; 5.8:1 on white)                              |
| `--palette-muted`              | #4F6262 | Secondary, placeholder and disabled text (derived; 6.4:1 on white)   |
| `--palette-field-border`       | #6A8282 | Input borders (derived; ≥ 3.3:1 on every light surface)              |
| `--palette-success`            | #287A55 | Success                                                              |
| `--palette-warning`            | #B7791F | Warning icons/borders                                                |
| `--palette-warning-dark`       | #8F5E14 | Warning text (derived for AA)                                        |
| `--palette-error`              | #B42318 | Error                                                                |
| `--palette-info`               | #3568A8 | Information                                                          |

### Contrast (generated — do not edit by hand)

<!-- prettier-ignore-start -->
<!-- contrast-table:start -->
| Where | Foreground | Background | Use | Ratio | AA minimum | Result |
|---|---|---|---|---|---|---|
| Body text on page | `--color-text` #263B3B | `--color-bg` #F7FAF8 | text | 11.28:1 | 4.5:1 | ✔ AA |
| Body text on cards | `--color-text` #263B3B | `--color-surface` #FFFFFF | text | 11.85:1 | 4.5:1 | ✔ AA |
| Body text on muted band | `--color-text` #263B3B | `--color-surface-muted` #EAF3EF | text | 10.48:1 | 4.5:1 | ✔ AA |
| Secondary text on page | `--color-text-muted` #4F6262 | `--color-bg` #F7FAF8 | text | 6.13:1 | 4.5:1 | ✔ AA |
| Secondary text on cards | `--color-text-muted` #4F6262 | `--color-surface` #FFFFFF | text | 6.44:1 | 4.5:1 | ✔ AA |
| Secondary text on muted band | `--color-text-muted` #4F6262 | `--color-surface-muted` #EAF3EF | text | 5.70:1 | 4.5:1 | ✔ AA |
| Headings on page | `--color-text-heading` #014246 | `--color-bg` #F7FAF8 | text | 10.69:1 | 4.5:1 | ✔ AA |
| Headings on cards | `--color-text-heading` #014246 | `--color-surface` #FFFFFF | text | 11.23:1 | 4.5:1 | ✔ AA |
| Headings on muted band | `--color-text-heading` #014246 | `--color-surface-muted` #EAF3EF | text | 9.93:1 | 4.5:1 | ✔ AA |
| Links on page | `--color-link` #025D62 | `--color-bg` #F7FAF8 | text | 7.28:1 | 4.5:1 | ✔ AA |
| Links on cards | `--color-link` #025D62 | `--color-surface` #FFFFFF | text | 7.65:1 | 4.5:1 | ✔ AA |
| Links on muted band | `--color-link` #025D62 | `--color-surface-muted` #EAF3EF | text | 6.76:1 | 4.5:1 | ✔ AA |
| Text, headings, links on teal band | `--color-text-inverse` #FFFFFF | `--color-surface-inverse` #025D62 | text | 7.65:1 | 4.5:1 | ✔ AA |
| Peach label on teal band | `--color-text-accent-on-inverse` #FFF2E5 | `--color-surface-inverse` #025D62 | text | 6.95:1 | 4.5:1 | ✔ AA |
| Lead text on teal band | `--color-text-inverse-muted` #EAF3EF | `--color-surface-inverse` #025D62 | text | 6.76:1 | 4.5:1 | ✔ AA |
| Gold label on page | `--color-text-accent` #B04F00 | `--color-bg` #F7FAF8 | text | 5.04:1 | 4.5:1 | ✔ AA |
| Gold label on cards | `--color-text-accent` #B04F00 | `--color-surface` #FFFFFF | text | 5.29:1 | 4.5:1 | ✔ AA |
| Body text on mint card | `--color-text` #263B3B | `--color-surface-accent` #F0F6E8 | text | 10.75:1 | 4.5:1 | ✔ AA |
| Headings on mint card | `--color-text-heading` #014246 | `--color-surface-accent` #F0F6E8 | text | 10.19:1 | 4.5:1 | ✔ AA |
| Links on mint card | `--color-link` #025D62 | `--color-surface-accent` #F0F6E8 | text | 6.94:1 | 4.5:1 | ✔ AA |
| Focus ring on mint card | `--color-focus` #00777B | `--color-surface-accent` #F0F6E8 | ui | 4.85:1 | 3:1 | ✔ AA |
| Warning message on muted band | `--color-status-warning-text` #8F5E14 | `--color-surface-muted` #EAF3EF | text | 4.91:1 | 4.5:1 | ✔ AA |
| Primary button | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg` #025D62 | text | 7.65:1 | 4.5:1 | ✔ AA |
| Primary button hover | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg-hover` #014246 | text | 11.23:1 | 4.5:1 | ✔ AA |
| Primary button pressed | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg-active` #263B3B | text | 11.85:1 | 4.5:1 | ✔ AA |
| Donate button | `--color-action-donate-text` #FFFFFF | `--color-action-donate-bg` #B04F00 | text | 5.29:1 | 4.5:1 | ✔ AA |
| Donate button hover | `--color-action-donate-text` #FFFFFF | `--color-action-donate-bg-hover` #9C4600 | text | 6.38:1 | 4.5:1 | ✔ AA |
| Donate button pressed | `--color-action-donate-text` #FFFFFF | `--color-action-donate-bg-active` #863C00 | text | 7.89:1 | 4.5:1 | ✔ AA |
| Secondary button label | `--color-action-secondary-text` #025D62 | `--color-surface` #FFFFFF | text | 7.65:1 | 4.5:1 | ✔ AA |
| Secondary button hover | `--color-action-secondary-text` #025D62 | `--color-action-secondary-bg-hover` #EAF3EF | text | 6.76:1 | 4.5:1 | ✔ AA |
| Secondary button border | `--color-action-secondary-border` #025D62 | `--color-bg` #F7FAF8 | ui | 7.28:1 | 3:1 | ✔ AA |
| Input placeholder | `--color-text-placeholder` #4F6262 | `--color-surface` #FFFFFF | text | 6.44:1 | 4.5:1 | ✔ AA |
| Success message | `--color-status-success` #287A55 | `--color-surface` #FFFFFF | text | 5.24:1 | 4.5:1 | ✔ AA |
| Success message on page | `--color-status-success` #287A55 | `--color-bg` #F7FAF8 | text | 4.98:1 | 4.5:1 | ✔ AA |
| Error message | `--color-status-error` #B42318 | `--color-surface` #FFFFFF | text | 6.57:1 | 4.5:1 | ✔ AA |
| Error message on page | `--color-status-error` #B42318 | `--color-bg` #F7FAF8 | text | 6.25:1 | 4.5:1 | ✔ AA |
| Info message | `--color-status-info` #3568A8 | `--color-surface` #FFFFFF | text | 5.68:1 | 4.5:1 | ✔ AA |
| Info message on page | `--color-status-info` #3568A8 | `--color-bg` #F7FAF8 | text | 5.40:1 | 4.5:1 | ✔ AA |
| Warning message | `--color-status-warning-text` #8F5E14 | `--color-surface` #FFFFFF | text | 5.55:1 | 4.5:1 | ✔ AA |
| Warning message on page | `--color-status-warning-text` #8F5E14 | `--color-bg` #F7FAF8 | text | 5.28:1 | 4.5:1 | ✔ AA |
| Warning icon/border | `--color-status-warning` #B7791F | `--color-surface` #FFFFFF | ui | 3.64:1 | 3:1 | ✔ AA |
| Form field border | `--color-border-input` #6A8282 | `--color-surface` #FFFFFF | ui | 4.09:1 | 3:1 | ✔ AA |
| Focus ring on page | `--color-focus` #00777B | `--color-bg` #F7FAF8 | ui | 5.09:1 | 3:1 | ✔ AA |
| Focus ring on cards | `--color-focus` #00777B | `--color-surface` #FFFFFF | ui | 5.35:1 | 3:1 | ✔ AA |
| Focus ring on muted band | `--color-focus` #00777B | `--color-surface-muted` #EAF3EF | ui | 4.73:1 | 3:1 | ✔ AA |
| Focus ring on teal band | `--color-focus-on-inverse` #FFF2E5 | `--color-surface-inverse` #025D62 | ui | 6.95:1 | 3:1 | ✔ AA |
| Form field border on teal band | `--color-border-input-on-inverse` #DFE9E5 | `--color-surface-inverse` #025D62 | ui | 6.16:1 | 3:1 | ✔ AA |
| Outline button hover on teal band | `--color-text-inverse` #FFFFFF | `--color-action-secondary-bg-hover-on-inverse` #014246 | text | 11.23:1 | 4.5:1 | ✔ AA |
| Orange label on mint band | `--color-text-accent` #B04F00 | `--color-surface-muted` #EAF3EF | text | 4.68:1 | 4.5:1 | ✔ AA |
| Secondary text on leaf card | `--color-text-muted` #4F6262 | `--color-surface-accent` #F0F6E8 | text | 5.85:1 | 4.5:1 | ✔ AA |
| Success text on mint band | `--color-status-success` #287A55 | `--color-surface-muted` #EAF3EF | text | 4.63:1 | 4.5:1 | ✔ AA |
| Focus ring on mint band | `--color-focus` #00777B | `--color-surface-muted` #EAF3EF | ui | 4.73:1 | 3:1 | ✔ AA |
| Focus ring on peach band | `--color-focus` #00777B | `--color-home-warm` #FFF2E5 | ui | 4.86:1 | 3:1 | ✔ AA |
| Field border on page | `--color-border-input` #6A8282 | `--color-bg` #F7FAF8 | ui | 3.89:1 | 3:1 | ✔ AA |
| Field border on mint band | `--color-border-input` #6A8282 | `--color-surface-muted` #EAF3EF | ui | 3.62:1 | 3:1 | ✔ AA |
| Heading on peach band | `--color-home-heading` #014246 | `--color-home-warm` #FFF2E5 | text | 10.21:1 | 4.5:1 | ✔ AA |
| Donate label on gradient start | `--color-action-donate-text` #FFFFFF | `--palette-orange-ink-light` #BC5400 | text | 4.76:1 | 4.5:1 | ✔ AA |
| Donate label on gradient end | `--color-action-donate-text` #FFFFFF | `--palette-orange-ink-hover` #9C4600 | text | 6.38:1 | 4.5:1 | ✔ AA |
| Peach Donate edge on teal band | `--color-action-donate-border-on-inverse` #FFF2E5 | `--color-surface-inverse` #025D62 | ui | 6.95:1 | 3:1 | ✔ AA |
| Disabled label | `--color-text-disabled` #4F6262 | `--color-surface-disabled` #DFE9E5 | text | 5.19:1 | 4.5:1 | ✔ AA |
<!-- contrast-table:end -->
<!-- prettier-ignore-end -->

## Typography

| Token               | Mobile (360px) | Desktop (1440px) | Font              |
| ------------------- | -------------- | ---------------- | ----------------- |
| `--text-hero`       | 34px           | 52px             | Plus Jakarta Sans |
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
