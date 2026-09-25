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
npm run typecheck && npm run lint && npm test
```

Both the TypeScript type check and all tests must pass. If either fails, fix the issues before proceeding.

Bei Änderungen an `src-tauri` zusätzlich die Rust-Seite:

```bash
npm run test:rust && npm run lint:rust
```

Bei Änderungen an der Oberfläche zusätzlich die E2E-Suite laufen lassen:

```bash
npm run test:e2e
```

Die E2E-Tests selektieren über CSS-Klassen und `aria-label`. Wer eine Klasse oder
Beschriftung umbenennt, zieht den Test mit.

## Commands

| Command | Description |
|---------|-------------|
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run all tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | ESLint (Warnungen sind sichtbar, brechen aber nicht) |
| `npm run test:e2e` | End-to-End-Tests (Chromium) |
| `npm run test:rust` | Rust-Tests (`src-tauri`) |
| `npm run lint:rust` | Clippy, Warnungen als Fehler |
| `npm run build` | Produktions-Build des Frontends |

## Test Files

- `src/types.test.ts` — unit tests for type utilities (`fromRow`, `compareCategoryNames`) und `normalizeTag` gegen `src-tauri/src/tag_cases.json`
- `src/timeSlots.test.ts` — unit tests for the time-tracking domain logic
- `src/timeCsv.test.ts` — unit tests for the CSV export
- `src/contrast.test.ts` — readable text colour on a category colour; guards the hex values against the tokens in `App.css`
- `src/TimeTrackingView.test.tsx` — time-tracking view (`timeDb` is mocked)
- `src/TimeStatsModal.test.tsx` — the time-tracking breakdown per category (`timeDb` is mocked)
- `src/App.test.tsx` — React component tests (db layer is mocked)
- `src/TodoDetailModal.test.tsx` — the detail window, isolated from `App`
- `src/TagInput.test.tsx` — die Tag-Eingabe des Detailfensters
- `src/TagFilterEditor.test.tsx` — der Editor für Tag-Filter
- `src/tagFilter.test.ts` — Tag-Filter: Regeln, Verknüpfung, Lesen aus `localStorage`
- `src/markdown.test.ts` — the markdown parser for the description (blocks and inline)
- `src/ui/Markdown.test.tsx` — the renderer: elements, not HTML — raw markup stays text
- `src/ui/TypeBadge.test.tsx` — das Badge des Aufgabentyps: Farbklasse statt Inline-Style
- `src/ui/TypeSelect.test.tsx` — das Auswahlfeld des Aufgabentyps
- `src/ui/TagChip.test.tsx` — das Tag-Etikett
- `src/ui/TagFilterSelect.test.tsx` — die Auswahl des Tag-Filters
- `src/main.test.tsx` — checks that the migration runs before the first render
- `src/db.test.ts` / `src/timeDb.test.ts` — which backend each dispatcher picks
- `src/todoStoreLocal.test.ts` / `src/timeStoreLocal.test.ts` — the localStorage stores
- `src/todoStoreSql.test.ts` / `src/timeStoreSql.test.ts` — the SQLite stores (`sqlClient` is mocked)
- `src/sqlClient.test.ts` — Tauri detection and the single shared connection
- `src/migrations.test.ts` — guards the migration list in `src-tauri/src/lib.rs`
- `src/migrateLocalStorage.test.ts` — the one-shot localStorage → SQLite migration
- `src/listPrefs.test.ts` — the list view's preferences in `localStorage`
- `e2e/todolist.spec.ts` — Playwright end-to-end tests against the dev server
- `e2e/timetracking.spec.ts` — Playwright end-to-end tests for the time tracking view

Die Rust-Seite hat eigene Tests in `src-tauri/src/lib.rs` (`cd src-tauri && cargo test`).
Sie decken `replace_time_day_tx` und `set_todo_tags_tx` ab, jeweils inklusive des
Falls, dass ein Fehler mitten im Schreibvorgang den Stand unverändert lässt.
`src-tauri/src/tags.rs` prüft die Tag-Regel gegen dieselbe Tabelle wie
`types.test.ts`.

## Persistenz

Todos, Kategorien und Zeitbuchungen liegen in SQLite (`todolist.db`), wenn die App
in Tauri läuft, und in `localStorage`, wenn sie im Browser läuft — Vite-Dev und die
Playwright-Suite. `db.ts` und `timeDb.ts` sind dünne Dispatcher, die pro Aufruf über
`isTauri()` entscheiden; dahinter liegen zwei austauschbare Implementierungen der
Interfaces aus `src/storeTypes.ts`.

**Oberflächen-Vorlieben gehören nicht in den Store.** Was nur die Ansicht betrifft
— der Statusfilter der Liste (`todolist.statusFilter`) und ihr Typfilter
(`todolist.typeFilter`) — sowie die gespeicherten Tag-Filter
(`todolist.tagFilters`) und der gewählte (`todolist.activeTagFilter`) — liegt in
`localStorage` und wird über `src/listPrefs.ts` gelesen und geschrieben, nicht
über `app_settings`. Sonst müsste das Store-Interface in beiden Backends wachsen
und das Lesen asynchron werden, womit die Liste beim Start kurz im falschen
Filter stünde. `localStorage` ist in beiden Umgebungen da und synchron.

**Die Doc-Kommentare in `storeTypes.ts` sind der verbindliche Vertrag.** Wer eine
Store-Funktion ändert, ändert sie in beiden Implementierungen oder begründet die
Abweichung dort. Speicherunabhängige Regeln gehören nicht in einen Store, sondern
nach `types.ts` (Todo-Regeln) oder `timeSlots.ts` (Zeit-Regeln) — eine handkopierte
Regel ist der Weg, auf dem Browser- und Desktop-Build auseinanderlaufen.

Vier Fallen, in die dieses Projekt schon getreten ist:

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
- **Ein optionaler Parameter mit Vorgabewert schluckt bestehende Werte.**
  `updateCategory(id, name, color, timeKind = "internal")` schrieb die Spalte
  jedes Mal mit; wer beim Umbenennen die Zeitart wegließ, stufte die Kategorie
  still auf Arbeitszeit zurück. Nichts brach sichtbar, nur eine Zahl wurde leise
  falsch — deshalb ist `timeKind` bei `updateCategory` inzwischen **Pflicht**,
  in `storeTypes.ts`, `db.ts` und beiden Implementierungen. Der Compiler fängt
  jeden neuen Aufrufer; wer nur Name oder Farbe ändert, reicht die vorhandene
  Zeitart mit durch, wie `commitEditCategory` in `App.tsx`. Bei `addCategory`
  bleibt der Parameter optional: dort ist „intern" als Vorgabe unkritisch, und
  der MCP-Pfad verlässt sich darauf. Aus demselben Grund sind `kindOf` in
  `buildCsv`/`blockRow` (`src/timeCsv.ts`) Pflichtparameter und kein
  Vorgabewert: eine still auf „intern" gesetzte Spalte fällt in keinem Test auf.

**Tags** liegen in `todo_tags(todo_id, name)`, ohne eigene Tabelle `tags`. Was
ein Tag ist, entscheidet `normalizeTag` in `types.ts` — und zum zweiten Mal
`tags::normalize_tag` in Rust für MCP und den Command `set_todo_tags`. Beide
prüfen sich gegen `src-tauri/src/tag_cases.json`; wer die Regel ändert, ändert
beide Seiten und die Tabelle. `updateTodoFields` mit `tags` ist im SQL-Store
bewusst zwei Schritte (UPDATE über das Plugin, dann der Command) — die
Begründung steht in `storeTypes.ts`.

## MCP-Server

Solange die Desktop-App läuft, bietet sie ihre Daten zusätzlich über MCP an:
Streamable HTTP unter `http://127.0.0.1:4319/mcp`, nur auf dem Loopback-Interface,
Port fest verdrahtet. Der Code liegt unter `src-tauri/src/mcp/`: `mod.rs` (Server
und `Notifier`), `auth.rs` (Token), `store.rs` (alle Datenbankzugriffe),
`tools.rs` (die Tools), `slots.rs` (Uhrzeit ↔ Viertelstunde).

Sieben Tools, mehr gibt es nicht: `list_todos`, `add_todo`, `update_todo`,
`delete_todo`, `list_categories`, `get_week_time`, `book_time`. Kategorien werden
über ihren **Namen** angesprochen, nicht über die Id, und ein unbekannter Name ist
ein Fehler — über MCP lassen sich bewusst keine Kategorien anlegen, umbenennen
oder löschen.

Eine Aufgabe trägt neben dem Titel eine optionale **Beschreibung**: frei
formulierter Text, mehrzeilig. Die Grenze von 4000 Zeichen und das Verbot von
`\r`, Tabulator und Nullbyte sind eine Regel dieser Tool-Grenze, keine Regel der
Spalte oder der Oberfläche — die App schreibt ungeprüft, eine dort verfasste
Beschreibung darf also länger sein oder diese Zeichen enthalten. `list_todos`
liefert einen solchen Wert unverändert zurück; `add_todo`/`update_todo` nehmen
ihn dann nicht mehr an. Zeilenumbrüche sind als `\n` zu schicken. Bei
`update_todo` leert ausschließlich `clear_description: true` die Beschreibung;
Weglassen, `null` und `""` lassen sie unverändert — dieselbe Regel wie bei
Fälligkeit (`clear_due_date`) und Kategorie (`clear_category`). Ein Feld zugleich
zu setzen und zu leeren ist ein Tool-Fehler. Der Grund ist Issue #35: `null` als
Löschbefehl hat Aufgaben die Kategorie und die Fälligkeit gekostet, weil ein
Modell sein Parameterobjekt vollständig ausfüllt.

Eine Aufgabe trägt außerdem einen **Typ**: `bug`, `task` oder `story`, Vorgabe
`task`. `add_todo` nimmt ihn optional, `update_todo` ändert ihn nur, wenn er
angegeben ist — ein `clear_type` gibt es nicht, weil es keine Aufgabe ohne Typ
gibt. Ein anderer Wert ist ein Tool-Fehler und die Meldung nennt die drei
erlaubten.

Eine Aufgabe trägt außerdem **Tags**. `list_todos` liefert sie, `add_todo`
nimmt sie optional, `update_todo` ersetzt sie mit `tags` vollständig.
Weglassen, `null` und `[]` lassen sie unverändert; geleert werden sie
ausschließlich über `clear_tags: true`, beides zugleich ist ein Tool-Fehler —
dieselbe Regel wie bei der Beschreibung. `check_tags` prüft zuerst die
Rohform, vor jeder Normalisierung: mehr als 100 Einträge oder ein einzelner
Rohtext über 200 Zeichen sind ein Tool-Fehler, bevor überhaupt normalisiert
wird — sonst ließe sich beliebig viel Text durchschicken, solange er am Ende
auf wenige kurze Tags zusammenfällt. Danach ist ein Tag mit Steuerzeichen,
eines, das nach der Normalisierung leer oder länger als 40 Zeichen ist, und
mehr als 20 Tags an einer Aufgabe ebenfalls ein Tool-Fehler; anders als die
Oberfläche verwirft die Tool-Grenze nichts still. Das Schreiben der Tags
geschieht in derselben Transaktion wie der Rest von `update_todo`, die immer
mit dem trash-geschützten UPDATE beginnt; scheitern die Tags, bleiben Titel
und übrige Felder unverändert (`update_todo_keeps_title_and_tags_when_the_tags_fail`).
Kein neues Tool, weiterhin sieben.

**Der Token steht in der Datenbank**, in `app_settings` unter dem Schlüssel
`mcp_token`, und entsteht beim ersten Start (32 Zufallsbytes, base64url). Die
Oberfläche zeigt ihn im Einstellungs-Popup. Jede Anfrage braucht
`Authorization: Bearer <token>`; alles andere bekommt ein nacktes `401` ohne Body.
Der Token gehört in keine Log-Zeile und in keine Fehlermeldung.

Zwei Regeln, an denen dieser Server hängt:

- **Ein Tool-Rumpf darf nicht panicken.** Eine Panik im Tool beantwortet die
  Anfrage überhaupt nicht — der Aufrufer sieht keinen Fehler, sondern hängt bis in
  seinen Timeout. Das ist der schlechteste aller Ausgänge und deutlich schlimmer
  als ein hässlicher Fehlertext. Also kein `unwrap`, kein `expect`, keine
  Index-Zugriffe und keine Arithmetik, die überlaufen kann, auf Werten, die aus
  den Parametern stammen. Jeder Fehlerfall wird zu einem Wert, den `respond` bzw.
  `tool_error` in eine Antwort verwandelt.
- **Die Fehlerart entscheidet, ob der Aufrufer die Meldung je zu sehen bekommt.**
  Ein `CallToolResult` mit `isError` (aus `tool_error`) transportiert den Text bis
  ins Modell und ist damit die einzige Form, aus der ein Aufrufer lernen kann, was
  er falsch gemacht hat. Ein `McpError` ist ein Protokollfehler; er landet im
  Transport und wird von Clients oft nur als Fehlschlag angezeigt. Alles, was der
  Aufrufer selbst beheben kann — unbekannte Kategorie, krumme Uhrzeit, kaputtes
  Datum, leerer Titel —, ist deshalb ein Tool-Fehler, und die Meldung nennt, was
  stattdessen erlaubt gewesen wäre (bei Kategorien die vorhandenen Namen).

Schreibende Tools melden der offenen Oberfläche über `Notifier::data_changed` das
Event `todolist:data-changed`; `src/events.ts` hört darauf und lädt die Ansicht
neu. **Der Name muss auf beiden Seiten gleich lauten** — läuft er auseinander,
bleibt alles grün, und die Oberfläche zeigt trotzdem veraltete Daten, bis jemand
die App neu startet.

Die Tests unter `src-tauri/src/mcp/` laufen gegen einen In-Memory-Pool und einen
zählenden `Notifier`-Stub. Was sie nicht abdecken, ist der echte `emit` und der
echte Transport; beides wird von Hand geprüft, indem man die App startet, den
Token aus `app_settings` liest und die Tools über HTTP aufruft.

## Adding Tests

When adding or modifying functionality, include corresponding tests:

1. Pure logic (types, utilities) → `*.test.ts` alongside the source file
2. React components → `*.test.tsx` alongside the component, mock the `db` module
3. Persistence changes → test both stores; a rule that must hold in both belongs in a shared module
4. CI will run `npm run typecheck && npm test` on every push to `main`
