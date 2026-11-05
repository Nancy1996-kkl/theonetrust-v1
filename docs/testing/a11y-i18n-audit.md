# Accessibility and Tamil/English audit (#37)

Target: WCAG 2.2 AA and Tamil/English parity, checked by tests rather than assumed.

## Automated (runs on every e2e and visual test)

| Check                                                          | How                                                             | Result (2026-11-04)                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| axe-core, WCAG 2.0/2.1/2.2 A + AA, incl. colour contrast       | auto bug detector after every Playwright test                   | 0 violations of any impact on all screens in the visual matrix (5 viewports × en/ta) |
| One `<h1>`, `<main>`, `lang`, title, unique ids, named links   | auto bug detector                                               | pass                                                                                 |
| No horizontal overflow at 360–1440 px                          | auto bug detector                                               | pass                                                                                 |
| Long Tamil words: no clipping, cramped line height or overflow | `design-tokens.spec.ts` + Tamil specimen baseline               | pass                                                                                 |
| Focus ring visible on light and navy surfaces                  | `design-tokens.spec.ts`                                         | pass                                                                                 |
| Every UI string in both languages                              | string-parity unit tests (admin, ledger, CMS, donate, help, UI) | pass                                                                                 |
| Visual baselines, loading / error / empty states               | `pnpm test:visual`                                              | committed (see `apps/web/e2e/__screenshots__/`)                                      |

### Problems the audit found and fixed in #37

1. **Owner dashboard loading and error states had no `<h1>`** (bank transfers, emails,
   exceptions, receipts, monthly giving, tax, settings, donation detail, help request). Screen
   reader users landed on a page with no title. The page heading is now shown in every state.
2. **Tables with hidden accessible text widened the page on phones** (360 px): visually hidden
   text inside table cells was positioned against the page, not the scrolling table, so the whole
   page scrolled sideways. `.ui-table__scroll` is now the containing block.

## Manual checks — to be done by a person (not automated)

These cannot be run from the build environment. Record the date, device, browser and result.

| Check                                                                                 | NVDA + Chrome (Windows) | TalkBack + Chrome (Android) |
| ------------------------------------------------------------------------------------- | ----------------------- | --------------------------- |
| Home: headings list (H key) makes sense; landmarks announced                          | not yet run             | not yet run                 |
| Language switch: Tamil text read with a Tamil voice (`lang="ta"`)                     | not yet run             | not yet run                 |
| Donate panel: focus moves into the dialog, Escape closes, focus returns to the button | not yet run             | not yet run                 |
| Donate form: labels, hints and errors read; error summary announced                   | not yet run             | not yet run                 |
| Get Help form: same as above; success message announced                               | not yet run             | not yet run                 |
| Acknowledgement page: amount, reference and "verified" status read in order           | not yet run             | not yet run                 |
| Owner sign-in: code field, error and lockout messages announced                       | not yet run             | not yet run                 |
| Owner tables: caption, column headers and row headers read                            | not yet run             | not yet run                 |
| Loading (polite) and error (assertive) messages announced                             | not yet run             | not yet run                 |

A failed manual check is a bug: open an issue labelled `accessibility`.
