# ADR 0003 — Tamil fonts: Unicode only (Noto Serif Tamil headings, Noto Sans Tamil body)

- **Date**: 2026-10-31
- **Status**: Accepted (owner approved)
- **Issue**: #46

## Context

The owner asked whether the site could use the **Bamini** Tamil font. Its download page
(tamil.indiatyping.com) describes it as a "non-Unicode (Legacy) Tamil typeface" and states no licence
terms ("All Rights Reserved").

## Decision

- No legacy (non-Unicode) Tamil fonts anywhere on the site.
- **Tamil headings:** Noto Serif Tamil 700, which gives the classic printed-Tamil look the owner
  liked in Bamini.
- **Tamil body text and buttons:** Noto Sans Tamil (variable).
- All fonts are SIL Open Font License, self-hosted via `@fontsource`; no third-party font requests.

## Why not Bamini

A legacy font stores Tamil as Latin characters that only _look_ Tamil while that font is installed:

- search engines index Latin gibberish, so Tamil pages can't be found;
- screen readers read nonsense, which fails WCAG 2.2 AA;
- phones and keyboards type Unicode Tamil, so donors couldn't fill in forms in Tamil;
- copy-paste into WhatsApp, email or search breaks;
- the licence for web embedding is unknown.

## Consequences

- `tokens.test.ts` pins `--font-heading-ta` and rejects legacy font names.
- e2e tests require the serif face to load from our origin and assert headings vs body fonts.
- The owner compared five Unicode options (rendered samples) before choosing.

## Update — November 2026

After the client review the Tamil headings moved from Noto Serif Tamil to **Noto Sans Tamil**
(semi-bold, one size step calmer than English): the serif looked heavy and dated on screen. Still
Unicode only; nothing in this decision about legacy fonts changes.
