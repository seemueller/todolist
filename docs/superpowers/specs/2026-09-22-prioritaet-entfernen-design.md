# Die Priorität entfällt, die Kante zeigt den Typ

Datum: 2026-09-22

## Ziel

Die Priorität verschwindet vollständig aus Code und Oberfläche. Die farbige
Kante, die sie heute an Listenzeile und Kanban-Karte anzeigt, zeigt künftig den
**Typ** — `bug` rot, `task` blau, `story` grün, in den bereits vorhandenen
Token `--type-bug`, `--type-task`, `--type-story`.

Zwei Felder, die beide eine Rangfolge behaupten, sind eines zu viel. Der Typ
sagt, um welche Art Arbeit es geht; die Fälligkeit sagt, wann sie dran ist.
Eine dritte Achse „hoch/mittel/niedrig" hat in diesem Werkzeug niemandem
geholfen.

## Was verschwindet

Aus `src/types.ts`: `Priority`, das Feld `priority` auf `Todo` und `TodoRow`,
seine Zuweisung in `fromRow` und der Prioritätsblock in `sortBoardTodos`.

Aus dem Store: `updateTodoPriority` in `src/storeTypes.ts` und in beiden
Implementierungen, der Parameter von `addTodo`, das Feld in `TodoFieldsPatch`,
die Fassaden in `src/db.ts` und die Spalte in den `INSERT`-Anweisungen von
`src/todoStoreSql.ts` und `src/migrateLocalStorage.ts`.

Aus der Oberfläche: der Baustein `src/ui/PrioritySelect.tsx` samt seiner beiden
Exporte aus `src/ui/index.ts`, das Auswahlfeld im Hinzufügen-Formular, das
Inline-Feld in der Listenzeile, das Feld im Detailfenster und der Zustand
`newPriority` samt seinem Zurücksetzen.

Aus `src/App.css`: die Token `--prio-high`, `--prio-medium`, `--prio-low`, die
Klassen `.todo-list li.priority-*` und `.kanban-card.priority-*` sowie die
Regeln für `.priority-select` und `.priority-select-inline`.

Aus `src-tauri/src/mcp/`: `PRIORITIES`, `check_priority`, das Feld `priority`
auf `Todo`, `TodoRow` und `TodoUpdate`, `t.priority` in `TODO_COLUMNS`, der
Parameter von `add_todo`, die Behandlung in `update_todo` und die Felder auf
`AddTodo` und `UpdateTodo`.

### Die Datenbankspalte bleibt

**Keine Migration.** Die Spalte `priority` bleibt in `todos` stehen. Sie ist
`NOT NULL DEFAULT 'medium'`, die `INSERT`-Anweisungen nennen sie nicht mehr,
also füllt SQLite sie selbst. Kein Lesepfad sieht sie noch an.

Der Grund ist Umkehrbarkeit: ein `DROP COLUMN` wäre unwiderruflich, und wer
die App eine Version zurückrollt, hätte die Prioritäten aller Aufgaben
verloren. Eine tote Spalte kostet nichts. Sie verschwindet, wenn jemand die
Entscheidung später als endgültig ansieht — dann in einer eigenen Migration,
nicht in dieser Arbeit.

Im localStorage-Speicher gilt dasselbe: `priority` bleibt in alten Einträgen
liegen und wird beim Lesen ignoriert. `migrateTodos` holt sie nicht auf.

## Die Kante

Dieselben zwei Stellen, dieselben Maße, andere Farbquelle:

| Ort | Eigenschaft | vorher | nachher |
|---|---|---|---|
| Listenzeile | `border-left-color`, Breite `--edge` (12 px) | `--prio-*` | `--type-*` |
| Kanban-Karte | `border-top-color` | `--prio-*` | `--type-*` |

Die Klassen heißen `type-bug`, `type-task`, `type-story` und sitzen dort, wo
heute `priority-high` und Geschwister sitzen: am `li` der Liste und an
`.kanban-card`.

**Das `TypeBadge` bleibt.** Die Kante trägt die Farbe, das Badge den Namen.
Farbe allein ist keine Information für jemanden, der sie nicht unterscheiden
kann, und die E2E-Tests greifen auf die Beschriftung zu. Damit ist der Typ
zweifach codiert — das ist Absicht, nicht Doppelung.

Die drei Token stehen bereits im `:root`-Block; es kommt keine Farbe hinzu.

## Sortierung

`sortBoardTodos` verliert den Prioritätsblock ersatzlos. Die Reihenfolge einer
Brett-Spalte wird:

```
board_order  →  due_date  →  created_at
```

Kein Ersatz-Tie-Breaker über den Typ: eine Story ist nicht grundsätzlich
weniger dringend als ein Bug, und eine erfundene Rangfolge wäre schwerer zu
erklären als gar keine. Der Doc-Kommentar der Funktion wird mitgezogen — er
nennt die Priorität heute ausdrücklich.

## MCP

Der Schnitt ist vollständig: `priority` verschwindet aus `list_todos`,
`add_todo` und `update_todo`. Ein Aufruf, der das Feld mitschickt, wird vom
Schema abgelehnt.

Das ist die ehrlichere Fassung. Das Feld im Schema zu lassen und den Wert zu
verwerfen wäre genau das Muster, das AGENTS.md als teuersten Irrtum beschreibt:
ein Modell glaubt, es habe etwas gesetzt, und nichts widerspricht ihm.

Die Tool-Beschreibungen verlieren ihre Erwähnung der Vorgabe `"medium"`. Die
Zahl der Tools bleibt sieben.

## Tests

| Datei | Was sich ändert |
|---|---|
| `src/types.test.ts` | Fälle zu `Priority` und zur Prioritätsstufe in `sortBoardTodos` entfallen; die Fixtures verlieren das Feld |
| `src/todoStoreLocal.test.ts`, `src/todoStoreSql.test.ts` | Fälle zu `updateTodoPriority` entfallen; `addTodo`-Aufrufe verlieren den Parameter; der `INSERT`-Test nennt die Spalte nicht mehr |
| `src/migrateLocalStorage.test.ts` | die Spalte fällt aus dem erwarteten `INSERT`, die Parameter-Indizes verschieben sich |
| `src/App.test.tsx` | Fälle zum Auswahlfeld und zum Ändern in der Zeile entfallen; die Zeile trägt jetzt `type-bug` statt `priority-high` |
| `src/TodoDetailModal.test.tsx` | der Fall zum Prioritätsfeld entfällt |
| `src/TrashModal.test.tsx` | Fixtures verlieren das Feld |
| `src-tauri/src/mcp/` | Fälle zu unbekannter Priorität entfallen; alle `add_todo`-Aufrufe und `AddTodo`-Literale verlieren ein Argument |
| `e2e/todolist.spec.ts` | „can set priority when adding a todo" entfällt ersatzlos; Selektoren auf `.priority-*` ziehen auf `.type-*` |

`src/ui/PrioritySelect.tsx` wird gelöscht und hatte nie einen eigenen Test.

Vor dem Merge nach `main`:

```bash
npm run typecheck && npm run lint && npm test
npm run test:rust && npm run lint:rust
npm run test:e2e
```

## Dokumentation

- `AGENTS.md`: Erwähnungen der Priorität in der MCP-Beschreibung und in der
  Test-Datei-Liste.
- `STYLEGUIDE.md`: die Token-Tabelle „Prioritäten" entfällt, der Katalogeintrag
  `PrioritySelect` ebenso; bei `--edge` steht künftig der Typ als Kantenfarbe.
- `CHANGELOG.md` und `src/version.ts`: ein Eintrag, der beides nennt — das
  entfallene Feld und die neue Bedeutung der Kante.

## Bewusst nicht enthalten

- Kein `DROP COLUMN`, weder in SQLite noch im localStorage-Bestand.
- Kein Ersatzfeld für Dringlichkeit; die Fälligkeit trägt das allein.
- Kein Umbau der Fälligkeits- oder Statusfilter.
- Keine Änderung am `TypeBadge` oder an der Typleiste.
