# Karten im Brett innerhalb der Swimlane sortieren

Stand: 2026-09-16. Anlass: Karten lassen sich heute nur zwischen den Lanes
ziehen. Innerhalb einer Lane bestimmt eine feste Regel die Reihenfolge, und die
passt nicht immer zu dem, was als Nächstes dran ist.

## Problem

Ein Drop im Brett ändert ausschließlich den Status (`handleDropOnLane`,
`src/App.tsx:460`). Die Reihenfolge innerhalb der Lane berechnet die Ansicht
selbst, seit heute nach Fälligkeit, dann Priorität, dann Alter
(`src/App.tsx:936`). Diese Regel ist eine gute Vorgabe, aber sie kennt nur, was
in den Feldern steht. Was der Mensch am Morgen als Reihenfolge im Kopf hat —
"erst das hier, dann das, der Rest danach" — lässt sich nirgends hinterlegen.

Die Reihenfolge ist damit kein Anzeigedetail, sondern eine Entscheidung. Sie
gehört in den Speicher, nicht in `localStorage`: sie soll den Wechsel zwischen
Browser- und Desktop-Build überleben und beim Umzug der Daten mitkommen.

## Entscheidungen

Vier Festlegungen, die den Rest des Entwurfs tragen:

1. **Manuell gewinnt.** Eine einmal gezogene Karte behält ihren Platz. Die
   Fälligkeitsregel bleibt als Tie-Breaker bestehen, statt ersetzt zu werden.
2. **Die Position ist Speicherzustand**, eine Spalte an `todos`, keine
   Oberflächen-Vorliebe in `listPrefs.ts`.
3. **`DEFAULT 0` statt Position bei Anlage.** Eine neue Aufgabe entsteht an
   sieben Stellen: im Frontend-Store und in sechs `INSERT INTO todos` der
   MCP-Werkzeuge (`src-tauri/src/mcp/tools.rs`). Jedem davon ein
   `SELECT max(board_order)` zu verpassen, wäre viel Fläche für wenig Gewinn,
   und die Rust-Seite müsste die Lane-Logik nachbauen. Mit `DEFAULT 0` teilen
   sich alle noch nie gezogenen Karten einen Wert, stehen als Block oben und
   sortieren sich untereinander nach der bekannten Regel. Kein NULL-Sonderfall,
   kein Eingriff in Rust.
4. **Lane-Wechsel setzt Status und Position in einem Schreibvorgang.** Zwei
   getrennte Aufrufe würden die Karte sichtbar an der falschen Stelle aufblitzen
   lassen, und ein Fehler zwischen beiden ließe sie halb verschoben zurück.

## Datenmodell

Migration 13 in `src-tauri/src/lib.rs`:

```sql
ALTER TABLE todos ADD COLUMN board_order REAL NOT NULL DEFAULT 0;
```

`REAL`, nicht `INTEGER`: die Position wird als Bruchzahl zwischen ihren Nachbarn
berechnet (siehe unten), und das braucht Nachkommastellen.

Der Sortierschlüssel einer Lane ist `board_order` aufsteigend; bei Gleichstand
gilt die heutige Regel — Fälligkeit zuerst, Karten ohne Datum ans Ende, dann
Priorität, dann `created_at` absteigend. Kleiner Wert heißt weiter oben, also
landet alles Unberührte (`0`) über den nach unten gezogenen Karten und unter den
nach oben gezogenen.

`Todo` bekommt das Feld `board_order: number`, `TodoRow` das optionale
`board_order?: number`. `fromRow` fällt auf `0` zurück — der
`localStorage`-Speicher liefert Einträge aus der Zeit vor der Spalte, genau wie
bei `description` und `status`.

## Die Positionsrechnung

`tauri-plugin-sql` kennt keine Transaktion über mehrere Aufrufe (siehe
AGENTS.md). Ein Drop darf deshalb **ein** UPDATE auslösen und nicht n — eine
Lane nach jedem Ziehen komplett neu durchzunummerieren wäre genau der Fall, den
ein abgebrochener Schreibvorgang halb erledigt zurücklässt.

Darum eine Bruchzahl zwischen den Nachbarn. In `src/types.ts`, weil die Regel
speicherunabhängig ist und in beiden Backends identisch gelten muss:

```ts
export function computeBoardOrder(before: number | null, after: number | null): number
```

- zwischen zwei Karten → `(before + after) / 2`
- an den Anfang (`before === null`) → `after - 1`
- ans Ende (`after === null`) → `before + 1`
- leere Lane (beide `null`) → `0`

Doubles halten etwa fünfzig Halbierungen an derselben Stelle aus. Unterschreitet
der Abstand `1e-6`, wird die Lane einmalig auf ganze Zahlen neu verteilt: eine
zweite Funktion `rebalanceBoardOrders(todos)` liefert die neuen Werte, die
Oberfläche schreibt sie nacheinander. Das ist der eine Pfad mit mehreren
Schreibvorgängen, und er ist bewusst nicht atomar — bricht er ab, steht die Lane
in einer Mischung aus alten und neuen Werten, die als Reihenfolge weiterhin
gültig ist und sich beim nächsten Ziehen selbst repariert. Der Fall tritt
praktisch nicht ein; wichtig ist, dass er nicht in einen ungültigen Zustand
führt.

## Store-Vertrag

Neu in `src/storeTypes.ts`, mit Doc-Kommentar als verbindlichem Vertrag, und in
beiden Implementierungen (`todoStoreSql.ts`, `todoStoreLocal.ts`) plus dem
Dispatcher `db.ts`:

```ts
/** Setzt nur die Position innerhalb der Lane; lehnt mit `Todo <id> not found` ab … */
updateTodoBoardOrder(id: number, order: number): Promise<Todo>;

/** Setzt Status und Position in einem Schreibvorgang; hält `done` konsistent zu `status` … */
updateTodoStatusAndOrder(id: number, status: TodoStatus, order: number): Promise<Todo>;
```

`updateTodoStatusAndOrder` ist kein Wrapper um `updateTodoStatus`, sondern ein
eigenes UPDATE über beide Spalten — das ist der ganze Punkt der Entscheidung
oben. `updateTodoStatus` bleibt bestehen: `toggleTodoDone` setzt den Status in
beiden Implementierungen darüber. Die Oberfläche ruft sie nach dieser Änderung
nicht mehr direkt — die Listenansicht geht über `toggleTodoDone`, die MCP-Seite
schreibt in Rust am Dispatcher vorbei. Die Fassade in `db.ts` bleibt trotzdem
stehen, damit `db.ts` den Store-Vertrag vollständig spiegelt; eine Lücke genau
bei einer Methode wäre die Abweichung, die später jemand übersieht.

`listTodos` behält seine Zusicherung "neueste zuerst". Die Brett-Reihenfolge
entsteht in der Ansicht, nicht im Speicher — wie schon heute.

## Oberfläche

Der Drop landet nicht mehr nur auf der Lane, sondern an einer Stelle in ihr.

- Jede Karte bekommt `onDragOver`: liegt der Zeiger über der oberen Hälfte des
  Rechtecks, wird vor der Karte eingefügt, sonst dahinter. Daraus folgt ein
  Zustand `dropTarget: { status: TodoStatus; index: number } | null`.
- Eine Einfügelinie (`kanban-drop-indicator`) zeigt die Stelle. Farbe als Token
  aus `STYLEGUIDE.md`, keine Verläufe.
- Ein Drop auf die Lane außerhalb jeder Karte hängt ans Ende, wie bisher.
- Aus dem Zielindex liest die Ansicht die Nachbarn und ruft `computeBoardOrder`.
  Die gezogene Karte selbst wird dabei aus der Nachbarschaftsrechnung
  ausgenommen, sonst verschiebt sich ein Ziehen um eine Position auf sich
  selbst.
- Gleiche Lane → `updateTodoBoardOrder`, andere Lane →
  `updateTodoStatusAndOrder`. Das Erledigt-Feuerwerk (`setBurstId`) bleibt an
  den Wechsel nach `done` gebunden, nicht an jedes Umsortieren innerhalb der
  Lane.
- Fällt die Rechnung unter die Rebalance-Schwelle, schreibt die Ansicht die
  neuen Werte der Lane nacheinander und aktualisiert den State danach in einem
  Zug.

## Tests

- `src/types.test.ts` — `computeBoardOrder` in allen vier Fällen, die
  Sortierfunktion der Lane inklusive Tie-Breaker bei `board_order === 0`,
  `rebalanceBoardOrders` und die Schwelle, ab der sie greift; `fromRow` mit
  fehlender Spalte.
- `src/todoStoreSql.test.ts` / `src/todoStoreLocal.test.ts` — beide neuen
  Store-Funktionen, inklusive der Ablehnung bei unbekannter Id und der
  `done`/`status`-Konsistenz bei `updateTodoStatusAndOrder`.
- `src/migrations.test.ts` — die neue Migrationszeile.
- `src/App.test.tsx` — Reihenfolge einer Lane, Drop zwischen zwei Karten
  innerhalb der Lane, Drop zwischen zwei Karten einer anderen Lane (Status
  **und** Position), kein Feuerwerk beim Umsortieren innerhalb `done`.
- `e2e/todolist.spec.ts` — ein echter Drag innerhalb einer Lane, der die
  Reihenfolge über einen Reload hinweg hält.
- `src/db.test.ts` — dass der Dispatcher die neuen Funktionen an das richtige
  Backend reicht.

## Was nicht dazugehört

- Keine Sortier-Umschaltung im Brett-Kopf. Die Fälligkeitsregel bleibt als
  Vorgabe wirksam, ein Schalter dafür ist ein eigener Wunsch.
- Kein Zugriff auf `board_order` über MCP. Die Position ist eine Geste der
  Oberfläche; ein Modell hat dafür keinen Anlass.
- Keine Sortierung in der Listenansicht. Dort gilt weiter "neueste zuerst".
