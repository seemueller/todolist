# Beschreibung an einer Aufgabe

Eine Aufgabe trägt heute nur einen Titel — eine Zeile, die in Liste und Brett
vollständig sichtbar ist. Alles, was zur Aufgabe noch zu sagen wäre, muss in
diese Zeile oder bleibt ungeschrieben. Dieses Dokument beschreibt, wie eine
Aufgabe zusätzlich eine frei formulierte Beschreibung bekommt: mehrzeilig,
optional, überall dort verfügbar, wo die Aufgabe schon lebt — in der App und
über den MCP-Server.

## Entscheidungen

Vier Festlegungen tragen den Entwurf; sie stehen hier zusammen, weil jede
spätere Abweichung den Rest betrifft.

**Die Beschreibung wird in einem Detail-Fenster bearbeitet, nicht in der
Zeile.** Die Zeile trägt heute Titel, Priorität, Fälligkeit und Kategorie
nebeneinander; ein mehrzeiliges Textfeld passt dort weder hin noch zum
Tastaturvertrag der Inline-Bearbeitung (Enter übernimmt), bei dem ein
Zeilenumbruch nicht einzugeben wäre.

**Das Fenster hat einen Sichern-Knopf und schreibt einmal.** Wer ein
mehrzeiliges Feld ausfüllt, erwartet, abbrechen zu können. Daraus folgt das
Gegenstück: gespeichert wird der Stand des Fensters als Ganzes, nicht Feld für
Feld.

**Zeilenumbrüche sind erlaubt, andere Steuerzeichen nicht.** Eine Beschreibung
ohne Absätze wäre ein Fließtext, der seinen Zweck verfehlt.

**Leer heißt leer — der leere String.** Es gibt keinen zweiten Weg über `NULL`,
damit „keine Beschreibung" nur eine Schreibweise hat.

## Datenmodell

Die Spalte kommt als **Migration 10** dazu:

```rust
Migration {
    version: 10,
    description: "add_description_column",
    sql: "ALTER TABLE todos ADD COLUMN description TEXT NOT NULL DEFAULT '';",
    kind: MigrationKind::Up,
},
```

Die bestehenden neun Migrationen werden nicht angefasst. Das ist keine
Stilfrage: `tauri-plugin-sql` prüft die Prüfsumme jeder bereits angewandten
Migration und bricht beim Start ab, wenn sie sich geändert hat — genau der
Fehler, den Version 0.8.1 geradegerückt hat.

In `src/types.ts`:

- `Todo` bekommt `description: string`.
- `TodoRow` bekommt `description?: string` — optional, weil der
  localStorage-Speicher Zeilen liefert, die vor dieser Änderung geschrieben
  wurden.
- `fromRow` setzt `description: row.description ?? ""`.

Daraus folgt für die beiden Speicher-Backends:

- **SQLite**: `description` gehört in `TODO_COLUMNS`, damit jede gelesene
  Aufgabe das Feld trägt. Die Spalte ist `NOT NULL DEFAULT ''`, alte Zeilen
  bekommen den leeren String also von der Datenbank.
- **localStorage**: alte Einträge haben das Feld nicht; `fromRow` deckt das ab.
  `migrateLocalStorage` reicht ein vorhandenes Feld durch und schreibt sonst
  den leeren String — für Daten aus der Zeit vor dieser Änderung ist das immer
  der zweite Fall.

## Speicherschicht

`TodoStore` bekommt eine Methode, die mehrere Felder in einem Schreibvorgang
ändert:

```ts
export interface TodoFieldsPatch {
  title?: string;
  description?: string;
  priority?: Priority;
  /** null entfernt die Fälligkeit. */
  dueDate?: string | null;
  /** null nimmt die Aufgabe aus ihrer Kategorie. */
  categoryId?: number | null;
}

updateTodoFields(id: number, patch: TodoFieldsPatch): Promise<Todo>;
```

Der Vertrag, wie ihn `storeTypes.ts` dokumentiert:

- Ein **fehlendes** Feld bleibt unverändert. `dueDate: null` und
  `categoryId: null` leeren — dieselbe Unterscheidung, die `update_todo` über
  MCP schon trifft.
- Ein **leerer Patch** schreibt nicht und gibt die Aufgabe unverändert zurück.
- Eine unbekannte Id wird mit `Todo <id> not found` abgelehnt, als
  Promise-Rejection, nie als synchroner throw — wie bei jeder anderen
  Update-Methode.
- Wird `categoryId` gesetzt, werden `category_name` und `category_color` neu
  denormalisiert, genau wie in `updateTodoCategory`.

Umsetzung je Backend:

- **SQLite**: aus den gesetzten Feldern wird eine `SET`-Liste gebaut und ein
  einziges `UPDATE` abgesetzt, danach `selectTodo(id)`. Kein `BEGIN`/`COMMIT`
  über getrennte Aufrufe — ein einzelnes `UPDATE` ist für sich atomar, und
  mehrere Aufrufe über den Connection-Pool wären es nicht (siehe `AGENTS.md`).
- **localStorage**: lesen, die gesetzten Felder überschreiben, einmal
  zurückschreiben.

`addTodo` bekommt einen optionalen fünften Parameter `description` mit der
Vorgabe `""`. Das Formular in der App benutzt ihn nicht — eine neue Aufgabe
entsteht weiterhin nur mit Titel, Priorität, Fälligkeit und Kategorie —, aber
`add_todo` über MCP soll eine Beschreibung gleich mitgeben können.

`updateTodoTitle`, `updateTodoPriority`, `updateTodoDueDate` und
`updateTodoCategory` bleiben, wo sie sind: die Zeile bedient weiter direkt über
sie. `updateTodoFields` tritt daneben, nicht an ihre Stelle.

## Oberfläche

### Das Detail-Fenster

Neue Datei `src/TodoDetailModal.tsx`. Eine eigene Datei, weil `App.tsx` mit
knapp 38 KB bereits an der Grenze dessen ist, was sich noch am Stück lesen
lässt; ein Formular mit fünf Feldern und eigenem Entwurfszustand gehört dort
nicht mehr hinein.

Gebaut wird es aus den vorhandenen Bausteinen: `ui/Modal` für Overlay, Panel
und Kopfzeile, `ui/PrioritySelect` und `ui/CategorySelect` für die beiden
Auswahlfelder. `Modal` braucht dafür eine dritte Panelbreite — `variant` wächst
von `"changelog" | "category"` auf `"changelog" | "category" | "todo"`; der
Katalog in `STYLEGUIDE.md` ist entsprechend nachzuziehen.

Felder von oben nach unten: Titel (`input`), Beschreibung (`textarea`, etwa
acht Zeilen hoch, in der Höhe veränderbar), Priorität, Fälligkeit, Kategorie.
Darunter Abbrechen und Sichern.

Verhalten:

- Das Fenster arbeitet auf einem **Entwurf**, den es beim Öffnen aus der
  Aufgabe befüllt. Erst Sichern schreibt.
- **Escape** und **Abbrechen** verwerfen den Entwurf. Beides läuft über
  `onClose` von `Modal`, das den Escape-Listener schon mitbringt.
- **Strg+Enter** sichert. Enter allein gehört im Textfeld dem Zeilenumbruch.
- Ein **leerer Titel** (nach `trim`) wird beim Sichern im Fenster angemerkt und
  nicht gespeichert; das Fenster bleibt offen.
- Gesichert wird über `updateTodoFields` mit genau den Feldern, die sich
  gegenüber dem Ausgangsstand unterscheiden. Hat sich nichts geändert, schließt
  das Fenster ohne Schreibvorgang.
- Schlägt das Schreiben fehl, bleibt das Fenster offen und zeigt den Fehler;
  der Entwurf ist nicht verloren.

### Einstieg

Geöffnet wird das Fenster über den **Stift-Knopf** der Zeile und den
**Doppelklick auf den Titel** — beide Einstiege führten bisher zum Inline-Feld
für den Titel. Damit entfällt die Inline-Bearbeitung des Titels: `editingId`,
`editingTitle` und der zugehörige `InlineEditInput`-Zweig verschwinden aus
`App.tsx`. `InlineEditInput` selbst bleibt, die Kategorieverwaltung benutzt es
weiter.

Im Brett öffnet ein **Doppelklick auf die Karte** dasselbe Fenster. Der
Doppelklick stört das Ziehen der Karte nicht: `dragstart` und `dblclick`
schließen einander nicht aus.

### Anzeige

- **Liste**: ein gedämpftes Notiz-Symbol neben dem Titel, nur wenn eine
  Beschreibung vorhanden ist. Es kommt als neues Icon nach `ui/icons.tsx`. Die
  Zeile bleibt einzeilig.
- **Brett**: die Karte zeigt zwei Zeilen Vorschau unter dem Titel
  (`-webkit-line-clamp: 2`), gedämpft. Umbrüche erscheinen darin als
  Leerzeichen, damit die Vorschau nicht nach der ersten Zeile abbricht.

Beides folgt dem Styleguide: keine Emoji, Farben nur als Token.

## MCP

Die Beschreibung steht in jedem zurückgegebenen Aufgaben-Objekt, also auch in
`list_todos`. Zwei Tools bekommen einen neuen Parameter:

- **`add_todo`**: `description: Option<String>`, optional. Ohne Angabe bleibt
  die Beschreibung leer.
- **`update_todo`**: `description: Option<Option<String>>` über
  `double_option`, wie `due_date` und `category`. `null` oder `""` leeren die
  Beschreibung, das Feld wegzulassen lässt sie unverändert.

Geprüft wird an der Tool-Grenze, nicht im Store — dieselbe Linie wie bei Titel,
Notiz und Kategoriename. `check_text` taugt dafür nicht, es lehnt jedes
Steuerzeichen ab. Daneben tritt:

```rust
/// Wie `check_text`, laesst aber den Zeilenumbruch durch.
fn check_multiline(label: &str, value: &str, max: usize) -> Result<(), String>
```

Erlaubt ist `\n`. Abgelehnt wird jedes andere Steuerzeichen, **auch `\r`**. Das
ist streng gegenüber Clients, die Zeilenumbrüche als `\r\n` schicken, und
absichtlich so: ein stillschweigend umgeschriebenes `\r\n` gäbe dem Absender
etwas anderes zurück, als er geschickt hat. Es ist dieselbe Entscheidung wie
bei `"09:07"` in `slots.rs` — eine Absage, die den Grund nennt, ist besser als
eine veränderte Eingabe. Die Meldung sagt deshalb ausdrücklich, dass der
Zeilenumbruch als `\n` zu schicken ist.

Die Grenze:

```rust
/// Eine Beschreibung darf ein paar Absaetze lang sein, kein Dokument.
const MAX_DESCRIPTION_CHARS: usize = 4000;
```

Gezählt werden Zeichen, nicht Bytes — wie bei den bestehenden Grenzen.

`add_todo` und `update_todo` melden über den `Notifier` weiterhin genau dann
eine Datenänderung, wenn geschrieben wurde; daran ändert der neue Parameter
nichts.

## Tests

- **`types.test.ts`**: `fromRow` setzt `description` auf `""`, wenn die Zeile
  das Feld nicht hat, und reicht einen vorhandenen Wert durch.
- **`todoStoreSql.test.ts` und `todoStoreLocal.test.ts`**: `updateTodoFields`
  mit einem Feld, mit mehreren Feldern, mit leerem Patch (kein Schreibvorgang,
  Aufgabe unverändert), mit `dueDate: null` und `categoryId: null` (leeren),
  mit unbekannter Id (`Todo <id> not found`). Dazu `addTodo` mit und ohne
  Beschreibung. Beide Backends bekommen dieselben Fälle — der Vertrag gilt für
  beide.
- **`migrations.test.ts`**: Migration 10 ist vorhanden und die Liste bis 9 ist
  unverändert.
- **`migrateLocalStorage.test.ts`**: Daten ohne `description` wandern mit
  leerer Beschreibung herüber.
- **`App.test.tsx`**: Stift-Knopf und Doppelklick öffnen das Fenster; Sichern
  ruft `updateTodoFields` mit genau den geänderten Feldern; Abbrechen und
  Escape verwerfen; ein leerer Titel wird abgelehnt, ohne zu speichern; ein
  fehlgeschlagenes Schreiben lässt das Fenster offen. Dazu das Notiz-Symbol in
  der Liste und die Vorschau auf der Kanban-Karte, jeweils nur bei vorhandener
  Beschreibung.
- **Rust, `store.rs`**: Beschreibung durch `add`, `update` und `list`;
  `null` leert, Weglassen lässt unverändert.
- **Rust, `tools.rs`**: `check_multiline` lässt `\n` durch und lehnt `\r`,
  `\t` und `\0` ab; eine zu lange Beschreibung wird mit Zeichenzahl und Grenze
  abgelehnt.
- **e2e**: eine Aufgabe anlegen, Beschreibung über das Fenster setzen, im Brett
  als Vorschau wiederfinden.

## Was nicht dazugehört

- **Kein Formatieren.** Die Beschreibung ist Text, kein Markdown. Umbrüche
  bleiben Umbrüche, mehr wird nicht gedeutet.
- **Keine Suche über Beschreibungen.** Der Filter in der Liste arbeitet
  weiterhin über Kategorie, Status und Fälligkeit.
- **Kein Feld im Anlegen-Formular.** Eine neue Aufgabe entsteht mit einem
  Titel; die Beschreibung kommt über das Detail-Fenster dazu. Das hält die
  Kopfzeile der App so schmal, wie sie ist.
- **Keine Aufräumarbeit an `App.tsx` darüber hinaus.** Das Auslagern des
  Fensters nimmt Code aus der Datei heraus; weitergehendes Zerlegen ist ein
  eigenes Vorhaben.
