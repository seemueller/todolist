# Tags an Aufgaben und ein Filter-Editor dafür

Datum: 2026-09-25

## Ziel

Eine Aufgabe trägt beliebig viele **Tags** — freie Schlagworte neben Kategorie
und Typ. Darüber lassen sich **benannte Tag-Filter** bauen: eine flache Liste
von Regeln („hat Tag X", „hat Tag X nicht", „hat keine Tags"), verknüpft mit
„alle Regeln" oder „mindestens eine". Ein gewählter Filter wirkt in Liste und
Brett zugleich.

Nicht Teil dieses Umbaus: Farben für Tags, ein Dialog zum Umbenennen oder
Löschen von Tags, verschachtelte UND/ODER-Gruppen.

## Tags

### Regeln (`src/types.ts`)

`normalizeTag(raw: string): string | null` ist die einzige Stelle, die
entscheidet, was ein Tag ist:

- trimmen,
- `toLowerCase()` — Kleinschreibung in JavaScript, nicht über `COLLATE NOCASE`,
  das nur ASCII faltet („Ärzte"/„ärzte"),
- jede Folge von Whitespace im Inneren wird zu einem `-`,
- länger als 40 Zeichen → `null`,
- leer → `null`.

`normalizeTags(raw: string[]): string[]` normalisiert, verwirft `null`,
entfernt Dubletten und sortiert mit `compareCategoryNames` (gleiches Verhalten
in WebKitGTK und Chromium).

Tags haben keine eigene Existenz: ein Tag gibt es, solange mindestens eine
Aufgabe ihn trägt. Die Vorschlagsliste entsteht aus den vorhandenen Tags.

### Datenmodell

- `Todo.tags: string[]`, immer normalisiert und sortiert. `TodoRow.tags` ist
  optional; `fromRow` setzt `[]`, wenn es fehlt (alte localStorage-Einträge).
- Neue Migration in `src-tauri/src/lib.rs`:

  ```sql
  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    name    TEXT    NOT NULL,
    PRIMARY KEY (todo_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_todo_tags_name ON todo_tags(name);
  ```

  Keine Tabelle `tags`: ohne Farbe und ohne Umbenennen gäbe es dort nichts zu
  speichern. `src/migrations.test.ts` zieht mit.
- Die Todo-Abfrage im SQL-Store hängt die Tags per Unterabfrage
  `(SELECT json_group_array(name) FROM todo_tags WHERE todo_id = todos.id)`
  an; `fromRow` parst und normalisiert.

### Store-Interface (`src/storeTypes.ts`)

- `setTodoTags(id: number, tags: string[]): Promise<void>` — ersetzt die Menge
  vollständig. Die Tags werden vorher mit `normalizeTags` bereinigt. Im
  SQL-Store als Tauri-Command `set_todo_tags` (DELETE + INSERT in einer
  Transaktion), weil `tauri-plugin-sql` keine Transaktion über mehrere Aufrufe
  kennt.
- `listTags(): Promise<string[]>` — alle Tags nicht gelöschter Aufgaben,
  sortiert, ohne Dubletten.
- `addTodo` nimmt `tags` optional (Vorgabe `[]`, unkritisch wie bei
  `addCategory`).
- Papierkorb: Tags bleiben an der abgelegten Aufgabe und kommen beim
  Wiederherstellen mit zurück. Endgültiges Löschen entfernt sie per
  `ON DELETE CASCADE` bzw. im localStorage-Store mit dem Eintrag.
- Beide Implementierungen, beide getestet.
- `migrateLocalStorage` übernimmt vorhandene `tags` aus localStorage.

## Tag-Filter

### Modell (`src/tagFilter.ts`, rein, ohne React und ohne Store)

```ts
export type TagRule =
  | { kind: "has"; tag: string }
  | { kind: "lacks"; tag: string }
  | { kind: "untagged" };

export interface TagFilter {
  id: string;          // crypto.randomUUID()
  name: string;
  match: "all" | "any";
  rules: TagRule[];
}

export function matchesTagFilter(tags: string[], filter: TagFilter): boolean;
```

- `has`: der Tag ist dabei. `lacks`: der Tag ist nicht dabei. `untagged`:
  `tags.length === 0`.
- `match: "all"` → jede Regel trifft; `"any"` → mindestens eine.
- Leere Regelliste trifft jede Aufgabe (unabhängig von `match`).
- Eine Regel auf einen Tag, den keine Aufgabe mehr trägt, bleibt stehen: `has`
  trifft dann nichts, `lacks` alles. Der Editor zeigt sie als „unbekannt" an,
  löscht sie aber nicht still.

### Speicherung (`src/listPrefs.ts`)

Oberflächen-Vorliebe, also localStorage, nicht Store:

- `todolist.tagFilters` — JSON-Array von `TagFilter`.
- `todolist.activeTagFilter` — Id des gewählten Filters oder fehlend.

`loadTagFilters()` parst defensiv wie `loadTodoModalSize`: kaputtes JSON →
`[]`; einzelne unbrauchbare Filter oder Regeln werden verworfen, der Rest
bleibt. Tags in Regeln laufen durch `normalizeTag`. `loadActiveTagFilter()`
liefert `null`, wenn die Id zu keinem gespeicherten Filter passt.

### Wirkung

- Ein aktiver Filter für Liste und Brett gemeinsam.
- UND-verknüpft mit den bestehenden Filtern (Status, Typ, Fälligkeit,
  Kategorie, Suche) in `filteredTodos` und `boardTodos` (`App.tsx`).
- Ein aktiver Tag-Filter zählt in `hasActiveFilter` und erscheint im Band
  `active-filters` mit seinem Namen; „Filter zurücksetzen" setzt ihn auf
  „keiner".

## Oberfläche

Vor der Umsetzung `STYLEGUIDE.md` lesen: keine Emoji, keine Verläufe, Farben
nur als Token.

- **Neuer Baustein `TagChip`** (`src/ui/TagChip.tsx`): kleines Etikett mit
  optionalem Entfernen-Knopf (`aria-label="Tag <name> entfernen"`). Taucht in
  Listenzeile, Brett-Karte und Detailfenster auf — dreimal, also Baustein.
- **Detailfenster**: Feld „Tags" mit den Chips und einem Eingabefeld;
  Enter oder Komma übernimmt, Backspace im leeren Feld entfernt den letzten
  Chip. Vorschläge über `<datalist>` aus `listTags()`. Speichert über
  `setTodoTags`.
- **Listenzeile / Brett-Karte**: Tags als Chips ohne Entfernen-Knopf.
- **Filterleiste in Liste und Brett**: Auswahl „Tag-Filter" (`Keiner` +
  gespeicherte Filter, `aria-label="Tag-Filter"`) und daneben zwei
  `IconButton`s: „Tag-Filter bearbeiten" (öffnet den gewählten) und
  „Neuer Tag-Filter".
- **Editor** (`src/TagFilterEditor.tsx`, im `Modal`-Baustein):
  - Name (Pflicht, nicht leer),
  - Umschalter „Alle Regeln" / „Mindestens eine" (`FilterChip`, Segment),
  - Regelzeilen: Auswahl `hat` / `hat nicht` / `hat keine Tags`, dazu —
    außer bei `hat keine Tags` — ein Tag-Feld mit denselben Vorschlägen;
    Entfernen-Knopf je Zeile,
  - „Regel hinzufügen",
  - „Speichern", „Löschen" (nur bei bestehendem Filter), „Abbrechen".
  - Unbekannte Tags in Regeln sind sichtbar markiert.
  - Speichern setzt den Filter zugleich aktiv.

## MCP

- `list_todos` liefert pro Aufgabe `tags: string[]`.
- `add_todo` nimmt `tags` optional.
- `update_todo`: `tags` ersetzt die Menge, wenn ein nicht-leeres Array
  angegeben ist; Weglassen, `null` und `[]` lassen sie unverändert.
  `clear_tags: true` leert sie. Beides zugleich ist ein Tool-Fehler — dieselbe
  Regel wie `clear_description` (Issue #35).
- Ein Tag, der nach der Normalisierung leer oder länger als 40 Zeichen ist,
  ist ein Tool-Fehler, und die Meldung nennt die Regel.
- Die Normalisierung gibt es in Rust ein zweites Mal (`mcp/store.rs` oder
  eigenes Modul). Damit Browser- und MCP-Pfad nicht auseinanderlaufen, prüfen
  ein TS- und ein Rust-Test dieselbe Tabelle von Beispielfällen (inklusive
  Umlaut-Großschreibung und Mehrfach-Leerzeichen).
- Das Schreiben der Tags geschieht in derselben Transaktion wie der Rest von
  `update_todo`. Kein neues Tool, weiterhin sieben.
- `AGENTS.md` (MCP-Abschnitt, Test-Dateien) wird nachgezogen.

## Tests

- `src/types.test.ts`: `normalizeTag`, `normalizeTags`, `fromRow` mit und ohne
  `tags`.
- `src/tagFilter.test.ts`: jede Regelart, `all`/`any`, leere Regelliste,
  unbekannter Tag.
- `src/listPrefs.test.ts`: Laden/Speichern, kaputtes JSON, kaputte Einzelregel,
  aktive Id ohne passenden Filter.
- `src/todoStoreLocal.test.ts` / `src/todoStoreSql.test.ts`: `setTodoTags`,
  `listTags` (ohne Papierkorb), Tags an `addTodo`, Wiederherstellen.
- `src/migrateLocalStorage.test.ts`, `src/migrations.test.ts`.
- `src/ui/TagChip.test.tsx`, `src/TagFilterEditor.test.tsx`,
  `src/TodoDetailModal.test.tsx` (Tag hinzufügen/entfernen),
  `src/App.test.tsx` (Filter wirkt in Liste und Brett, Band zeigt ihn).
- Rust: `set_todo_tags` inklusive Fehler mitten im Schreiben lässt die Menge
  unverändert; MCP-Tools `add_todo`/`update_todo`/`list_todos` mit Tags,
  `clear_tags`, Konflikt, ungültiger Tag.
- E2E (`e2e/todolist.spec.ts`): Tags setzen, Filter „hat frontend, hat nicht
  blocked" anlegen, Liste und Brett prüfen, nach Reload noch aktiv.
