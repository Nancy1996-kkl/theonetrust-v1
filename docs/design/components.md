# UI components

Shared primitives for the public site and the owner dashboard (issue #10).
Code: [`apps/web/src/components/ui/`](../../apps/web/src/components/ui/) · styles:
[`apps/web/src/styles/components.css`](../../apps/web/src/styles/components.css) · tokens:
[`tokens.md`](tokens.md).

```tsx
import { Button, TextField, Dialog } from '../components/ui';
```

## Rules for every component

1. **Text comes from the caller.** Components never contain page copy. The only built-in words
   (Close, Loading…, required/optional, step counter, error prefixes) live in `ui-strings.ts` in
   Tamil and English; `ui-strings.test.ts` enforces parity.
2. **Language**: wrap the app in `<UiLangContext.Provider value="ta">` (the app shell, #11, does
   this from the route). Tamil fonts and leading come from `lang="ta"` via tokens.
3. **Never colour alone**: every state also changes an icon, words, border weight, underline or
   a tick. Errors carry a spoken "Error:" prefix.
4. **Tokens only**: role tokens from `tokens.css`; no raw colours or sizes (tests enforce it).
5. **Native first**: real `<button>`, `<input>`, `<select>`, radios and checkboxes for keyboard,
   screen-reader and mobile support. Touch targets are at least 44 px.
6. **Motion**: 150–250 ms transitions; all motion is cut with `prefers-reduced-motion`.

## States

| State         | How it is shown                                                                   |
| ------------- | --------------------------------------------------------------------------------- |
| Default       | Base styles                                                                       |
| Hover         | State token background/border (`--color-*-hover`)                                 |
| Focus-visible | 3 px focus ring (`--color-focus`; gold inside navy bands)                         |
| Active        | Pressed token + 1 px press-down                                                   |
| Disabled      | Disabled tokens, `not-allowed` cursor, native `disabled`; buttons also strike out |
| Loading       | Spinner + "Loading…" announced, `aria-busy`; button stays focusable but inert     |
| Success       | Tick icon + words; `role="status"`                                                |
| Error         | Cross icon + "Error:" + message, `aria-invalid`, thicker border; `role="alert"`   |
| Empty         | `StateBlock state="empty"` with a next step                                       |
| No results    | `StateBlock state="no-results"` with "clear filters" style action                 |

## Components

| Component                    | Use for                                        | Notes                                                                                                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`                     | Every action                                   | Variants `primary`, `donate` (the one gold CTA — once per view), `secondary`, `ghost`. `loading` blocks repeat submits (use it on Pay). `type="button"` default.                                                                                                                     |
| `TextLink`                   | Inline links                                   | Internal paths use the router; `newTab` adds `rel="noopener noreferrer"` and needs `newTabLabel` in the current language.                                                                                                                                                            |
| `TextField`                  | Text, email, tel inputs                        | `label`, `hint`, `error`, `required` / `showOptional` (shown in words). Pass `autoComplete` and `inputMode`.                                                                                                                                                                         |
| `SelectField`                | Short choice lists                             | Native select; optional `placeholder` adds an empty first option.                                                                                                                                                                                                                    |
| `Checkbox`                   | Consent, "cover the fee", updates opt-in       | Label is part of the tap target.                                                                                                                                                                                                                                                     |
| `RadioCardGroup`             | Choosing a need, frequency, payment route      | Fieldset + legend; arrow keys move; selected = heavier border + filled dot.                                                                                                                                                                                                          |
| `AmountPicker`               | Donation amount                                | Emits **integer paise** or `null`. Presets come from settings (`presetsRupees`), never hard-coded. Other amount: whole rupees ≥ `minRupees` (₹1), optional `maxRupees` + `maxMessage` (e.g. UPI AutoPay limit). Accepts `1,00,000`. Errors show after blur. The server re-validates. |
| `Card`                       | Light container                                | Restores light tokens inside navy bands. `elevation="flat"` for borders only.                                                                                                                                                                                                        |
| `BentoGrid` / `BentoTile`    | "Ways we help" grid                            | 1 → 2 → 3 columns; `span={2}` for a wide tile on laptops; `tone="inverse"` for a navy tile. Pick `headingLevel` to keep the outline correct.                                                                                                                                         |
| `StatusPill`                 | Payment/request status, badges                 | Always icon + words. `plain` only for counts.                                                                                                                                                                                                                                        |
| `Dialog`                     | Donate panel, Get Help panel, confirmations    | `variant="panel"` (side panel, full screen on phones) or `modal`. Traps and restores focus, Esc/backdrop close, page made `inert`, scroll locked. Set `dismissible={false}` while a payment is in progress.                                                                          |
| `ToastProvider` / `useToast` | Short confirmations                            | Polite region for info/success/warning, assertive for errors. Errors never auto-dismiss; others pause on hover/focus. Never use a toast as the only proof of a payment.                                                                                                              |
| `LiveRegion`                 | Inline announcements ("3 results")             | Keep mounted; change `message`.                                                                                                                                                                                                                                                      |
| `Stepper`                    | Donation progress                              | "Step 2 of 4" text, `aria-current="step"`, completed steps say "completed".                                                                                                                                                                                                          |
| `DataTable`                  | Owner dashboard lists                          | Caption is the name; scroll wrapper is focusable for keyboard scrolling; `empty` slot spans all columns; `align="end"` for amounts.                                                                                                                                                  |
| `StateBlock`                 | Empty / no-results / loading / error / success | Loading and success are `status`; error is `alert`. Always give a recovery `action` for errors.                                                                                                                                                                                      |
| `LanguageSwitch`             | Header language toggle                         | Each name in its own script with `lang`; current language is `aria-pressed`. The shell (#11) maps the change to `/ta/` and keeps the chosen amount.                                                                                                                                  |

## Known limits

- Components are not yet placed on any page; Playwright checks at the five viewports arrive with
  the pages that use them (#11–#15). Unit tests (Vitest + Testing Library + axe) cover behaviour,
  keyboard use and both languages.
- `LanguageSwitch` inside a navy band shows the pressed option as navy on navy — style it with
  `surface` or adjust when the header is built (#11).
- Tamil built-in strings should be read by a native speaker before launch (#37).
