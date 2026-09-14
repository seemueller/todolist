# `update_todo`: `null` ändert nichts mehr, `clear_*` leert

Stand: 2026-09-14. Anlass: Issue #35 — beim Abhaken einer Aufgabe über
`update_todo` verschwanden Kategorie und Fälligkeit.

## Problem

An der MCP-Grenze trägt `null` heute Bedeutung: bei `description`, `due_date`
und `category` heißt ein ausdrückliches `null` „dieses Feld leeren", während ein
weggelassenes Feld „unverändert lassen" heißt. Technisch ist die
Unterscheidung sauber umgesetzt (`double_option` in `src-tauri/src/mcp/tools.rs`,
dynamische SET-Liste in `src-tauri/src/mcp/store.rs`), und die Tests decken sie
ab.

Sie ist trotzdem die falsche API für einen MCP-Aufrufer. Das Schema zeigt die
Felder als nullable an; ein Modell, das sein Parameterobjekt vollständig
ausfüllt, schickt `due_date: null, category: null` mit, obwohl es nur den Status
ändern wollte — und verliert damit Daten, die es nie angefasst hat. Ein
Feldwert, der bei Abwesenheit harmlos und bei ausdrücklicher Angabe
destruktiv ist, lädt zu genau diesem Fehler ein.

## Lösung

Löschen bekommt ein eigenes, nur mit Absicht setzbares Signal: je ein boolescher
Parameter `clear_description`, `clear_due_date`, `clear_category`. `null`,
Weglassen und der leere String heißen danach alle drei „unverändert". Damit ist
Datenverlust ohne ausdrückliches `clear_*: true` nicht mehr ausdrückbar.

Betroffen ist ausschließlich die MCP-Grenze (`src-tauri/src/mcp/tools.rs`). Der
Store (`store.rs`) und die Patch-API des Frontends (`src/storeTypes.ts`,
`src/todoStoreSql.ts`) behalten ihre inneren `Option<Option<_>>`- bzw.
`null`-Semantik: dort ist sie richtig, weil kein Modell sie befüllt.

## Parameter

`UpdateTodo` verliert die drei doppelten Optionen und gewinnt drei Flags:

| Feld | vorher | nachher |
|---|---|---|
| `description` | `Option<Option<String>>` über `double_option` | `Option<String>` |
| `due_date` | `Option<Option<String>>` über `double_option` | `Option<String>` |
| `category` | `Option<Option<String>>` über `double_option` | `Option<String>` |
| `clear_description` | — | `Option<bool>` |
| `clear_due_date` | — | `Option<bool>` |
| `clear_category` | — | `Option<bool>` |

Die Hilfsfunktionen `double_option` und `clearable` haben danach keinen Aufrufer
mehr und entfallen samt ihrer Kommentare. `title`, `status`, `priority` und `id`
bleiben unberührt.

`clear_x: false` ist gleichbedeutend mit Weglassen: unverändert.

## Konflikt

`clear_x: true` zusammen mit einem nicht-leeren Wert im gleichnamigen Feld ist
ein Fehler. Der Aufruf schreibt nichts und antwortet mit einem Tool-Error, der
das Feld benennt, etwa:

> Die Faelligkeit kann nicht zugleich gesetzt und geleert werden: entweder
> "due_date" angeben oder "clear_due_date" setzen.

Ein Widerspruch ist immer ein Fehler des Aufrufers; ihn still nach einer Regel
aufzulösen verschleiert ihn und bringt dieselbe Sorte Überraschung zurück, die
dieser Umbau abstellt. Die Prüfung gehört in die bestehende `checked`-Kette in
`update_todo`, also vor jeden Schreibzugriff — dieselbe Reihenfolge, die schon
heute dafür sorgt, dass eine unbekannte Kategorie den Titel nicht bereits
geändert hat.

Ein leerer oder nur aus Leerraum bestehender Wert ist kein Widerspruch: `""`
zählt als „nicht angegeben", `clear_x: true` gewinnt.

## Abbildung auf den Store

`TodoUpdate` bleibt, wie es ist; nur die Herkunft seiner Werte ändert sich. Für
jedes der drei Felder, nach der Konfliktprüfung:

| Wert | `clear_*` | `TodoUpdate` |
|---|---|---|
| beliebig | `Some(true)` | `Some(None)` — leeren |
| `Some(v)`, nicht leer | sonst | `Some(Some(v))` — setzen |
| fehlt, `null` oder leer | sonst | `None` — unverändert |

Bei `description` bleibt die bisherige Sonderbehandlung des Textes erhalten:
Absätze am Anfang und Ende gehören zum Text und werden nicht abgeschnitten.
Geleert wird sie weiterhin zum leeren String, nicht zu `NULL` — die Spalte ist
`NOT NULL`.

## Tool-Beschreibung

Die Beschreibung von `update_todo` und die Doc-Kommentare der sechs betroffenen
Felder werden umgeschrieben. Der Satz „null loescht, weglassen aendert nichts"
verschwindet überall; an seine Stelle tritt, dass ausschließlich `clear_*` löscht
und jede andere Schreibweise das Feld unverändert lässt. Die Beschreibung der
`clear_*`-Felder sagt, dass sie ohne den passenden Wert zu verwenden sind.

## Tests

Alle in `src-tauri/src/mcp/tools.rs`; die Tests in `store.rs` bleiben
unverändert, weil der Store sich nicht ändert.

- **Regression zu Issue #35:** `status: "done"` zusammen mit `due_date: null`
  und `category: null` lässt Fälligkeit und Kategorie stehen.
- `update_todo_clears_a_due_date_when_given_null` wird zu
  `..._when_the_clear_flag_is_set` und schickt `clear_due_date: true`.
- Neu: `clear_category: true` nimmt die Aufgabe aus ihrer Kategorie.
- Neu: Wert und `clear_*: true` zugleich ergeben einen Tool-Error, und die
  Aufgabe steht danach unverändert in der Datenbank.
- Neu: `clear_x: false` ändert nichts.
- `update_todo_sets_and_clears_the_description` stellt das Leeren auf
  `clear_description: true` um.
- Der serde-Test, der `null` von einem fehlenden Feld unterscheidet, wird zu
  einem Test, der zeigt, dass beide Schreibweisen jetzt dasselbe ergeben.
- Der Schema-Test `the_router_lists_all_seven_tools_with_documented_parameters`
  nimmt die drei neuen Felder auf.

## Dokumentation

- `AGENTS.md:112` beschreibt die alte `null`-Regel für die Beschreibung und wird
  auf die Flags umgeschrieben.
- `CHANGELOG.md` bekommt einen Eintrag: Breaking Change am MCP-Tool.

Die älteren Spec- und Plan-Dateien unter `docs/superpowers/` bleiben, wie sie
sind — sie halten den Stand ihres Datums fest.

## Bewusst nicht enthalten

- Keine Änderung an `add_todo`: dort gibt es nichts zu leeren.
- Kein achtes Tool und keine Änderung an Store oder Frontend.
- Keine Übergangsfrist, in der `null` weiter löscht. Das Tool hat genau einen
  Aufrufer-Typ, und eine Schonfrist würde die Fehlerquelle behalten, um die es
  geht.
