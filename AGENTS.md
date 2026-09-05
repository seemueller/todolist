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

- `src/types.test.ts` — unit tests for type utilities (`fromRow`, `compareCategoryNames`)
- `src/timeSlots.test.ts` — unit tests for the time-tracking domain logic
- `src/timeCsv.test.ts` — unit tests for the CSV export
- `src/TimeTrackingView.test.tsx` — time-tracking view (`timeDb` is mocked)
- `src/App.test.tsx` — React component tests (db layer is mocked)
- `src/main.test.tsx` — checks that the migration runs before the first render
- `src/db.test.ts` / `src/timeDb.test.ts` — which backend each dispatcher picks
- `src/todoStoreLocal.test.ts` / `src/timeStoreLocal.test.ts` — the localStorage stores
- `src/todoStoreSql.test.ts` / `src/timeStoreSql.test.ts` — the SQLite stores (`sqlClient` is mocked)
- `src/sqlClient.test.ts` — Tauri detection and the single shared connection
- `src/migrations.test.ts` — guards the migration list in `src-tauri/src/lib.rs`
- `src/migrateLocalStorage.test.ts` — the one-shot localStorage → SQLite migration
- `e2e/todolist.spec.ts` — Playwright end-to-end tests against the dev server
- `e2e/timetracking.spec.ts` — Playwright end-to-end tests for the time tracking view

Die Rust-Seite hat eigene Tests in `src-tauri/src/lib.rs` (`cd src-tauri && cargo test`).
Sie decken `replace_time_day_tx` ab, inklusive des Falls, dass ein Fehler mitten im
Schreibvorgang den Tag unverändert lässt.

## Persistenz

Todos, Kategorien und Zeitbuchungen liegen in SQLite (`todolist.db`), wenn die App
in Tauri läuft, und in `localStorage`, wenn sie im Browser läuft — Vite-Dev und die
Playwright-Suite. `db.ts` und `timeDb.ts` sind dünne Dispatcher, die pro Aufruf über
`isTauri()` entscheiden; dahinter liegen zwei austauschbare Implementierungen der
Interfaces aus `src/storeTypes.ts`.

**Die Doc-Kommentare in `storeTypes.ts` sind der verbindliche Vertrag.** Wer eine
Store-Funktion ändert, ändert sie in beiden Implementierungen oder begründet die
Abweichung dort. Speicherunabhängige Regeln gehören nicht in einen Store, sondern
nach `types.ts` (Todo-Regeln) oder `timeSlots.ts` (Zeit-Regeln) — eine handkopierte
Regel ist der Weg, auf dem Browser- und Desktop-Build auseinanderlaufen.

Drei Fallen, in die dieses Projekt schon getreten ist:

- **`localeCompare` allein sortiert nicht überall gleich.** WebKitGTK gewichtet
  Groß- und Kleinschreibung auf primärer Ebene, Chromium und Node erst auf
  tertiärer. Kategorien werden deshalb über `compareCategoryNames` aus `types.ts`
  sortiert, das vorher kleinschreibt. Kein Unit-Test findet das — sie laufen unter
  jsdom auf Nodes ICU.
- **SQLites `COLLATE NOCASE` faltet nur ASCII.** „Ärzte" und „ärzte" gelten ihm als
  verschieden, der `UNIQUE`-Constraint greift dort also nicht. Eindeutigkeit von
  Kategorienamen wird darum in JavaScript geprüft, über `categoryNameKey`.
- **`tauri-plugin-sql` kennt keine Transaktion über mehrere Aufrufe.** Jeder
  `execute`-Aufruf läuft gegen den Verbindungspool und kann eine andere Verbindung
  erwischen, `BEGIN` und `COMMIT` als getrennte Aufrufe bilden also keine
  Transaktion. Wo Atomarität nötig ist, gehört die Operation als Tauri-Command nach
  `src-tauri/src/lib.rs` — siehe `replace_time_day`.

## Adding Tests

When adding or modifying functionality, include corresponding tests:

1. Pure logic (types, utilities) → `*.test.ts` alongside the source file
2. React components → `*.test.tsx` alongside the component, mock the `db` module
3. Persistence changes → test both stores; a rule that must hold in both belongs in a shared module
4. CI will run `npm run typecheck && npm test` on every push to `main`
