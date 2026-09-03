# AGENTS.md

## UI-Änderungen

**Vor jeder Arbeit an der Oberfläche `STYLEGUIDE.md` lesen.** Dort stehen die
Design-Token, die verbindlichen Regeln (keine Emoji, keine Verläufe, Farben nur
als Token) und der Katalog der wiederverwendbaren Bausteine unter `src/ui/`.
Neue UI wird aus diesen Bausteinen gebaut; ein neuer Baustein entsteht erst, wenn
ein Muster zum zweiten Mal auftaucht.

## Before Merging to Main

Always run the test suite locally before pushing or merging changes to `main`:

```bash
npm run typecheck && npm test
```

Both the TypeScript type check and all tests must pass. If either fails, fix the issues before proceeding.

Bei Änderungen an der Oberfläche zusätzlich die E2E-Suite laufen lassen:

```bash
npx playwright test
```

Die E2E-Tests selektieren über CSS-Klassen und `aria-label`. Wer eine Klasse oder
Beschriftung umbenennt, zieht den Test mit.

## Commands

| Command | Description |
|---------|-------------|
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run all tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npx playwright test` | End-to-End-Tests (Chromium) |

## Test Files

- `src/types.test.ts` — unit tests for type utilities (`fromRow`)
- `src/timeSlots.test.ts` — unit tests for the time-tracking domain logic
- `src/timeCsv.test.ts` — unit tests for the CSV export
- `src/TimeTrackingView.test.tsx` — time-tracking view (`timeDb` is mocked)
- `src/App.test.tsx` — React component tests (db layer is mocked)
- `e2e/todolist.spec.ts` — Playwright end-to-end tests against the dev server
- `e2e/timetracking.spec.ts` — Playwright end-to-end tests for the time tracking view

## Adding Tests

When adding or modifying functionality, include corresponding tests:

1. Pure logic (types, utilities) → `*.test.ts` alongside the source file
2. React components → `*.test.tsx` alongside the component, mock the `db` module
3. CI will run `npm run typecheck && npm test` on every push to `main`
