# MCP-Server für die Todolist-App

Datum: 2026-09-03
Status: entworfen, noch nicht implementiert

## Ziel

Die Todolist-App stellt ihre Daten als MCP-Server bereit, damit Claude Code und
Claude Desktop Aufgaben lesen, anlegen und ändern sowie Zeiten buchen können.

Der Server ist Teil der laufenden Anwendung: er startet mit ihr und endet mit
ihr. Es gibt keinen Zugriff auf die Daten, während die App geschlossen ist.

## Ausgangslage

`src/db.ts` und `src/timeDb.ts` speichern ausschließlich in `localStorage`. Die
SQLite-Migrationen in `src-tauri/src/lib.rs` legen zwar `todos` und `categories`
an, aber niemand schreibt hinein. Das Rust-Backend kommt an `localStorage` nicht
heran.

Die Persistenz muss deshalb zuerst auf SQLite umgestellt werden. Das Vorhaben
zerfällt in zwei Phasen mit einem Checkpoint dazwischen: Phase 1 ist für sich
genommen abgeschlossen und lauffähig, auch wenn Phase 2 nie käme.

## Architektur

```
Phase 1 — Persistenz auf SQLite
  db.ts / timeDb.ts  ──►  tauri-plugin-sql  ──►  todolist.db

Phase 2 — MCP-Server
  Claude Code / Claude Desktop
        │ Streamable HTTP + Bearer-Token
        ▼
  127.0.0.1:4319/mcp   (Rust, axum, im Tauri-Backend)
        │ sqlx
        ▼
      todolist.db
        │ emit "todolist:data-changed"
        ▼
  React-UI lädt neu
```

---

## Phase 1 — Persistenz auf SQLite

### Grundsatz

Die öffentlichen Signaturen von `db.ts` und `timeDb.ts` bleiben unverändert.
Getauscht wird nur die Implementierung dahinter. `App.tsx` und
`TimeTrackingView.tsx` werden nicht angefasst. Die bestehenden Tests mocken
bereits das `db`-Modul und laufen unverändert weiter.

Betroffene Funktionen — alle behalten Name, Parameter und Rückgabetyp:

- `db.ts`: `listTodos`, `addTodo`, `updateTodoTitle`, `updateTodoDueDate`,
  `updateTodoPriority`, `updateTodoCategory`, `updateTodoStatus`,
  `toggleTodoDone`, `deleteTodo`, `listCategories`, `addCategory`,
  `updateCategory`, `deleteCategory`
- `timeDb.ts`: `getSettings`, `saveSettings`, `listSlots`, `saveDay`,
  `paintSlots`, `setBlockNote`, `clearBlock`

Die Fachlogik in `timeSlots.ts` bleibt unberührt. Sie arbeitet auf `DaySlot[]`
und weiß nichts über Speicherung.

### Neue Migrationen

```sql
-- 6: add_status_column
ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'todo';

-- 7: create_time_tables
CREATE TABLE IF NOT EXISTS time_slots (
  date        TEXT    NOT NULL,
  slot        INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  note        TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (date, slot)
);
CREATE TABLE IF NOT EXISTS time_settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  target_slots_per_day INTEGER NOT NULL DEFAULT 32,
  show_weekend         INTEGER NOT NULL DEFAULT 0
);
```

`status` und `done` werden weiterhin beide geführt, wie heute im Frontend-Typ.
`fromRow` leitet `done` aus `status` ab; geschrieben werden beide Spalten.

`time_slots` bildet die heutige flache Liste eins zu eins ab. Der
Primärschlüssel `(date, slot)` macht `saveDay` zu einem `DELETE` für das Datum
plus `INSERT`s in einer Transaktion — dieselbe Semantik wie heute `saveAll`.

`time_settings` ist eine Ein-Zeilen-Tabelle mit `CHECK (id = 1)`. Für genau zwei
Werte ist ein generischer Key-Value-Store unnötig.

### Migration der Altdaten

Neues Modul `src/migrateLocalStorage.ts`, aufgerufen einmalig in `main.tsx` vor
dem ersten Render.

Ablauf:

1. Flag `todolist_migrated_to_sqlite` prüfen. Gesetzt → sofort zurück.
2. `todolist_todos`, `todolist_categories`, `todolist_timeslots` und
   `todolist_time_settings` lesen.
3. In einer Transaktion nach SQLite schreiben. Kategorien zuerst, damit die
   Fremdschlüssel von Todos und Slots auflösen.
4. Flag setzen.

Die alten `localStorage`-Keys bleiben als Sicherheitsnetz liegen und werden
nicht gelöscht.

Zu behandelnde Fälle, jeder mit eigenem Test in
`src/migrateLocalStorage.test.ts`:

- leerer `localStorage` — nichts zu tun, Flag wird trotzdem gesetzt
- Todos ohne `status` — abgeleitet aus `done`, wie heute `migrateTodos`
- Slots, deren `category_id` auf keine vorhandene Kategorie zeigt — verworfen
- kaputtes JSON in einem Key — dieser Key wird übersprungen, die anderen laufen
  durch, das Flag wird gesetzt

### Browser-Fallback

`db.ts` und `timeDb.ts` erkennen zur Laufzeit, ob ein Tauri-Kontext vorliegt.
Ohne Tauri — Vite-Dev im Browser und die Playwright-E2E-Tests — bleibt die
`localStorage`-Implementierung aktiv. Ohne diese Weiche brechen die E2E-Tests,
die gegen den Dev-Server laufen.

Die Weiche liegt an genau einer Stelle je Modul: eine Funktion `backend()`, die
das passende Implementierungsobjekt liefert. Die exportierten Funktionen
delegieren dorthin.

### Fertig, wenn

- `npm run typecheck && npm test` läuft durch
- `npx playwright test` läuft durch
- In der gebauten Tauri-App überleben angelegte Todos und gebuchte Zeiten einen
  Neustart, und die Daten liegen in `todolist.db`

---

## Phase 2 — MCP-Server

### Aufbau

Neues Modul `src-tauri/src/mcp/`:

| Datei | Verantwortung |
|---|---|
| `mod.rs` | Serverstart, Lifecycle am Tauri-Setup-Hook |
| `auth.rs` | Token erzeugen, speichern, prüfen |
| `tools.rs` | Tool-Definitionen und Schemata |
| `store.rs` | SQL-Zugriff, die einzige Stelle mit Queries |

Crates: `rmcp` (offizielles Rust-MCP-SDK) mit Streamable-HTTP-Server-Transport,
`axum` als HTTP-Layer, `sqlx` für die Datenbank. Die genauen Feature-Flags und
Versionen werden bei der Implementierung gegen die aktuelle Dokumentation
festgelegt.

### Datenbankzugriff

Der Server öffnet einen eigenen `sqlx`-Pool auf dieselbe Datei. Der Pool des
`tauri-plugin-sql` wird nicht mitbenutzt — dessen `DbInstances` ist kein
stabiles öffentliches API.

Beide Verbindungen setzen `journal_mode=WAL` und ein `busy_timeout` von 5000 ms.
Ohne das treten bei gleichzeitigem Schreiben `database is locked`-Fehler auf.
Das ist die einzige heikle Stelle dieser Phase und gehört als Erstes verifiziert.

### Tools

| Tool | Eingabe | Wirkung |
|---|---|---|
| `list_todos` | `status?`, `category?`, `due_before?` | Liest Todos, gefiltert |
| `add_todo` | `title`, `priority?`, `due_date?`, `category?` | Legt Todo an, gibt es zurück |
| `update_todo` | `id`, optional `title`, `status`, `priority`, `due_date`, `category` | Ändert nur die gesetzten Felder |
| `delete_todo` | `id` | Löscht das Todo |
| `list_categories` | — | Namen, Farben, IDs |
| `get_week_time` | `monday` (ISO-Datum) | Slots der Woche plus Summen je Kategorie |
| `book_time` | `date`, `from`, `to` (HH:MM), `category`, `note?` | Bucht einen Block Viertelstunden |

Kategorien werden in Ein- und Ausgabe über ihren **Namen** adressiert, nicht über
die ID. Ein unbekannter Name ist ein Fehler; Kategorien werden nicht still
angelegt.

`book_time` rechnet `HH:MM` in Slot-Indizes um (`slot = hour * 4 + minute / 15`).
Diese Umrechnung existiert heute nur in `timeSlots.ts` und wird in Rust
nachgezogen; sie wird auf beiden Seiten getestet. Weitergehende Fachlogik —
Blockbildung, Notiz-Vererbung — wandert **nicht** nach Rust. `book_time`
schreibt Slots, mehr nicht.

Fehler kommen als MCP-Tool-Fehler mit lesbarem Text zurück, nicht als Panic.

### Sicherheit

- Der Server bindet ausschließlich auf `127.0.0.1:4319`.
- Beim ersten Start wird ein Token aus 32 zufälligen Bytes erzeugt und
  base64url-kodiert in einer neuen Tabelle `app_settings` abgelegt. Diese kommt
  als Migration 8 dazu:

  ```sql
  -- 8: create_app_settings
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  ```

  Anders als `time_settings` ist hier ein Key-Value-Store richtig: der Inhalt ist
  Infrastruktur, die mit weiteren Schlüsseln wachsen wird.
- Jeder Request muss `Authorization: Bearer <token>` mitbringen. Fehlt oder
  stimmt das Token nicht, antwortet der Server `401` ohne weitere Angaben.
- Der Vergleich läuft in konstanter Zeit.
- Das Token erscheint in keinem Log und in keiner Fehlermeldung.

### Oberfläche

Neuer Abschnitt in den Einstellungen, gebaut aus den Bausteinen unter `src/ui/`
nach `STYLEGUIDE.md`:

- Status: läuft / läuft nicht, mit Port
- Token, maskiert dargestellt, mit Kopier-Button und Aufdecken-Schalter
- Die fertige Konfigurationszeile für den Client zum Kopieren

### Aktualisierung der Oberfläche

Nach jedem schreibenden Tool sendet das Backend
`app.emit("todolist:data-changed", …)`. `App.tsx` und `TimeTrackingView.tsx`
hängen je einen `listen`-Hook daran und laden ihre Daten neu.

### Tests

- Rust-Unit-Tests gegen eine temporäre SQLite-Datei: jedes der sieben Tools im
  Erfolgs- und im Fehlerfall
- Rust-Unit-Tests für Token-Prüfung (fehlend, falsch, richtig) und für die
  Zeit-Umrechnung
- Ein Integrationstest, der einen echten MCP-Handshake über HTTP fährt,
  `list_todos` aufruft und die Antwort prüft
- Ein Test, der bestätigt, dass ohne gültiges Token `401` zurückkommt

### Fertig, wenn

- `npm run typecheck && npm test` und `cargo test` laufen durch
- `claude mcp add --transport http todolist http://127.0.0.1:4319/mcp` verbindet
  sich, und alle sieben Tools sind über Claude Code aufrufbar
- Ein über MCP angelegtes Todo erscheint ohne Neustart in der offenen App

---

## Bewusst nicht enthalten

- Zugriff bei geschlossener App (kein Sidecar, kein eigenständiger Prozess)
- MCP-Client-Funktionalität, also das Anbinden fremder Server
- Kategorien anlegen, ändern oder löschen über MCP
- CSV-Export über MCP
- Konfigurierbarer Port; `4319` ist fest verdrahtet
