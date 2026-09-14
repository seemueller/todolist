# Papierkorb und Rückgängig statt endgültigem Löschen

Stand: 2026-09-14. Anlass: Punkt B2 der Bestandsaufnahme — Löschen ist heute
endgültig, in der Oberfläche wie über MCP.

## Problem

`deleteTodo` entfernt die Zeile (`src/todoStoreSql.ts:126`,
`src/todoStoreLocal.ts:192`, `src-tauri/src/mcp/store.rs`). Es gibt keinen Weg
zurück: kein Rückgängig, keinen Papierkorb, kein Backup aus der App heraus.

Das wiegt schwerer, seit der MCP-Server da ist. Ein Agent ruft `delete_todo`
auf, während niemand hinsieht; greift er die falsche Id, ist die Aufgabe samt
Beschreibung weg, und der Nutzer erfährt es frühestens, wenn er sie sucht. In
der Oberfläche trifft derselbe Klick sofort — der Löschknopf sitzt in jeder
Listenzeile und jeder Brett-Karte direkt neben dem Bearbeiten-Stift.

## Lösung

Löschen wird umkehrbar. `todos` bekommt eine Spalte `deleted_at`; eine gesetzte
Spalte heißt „liegt im Papierkorb". Die Oberfläche bietet direkt nach dem
Löschen ein Rückgängig an und führt einen Papierkorb, aus dem einzeln
wiederhergestellt oder endgültig gelöscht werden kann. Nach 30 Tagen räumt die
App den Papierkorb beim Start selbst auf.

Kategorien bleiben hart gelöscht: sie tragen keinen Inhalt, nur eine Zuordnung,
und ihr Löschen ist heute schon verlustarm (die Aufgaben behalten alles außer
der Kategorie).

## Datenmodell

Migration 11, `add_deleted_at_to_todos` (die höchste bestehende ist 10,
`add_description_column`):

```sql
ALTER TABLE todos ADD COLUMN deleted_at TEXT DEFAULT NULL;
```

Der Wert ist der Löschzeitpunkt im selben Format wie `created_at`. Er trägt
damit zugleich die Aufbewahrungsfrist — eine zweite Spalte dafür gibt es nicht.

`Todo` in `src/types.ts` bleibt unverändert: das Feld erscheint nicht im Typ.
Der Papierkorb braucht nur die Reihenfolge „zuletzt gelöscht zuerst", und ein
Feld im Typ hieße, dass jede Ansicht sich dazu verhalten müsste.

### Die Filterregel

Jeder Lesepfad zeigt nur, was nicht im Papierkorb liegt. Die Bedingung steht je
Backend als **eine** Konstante neben `TODO_COLUMNS`, nicht je Abfrage neu:

- `src/todoStoreSql.ts` — `t.deleted_at IS NULL`
- `src-tauri/src/mcp/store.rs` — dieselbe Bedingung
- `src/todoStoreLocal.ts` — ein Prädikat, da ohne SQL

Betroffen ist auch `selectTodo`/`get_todo`, das nach jedem Schreibvorgang läuft.
Eine Aufgabe im Papierkorb gilt damit für `updateTodoDueDate`,
`updateTodoPriority`, `updateTodoCategory`, `updateTodoFields`,
`updateTodoStatus` und `toggleTodoDone` als `Todo <id> not found` — mit
derselben Formulierung und derselben Promise-Rejection wie eine unbekannte Id.
Sonst könnte ein Agent an etwas schreiben, das der Mensch weggeworfen hat.

## Speicher-Schnittstelle

`TodoStore` in `src/storeTypes.ts` wächst um vier Methoden:

```ts
/** Was im Papierkorb liegt, zuletzt Gelöschtes zuerst. */
listDeletedTodos(): Promise<Todo[]>;
/** Holt eine Aufgabe zurück; lehnt mit `Todo <id> not found` ab, wenn `id`
 *  nicht im Papierkorb liegt. */
restoreTodo(id: number): Promise<Todo>;
/** Entfernt eine Aufgabe unwiederbringlich. */
purgeTodo(id: number): Promise<number>;
/** Entfernt alles, was vor `cutoff` gelöscht wurde; gibt die Anzahl zurück. */
purgeDeletedBefore(cutoff: string): Promise<number>;
```

`deleteTodo(id)` behält Signatur und Rückgabe und setzt ab jetzt `deleted_at`.
Das ist die eine Stelle, an der sich das Verhalten für bestehende Aufrufer
ändert — beabsichtigt, denn daran hängt der Schutz an der MCP-Grenze.

`purgeTodo` ist das alte, harte `DELETE`.

### Randfälle

- **Kategorie löschen** setzt `category_id` auch bei Aufgaben im Papierkorb auf
  null. Eine wiederhergestellte Aufgabe kommt dann ohne Kategorie zurück; die
  Alternative wäre ein Verweis auf eine Kategorie, die es nicht mehr gibt.
- **Zeitbuchungen** sind nicht betroffen — sie hängen an Kategorien, nie an
  Aufgaben.
- **Doppeltes Löschen:** `deleteTodo` auf eine Aufgabe, die schon im Papierkorb
  liegt, verhält sich wie eine unbekannte Id (`Todo <id> not found`).

## MCP-Grenze

`delete_todo` behält Name, Parameter und Rückgabewert. Darunter löscht
`store.rs` weich. Die Werkzeugbeschreibung sagt das ausdrücklich — sinngemäß
„die Aufgabe landet im Papierkorb der App und kann dort wiederhergestellt
werden". Ein Modell, das glaubt, endgültig gelöscht zu haben, würde dem Nutzer
sonst das Falsche berichten.

Keine neuen Werkzeuge. Wiederherstellen und endgültiges Löschen bleiben in der
Oberfläche: ein Agent soll nichts unwiederbringlich machen können, was bereits
im Papierkorb liegt.

Das `data_changed`-Ereignis feuert wie bisher nach dem Löschen.

## Aufräumen

`TRASH_RETENTION_DAYS = 30`, an genau einer Stelle definiert.

Der Aufruf steht in `src/main.tsx` direkt nach `migrateLocalStorage`, nach
demselben Muster: ein Fehler landet in der Konsole und hält den Start nicht auf.
Ein Banner braucht es nicht — misslungenes Aufräumen kostet niemanden Daten.

Der Aufrufer rechnet den Stichtag aus und übergibt ihn; `purgeDeletedBefore`
kennt keine Uhr. Damit bleiben alle Store-Tests zeitfrei, und die einzige
Stelle, die „heute" kennt, ist eine Zeile in `main.tsx`.

Aufgeräumt wird nur beim Start, nicht periodisch. Wer die App wochenlang offen
lässt, behält seinen Papierkorb länger als 30 Tage. Das ist der Preis dafür,
dass im Hintergrund nichts verschwindet, während jemand davorsitzt.

## Oberfläche

### Rückgängig-Leiste

`App` hält `justDeleted: { id: number; title: string } | null`, gesetzt in
`handleDelete`. Die Leiste steht dort, wo Fehler- und Ladehinweis schon stehen,
und zeigt den Titel der gelöschten Aufgabe, „Rückgängig" und ein Schließen.

Sie verschwindet bei Rückgängig, beim Schließen und beim nächsten Löschen — das
zweite Löschen ersetzt den Eintrag, sammelt also nicht. Kein Timer: nichts
verschwindet, während jemand hinsieht, und keine Komponente und kein Test
braucht eine Uhr.

### Papierkorb-Fenster

Eigene Komponente `src/TrashModal.tsx`, kein weiterer Block in `App.tsx`. Der
Knopf sitzt im Kopf neben „Kategorien" und nutzt das vorhandene `TrashIcon`.

Inhalt: je Zeile der Titel, „Wiederherstellen" und „Endgültig löschen"; unten
„Papierkorb leeren"; ist nichts da, steht „Der Papierkorb ist leer."

Das Fenster lädt seine Liste beim Öffnen selbst — `App` hält den Papierkorb
nicht dauerhaft im State. Es hängt sich an `data_changed`, sonst zeigt es alte
Stände, während ein Agent nebenher arbeitet.

Dass das eine eigene Datei wird, ist Absicht: `App.tsx` steht bei 1099 Zeilen
und rund 25 `useState`. Ein neues Fenster gehört nicht noch hinein.

### Rückfrage vor dem Endgültigen

„Papierkorb leeren" fragt nach. Das einzelne „Endgültig löschen" nicht: der
Eintrag liegt sichtbar im Papierkorb und trägt seinen Titel, während „Leeren"
auch trifft, was gerade nicht auf dem Schirm ist.

## Tests

**Pro Backend, gleicher Satz** (`todoStoreSql.test.ts`, `todoStoreLocal.test.ts`):

- Eine gelöschte Aufgabe erscheint in keiner Leseoperation: nicht in
  `listTodos`, weder ungefiltert noch nach Kategorie.
- Jeder `updateTodo*` und `toggleTodoDone` lehnt sie mit `Todo <id> not found`
  ab.
- `listDeletedTodos` zeigt sie, zuletzt Gelöschtes zuerst.
- `restoreTodo` bringt sie in `listTodos` zurück und aus `listDeletedTodos`
  heraus; auf eine nicht gelöschte Id lehnt es ab.
- `purgeTodo` entfernt sie aus beidem.
- `purgeDeletedBefore` entfernt nur, was vor dem Stichtag gelöscht wurde — mit
  festen Zeitstempeln, ohne Systemuhr.
- Eine gelöschte Kategorie nimmt auch Aufgaben im Papierkorb die `category_id`.

**Rust** (`src-tauri/src/mcp/store.rs`, `tools.rs`):

- `delete_todo` löscht weich: die Zeile existiert noch, `deleted_at` ist gesetzt.
- `list_todos` zeigt sie nicht.
- `update_todo` auf eine weggeworfene Aufgabe ist ein Tool-Fehler, kein
  Protokollfehler.
- `delete_todo` auf eine bereits weggeworfene Aufgabe meldet `Todo <id> not
  found`.

**Migrationen:** `migrations.test.ts` um Migration 11 erweitert.

**Komponenten:**

- `TrashModal.test.tsx` isoliert: rendert die Liste, ruft die Handler für
  Wiederherstellen, endgültiges Löschen und Leeren, zeigt den Leerzustand, und
  „Leeren" wirkt erst nach der Rückfrage.
- `App.test.tsx`: die Rückgängig-Leiste erscheint nach dem Löschen mit dem
  Titel, „Rückgängig" holt die Aufgabe zurück in die Liste, ein zweites Löschen
  ersetzt die Leiste statt eine zweite anzuhängen.

**E2E** (`e2e/todolist.spec.ts`):

- Aufgabe löschen → Leiste erscheint → Rückgängig → Aufgabe steht wieder in der
  Liste.
- Aufgabe löschen → Papierkorb öffnen → wiederherstellen → Aufgabe steht wieder
  in der Liste, Papierkorb ist leer.

## Was nicht dazugehört

- Kategorien werden nicht soft-gelöscht.
- Kein Werkzeug an der MCP-Grenze zum Durchsuchen oder Wiederherstellen des
  Papierkorbs.
- Keine Mehrfachauswahl im Papierkorb, kein „alles wiederherstellen".
- Kein Undo für andere Aktionen als Löschen.
