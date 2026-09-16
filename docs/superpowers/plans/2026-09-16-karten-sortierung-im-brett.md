# Karten im Brett sortieren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karten im Kanban-Brett lassen sich innerhalb einer Swimlane per Drag an eine beliebige Stelle ziehen, und die Reihenfolge überlebt einen Neustart.

**Architecture:** Eine neue Spalte `board_order REAL NOT NULL DEFAULT 0` an `todos` trägt die Position. Der Wert wird als Bruchzahl zwischen den beiden Nachbarn berechnet (fractional index), damit ein Drop genau ein UPDATE auslöst — `tauri-plugin-sql` kennt keine Transaktion über mehrere Aufrufe. Die Rechenregeln liegen speicherunabhängig in `src/types.ts`, die Schreibpfade als zwei neue Store-Funktionen in beiden Backends.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library, Playwright (E2E), Tauri 2 mit `tauri-plugin-sql` (SQLite), `localStorage` als zweites Backend.

**Spec:** `docs/superpowers/specs/2026-09-16-karten-sortierung-im-brett-design.md`

---

## Dateiübersicht

| Datei | Rolle in diesem Vorhaben |
|-------|--------------------------|
| `src/types.ts` | `board_order` an `Todo`/`TodoRow`, `fromRow`-Rückfall, `computeBoardOrder`, `sortBoardTodos`, `needsRebalance`, `rebalanceBoardOrders` |
| `src/types.test.ts` | Tests der obigen reinen Funktionen |
| `src-tauri/src/lib.rs` | Migration 13 |
| `src/migrations.test.ts` | Wächter über die Migrationsliste |
| `src/storeTypes.ts` | Vertrag für `updateTodoBoardOrder` und `updateTodoStatusAndOrder` |
| `src/todoStoreSql.ts` / `.test.ts` | SQLite-Umsetzung |
| `src/todoStoreLocal.ts` / `.test.ts` | localStorage-Umsetzung |
| `src/db.ts` / `src/db.test.ts` | Dispatcher |
| `src/App.tsx` | Lane-Sortierung, Drop-Ziel, Einfügelinie, Schreibpfade |
| `src/App.css` | `.kanban-drop-indicator` |
| `src/App.test.tsx` | Komponententests der Brett-Interaktion |
| `e2e/todolist.spec.ts` | Echter Drag über den Browser |
| `CHANGELOG.md` | Eintrag unter „Unveröffentlicht" |

Reihenfolge der Tasks: reine Regeln → Speicher → Oberfläche. Jeder Task endet mit grünen Tests und einem Commit.

---

### Task 1: Positionsregeln in `types.ts`

**Files:**
- Modify: `src/types.ts`
- Test: `src/types.test.ts`

- [ ] **Step 1: Write the failing tests**

An das Ende von `src/types.test.ts` anhängen (die Datei nutzt `describe`/`it`/`expect` aus `vitest`, die Importzeile steht schon oben; `computeBoardOrder`, `needsRebalance`, `rebalanceBoardOrders`, `sortBoardTodos` und `Todo` dem bestehenden Import aus `./types` hinzufügen):

```ts
describe("computeBoardOrder", () => {
  it("puts a card between its two neighbours", () => {
    expect(computeBoardOrder(2, 4)).toBe(3);
  });

  it("puts a card dropped at the top below nothing", () => {
    expect(computeBoardOrder(null, 4)).toBe(3);
  });

  it("puts a card dropped at the bottom above nothing", () => {
    expect(computeBoardOrder(2, null)).toBe(3);
  });

  it("starts an empty lane at zero", () => {
    expect(computeBoardOrder(null, null)).toBe(0);
  });

  it("keeps splitting equal neighbours apart", () => {
    // Zwei Karten mit demselben Wert -- der Normalfall, solange niemand
    // gezogen hat: DEFAULT 0. Der Drop dazwischen muss trotzdem einen Wert
    // liefern, der strikt zwischen beiden liegt, sonst haengt die Reihenfolge
    // am Tie-Breaker statt am Ziehen.
    expect(computeBoardOrder(0, 0)).toBe(0);
    expect(needsRebalance(0, 0)).toBe(true);
  });
});

describe("needsRebalance", () => {
  it("is false for neighbours far enough apart", () => {
    expect(needsRebalance(1, 2)).toBe(false);
  });

  it("is false at the ends of a lane", () => {
    expect(needsRebalance(null, 1)).toBe(false);
    expect(needsRebalance(1, null)).toBe(false);
    expect(needsRebalance(null, null)).toBe(false);
  });

  it("is true once the gap falls below the threshold", () => {
    expect(needsRebalance(1, 1 + 1e-7)).toBe(true);
  });
});

describe("rebalanceBoardOrders", () => {
  it("numbers the lane in its current order", () => {
    const lane = [
      { id: 5, board_order: 0 },
      { id: 6, board_order: 0 },
      { id: 7, board_order: 0.5 },
    ];
    expect(rebalanceBoardOrders(lane)).toEqual([
      { id: 5, board_order: 0 },
      { id: 6, board_order: 1 },
      { id: 7, board_order: 2 },
    ]);
  });
});

describe("sortBoardTodos", () => {
  const card = (over: Partial<Todo>): Todo => ({
    id: 1,
    title: "T",
    description: "",
    done: false,
    status: "todo",
    priority: "medium",
    created_at: "2026-01-01T00:00:00.000Z",
    due_date: null,
    category_id: null,
    category_name: null,
    category_color: null,
    board_order: 0,
    ...over,
  });

  it("sorts by board_order, smallest first", () => {
    const sorted = sortBoardTodos([
      card({ id: 1, board_order: 2 }),
      card({ id: 2, board_order: -1 }),
      card({ id: 3, board_order: 0.5 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("falls back to the due date rule when the position is equal", () => {
    const sorted = sortBoardTodos([
      card({ id: 1, title: "Ohne Datum", priority: "high" }),
      card({ id: 2, title: "Spaet", due_date: "2026-12-01" }),
      card({ id: 3, title: "Frueh", due_date: "2026-01-15", priority: "low" }),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(["Frueh", "Spaet", "Ohne Datum"]);
  });

  it("lets a dragged card beat the due date rule", () => {
    const sorted = sortBoardTodos([
      card({ id: 1, title: "Frueh", due_date: "2026-01-15" }),
      card({ id: 2, title: "Hochgezogen", due_date: "2026-12-01", board_order: -1 }),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(["Hochgezogen", "Frueh"]);
  });

  it("does not sort the array it was given", () => {
    const lane = [card({ id: 1, board_order: 2 }), card({ id: 2, board_order: 1 })];
    sortBoardTodos(lane);
    expect(lane.map((t) => t.id)).toEqual([1, 2]);
  });
});

// Dieser Fall gehoert in den bestehenden describe("fromRow", ...)-Block
// (src/types.test.ts:20), nicht in einen zweiten daneben:
  it("defaults board_order to zero for rows written before the column", () => {
    const todo = fromRow({
      id: 1,
      title: "Alt",
      done: 0,
      priority: "medium",
      created_at: "2026-01-01T00:00:00.000Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    });
    expect(todo.board_order).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/types.test.ts`
Expected: FAIL — `computeBoardOrder is not defined` bzw. `board_order` fehlt am Typ.

- [ ] **Step 3: Write the implementation**

In `src/types.ts`: `Todo` um das Feld erweitern (hinter `category_color`):

```ts
  /** Platz der Karte in ihrer Brett-Spalte; kleiner Wert heisst weiter oben.
   *  0 heisst "noch nie gezogen" -- alle unberuehrten Karten teilen sich den
   *  Wert und sortieren sich untereinander nach der Faelligkeitsregel. */
  board_order: number;
```

`TodoRow` um `board_order?: number;` erweitern (optional, weil der
localStorage-Speicher Eintraege aus der Zeit vor der Spalte liefert).

In `fromRow` hinter `category_color: row.category_color,` ergänzen:

```ts
    board_order: row.board_order ?? 0,
```

Und ans Ende der Datei:

```ts
/**
 * Ab welchem Abstand zweier Nachbarn eine Bruchzahl dazwischen nicht mehr
 * verlaesslich ist. Doubles halten rund fuenfzig Halbierungen an derselben
 * Stelle aus; diese Schwelle greift lange davor.
 */
const BOARD_ORDER_EPSILON = 1e-6;

/**
 * Der Platz, den eine Karte zwischen ihren beiden kuenftigen Nachbarn bekommt.
 * `null` heisst "kein Nachbar auf dieser Seite", also Anfang bzw. Ende der
 * Spalte.
 *
 * Eine Bruchzahl statt einer Durchnummerierung, weil ein Drop genau ein UPDATE
 * ausloesen darf: `tauri-plugin-sql` kennt keine Transaktion ueber mehrere
 * Aufrufe (siehe AGENTS.md), eine halb geschriebene Neunummerierung liesse die
 * Spalte in einem Zustand zurueck, den niemand gewollt hat.
 *
 * Liegen beide Nachbarn zu dicht beieinander, liefert das Ergebnis keine echte
 * Trennung mehr -- dafuer fragt der Aufrufer vorher `needsRebalance`.
 */
export function computeBoardOrder(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/**
 * Ob zwischen diese beiden Nachbarn keine Bruchzahl mehr passt, die Ziehende
 * als Reihenfolge wahrnehmen. Trifft vor allem den Alltagsfall zweier noch nie
 * gezogener Karten (beide 0) und -- theoretisch -- viele Drops auf dieselbe
 * Stelle. Der Aufrufer verteilt die Spalte dann einmal neu.
 */
export function needsRebalance(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false;
  return Math.abs(after - before) < BOARD_ORDER_EPSILON;
}

/**
 * Die Spalte neu durchnummeriert, in genau der Reihenfolge, in der sie
 * hereingereicht wurde: 0, 1, 2, ... Der Aufrufer schreibt die Werte
 * anschliessend einzeln.
 */
export function rebalanceBoardOrders<T extends { id: number; board_order: number }>(
  lane: T[]
): { id: number; board_order: number }[] {
  return lane.map((todo, index) => ({ id: todo.id, board_order: index }));
}

/**
 * Die Reihenfolge einer Brett-Spalte: erst der gezogene Platz, dann -- bei
 * Gleichstand -- die Faelligkeit, die Prioritaet und zuletzt das Alter.
 *
 * Der Tie-Breaker ist kein Beiwerk: solange niemand gezogen hat, stehen alle
 * Karten auf 0, und dann ist er die ganze Sortierung.
 *
 * Sortiert auf einer Kopie: die Aufrufer reichen React-State herein.
 */
export function sortBoardTodos(todos: Todo[]): Todo[] {
  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return todos.slice().sort((a, b) => {
    if (a.board_order !== b.board_order) return a.board_order - b.board_order;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.created_at.localeCompare(a.created_at);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/types.test.ts`
Expected: PASS. `npm run typecheck` schlägt jetzt an anderen Stellen fehl (`board_order` fehlt in Stores und Tests) — das ist erwartet und wird in Task 2–4 behoben.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "feat: add the board position rules to types"
```

---

### Task 2: Migration 13

**Files:**
- Modify: `src-tauri/src/lib.rs:386-391` (hinter Migration 12, vor dem schliessenden `];`)
- Test: `src/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

An das Ende des `describe("sql migrations", ...)`-Blocks in `src/migrations.test.ts`:

```ts
  it("gives todos a board_order column defaulting to zero", () => {
    expect(source).toContain("add_board_order_to_todos");
    expect(source).toContain(
      "ALTER TABLE todos ADD COLUMN board_order REAL NOT NULL DEFAULT 0;"
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/migrations.test.ts`
Expected: FAIL — der String steht nicht in `lib.rs`.

- [ ] **Step 3: Write the implementation**

In `src-tauri/src/lib.rs` hinter der Migration mit `version: 12` einfügen:

```rust
        // Alle bestehenden Aufgaben starten auf 0 und sortieren sich damit
        // weiter nach der Faelligkeitsregel. Bewusst keine Vorab-Nummerierung
        // per ROW_NUMBER: die Reihenfolge waere dieselbe, aber jede Aufgabe
        // haette einen eingefrorenen Platz, den niemand gesetzt hat.
        Migration {
            version: 13,
            description: "add_board_order_to_todos",
            sql: "ALTER TABLE todos ADD COLUMN board_order REAL NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/migrations.test.ts && npm run test:rust && npm run lint:rust`
Expected: PASS, PASS, keine Clippy-Warnung.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src/migrations.test.ts
git commit -m "feat: add the board_order column"
```

---

### Task 3: SQLite-Backend

**Files:**
- Modify: `src/storeTypes.ts` (im `TodoStore`-Interface, hinter `updateTodoStatus`)
- Modify: `src/todoStoreSql.ts` (`TODO_COLUMNS`, neue Funktionen, Export-Objekt)
- Test: `src/todoStoreSql.test.ts`

- [ ] **Step 1: Write the failing tests**

An das Ende des `describe("sqlTodoStore", ...)`-Blocks in `src/todoStoreSql.test.ts`:

```ts
  it("reads the board position back with the row", async () => {
    select.mockResolvedValue([{ ...ROW, board_order: 2.5 }]);
    const todos = await sqlTodoStore.listTodos();

    expect(select.mock.calls[0][0]).toContain("t.board_order");
    expect(todos[0].board_order).toBe(2.5);
  });

  it("writes only the board position when a card moves inside its lane", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([{ ...ROW, board_order: 1.5 }]);

    const updated = await sqlTodoStore.updateTodoBoardOrder(7, 1.5);

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("UPDATE todos SET board_order = $1 WHERE id = $2");
    expect(sql).toContain("deleted_at IS NULL");
    expect(params).toEqual([1.5, 7]);
    expect(updated.board_order).toBe(1.5);
  });

  it("writes status, done and position in a single statement", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([{ ...ROW, status: "done", done: 1, board_order: 3 }]);

    const updated = await sqlTodoStore.updateTodoStatusAndOrder(7, "done", 3);

    const [sql, params] = execute.mock.calls[0];
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sql).toContain("SET status = $1, done = $2, board_order = $3");
    expect(params).toEqual(["done", 1, 3, 7]);
    expect(updated.done).toBe(true);
  });

  it("rejects an unknown id on both new writes", async () => {
    execute.mockResolvedValue({ rowsAffected: 0 });
    select.mockResolvedValue([]);

    await expect(sqlTodoStore.updateTodoBoardOrder(99, 1)).rejects.toThrow("Todo 99 not found");
    await expect(sqlTodoStore.updateTodoStatusAndOrder(99, "todo", 1)).rejects.toThrow(
      "Todo 99 not found"
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/todoStoreSql.test.ts`
Expected: FAIL — `sqlTodoStore.updateTodoBoardOrder is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/storeTypes.ts` hinter der Zeile mit `updateTodoStatus(...)`:

```ts
  /**
   * Setzt nur den Platz der Karte in ihrer Brett-Spalte. Kleiner Wert heisst
   * weiter oben; den Wert selbst rechnet `computeBoardOrder` in types.ts aus.
   * Lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo
   * referenziert — als Promise-Rejection, nie als synchroner throw.
   */
  updateTodoBoardOrder(id: number, order: number): Promise<Todo>;
  /**
   * Setzt Status und Platz in einem Schreibvorgang -- was ein Zug in eine
   * andere Spalte des Bretts ist. Kein Wrapper um `updateTodoStatus`: zwei
   * getrennte Schreibvorgaenge liessen die Karte sichtbar an der falschen
   * Stelle aufblitzen, und ein Fehler dazwischen liesse sie halb verschoben
   * zurueck. Haelt `done` konsistent zu `status` ("done" <=> done === true);
   * lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo
   * referenziert — als Promise-Rejection, nie als synchroner throw.
   */
  updateTodoStatusAndOrder(id: number, status: TodoStatus, order: number): Promise<Todo>;
```

In `src/todoStoreSql.ts` die Spaltenliste erweitern:

```ts
const TODO_COLUMNS = `
  t.id, t.title, t.description, t.done, t.status, t.priority, t.created_at,
  t.due_date, t.category_id, t.board_order,
  c.name AS category_name, c.color AS category_color
`;
```

Hinter `updateTodoStatus` einfügen:

```ts
function updateTodoBoardOrder(id: number, order: number): Promise<Todo> {
  return updateColumn(id, "UPDATE todos SET board_order = $1 WHERE id = $2", [order]);
}

// Ein einziges UPDATE ueber beide Spalten, aus demselben Grund wie bei
// updateTodoFields: der Pool kann zwischen zwei Aufrufen die Verbindung
// wechseln, zwei Anweisungen waeren also keine Transaktion.
function updateTodoStatusAndOrder(
  id: number,
  status: TodoStatus,
  order: number
): Promise<Todo> {
  return updateColumn(
    id,
    "UPDATE todos SET status = $1, done = $2, board_order = $3 WHERE id = $4",
    [status, status === "done" ? 1 : 0, order]
  );
}
```

Und beide im Export-Objekt `sqlTodoStore` hinter `updateTodoStatus,` eintragen:

```ts
  updateTodoBoardOrder,
  updateTodoStatusAndOrder,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/todoStoreSql.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storeTypes.ts src/todoStoreSql.ts src/todoStoreSql.test.ts
git commit -m "feat: store the board position in sqlite"
```

---

### Task 4: localStorage-Backend und Dispatcher

**Files:**
- Modify: `src/todoStoreLocal.ts` (`migrateTodos`, `addTodo`, neue Funktionen, Export-Objekt)
- Modify: `src/db.ts`
- Test: `src/todoStoreLocal.test.ts`, `src/db.test.ts`

- [ ] **Step 1: Write the failing tests**

An das Ende des `describe("localTodoStore", ...)`-Blocks in `src/todoStoreLocal.test.ts`:

```ts
  it("starts a new todo at position zero", async () => {
    const created = await localTodoStore.addTodo("Schreiben", "high", null, null);
    expect(created.board_order).toBe(0);
  });

  it("defaults the position of entries written before the column", async () => {
    localStorage.setItem(
      "todolist_todos",
      JSON.stringify([
        {
          id: 1,
          title: "Alt",
          done: false,
          status: "todo",
          priority: "medium",
          created_at: "2026-01-01T00:00:00.000Z",
          due_date: null,
          category_id: null,
          category_name: null,
          category_color: null,
        },
      ])
    );

    const [todo] = await localTodoStore.listTodos();
    expect(todo.board_order).toBe(0);
  });

  it("moves a card inside its lane without touching the status", async () => {
    const created = await localTodoStore.addTodo("Schreiben", "high", null, null);
    const moved = await localTodoStore.updateTodoBoardOrder(created.id, -1.5);

    expect(moved.board_order).toBe(-1.5);
    expect(moved.status).toBe("todo");

    const [reloaded] = await localTodoStore.listTodos();
    expect(reloaded.board_order).toBe(-1.5);
  });

  it("sets status, done and position together", async () => {
    const created = await localTodoStore.addTodo("Schreiben", "high", null, null);
    const moved = await localTodoStore.updateTodoStatusAndOrder(created.id, "done", 2);

    expect(moved.status).toBe("done");
    expect(moved.done).toBe(true);
    expect(moved.board_order).toBe(2);
  });

  it("rejects an unknown id on both new writes", async () => {
    await expect(localTodoStore.updateTodoBoardOrder(99, 1)).rejects.toThrow("Todo 99 not found");
    await expect(localTodoStore.updateTodoStatusAndOrder(99, "todo", 1)).rejects.toThrow(
      "Todo 99 not found"
    );
  });
```

In `src/db.test.ts` prüft die Suite, welches Backend der Dispatcher wählt. Die dortige Struktur übernehmen und einen Fall für die neuen Funktionen ergänzen — die Datei zuerst lesen, dann nach ihrem Muster ergänzen:

```ts
  it("reicht updateTodoBoardOrder an das aktive Backend weiter", async () => {
    await db.updateTodoBoardOrder(1, 2.5);
    // Erwartung nach dem Muster der bestehenden Faelle in dieser Datei:
    // das gemockte Backend hat den Aufruf mit (1, 2.5) gesehen.
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/todoStoreLocal.test.ts src/db.test.ts`
Expected: FAIL — `localTodoStore.updateTodoBoardOrder is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/todoStoreLocal.ts`:

`StoredTodo` kennt jetzt ein weiteres fehlendes Feld:

```ts
type StoredTodo = Omit<StoredTodoRecord, "status" | "description" | "board_order"> &
  Partial<Pick<StoredTodoRecord, "status" | "description" | "board_order">>;
```

`migrateTodos` setzt den Rückfall — dieselbe Rolle, die in SQLite der Spaltenvorgabewert hat:

```ts
function migrateTodos(todos: StoredTodo[]): StoredTodoRecord[] {
  return todos.map((todo) => {
    const description = todo.description ?? "";
    const board_order = todo.board_order ?? 0;
    if (todo.status) return { ...todo, description, board_order, status: todo.status };
    const status: TodoStatus = todo.done ? "done" : "todo";
    return { ...todo, description, board_order, status, done: status === "done" };
  });
}
```

In `addTodo` das neue Feld im Objektliteral hinter `category_color` ergänzen:

```ts
    board_order: 0,
```

Hinter `updateTodoStatus` einfügen:

```ts
async function updateTodoBoardOrder(id: number, order: number): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], board_order: order };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

async function updateTodoStatusAndOrder(
  id: number,
  status: TodoStatus,
  order: number
): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], status, done: status === "done", board_order: order };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}
```

Beide im Export-Objekt `localTodoStore` hinter `updateTodoStatus,` eintragen.

In `src/db.ts` hinter `updateTodoStatus`:

```ts
export function updateTodoBoardOrder(id: number, order: number): Promise<Todo> {
  return store().updateTodoBoardOrder(id, order);
}

export function updateTodoStatusAndOrder(
  id: number,
  status: TodoStatus,
  order: number
): Promise<Todo> {
  return store().updateTodoStatusAndOrder(id, status, order);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/todoStoreLocal.test.ts src/db.test.ts && npm run typecheck`
Expected: Tests PASS. `typecheck` meldet jetzt höchstens noch Stellen in `src/App.tsx` und `src/App.test.tsx` (fehlendes `board_order` in Test-Fixtures) — die kommen in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/todoStoreLocal.ts src/todoStoreLocal.test.ts src/db.ts src/db.test.ts
git commit -m "feat: store the board position in localStorage"
```

---

### Task 5: Sortierung der Lane in der Oberfläche

**Files:**
- Modify: `src/App.tsx:936-949` (die Inline-Sortierung der Lane)
- Test: `src/App.test.tsx`

Dieser Task tauscht nur die Sortierung aus, ohne Interaktion. Er hält die Suite grün, bevor Task 6 die Drag-Logik anfasst.

- [ ] **Step 1: Write the failing test**

In `src/App.test.tsx` zuerst `todoBase` (Zeile 76) um das neue Feld ergänzen, sonst fehlt es allen Fixtures:

```ts
const todoBase = { description: "", priority: "medium" as const, due_date: null, category_id: null as number | null, category_name: null as string | null, category_color: null as string | null, status: "todo" as const, board_order: 0 };
```

Dann hinter dem bestehenden Test `"sorts the kanban cards by due date, the furthest in the future at the bottom"`:

```ts
  it("puts a dragged card where it was dropped, ahead of the due date rule", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 1, title: "Frueh", due_date: "2026-01-15" }),
      makeTodo({ id: 2, title: "Hochgezogen", due_date: "2026-12-01", board_order: -1 }),
      makeTodo({ id: 3, title: "Runtergezogen", due_date: "2026-01-01", board_order: 5 }),
    ]);

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText("Frueh")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

    await waitFor(() => {
      const titles = Array.from(
        container.querySelectorAll<HTMLElement>(".kanban-card-title")
      ).map((el) => el.textContent);
      expect(titles).toEqual(["Hochgezogen", "Frueh", "Runtergezogen"]);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "ahead of the due date rule"`
Expected: FAIL — die Reihenfolge ist `["Runtergezogen", "Frueh", "Hochgezogen"]`, weil `board_order` noch nicht sortiert.

- [ ] **Step 3: Write the implementation**

In `src/App.tsx` den Import aus `./types` um `sortBoardTodos` erweitern und die Inline-Sortierung (Zeilen 936-949) ersetzen durch:

```tsx
              const laneTodos = sortBoardTodos(
                boardTodos.filter((t) => t.status === lane.status)
              );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/App.test.tsx && npm run typecheck`
Expected: PASS, keine Typfehler mehr im ganzen Projekt.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: sort board lanes by the stored position"
```

---

### Task 6: Drop-Ziel innerhalb der Lane

**Files:**
- Modify: `src/App.tsx` (Zustand bei `src/App.tsx:190-191`, Drag-Block ab `src/App.tsx:452`, Lane- und Karten-Markup ab `src/App.tsx:951`)
- Modify: `src/App.css` (hinter `.kanban-card`, etwa `src/App.css:1449`)
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/App.test.tsx` das `db`-Mock (Zeilen 46-65) um die beiden neuen Funktionen ergänzen:

```ts
  updateTodoBoardOrder: vi.fn(),
  updateTodoStatusAndOrder: vi.fn(),
```

Dann hinter dem Test aus Task 5:

```ts
  /** Ein DataTransfer-Ersatz: jsdom bringt keinen mit. */
  function makeDataTransfer() {
    let payload = "";
    return {
      effectAllowed: "",
      dropEffect: "",
      setData: (_type: string, value: string) => {
        payload = value;
      },
      getData: () => payload,
    };
  }

  /** Gibt der Karte eine Hoehe, damit die Mitte-Berechnung etwas zu rechnen hat. */
  function stubRect(card: HTMLElement) {
    card.getBoundingClientRect = () =>
      ({ top: 0, height: 100, bottom: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  }

  async function renderBoard(todos: ReturnType<typeof makeTodo>[]) {
    vi.mocked(db.listTodos).mockResolvedValue(todos);
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText(todos[0].title)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));
    await waitFor(() => {
      expect(container.querySelectorAll(".kanban-card").length).toBe(todos.length);
    });
    return container;
  }

  it("moves a card above its neighbour inside the lane", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockResolvedValue(
      makeTodo({ id: 2, title: "Zweite", board_order: -1 }),
    );

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(first);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(second, { dataTransfer });
    // Obere Haelfte der ersten Karte: davor einfuegen.
    fireEvent.dragOver(first, { dataTransfer, clientY: 10 });
    fireEvent.drop(first, { dataTransfer, clientY: 10 });

    await waitFor(() => {
      expect(db.updateTodoBoardOrder).toHaveBeenCalledWith(2, -1);
    });
    expect(db.updateTodoStatusAndOrder).not.toHaveBeenCalled();
  });

  it("moves a card below its neighbour inside the lane", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockResolvedValue(
      makeTodo({ id: 1, title: "Erste", board_order: 2 }),
    );

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(second);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(first, { dataTransfer });
    // Untere Haelfte der zweiten Karte: dahinter einfuegen.
    fireEvent.dragOver(second, { dataTransfer, clientY: 90 });
    fireEvent.drop(second, { dataTransfer, clientY: 90 });

    await waitFor(() => {
      expect(db.updateTodoBoardOrder).toHaveBeenCalledWith(1, 2);
    });
  });

  it("sets status and position in one write when the card changes lane", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Laeuft", status: "in_progress", board_order: 0 }),
      makeTodo({ id: 2, title: "Offen", status: "todo", board_order: 0 }),
    ]);
    vi.mocked(db.updateTodoStatusAndOrder).mockResolvedValue(
      makeTodo({ id: 2, title: "Offen", status: "in_progress", board_order: -1 }),
    );

    const cards = container.querySelectorAll<HTMLElement>(".kanban-card");
    const running = Array.from(cards).find((c) => c.textContent?.includes("Laeuft")) as HTMLElement;
    const open = Array.from(cards).find((c) => c.textContent?.includes("Offen")) as HTMLElement;
    stubRect(running);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(open, { dataTransfer });
    fireEvent.dragOver(running, { dataTransfer, clientY: 10 });
    fireEvent.drop(running, { dataTransfer, clientY: 10 });

    await waitFor(() => {
      expect(db.updateTodoStatusAndOrder).toHaveBeenCalledWith(2, "in_progress", -1);
    });
    expect(db.updateTodoStatus).not.toHaveBeenCalled();
  });

  it("shows an insertion line while dragging over a card", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(first);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(second, { dataTransfer });
    fireEvent.dragOver(first, { dataTransfer, clientY: 10 });

    await waitFor(() => {
      expect(container.querySelector(".kanban-drop-indicator")).not.toBeNull();
    });
  });

  it("renumbers the lane when two neighbours sit on the same position", async () => {
    // Beide Karten stehen auf 0 -- der Normalfall, solange niemand gezogen
    // hat. Zwischen ihnen ist kein Platz, also wird die Spalte neu verteilt.
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0, due_date: "2026-01-01" }),
      makeTodo({ id: 2, title: "Zweite", board_order: 0, due_date: "2026-02-01" }),
      makeTodo({ id: 3, title: "Dritte", board_order: 0, due_date: "2026-03-01" }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockImplementation((id, order) =>
      Promise.resolve(makeTodo({ id, title: `#${id}`, board_order: order })),
    );

    const cards = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(cards[1]);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(cards[2], { dataTransfer });
    fireEvent.dragOver(cards[1], { dataTransfer, clientY: 10 });
    fireEvent.drop(cards[1], { dataTransfer, clientY: 10 });

    await waitFor(() => {
      // Jede Karte der Spalte bekommt einen eigenen Wert, die gezogene den
      // Platz, auf den sie gezogen wurde.
      expect(vi.mocked(db.updateTodoBoardOrder).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("keeps a reorder inside the done lane a plain position write", async () => {
    // Das Feuerwerk (`burstId`/`.done-flash`) zeichnet nur die Listenansicht;
    // im Brett ist es nicht sichtbar. Pruefbar ist deshalb der Schreibpfad:
    // eine Karte, die "erledigt" bleibt, darf keinen Status-Schreibvorgang
    // ausloesen.
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Fertig A", status: "done", done: true, board_order: 0 }),
      makeTodo({ id: 2, title: "Fertig B", status: "done", done: true, board_order: 1 }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockResolvedValue(
      makeTodo({ id: 2, title: "Fertig B", status: "done", done: true, board_order: -1 }),
    );

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(first);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(second, { dataTransfer });
    fireEvent.dragOver(first, { dataTransfer, clientY: 10 });
    fireEvent.drop(first, { dataTransfer, clientY: 10 });

    await waitFor(() => expect(db.updateTodoBoardOrder).toHaveBeenCalledWith(2, -1));
    expect(db.updateTodoStatusAndOrder).not.toHaveBeenCalled();
    expect(db.updateTodoStatus).not.toHaveBeenCalled();
  });
```

`setBurstId` bleibt im Code an den Wechsel nach `done` gebunden (siehe `moveCard` unten), auch wenn nur die Listenansicht das Aufblitzen zeichnet (`src/App.tsx:879`, `.done-flash`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — `db.updateTodoBoardOrder` wird nie aufgerufen, `.kanban-drop-indicator` gibt es nicht.

- [ ] **Step 3: Write the implementation**

In `src/App.tsx` den Import aus `./types` um `computeBoardOrder`, `needsRebalance` und `rebalanceBoardOrders` erweitern und aus `./db` um `updateTodoBoardOrder` und `updateTodoStatusAndOrder`.

Zustand (bei `src/App.tsx:191`) ersetzen/ergänzen:

```tsx
  const [dragOverLane, setDragOverLane] = useState<TodoStatus | null>(null);
  /** Wohin der laufende Zug einfuegt: Spalte und Index in der sortierten Spalte. */
  const [dropTarget, setDropTarget] = useState<{ status: TodoStatus; index: number } | null>(null);
```

Der Drag-Block ab `src/App.tsx:452` bekommt die Rechenstelle. `handleDropOnLane` behält seine Rolle für den Drop auf die leere Lane-Fläche und bekommt den Zielindex dazu:

```tsx
  /**
   * Schreibt den Zug weg: Position allein, wenn die Karte in ihrer Spalte
   * bleibt, sonst Status und Position in einem Schreibvorgang.
   *
   * `laneTodos` ist die sortierte Zielspalte *ohne* die gezogene Karte --
   * sonst waere die Karte ihr eigener Nachbar und ein Zug um eine Position
   * bliebe wirkungslos.
   */
  async function moveCard(todoId: number, targetStatus: TodoStatus, index: number) {
    const dragged = todos.find((t) => t.id === todoId);
    if (!dragged) return;

    const laneTodos = sortBoardTodos(
      boardTodos.filter((t) => t.status === targetStatus && t.id !== todoId)
    );
    const before = index > 0 ? laneTodos[index - 1].board_order : null;
    const after = index < laneTodos.length ? laneTodos[index].board_order : null;

    try {
      if (needsRebalance(before, after)) {
        // Kein Platz zwischen den Nachbarn: die Spalte einmal neu
        // durchnummerieren, mit der gezogenen Karte an ihrem neuen Index.
        const ordered = [...laneTodos];
        ordered.splice(index, 0, dragged);
        const positions = rebalanceBoardOrders(ordered);
        const written: Todo[] = [];
        for (const { id, board_order } of positions) {
          written.push(
            id === todoId && dragged.status !== targetStatus
              ? await updateTodoStatusAndOrder(id, targetStatus, board_order)
              : await updateTodoBoardOrder(id, board_order)
          );
        }
        setTodos((prev) =>
          prev.map((t) => written.find((w) => w.id === t.id) ?? t)
        );
      } else {
        const order = computeBoardOrder(before, after);
        const updated =
          dragged.status === targetStatus
            ? await updateTodoBoardOrder(todoId, order)
            : await updateTodoStatusAndOrder(todoId, targetStatus, order);
        setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      }

      // Das Feuerwerk gehoert an den Wechsel nach "erledigt", nicht an jedes
      // Umsortieren innerhalb der Spalte.
      if (targetStatus === "done" && dragged.status !== "done") {
        setBurstId(todoId);
        setTimeout(() => setBurstId(null), 800);
      }
      setError(null);
      console.log(`drag: Aufgabe ${todoId} nach "${targetStatus}" an Platz ${index} verschoben`);
    } catch (err) {
      console.error(`drag: Verschieben von Aufgabe ${todoId} fehlgeschlagen:`, String(err));
      setError(String(err));
    } finally {
      setDraggedTodoId(null);
      setDragOverLane(null);
      setDropTarget(null);
    }
  }
```

`handleDropOnLane` ruft `moveCard` mit dem Ende der Spalte auf (Drop auf die freie Fläche):

```tsx
  function handleDropOnLane(todoId: number, targetStatus: TodoStatus) {
    const laneLength = boardTodos.filter(
      (t) => t.status === targetStatus && t.id !== todoId
    ).length;
    return moveCard(todoId, targetStatus, dropTarget?.status === targetStatus ? dropTarget.index : laneLength);
  }
```

Neue Handler für die Karte:

```tsx
  /** Obere Haelfte der Karte heisst davor, untere dahinter. */
  function handleCardDragOver(e: DragEvent, status: TodoStatus, index: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDragOverLane(status);
    setDropTarget({ status, index: after ? index + 1 : index });
  }

  function handleCardDrop(e: DragEvent, status: TodoStatus, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const raw = e.dataTransfer.getData("text/plain");
    const todoId = Number(raw);
    if (!todoId) {
      console.warn(`drag: drop ohne verwertbare Aufgaben-ID (dataTransfer="${raw}")`);
      return;
    }
    moveCard(todoId, status, after ? index + 1 : index);
  }
```

`handleDragEnd` ergänzen (am Karten-Element `onDragEnd`), damit ein abgebrochener Zug die Linie nicht stehen lässt:

```tsx
  function handleDragEnd() {
    setDraggedTodoId(null);
    setDragOverLane(null);
    setDropTarget(null);
  }
```

Im Markup: der Index, den `moveCard` bekommt, zählt in der Spalte **ohne** die gezogene Karte. Deshalb wird die Einfügelinie über denselben Index gezeichnet. Im `.kanban-lane-body` die Karten über eine Hilfsvariable rendern:

```tsx
                  <div className="kanban-lane-body">
                    {laneTodos.map((todo, position) => {
                      // Index in der Spalte ohne die gezogene Karte -- derselbe
                      // Massstab, in dem moveCard rechnet.
                      const index =
                        draggedTodoId !== null &&
                        laneTodos.findIndex((t) => t.id === draggedTodoId) < position
                          ? position - 1
                          : position;
                      const showIndicator =
                        dropTarget?.status === lane.status && dropTarget.index === index;
                      const overdue = !todo.done && isOverdue(todo.due_date);
                      const today = isDueToday(todo.due_date);

                      return (
                        <Fragment key={todo.id}>
                          {showIndicator && <div className="kanban-drop-indicator" />}
                          <div
                            className={`kanban-card ...`}   // bestehende Klassenliste unveraendert
                            draggable
                            onDragStart={(e) => handleDragStart(e, todo.id)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => handleCardDragOver(e, lane.status, index)}
                            onDrop={(e) => handleCardDrop(e, lane.status, index)}
                            onDoubleClick={() => setDetailTodoId(todo.id)}
                          >
                            {/* Karteninhalt unveraendert */}
                          </div>
                        </Fragment>
                      );
                    })}
                    {dropTarget?.status === lane.status &&
                      dropTarget.index >= laneTodos.length && (
                        <div className="kanban-drop-indicator" />
                      )}
                  </div>
```

`Fragment` aus `react` importieren. Das `key` wandert vom `div` auf das `Fragment`.

In `src/App.css` hinter dem `.kanban-card`-Block:

```css
/* Zeigt beim Ziehen, zwischen welche beiden Karten die gezogene faellt. */
.kanban-drop-indicator {
  height: 3px;
  border-radius: 2px;
  background: var(--accent);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/App.test.tsx && npm run typecheck && npm run lint`
Expected: PASS, keine Typfehler, keine neuen Lint-Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "feat: drag cards to a position inside the lane"
```

---

### Task 7: E2E-Test

**Files:**
- Modify: `e2e/todolist.spec.ts`

Playwrights `dragTo` löst keine HTML5-Drag-Ereignisse aus. Der Test baut sie deshalb selbst im Seitenkontext, mit einem geteilten `DataTransfer`.

- [ ] **Step 1: Write the failing test**

Ans Ende von `e2e/todolist.spec.ts`, im Stil der dortigen Tests (die bestehenden Tests zuerst lesen: sie legen Aufgaben über die Oberfläche an und schalten über `Zur Ansicht Brett wechseln` um):

```ts
test("haelt die gezogene Reihenfolge einer Spalte ueber einen Reload", async ({ page }) => {
  await page.goto("/");

  // Zwei Aufgaben anlegen -- nach dem Muster der Tests weiter oben in dieser Datei.
  await addTodo(page, "Zuerst");
  await addTodo(page, "Danach");

  await page.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }).click();
  const titles = page.locator(".kanban-card-title");
  await expect(titles).toHaveText(["Danach", "Zuerst"]);

  // HTML5-Drag von Hand: dragstart auf der zweiten Karte, dragover und drop
  // auf der oberen Haelfte der ersten.
  await page.evaluate(() => {
    const cards = document.querySelectorAll<HTMLElement>(".kanban-card");
    const source = cards[1];
    const target = cards[0];
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    const rect = target.getBoundingClientRect();
    const clientY = rect.top + 2;
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer, clientY }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer, clientY }));
  });

  await expect(titles).toHaveText(["Zuerst", "Danach"]);

  await page.reload();
  await page.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }).click();
  await expect(titles).toHaveText(["Zuerst", "Danach"]);
});
```

`addTodo` ist der Platzhalter für die Anlege-Schritte, die die Datei schon verwendet — entweder eine dort vorhandene Hilfsfunktion nutzen oder die Schritte ausschreiben, wie die Nachbartests es tun. Keine neue Hilfsfunktion erfinden, wenn es schon eine gibt.

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm run test:e2e -- -g "gezogene Reihenfolge"`
Expected: PASS. Schlägt es fehl, weil `dragstart` den React-Handler nicht erreicht: prüfen, ob `bubbles: true` gesetzt ist und ob die Karte selbst (nicht ein Kind) das Ziel ist.

- [ ] **Step 3: Commit**

```bash
git add e2e/todolist.spec.ts
git commit -m "test: cover dragging inside a lane end to end"
```

---

### Task 8: Changelog und volle Suite

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the changelog entry**

Über `## [0.11.0] - 2026-09-16` einfügen:

```markdown
## [Unveröffentlicht]

### Hinzugefügt
- Karten lassen sich im Brett innerhalb einer Spalte an eine beliebige Stelle ziehen. Eine Linie zeigt beim Ziehen, wo die Karte landet, und die Reihenfolge überlebt den Neustart. Wer nichts zieht, sieht die Spalte weiterhin nach Fälligkeit sortiert.
```

- [ ] **Step 2: Run the full suite**

Run: `npm run typecheck && npm run lint && npm test && npm run test:rust && npm run lint:rust && npm run test:e2e`
Expected: alles grün. Kein Schritt darf übersprungen werden — `src-tauri` und die Oberfläche sind beide angefasst worden (AGENTS.md).

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: note the manual card order in the changelog"
```

---

## Prüfliste gegen die Spec

| Spec-Abschnitt | Task |
|----------------|------|
| Spalte `board_order REAL NOT NULL DEFAULT 0` | 2 |
| Sortierschlüssel mit Fälligkeit als Tie-Breaker | 1, 5 |
| `board_order` an `Todo`/`TodoRow`, `fromRow`-Rückfall | 1 |
| `computeBoardOrder` in allen vier Fällen | 1 |
| Rebalance-Schwelle und Neuverteilung | 1, 6 |
| `updateTodoBoardOrder` / `updateTodoStatusAndOrder` in beiden Backends | 3, 4 |
| Dispatcher `db.ts` | 4 |
| Drop-Ziel über die Kartenmitte, Einfügelinie | 6 |
| Gezogene Karte aus der Nachbarschaftsrechnung ausnehmen | 6 |
| Feuerwerk nur beim Wechsel nach `done` (nur Liste zeichnet es) | 6 |
| E2E-Drag mit Reload | 7 |
| Kein MCP-Zugriff, kein Sortier-Umschalter, Liste unverändert | — (bewusst nicht gebaut) |
