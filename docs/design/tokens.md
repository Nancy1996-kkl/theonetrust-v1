# Design tokens

Source of truth: [`apps/web/src/styles/tokens.css`](../../apps/web/src/styles/tokens.css).
Brand direction: [`docs/ux-design-brief.md`](../ux-design-brief.md) §2–4 (logo green & gold, owner 24 Nov 2026).

## Rules

1. **Components use role tokens** (`--color-text`, `--color-action-primary-bg`, …), never palette
   tokens (`--palette-*`) and never raw values. Raw colours and font sizes anywhere outside
   `tokens.css` fail `no-hardcoded-values.test.ts`.
2. **Every foreground/background combination must be listed** in `CONTRAST_PAIRS`
   (`apps/web/src/styles/design-tokens.ts`). The test enforces WCAG 2.2 AA and regenerates the
   table below: `UPDATE_TOKEN_DOCS=1 pnpm --filter @theonetrust/web test`.
3. **Status is never colour alone**: always pair with an icon and words.
4. **Gold is the action colour**: the Donate button (soft-gold → gold gradient `#F2B636 → #E09D12`
   with a **darkest-green** label `#024414`, 4.89–6.26:1 — white on gold would fail AA), thin 1px
   rules (`--color-rule-accent`) and the hover glow. Donate **brightens** to light gold on hover
   (8.25:1); a darker gold is forbidden (it drops below AA with the dark label). Small gold labels
   use `--color-text-accent` (`#845400`, ≥ 5.6:1 on every light surface). Numbers and accents on
   green bands use light gold (`--color-text-accent-on-inverse`, 5.18:1).
5. **Warning amber** (`--color-status-warning`) is for icons and borders only (3.6:1). Warning
   text uses `--color-status-warning-text` (derived darker tone, 5.5:1).
6. **Focus ring**: focus-ink green on light surfaces; light gold inside `.surface-inverse` and the
   dark home bands (focus-ink is only 1.3:1 on green).

7. **Green bands** use `.surface-inverse`, which re-maps the role tokens (text, headings, links,
   focus ring) — never set only `color` on a dark container.
8. **Bright logo colours are never text.** Gold, fresh green and leaf green fail AA as text on
   light surfaces; text uses the derived ink tones (`--palette-*-ink`). `tokens.test.ts` enforces it.
9. **Section rhythm**: dark-green hero → light-grey sections → soft-green and cream bands → green
   impact band, with leaf-tint tiles. The Donate button (gold, darkest-green label) appears in the
   sticky header and every green band, where it gets a 2px light-gold edge.
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

Measured from the trust's logo file (green & gold heart, owner 24 Nov 2026); ink tones are derived
so every text pair passes WCAG 2.2 AA.

| Palette token            | Value   | Role                                                                  |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `--palette-green`        | #0B6619 | Deep Green — primary brand, links, primary buttons, green bands       |
| `--palette-green-deep`   | #024414 | Darkest Green — headings, Donate label, hero scrim, primary hover     |
| `--palette-green-bright` | #60B710 | Fresh Green — fills and icons only (2.5:1 on white, never text)       |
| `--palette-leaf-green`   | #338615 | Leaf Green — leaf icons and fills only (never text)                   |
| `--palette-gold`         | #E09D12 | Gold — Donate fill and pressed, glow, 1px rules (never text on light) |
| `--palette-gold-soft`    | #F2B636 | Donate gradient start                                                 |
| `--palette-gold-light`   | #FDD947 | Light Gold — Donate hover; accent text, focus ring and edges on green |
| `--palette-cloud`        | #F7F7F7 | Light Grey — page background (the logo's background)                  |
| `--palette-mint`         | #EAF3E7 | Soft Green — muted bands, tablist, lead text on green                 |
| `--palette-cream`        | #FCF4D6 | Warm Cream — warm bands (the glow inside the logo heart)              |
| `--palette-leaf-tint`    | #F2F7EA | Leaf Tint — story and growth tiles                                    |
| `--palette-charcoal`     | #1F2D22 | Charcoal — body text; primary pressed                                 |
| `--palette-white`        | #FFFFFF | Card surfaces, text on green                                          |
| `--palette-border`       | #DCE5DA | Decorative dividers and disabled surfaces only                        |
| `--palette-focus-ink`    | #2E7A14 | Focus ring on light surfaces (derived; ≥ 4.7:1)                       |
| `--palette-gold-ink`     | #845400 | Gold labels as text on light (derived; ≥ 5.6:1)                       |
| `--palette-green-ink`    | #2B6E11 | Growth labels (derived; ≥ 5.5:1 on light)                             |
| `--palette-muted`        | #4B5C4E | Secondary, placeholder and disabled text (derived; ≥ 6.2:1 on light)  |
| `--palette-field-border` | #687B6A | Input borders (derived; ≥ 3.9:1 on every light surface)               |
| `--palette-success`      | #287A55 | Success                                                               |
| `--palette-warning`      | #B7791F | Warning icons/borders                                                 |
| `--palette-warning-dark` | #8F5E14 | Warning text (derived for AA)                                         |
| `--palette-error`        | #B42318 | Error                                                                 |
| `--palette-info`         | #3568A8 | Information                                                           |

### Contrast (generated — do not edit by hand)

<!-- prettier-ignore-start -->
<!-- contrast-table:start -->
| Where | Foreground | Background | Use | Ratio | AA minimum | Result |
|---|---|---|---|---|---|---|
| Body text on page | `--color-text` #1F2D22 | `--color-bg` #F7F7F7 | text | 13.45:1 | 4.5:1 | ✔ AA |
| Body text on cards | `--color-text` #1F2D22 | `--color-surface` #FFFFFF | text | 14.41:1 | 4.5:1 | ✔ AA |
| Body text on muted band | `--color-text` #1F2D22 | `--color-surface-muted` #EAF3E7 | text | 12.68:1 | 4.5:1 | ✔ AA |
| Secondary text on page | `--color-text-muted` #4B5C4E | `--color-bg` #F7F7F7 | text | 6.66:1 | 4.5:1 | ✔ AA |
| Secondary text on cards | `--color-text-muted` #4B5C4E | `--color-surface` #FFFFFF | text | 7.14:1 | 4.5:1 | ✔ AA |
| Secondary text on muted band | `--color-text-muted` #4B5C4E | `--color-surface-muted` #EAF3E7 | text | 6.28:1 | 4.5:1 | ✔ AA |
| Headings on page | `--color-text-heading` #024414 | `--color-bg` #F7F7F7 | text | 10.65:1 | 4.5:1 | ✔ AA |
| Headings on cards | `--color-text-heading` #024414 | `--color-surface` #FFFFFF | text | 11.41:1 | 4.5:1 | ✔ AA |
| Headings on muted band | `--color-text-heading` #024414 | `--color-surface-muted` #EAF3E7 | text | 10.04:1 | 4.5:1 | ✔ AA |
| Links on page | `--color-link` #0B6619 | `--color-bg` #F7F7F7 | text | 6.69:1 | 4.5:1 | ✔ AA |
| Links on cards | `--color-link` #0B6619 | `--color-surface` #FFFFFF | text | 7.17:1 | 4.5:1 | ✔ AA |
| Links on muted band | `--color-link` #0B6619 | `--color-surface-muted` #EAF3E7 | text | 6.30:1 | 4.5:1 | ✔ AA |
| Text, headings, links on green band | `--color-text-inverse` #FFFFFF | `--color-surface-inverse` #0B6619 | text | 7.17:1 | 4.5:1 | ✔ AA |
| Light-gold label on green band | `--color-text-accent-on-inverse` #FDD947 | `--color-surface-inverse` #0B6619 | text | 5.18:1 | 4.5:1 | ✔ AA |
| Lead text on green band | `--color-text-inverse-muted` #EAF3E7 | `--color-surface-inverse` #0B6619 | text | 6.30:1 | 4.5:1 | ✔ AA |
| Gold label on page | `--color-text-accent` #845400 | `--color-bg` #F7F7F7 | text | 6.03:1 | 4.5:1 | ✔ AA |
| Gold label on cards | `--color-text-accent` #845400 | `--color-surface` #FFFFFF | text | 6.46:1 | 4.5:1 | ✔ AA |
| Body text on leaf-tint card | `--color-text` #1F2D22 | `--color-surface-accent` #F2F7EA | text | 13.22:1 | 4.5:1 | ✔ AA |
| Headings on leaf-tint card | `--color-text-heading` #024414 | `--color-surface-accent` #F2F7EA | text | 10.47:1 | 4.5:1 | ✔ AA |
| Links on leaf-tint card | `--color-link` #0B6619 | `--color-surface-accent` #F2F7EA | text | 6.57:1 | 4.5:1 | ✔ AA |
| Focus ring on leaf-tint card | `--color-focus` #2E7A14 | `--color-surface-accent` #F2F7EA | ui | 4.92:1 | 3:1 | ✔ AA |
| Warning message on muted band | `--color-status-warning-text` #8F5E14 | `--color-surface-muted` #EAF3E7 | text | 4.88:1 | 4.5:1 | ✔ AA |
| Primary button | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg` #0B6619 | text | 7.17:1 | 4.5:1 | ✔ AA |
| Primary button hover | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg-hover` #024414 | text | 11.41:1 | 4.5:1 | ✔ AA |
| Primary button pressed | `--color-action-primary-text` #FFFFFF | `--color-action-primary-bg-active` #1F2D22 | text | 14.41:1 | 4.5:1 | ✔ AA |
| Donate button | `--color-action-donate-text` #024414 | `--color-action-donate-bg` #E09D12 | text | 4.89:1 | 4.5:1 | ✔ AA |
| Donate button hover | `--color-action-donate-text` #024414 | `--color-action-donate-bg-hover` #FDD947 | text | 8.25:1 | 4.5:1 | ✔ AA |
| Donate button pressed | `--color-action-donate-text` #024414 | `--color-action-donate-bg-active` #E09D12 | text | 4.89:1 | 4.5:1 | ✔ AA |
| Secondary button label | `--color-action-secondary-text` #0B6619 | `--color-surface` #FFFFFF | text | 7.17:1 | 4.5:1 | ✔ AA |
| Secondary button hover | `--color-action-secondary-text` #0B6619 | `--color-action-secondary-bg-hover` #EAF3E7 | text | 6.30:1 | 4.5:1 | ✔ AA |
| Secondary button border | `--color-action-secondary-border` #0B6619 | `--color-bg` #F7F7F7 | ui | 6.69:1 | 3:1 | ✔ AA |
| Input placeholder | `--color-text-placeholder` #4B5C4E | `--color-surface` #FFFFFF | text | 7.14:1 | 4.5:1 | ✔ AA |
| Success message | `--color-status-success` #287A55 | `--color-surface` #FFFFFF | text | 5.24:1 | 4.5:1 | ✔ AA |
| Success message on page | `--color-status-success` #287A55 | `--color-bg` #F7F7F7 | text | 4.89:1 | 4.5:1 | ✔ AA |
| Error message | `--color-status-error` #B42318 | `--color-surface` #FFFFFF | text | 6.57:1 | 4.5:1 | ✔ AA |
| Error message on page | `--color-status-error` #B42318 | `--color-bg` #F7F7F7 | text | 6.13:1 | 4.5:1 | ✔ AA |
| Info message | `--color-status-info` #3568A8 | `--color-surface` #FFFFFF | text | 5.68:1 | 4.5:1 | ✔ AA |
| Info message on page | `--color-status-info` #3568A8 | `--color-bg` #F7F7F7 | text | 5.30:1 | 4.5:1 | ✔ AA |
| Warning message | `--color-status-warning-text` #8F5E14 | `--color-surface` #FFFFFF | text | 5.55:1 | 4.5:1 | ✔ AA |
| Warning message on page | `--color-status-warning-text` #8F5E14 | `--color-bg` #F7F7F7 | text | 5.18:1 | 4.5:1 | ✔ AA |
| Warning icon/border | `--color-status-warning` #B7791F | `--color-surface` #FFFFFF | ui | 3.64:1 | 3:1 | ✔ AA |
| Form field border | `--color-border-input` #687B6A | `--color-surface` #FFFFFF | ui | 4.53:1 | 3:1 | ✔ AA |
| Focus ring on page | `--color-focus` #2E7A14 | `--color-bg` #F7F7F7 | ui | 5.01:1 | 3:1 | ✔ AA |
| Focus ring on cards | `--color-focus` #2E7A14 | `--color-surface` #FFFFFF | ui | 5.37:1 | 3:1 | ✔ AA |
| Focus ring on muted band | `--color-focus` #2E7A14 | `--color-surface-muted` #EAF3E7 | ui | 4.72:1 | 3:1 | ✔ AA |
| Focus ring on green band | `--color-focus-on-inverse` #FDD947 | `--color-surface-inverse` #0B6619 | ui | 5.18:1 | 3:1 | ✔ AA |
| Form field border on green band | `--color-border-input-on-inverse` #DCE5DA | `--color-surface-inverse` #0B6619 | ui | 5.55:1 | 3:1 | ✔ AA |
| Outline button hover on green band | `--color-text-inverse` #FFFFFF | `--color-action-secondary-bg-hover-on-inverse` #024414 | text | 11.41:1 | 4.5:1 | ✔ AA |
| Gold label on soft-green band | `--color-text-accent` #845400 | `--color-surface-muted` #EAF3E7 | text | 5.68:1 | 4.5:1 | ✔ AA |
| Secondary text on leaf card | `--color-text-muted` #4B5C4E | `--color-surface-accent` #F2F7EA | text | 6.55:1 | 4.5:1 | ✔ AA |
| Success text on soft-green band | `--color-status-success` #287A55 | `--color-surface-muted` #EAF3E7 | text | 4.61:1 | 4.5:1 | ✔ AA |
| Focus ring on soft-green band | `--color-focus` #2E7A14 | `--color-surface-muted` #EAF3E7 | ui | 4.72:1 | 3:1 | ✔ AA |
| Focus ring on cream band | `--color-focus` #2E7A14 | `--color-home-warm` #FCF4D6 | ui | 4.87:1 | 3:1 | ✔ AA |
| Field border on page | `--color-border-input` #687B6A | `--color-bg` #F7F7F7 | ui | 4.23:1 | 3:1 | ✔ AA |
| Field border on soft-green band | `--color-border-input` #687B6A | `--color-surface-muted` #EAF3E7 | ui | 3.98:1 | 3:1 | ✔ AA |
| Heading on cream band | `--color-home-heading` #024414 | `--color-home-warm` #FCF4D6 | text | 10.35:1 | 4.5:1 | ✔ AA |
| Donate label on gradient start | `--color-action-donate-text` #024414 | `--palette-gold-soft` #F2B636 | text | 6.26:1 | 4.5:1 | ✔ AA |
| Donate label on gradient end | `--color-action-donate-text` #024414 | `--palette-gold` #E09D12 | text | 4.89:1 | 4.5:1 | ✔ AA |
| Light-gold Donate edge on green band | `--color-action-donate-border-on-inverse` #FDD947 | `--color-surface-inverse` #0B6619 | ui | 5.18:1 | 3:1 | ✔ AA |
| Disabled label | `--color-text-disabled` #4B5C4E | `--color-surface-disabled` #DCE5DA | text | 5.53:1 | 4.5:1 | ✔ AA |
| Hero headline | `--color-text-inverse` #FFFFFF | `--color-hero-band` #024414 | text | 11.41:1 | 4.5:1 | ✔ AA |
| Hero lead and accent words | `--color-text-inverse-muted` #EAF3E7 | `--color-hero-band` #024414 | text | 10.04:1 | 4.5:1 | ✔ AA |
| Hero eyebrow and help link | `--color-text-accent-on-inverse` #FDD947 | `--color-hero-band` #024414 | text | 8.25:1 | 4.5:1 | ✔ AA |
| Focus on hero | `--color-focus-on-inverse` #FDD947 | `--color-hero-band` #024414 | ui | 8.25:1 | 3:1 | ✔ AA |
| Donate edge on hero | `--color-action-donate-border-on-inverse` #FDD947 | `--color-hero-band` #024414 | ui | 8.25:1 | 3:1 | ✔ AA |
| Selected language on green band | `--color-lang-selected-text-on-inverse` #024414 | `--color-lang-selected-bg-on-inverse` #FFFFFF | text | 11.41:1 | 4.5:1 | ✔ AA |
| Selected-language pill on green band | `--color-lang-selected-bg-on-inverse` #FFFFFF | `--color-surface-inverse` #0B6619 | ui | 7.17:1 | 3:1 | ✔ AA |
| Donate hover edge on page | `--color-action-donate-border-hover` #845400 | `--color-bg` #F7F7F7 | ui | 6.03:1 | 3:1 | ✔ AA |
| Donate hover edge on cream band | `--color-action-donate-border-hover` #845400 | `--color-home-warm` #FCF4D6 | ui | 5.86:1 | 3:1 | ✔ AA |
| Policy card number badge | `--color-text-accent-on-inverse` #FDD947 | `--color-badge-inverse-bg` #024414 | text | 8.25:1 | 4.5:1 | ✔ AA |
<!-- contrast-table:end -->
<!-- prettier-ignore-end -->

## Typography

Headings, titles and the brand name use **Poppins** — the closest free match to the logo's
lettering (owner, 24 Nov 2026). Body text, menus, buttons and forms use **Plus Jakarta Sans**,
which reads better in paragraphs.

| Token               | Mobile (360px) | Desktop (1440px) | Font              |
| ------------------- | -------------- | ---------------- | ----------------- |
| `--text-hero`       | 34px           | 52px             | Poppins           |
| `--text-h1`         | 34px           | 48px             | Poppins           |
| `--text-h2`         | 28px           | 38px             | Poppins           |
| `--text-h3`         | 22px           | 26px             | Poppins           |
| `--text-card-title` | 18px           | 20px             | Poppins           |
| `--text-body`       | 16px           | 17px             | Plus Jakarta Sans |
| `--text-small`      | 13px           | 14px             | Plus Jakarta Sans |

- Sizes are fluid `clamp()` values in `rem` + `vw`: exact at 360 and 1440 px, smooth in between,
  and they still scale with browser zoom and the user's font-size setting.
- Tamil letters in **headings, body text and buttons** come from **Noto Sans Tamil**
  (`--font-heading-ta`, `--font-tamil`); English words and numbers on Tamil pages stay in Poppins
  (headings) or Plus Jakarta Sans (text). Tamil headings are semi-bold and one size step calmer than English (`--text-h2-ta`, `--text-h3-ta`); the serif
  heading face was dropped after the client review (Nov 2026) as too heavy. Legacy non-Unicode fonts such as Bamini are not used:
  they break search, screen readers, mobile typing and copy-paste (#46).
- Tamil uses extra leading (`--leading-body-ta` 1.8, `--leading-heading-ta` 1.5);
  `:lang(ta)` switches to the Tamil body font, the Tamil heading font and Tamil leading automatically.
- Weights: 400 / 500 / 600 / 700 only — no thin weights. Poppins loads 500 / 600 / 700 only.
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
