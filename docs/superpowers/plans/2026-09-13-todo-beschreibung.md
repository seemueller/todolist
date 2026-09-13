# Beschreibung an einer Aufgabe — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Aufgabe bekommt zusätzlich zum Titel eine optionale, mehrzeilige Beschreibung — bearbeitbar in einem Detail-Fenster, sichtbar in Liste und Brett, les- und schreibbar über den MCP-Server.

**Architecture:** Die Beschreibung ist eine neue Spalte an `todos` (Migration 10, `TEXT NOT NULL DEFAULT ''`). Beide Speicher-Backends (SQLite und localStorage) bekommen dieselbe neue Store-Methode `updateTodoFields(id, patch)`, die mehrere Felder in einem Schreibvorgang ändert — das ist die Gegenseite zum Sichern-Knopf des Fensters. Die Oberfläche bekommt eine neue Komponente `src/TodoDetailModal.tsx`; die Inline-Bearbeitung des Titels in der Zeile entfällt dafür. Auf Rust-Seite tragen `add_todo` und `update_todo` einen neuen Parameter, geprüft von einer zweiten Textprüfung, die den Zeilenumbruch durchlässt.

**Tech Stack:** React 18 + TypeScript + Vite, Tauri 2 mit `tauri-plugin-sql` (SQLite), Rust mit `rmcp`/`sqlx` für den MCP-Server, Vitest + Testing Library für Unit-Tests, Playwright für e2e.

**Spec:** `docs/superpowers/specs/2026-09-13-todo-beschreibung-design.md`

---

## Vorwissen für die ausführende Person

Ein paar Dinge, die in diesem Projekt anders sind, als man vermuten würde:

- **Migrationen niemals nachträglich ändern.** `tauri-plugin-sql` speichert die Prüfsumme jeder angewandten Migration. Wird eine bestehende angefasst, bricht die App beim Start mit `migration N was previously applied but has been modified` ab. Neue Migrationen werden ausschließlich hinten angehängt.
- **Zwei Speicher-Backends.** `src/db.ts` wählt zur Laufzeit: im Tauri-Fenster `src/todoStoreSql.ts`, im Browser (Vite-Dev, Playwright, Vitest) `src/todoStoreLocal.ts`. Der Vertrag steht in `src/storeTypes.ts` und gilt für beide. Was in dem einen Backend geändert wird, muss im anderen mitgeändert werden.
- **Das Rust-Testschema in `src-tauri/src/mcp/store.rs` ist eine Kopie des echten Schemas.** Wird eine Spalte in `lib.rs` ergänzt, muss sie dort mit ergänzt werden, sonst laufen die Tests gegen ein anderes Schema als die App.
- **Kein `BEGIN`/`COMMIT` über getrennte Aufrufe** — der Connection-Pool kann zwischendurch die Verbindung wechseln. Ein einzelnes `UPDATE` ist für sich atomar und genügt hier.
- **`STYLEGUIDE.md` vor jeder UI-Änderung lesen.** Keine Emoji, keine Verläufe, Farben nur über die Token aus dem `:root`-Block in `src/App.css`.
- **Tests laufen mit** `npm test` (Vitest, einmalig), `npm run typecheck`, `cargo test --manifest-path src-tauri/Cargo.toml` und `npx playwright test`.

## Dateiübersicht

| Datei | Was sie danach tut |
|---|---|
| `src-tauri/src/lib.rs` | trägt Migration 10, die die Spalte `description` anlegt |
| `src/types.ts` | `Todo.description`, `TodoRow.description?`, Vorgabe `""` in `fromRow` |
| `src/storeTypes.ts` | `TodoFieldsPatch` und `updateTodoFields` im `TodoStore`-Vertrag |
| `src/todoStoreSql.ts` | liest und schreibt `description`, setzt `updateTodoFields` als ein `UPDATE` um |
| `src/todoStoreLocal.ts` | dasselbe auf `localStorage`, inklusive Vorgabe für alte Einträge |
| `src/db.ts` | reicht `updateTodoFields` und den neuen `addTodo`-Parameter durch |
| `src/TodoDetailModal.tsx` | **neu** — das Detail-Fenster mit Entwurfszustand, Sichern und Abbrechen |
| `src/TodoDetailModal.test.tsx` | **neu** — Tests des Fensters, isoliert von `App` |
| `src/ui/Modal.tsx` | dritte Panelbreite `"todo"` |
| `src/ui/icons.tsx`, `src/ui/index.ts` | `NoteIcon` |
| `src/App.tsx` | öffnet das Fenster, zeigt Symbol und Vorschau, ohne Inline-Titel-Bearbeitung |
| `src/App.css` | Klassen für Fenster, Symbol und Kartenvorschau |
| `src-tauri/src/mcp/store.rs` | `description` in `Todo`, `TodoRow`, `TodoUpdate`, `add_todo`, `update_todo` |
| `src-tauri/src/mcp/tools.rs` | `check_multiline`, `MAX_DESCRIPTION_CHARS`, neue Tool-Parameter |
| `AGENTS.md`, `STYLEGUIDE.md`, `CHANGELOG.md` | beschreiben den neuen Stand |

---

## Task 1: Die Spalte

**Files:**
- Modify: `src-tauri/src/lib.rs` (Migrationsliste, nach Version 9)
- Modify: `src-tauri/src/mcp/store.rs` (`SCHEMA` im Testmodul)
- Test: `src/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/migrations.test.ts`, ans Ende des `describe`-Blocks:

```ts
  it("gives todos a description column", () => {
    expect(source).toContain("ALTER TABLE todos ADD COLUMN description");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/migrations.test.ts -t "description column"`
Expected: FAIL — `expected '…' to contain 'ALTER TABLE todos ADD COLUMN description'`

- [ ] **Step 3: Migration 10 anhängen**

In `src-tauri/src/lib.rs`, in der Liste `let migrations = vec![…]`, direkt **hinter** der Migration mit `version: 9` und vor dem schließenden `];`:

```rust
        // Eine Aufgabe traegt zusaetzlich zum Titel einen frei formulierten
        // Text. `NOT NULL DEFAULT ''` statt NULL: "keine Beschreibung" soll
        // nur eine Schreibweise haben, und Altbestand bekommt den leeren
        // String von der Datenbank.
        Migration {
            version: 10,
            description: "add_description_column",
            sql: "ALTER TABLE todos ADD COLUMN description TEXT NOT NULL DEFAULT '';",
            kind: MigrationKind::Up,
        },
```

- [ ] **Step 4: Das Rust-Testschema nachziehen**

In `src-tauri/src/mcp/store.rs`, im `SCHEMA`-Array, die `todos`-Tabelle um die Spalte ergänzen (letzte Spalte, hinter `status`):

```rust
        "CREATE TABLE todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            due_date TEXT DEFAULT NULL,
            category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'todo',
            description TEXT NOT NULL DEFAULT ''
        );",
```

Den Doc-Kommentar über `SCHEMA` von „nach Migration 9" auf „nach Migration 10" ändern.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/migrations.test.ts`
Expected: PASS, 4 Tests — insbesondere `numbers migrations consecutively from 1 without duplicates`, das die lückenlose 1..10 prüft.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS — das geänderte Testschema bricht nichts, die Spalte hat eine Vorgabe.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/mcp/store.rs src/migrations.test.ts
git commit -m "feat: give todos a description column"
```

---

## Task 2: Die Beschreibung im Typ

**Files:**
- Modify: `src/types.ts:4-42`
- Test: `src/types.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/types.test.ts`, im vorhandenen `describe("fromRow", …)`-Block (ab `src/types.test.ts:16`), hinter den dortigen Tests:

```ts
  it("defaults a missing description to the empty string", () => {
    const todo = fromRow({
      id: 1,
      title: "Ohne Beschreibung",
      done: 0,
      priority: "medium",
      created_at: "2026-09-13T10:00:00.000Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    });

    expect(todo.description).toBe("");
  });

  it("passes a stored description through unchanged", () => {
    const todo = fromRow({
      id: 2,
      title: "Mit Beschreibung",
      done: 0,
      priority: "medium",
      created_at: "2026-09-13T10:00:00.000Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
      description: "Zeile eins\nZeile zwei",
    });

    expect(todo.description).toBe("Zeile eins\nZeile zwei");
  });
```

Falls `fromRow` in der Datei noch nicht importiert ist, den Import oben ergänzen: `import { fromRow } from "./types";`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types.test.ts -t "description"`
Expected: FAIL — `Property 'description' does not exist on type 'Todo'` bzw. `expected undefined to be ""`

- [ ] **Step 3: Die Felder ergänzen**

In `src/types.ts`, in `interface Todo` hinter `title`:

```ts
  /** Frei formulierter Text zur Aufgabe; leerer String heisst "keine Beschreibung". */
  description: string;
```

In `interface TodoRow` hinter `title`:

```ts
  /** Optional, weil der localStorage-Speicher Eintraege aus der Zeit vor
   *  dieser Spalte liefert; `fromRow` setzt dann den leeren String. */
  description?: string;
```

In `fromRow`, im zurückgegebenen Objekt hinter `title: row.title,`:

```ts
    description: row.description ?? "",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: Fehler in `src/todoStoreLocal.ts` — `addTodo` baut ein `Todo` ohne `description`. Das ist erwartet und wird in Task 3 behoben. Wer zwischendurch einen grünen Typecheck braucht, zieht Task 3 sofort nach.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "feat: carry a description on the todo type"
```

---

## Task 3: Die Beschreibung in beiden Speichern lesen und anlegen

**Files:**
- Modify: `src/storeTypes.ts` (Doc-Kommentar und Signatur von `addTodo`)
- Modify: `src/todoStoreSql.ts:21-63`
- Modify: `src/todoStoreLocal.ts:30-101`
- Modify: `src/db.ts:15-22`
- Test: `src/todoStoreSql.test.ts`, `src/todoStoreLocal.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/todoStoreLocal.test.ts` ans Ende des äußeren `describe`-Blocks:

```ts
  it("creates a todo without a description by default", async () => {
    const todo = await localTodoStore.addTodo("Ohne Text", "medium", null);

    expect(todo.description).toBe("");
  });

  it("stores a description given at creation time", async () => {
    const todo = await localTodoStore.addTodo("Mit Text", "medium", null, null, "Zeile eins\nZeile zwei");

    expect(todo.description).toBe("Zeile eins\nZeile zwei");
    const [listed] = await localTodoStore.listTodos();
    expect(listed.description).toBe("Zeile eins\nZeile zwei");
  });

  it("reads a legacy entry without the field as an empty description", async () => {
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
      ]),
    );

    const [todo] = await localTodoStore.listTodos();

    expect(todo.description).toBe("");
  });
```

In `src/todoStoreSql.test.ts` ans Ende des äußeren `describe`-Blocks (die Datei mockt `getDb`; die vorhandenen Tests zeigen, wie die erwarteten SQL-Aufrufe geprüft werden — an dasselbe Muster halten):

```ts
  it("selects the description column", async () => {
    await sqlTodoStore.listTodos();

    const [sql] = selectCalls[0];
    expect(sql).toContain("t.description");
  });

  it("writes the description when creating a todo", async () => {
    await sqlTodoStore.addTodo("Mit Text", "medium", null, null, "Zeile eins\nZeile zwei");

    const [sql, params] = executeCalls[0];
    expect(sql).toContain("description");
    expect(params).toContain("Zeile eins\nZeile zwei");
  });

  it("writes an empty description when none was given", async () => {
    await sqlTodoStore.addTodo("Ohne Text", "medium", null);

    const [, params] = executeCalls[0];
    expect(params).toContain("");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/todoStoreLocal.test.ts src/todoStoreSql.test.ts`
Expected: FAIL — `Expected 4 arguments, but got 5` bzw. `expected '…' to contain 't.description'`

- [ ] **Step 3: Den Vertrag erweitern**

In `src/storeTypes.ts`, `addTodo` im `TodoStore`-Interface ersetzen:

```ts
  /**
   * Legt ein neues Todo im Status "todo" an; category_name/category_color
   * werden aus der Kategorie denormalisiert. `description` ist frei
   * formulierter Text; ohne Angabe bleibt sie leer (`""`, nie null).
   */
  addTodo(
    title: string,
    priority: Priority,
    dueDate: string | null,
    categoryId?: number | null,
    description?: string
  ): Promise<Todo>;
```

- [ ] **Step 4: Den SQL-Speicher anpassen**

In `src/todoStoreSql.ts`:

`TODO_COLUMNS` um die Spalte ergänzen:

```ts
const TODO_COLUMNS = `
  t.id, t.title, t.description, t.done, t.status, t.priority, t.created_at,
  t.due_date, t.category_id, c.name AS category_name, c.color AS category_color
`;
```

`addTodo` ersetzen:

```ts
async function addTodo(
  title: string,
  priority: Priority,
  dueDate: string | null,
  categoryId?: number | null,
  description = ""
): Promise<Todo> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO todos (title, description, done, status, priority, created_at, due_date, category_id)
     VALUES ($1, $2, 0, 'todo', $3, $4, $5, $6)`,
    [title, description, priority, new Date().toISOString(), dueDate, categoryId ?? null]
  );
  return selectTodo(result.lastInsertId as number);
}
```

- [ ] **Step 5: Den localStorage-Speicher anpassen**

In `src/todoStoreLocal.ts`:

`migrateTodos` ersetzen — hier, nicht in `fromRow`, weil dieser Speicher `fromRow` gar nicht benutzt:

```ts
// Holt Eintraege aus aelteren Staenden auf den heutigen Stand: `status` kam
// mit dem Brett dazu, `description` mit dem Detail-Fenster. Beides fehlt in
// Daten, die davor geschrieben wurden.
function migrateTodos(todos: any[]): Todo[] {
  return todos.map((todo) => {
    const description = todo.description ?? "";
    if (todo.status) return { ...todo, description };
    const status: TodoStatus = todo.done ? "done" : "todo";
    return { ...todo, description, status, done: status === "done" };
  });
}
```

`addTodo` ersetzen:

```ts
function addTodo(
  title: string,
  priority: Priority,
  dueDate: string | null,
  categoryId?: number | null,
  description = ""
): Promise<Todo> {
  const todos = loadTodos();
  const todo: Todo = {
    id: generateId(),
    title,
    description,
    done: false,
    status: "todo",
    priority,
    created_at: now(),
    due_date: dueDate,
    category_id: categoryId ?? null,
    category_name: categoryId ? findCategory(categoryId)?.name ?? null : null,
    category_color: categoryId ? findCategory(categoryId)?.color ?? null : null,
  };
  todos.unshift(todo);
  saveTodos(todos);
  return Promise.resolve(todo);
}
```

- [ ] **Step 6: Die Durchreiche in db.ts anpassen**

In `src/db.ts`:

```ts
export function addTodo(
  title: string,
  priority: Priority,
  dueDate: string | null,
  categoryId?: number | null,
  description?: string
): Promise<Todo> {
  return store().addTodo(title, priority, dueDate, categoryId, description);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/todoStoreLocal.test.ts src/todoStoreSql.test.ts src/types.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: keine Fehler

- [ ] **Step 8: Commit**

```bash
git add src/storeTypes.ts src/todoStoreSql.ts src/todoStoreLocal.ts src/db.ts src/todoStoreSql.test.ts src/todoStoreLocal.test.ts
git commit -m "feat: read and create todos with a description"
```

---

## Task 4: `updateTodoFields` in beiden Speichern

**Files:**
- Modify: `src/storeTypes.ts`
- Modify: `src/todoStoreSql.ts`
- Modify: `src/todoStoreLocal.ts`
- Modify: `src/db.ts`
- Test: `src/todoStoreLocal.test.ts`, `src/todoStoreSql.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/todoStoreLocal.test.ts`:

```ts
  describe("updateTodoFields", () => {
    it("changes a single field and leaves the rest alone", async () => {
      const todo = await localTodoStore.addTodo("Titel", "medium", "2026-09-20");

      const updated = await localTodoStore.updateTodoFields(todo.id, {
        description: "Neuer Text",
      });

      expect(updated.description).toBe("Neuer Text");
      expect(updated.title).toBe("Titel");
      expect(updated.priority).toBe("medium");
      expect(updated.due_date).toBe("2026-09-20");
    });

    it("changes several fields at once", async () => {
      const todo = await localTodoStore.addTodo("Alt", "low", null);

      const updated = await localTodoStore.updateTodoFields(todo.id, {
        title: "Neu",
        description: "Text",
        priority: "high",
        dueDate: "2026-10-01",
      });

      expect(updated).toMatchObject({
        title: "Neu",
        description: "Text",
        priority: "high",
        due_date: "2026-10-01",
      });
    });

    it("clears the due date and the category with null", async () => {
      const category = await localTodoStore.addCategory("Arbeit", "#7cc3f7");
      const todo = await localTodoStore.addTodo("Titel", "medium", "2026-09-20", category.id);

      const updated = await localTodoStore.updateTodoFields(todo.id, {
        dueDate: null,
        categoryId: null,
      });

      expect(updated.due_date).toBeNull();
      expect(updated.category_id).toBeNull();
      expect(updated.category_name).toBeNull();
      expect(updated.category_color).toBeNull();
    });

    it("denormalises name and colour when the category changes", async () => {
      const category = await localTodoStore.addCategory("Arbeit", "#7cc3f7");
      const todo = await localTodoStore.addTodo("Titel", "medium", null);

      const updated = await localTodoStore.updateTodoFields(todo.id, {
        categoryId: category.id,
      });

      expect(updated.category_name).toBe("Arbeit");
      expect(updated.category_color).toBe("#7cc3f7");
    });

    it("returns the todo unchanged for an empty patch", async () => {
      const todo = await localTodoStore.addTodo("Titel", "medium", null);

      const updated = await localTodoStore.updateTodoFields(todo.id, {});

      expect(updated).toEqual(todo);
    });

    it("rejects an unknown id", async () => {
      await expect(localTodoStore.updateTodoFields(999, { title: "Neu" })).rejects.toThrow(
        "Todo 999 not found",
      );
    });
  });
```

In `src/todoStoreSql.test.ts` (am Mock-Muster der Datei orientieren):

```ts
  describe("updateTodoFields", () => {
    it("writes exactly the given fields in a single statement", async () => {
      await sqlTodoStore.updateTodoFields(7, { title: "Neu", description: "Text" });

      expect(executeCalls).toHaveLength(1);
      const [sql, params] = executeCalls[0];
      expect(sql).toContain("title = $1");
      expect(sql).toContain("description = $2");
      expect(sql).not.toContain("priority");
      expect(params).toEqual(["Neu", "Text", 7]);
    });

    it("writes nothing for an empty patch", async () => {
      await sqlTodoStore.updateTodoFields(7, {});

      expect(executeCalls).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/todoStoreLocal.test.ts src/todoStoreSql.test.ts -t "updateTodoFields"`
Expected: FAIL — `sqlTodoStore.updateTodoFields is not a function`

- [ ] **Step 3: Den Vertrag schreiben**

In `src/storeTypes.ts`, oberhalb von `export interface TodoStore`:

```ts
/**
 * Was `updateTodoFields` aendern soll. Ein fehlendes Feld bleibt unveraendert;
 * `dueDate: null` und `categoryId: null` leeren ausdruecklich. Dieselbe
 * Unterscheidung, die `update_todo` ueber MCP zwischen "weggelassen" und
 * "null" trifft.
 */
export interface TodoFieldsPatch {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string | null;
  categoryId?: number | null;
}
```

Und im `TodoStore`-Interface, hinter `updateTodoCategory`:

```ts
  /**
   * Aendert mehrere Felder in einem Schreibvorgang -- der Gegenpart zum
   * Sichern-Knopf des Detail-Fensters: entweder steht der ganze Stand in der
   * Datenbank oder nichts davon.
   *
   * Ein leerer Patch schreibt nicht und gibt die Aufgabe unveraendert zurueck.
   * Wird `categoryId` gesetzt, werden category_name/category_color neu
   * denormalisiert. Lehnt mit `Todo <id> not found` ab, wenn `id` kein
   * bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner
   * throw.
   */
  updateTodoFields(id: number, patch: TodoFieldsPatch): Promise<Todo>;
```

- [ ] **Step 4: Den SQL-Speicher umsetzen**

In `src/todoStoreSql.ts` den Import um `TodoFieldsPatch` erweitern:

```ts
import { TodoStore, TodoFieldsPatch } from "./storeTypes";
```

Hinter `updateTodoCategory` einsetzen:

```ts
// Ein einziges UPDATE, keine Folge von Einzelanweisungen: der Pool kann
// zwischen zwei Aufrufen die Verbindung wechseln, BEGIN und COMMIT waeren
// also keine Transaktion (siehe AGENTS.md). Ein UPDATE ist fuer sich atomar.
async function updateTodoFields(id: number, patch: TodoFieldsPatch): Promise<Todo> {
  const assignments: string[] = [];
  const params: unknown[] = [];

  function set(column: string, value: unknown): void {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  }

  if (patch.title !== undefined) set("title", patch.title);
  if (patch.description !== undefined) set("description", patch.description);
  if (patch.priority !== undefined) set("priority", patch.priority);
  if (patch.dueDate !== undefined) set("due_date", patch.dueDate);
  if (patch.categoryId !== undefined) set("category_id", patch.categoryId);

  // Ein leerer Patch bekommt kein UPDATE ohne SET-Liste, das waere ein
  // Syntaxfehler. selectTodo prueft trotzdem, ob es die Aufgabe gibt.
  if (assignments.length === 0) return selectTodo(id);

  const db = await getDb();
  await db.execute(`UPDATE todos SET ${assignments.join(", ")} WHERE id = $${params.length + 1}`, [
    ...params,
    id,
  ]);
  return selectTodo(id);
}
```

Und `updateTodoFields` in das exportierte `sqlTodoStore`-Objekt aufnehmen, hinter `updateTodoCategory`.

- [ ] **Step 5: Den localStorage-Speicher umsetzen**

In `src/todoStoreLocal.ts` den Import erweitern:

```ts
import { TodoStore, TodoFieldsPatch } from "./storeTypes";
```

Hinter `updateTodoCategory` einsetzen:

```ts
async function updateTodoFields(id: number, patch: TodoFieldsPatch): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);

  const next = { ...todos[idx] };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueDate !== undefined) next.due_date = patch.dueDate;
  if (patch.categoryId !== undefined) {
    const cat = patch.categoryId === null ? null : findCategory(patch.categoryId);
    next.category_id = patch.categoryId;
    next.category_name = cat?.name ?? null;
    next.category_color = cat?.color ?? null;
  }

  todos[idx] = next;
  saveTodos(todos);
  return Promise.resolve(next);
}
```

Und `updateTodoFields` in das exportierte `localTodoStore`-Objekt aufnehmen.

- [ ] **Step 6: Durchreichen in db.ts**

In `src/db.ts` den Import erweitern und die Funktion hinter `updateTodoCategory` ergänzen:

```ts
import { TodoStore, TodoFieldsPatch } from "./storeTypes";

export function updateTodoFields(id: number, patch: TodoFieldsPatch): Promise<Todo> {
  return store().updateTodoFields(id, patch);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/todoStoreLocal.test.ts src/todoStoreSql.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: keine Fehler

- [ ] **Step 8: Commit**

```bash
git add src/storeTypes.ts src/todoStoreSql.ts src/todoStoreLocal.ts src/db.ts src/todoStoreSql.test.ts src/todoStoreLocal.test.ts
git commit -m "feat: change several todo fields in one write"
```

---

## Task 5: Die Migration der Altdaten

**Files:**
- Modify: `src/migrateLocalStorage.ts`
- Test: `src/migrateLocalStorage.test.ts`

Diese Datei übernimmt beim ersten Start nach dem Update die `localStorage`-Daten in die SQLite-Datenbank. Sie schreibt `INSERT`s und muss die neue Spalte kennen.

- [ ] **Step 1: Write the failing test**

In `src/migrateLocalStorage.test.ts`, am Muster der vorhandenen Tests:

```ts
  it("migrates a todo that has no description yet", async () => {
    seedTodos([
      {
        id: 1,
        title: "Alt",
        done: false,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-01T00:00:00.000Z",
        due_date: null,
        category_id: null,
      },
    ]);

    await migrateLocalStorage();

    const insert = executed.find(([sql]) => sql.includes("INSERT INTO todos"));
    expect(insert).toBeDefined();
    expect(insert![1]).toContain("");
  });

  it("carries an existing description over", async () => {
    seedTodos([
      {
        id: 1,
        title: "Alt",
        description: "Zeile eins\nZeile zwei",
        done: false,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-01T00:00:00.000Z",
        due_date: null,
        category_id: null,
      },
    ]);

    await migrateLocalStorage();

    const insert = executed.find(([sql]) => sql.includes("INSERT INTO todos"));
    expect(insert![1]).toContain("Zeile eins\nZeile zwei");
  });
```

`seedTodos` und `executed` sind die Helfer, die die Datei bereits benutzt — beim Schreiben der Tests die vorhandenen Namen übernehmen, nicht neue erfinden.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/migrateLocalStorage.test.ts -t "description"`
Expected: FAIL — die `INSERT`-Parameter enthalten die Beschreibung nicht

- [ ] **Step 3: Die Spalte in den INSERT aufnehmen**

In `src/migrateLocalStorage.ts`, in der Todo-Schleife (um `src/migrateLocalStorage.ts:150`), bei den übrigen Feldvorgaben ergänzen:

```ts
    const description = typeof todo.description === "string" ? todo.description : "";
```

Und die Anweisung austauschen — Spaltenliste, Platzhalter und Parameter-Array müssen zusammen wachsen:

```ts
    await db.execute(
      `INSERT OR IGNORE INTO todos (id, title, description, done, status, priority, created_at, due_date, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        todo.id,
        todo.title,
        description,
        status === "done" ? 1 : 0,
        status,
        priority,
        createdAt,
        dueDate,
        categoryId,
      ]
    );
```

Die Typprüfung mit `typeof` statt `?? ""` folgt dem Muster der Nachbarzeilen: die Daten kommen aus `localStorage` und sind nicht typsicher, ein `{ description: 42 }` soll nicht in die Spalte wandern.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/migrateLocalStorage.test.ts`
Expected: PASS, alle Tests der Datei

- [ ] **Step 5: Commit**

```bash
git add src/migrateLocalStorage.ts src/migrateLocalStorage.test.ts
git commit -m "feat: carry descriptions through the localStorage migration"
```

---

## Task 6: Panelbreite und Symbol

**Files:**
- Modify: `src/ui/Modal.tsx:12-17`
- Modify: `src/ui/icons.tsx`
- Modify: `src/ui/index.ts`
- Modify: `src/App.css`

Reine Bausteinarbeit ohne eigenes Verhalten; die Tests dafür kommen in Task 7 und 8 mit den Komponenten, die sie benutzen.

- [ ] **Step 1: Die dritte Panelbreite**

In `src/ui/Modal.tsx`:

```ts
export type ModalVariant = "changelog" | "category" | "todo";

const VARIANT_CLASS: Record<ModalVariant, string> = {
  changelog: "changelog-modal",
  category: "category-modal",
  todo: "todo-modal",
};
```

- [ ] **Step 2: Das Notiz-Symbol**

In `src/ui/icons.tsx`, alphabetisch zwischen `MinusIcon` und `PencilIcon`:

```tsx
export function NoteIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" {...props}>
      <path d="M3 2.2h8v9.6H3z" />
      <path d="M5 5h4M5 7h4M5 9h2.5" />
    </BaseIcon>
  );
}
```

In `src/ui/index.ts` den Namen `NoteIcon` in die `export { … } from "./icons";`-Liste aufnehmen, alphabetisch zwischen `MinusIcon` und `PencilIcon`.

- [ ] **Step 3: Das Styling**

In `src/App.css`, bei den Modal-Regeln (ab `.changelog-modal,`):

```css
.changelog-modal,
.category-modal,
.todo-modal {
  /* die vorhandene gemeinsame Regel — den Selektor nur erweitern */
}

.todo-modal {
  max-width: 560px;
}

.todo-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
}

.todo-modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-modal-field > label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}

.todo-modal-row {
  display: flex;
  gap: 12px;
}

.todo-modal-row > .todo-modal-field {
  flex: 1;
}

.todo-modal-description {
  min-height: 160px;
  padding: 10px 12px;
  border: 2px solid var(--ink);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  line-height: 1.5;
  resize: vertical;
}

.todo-modal-description::placeholder {
  color: var(--ink-faint);
}

.todo-modal-error {
  margin: 0;
  color: var(--accent);
  font-size: 13px;
}

.todo-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 18px 18px;
}

/* Die beiden Knoepfe des Fensters. Eigene Klassen, weil es im Projekt bisher
   keinen benannten Sichern-/Abbrechen-Knopf gibt: das Kategorie-Fenster kommt
   mit einem nackten <button type="submit"> aus. */
.todo-modal-cancel,
.todo-modal-save {
  padding: 8px 16px;
  border: 2px solid var(--ink);
  border-radius: var(--radius-md);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.todo-modal-cancel {
  background: var(--surface);
  color: var(--ink);
}

.todo-modal-save {
  background: var(--accent);
  color: var(--canvas);
}

.todo-modal-save:disabled {
  background: var(--ink-ghost);
  cursor: default;
}

/* Hinweis in der Liste, dass eine Aufgabe eine Beschreibung hat. */
.todo-note-mark {
  display: inline-flex;
  color: var(--ink-ghost);
}

/* Zwei Zeilen Vorschau auf der Kanban-Karte. */
.kanban-card-description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.4;
}
```

`--radius-md` und die Farbtoken stehen im `:root`-Block derselben Datei; falls ein Name abweicht, den dort vorhandenen nehmen — keine neuen Token anlegen.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler

- [ ] **Step 5: Commit**

```bash
git add src/ui/Modal.tsx src/ui/icons.tsx src/ui/index.ts src/App.css
git commit -m "feat: add a todo modal width and a note icon"
```

---

## Task 7: Das Detail-Fenster

**Files:**
- Create: `src/TodoDetailModal.tsx`
- Test: `src/TodoDetailModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Neue Datei `src/TodoDetailModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TodoDetailModal } from "./TodoDetailModal";
import { Category, Todo } from "./types";

const categories: Category[] = [
  { id: 1, name: "Arbeit", color: "#7cc3f7", created_at: "2026-01-01T00:00:00.000Z" },
];

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 7,
    title: "Steuererklärung",
    description: "",
    done: false,
    status: "todo",
    priority: "medium",
    created_at: "2026-09-13T10:00:00.000Z",
    due_date: null,
    category_id: null,
    category_name: null,
    category_color: null,
    ...overrides,
  };
}

function renderModal(overrides: Partial<Todo> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <TodoDetailModal
      todo={makeTodo(overrides)}
      categories={categories}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  return { onSave, onClose };
}

describe("TodoDetailModal", () => {
  it("shows the current values of the todo", () => {
    renderModal({ description: "Belege holen", priority: "high", due_date: "2026-09-20" });

    expect(screen.getByLabelText(/Titel/i)).toHaveValue("Steuererklärung");
    expect(screen.getByLabelText(/Beschreibung/i)).toHaveValue("Belege holen");
    expect(screen.getByLabelText(/Priorität/i)).toHaveValue("high");
    expect(screen.getByLabelText(/Fällig/i)).toHaveValue("2026-09-20");
  });

  it("saves only the fields that changed", async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), {
      target: { value: "Zeile eins\nZeile zwei" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { description: "Zeile eins\nZeile zwei" });
    });
  });

  it("closes without saving when nothing changed", async () => {
    const { onSave, onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("discards the draft on cancel", () => {
    const { onSave, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "verworfen" } });
    fireEvent.click(screen.getByRole("button", { name: /Abbrechen/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses an empty title and stays open", async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText(/Titel/i), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    expect(await screen.findByText(/Titel darf nicht leer sein/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves on Ctrl+Enter", async () => {
    const { onSave } = renderModal();

    const description = screen.getByLabelText(/Beschreibung/i);
    fireEvent.change(description, { target: { value: "Text" } });
    fireEvent.keyDown(description, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { description: "Text" }));
  });

  it("stays open and shows the error when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Datenbank weg"));
    const onClose = vi.fn();
    render(
      <TodoDetailModal
        todo={makeTodo()}
        categories={categories}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "Text" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    expect(await screen.findByText(/Datenbank weg/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/TodoDetailModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./TodoDetailModal"`

- [ ] **Step 3: Die Komponente schreiben**

Neue Datei `src/TodoDetailModal.tsx`:

```tsx
// Detail-Fenster einer Aufgabe: Titel, Beschreibung, Prioritaet, Faelligkeit
// und Kategorie an einer Stelle. Eigene Datei, weil App.tsx schon zu gross
// ist, um noch ein Formular mit eigenem Entwurfszustand aufzunehmen.
//
// Das Fenster arbeitet auf einem Entwurf und schreibt erst beim Sichern --
// deshalb gibt es hier ein Abbrechen, anders als bei der Bedienung direkt in
// der Zeile. Gesichert wird ueber `onSave` mit genau den Feldern, die sich
// geaendert haben; ein unveraendertes Fenster schliesst ohne Schreibvorgang.

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Category, Priority, Todo } from "./types";
import type { TodoFieldsPatch } from "./storeTypes";
import { CategorySelect, Modal, PrioritySelect } from "./ui";

export interface TodoDetailModalProps {
  todo: Todo;
  categories: Category[];
  /** Schreibt den Patch. Wirft, wenn das Schreiben scheitert. */
  onSave: (id: number, patch: TodoFieldsPatch) => Promise<void>;
  /** Abbrechen, Escape, Schliessen-Knopf und der geglueckte Sichern-Lauf. */
  onClose: () => void;
}

export function TodoDetailModal({ todo, categories, onSave, onClose }: TodoDetailModalProps) {
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description);
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [dueDate, setDueDate] = useState(todo.due_date ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(todo.category_id);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Nur die Felder, die sich gegenueber dem Ausgangsstand unterscheiden. */
  function buildPatch(trimmedTitle: string): TodoFieldsPatch {
    const patch: TodoFieldsPatch = {};
    if (trimmedTitle !== todo.title) patch.title = trimmedTitle;
    if (description !== todo.description) patch.description = description;
    if (priority !== todo.priority) patch.priority = priority;
    const nextDueDate = dueDate || null;
    if (nextDueDate !== todo.due_date) patch.dueDate = nextDueDate;
    if (categoryId !== todo.category_id) patch.categoryId = categoryId;
    return patch;
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Der Titel darf nicht leer sein.");
      return;
    }

    const patch = buildPatch(trimmedTitle);
    // Nichts geaendert: schliessen, ohne zu schreiben.
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await onSave(todo.id, patch);
      onClose();
    } catch (err) {
      // Offen lassen: der Entwurf ist sonst verloren.
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  // Enter gehoert im Textfeld dem Zeilenumbruch, Strg+Enter sichert.
  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSave();
    }
  }

  return (
    <Modal variant="todo" title="Aufgabe bearbeiten" onClose={onClose} closeLabel="Schließen">
      <div className="todo-modal-body" onKeyDown={handleKeyDown}>
        <div className="todo-modal-field">
          <label htmlFor="todo-detail-title">Titel</label>
          <input
            id="todo-detail-title"
            className="edit-input"
            type="text"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
        </div>

        <div className="todo-modal-field">
          <label htmlFor="todo-detail-description">Beschreibung</label>
          <textarea
            id="todo-detail-description"
            className="todo-modal-description"
            value={description}
            placeholder="Was zur Aufgabe noch zu sagen ist"
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
        </div>

        <div className="todo-modal-row">
          <div className="todo-modal-field">
            <label htmlFor="todo-detail-priority">Priorität</label>
            <PrioritySelect
              id="todo-detail-priority"
              value={priority}
              onValueChange={setPriority}
            />
          </div>

          <div className="todo-modal-field">
            <label htmlFor="todo-detail-due">Fällig</label>
            <input
              id="todo-detail-due"
              className="edit-date-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.currentTarget.value)}
            />
          </div>

          <div className="todo-modal-field">
            <label htmlFor="todo-detail-category">Kategorie</label>
            <CategorySelect
              id="todo-detail-category"
              categories={categories}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholderLabel="Keine Kategorie"
            />
          </div>
        </div>

        {error && <p className="todo-modal-error">{error}</p>}
      </div>

      <div className="todo-modal-actions">
        <button type="button" className="todo-modal-cancel" onClick={onClose}>
          Abbrechen
        </button>
        <button type="button" className="todo-modal-save" onClick={handleSave} disabled={saving}>
          Sichern
        </button>
      </div>
    </Modal>
  );
}
```

`todo-modal-cancel` und `todo-modal-save` sind in Task 6 angelegt worden. `edit-input` und `edit-date-input` gibt es bereits — sie stammen aus der Inline-Bearbeitung, die Task 8 aus der Zeile entfernt, und werden hier weiterverwendet.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/TodoDetailModal.test.tsx`
Expected: PASS, 7 Tests

Run: `npm run typecheck`
Expected: keine Fehler

- [ ] **Step 5: Commit**

```bash
git add src/TodoDetailModal.tsx src/TodoDetailModal.test.tsx
git commit -m "feat: add a todo detail modal"
```

---

## Task 8: Das Fenster in der App

**Files:**
- Modify: `src/App.tsx` (Imports, Zustand, `startEdit`/`commitEdit`, Listenzeile, Kanban-Karte, Render-Ende)
- Test: `src/App.test.tsx`

Hier verschwindet die Inline-Bearbeitung des Titels. Betroffen sind in `src/App.tsx`: der Import von `updateTodoTitle` und `updateTodoDueDate` (nur noch nötig, falls sie anderswo benutzt werden — sonst entfernen), die Zustände `editingId`, `editingTitle`, `editingDueDate`, die Funktionen `startEdit` und `commitEdit` sowie der `editingId === todo.id`-Zweig in der Listenzeile.

- [ ] **Step 1: Write the failing tests**

In `src/App.test.tsx`, ans Ende des `describe("App", …)`-Blocks:

```tsx
  it("opens the detail modal from the pencil button", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Bearbeiten/i }));

    expect(await screen.findByLabelText(/Beschreibung/i)).toBeInTheDocument();
  });

  it("opens the detail modal on a double click on the title", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.doubleClick(screen.getByText("Task"));

    expect(await screen.findByLabelText(/Beschreibung/i)).toBeInTheDocument();
  });

  it("writes the changed fields through updateTodoFields", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);
    vi.mocked(db.updateTodoFields).mockResolvedValue(
      makeTodo({ id: 7, title: "Task", description: "Neuer Text" }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Bearbeiten/i }));
    fireEvent.change(await screen.findByLabelText(/Beschreibung/i), {
      target: { value: "Neuer Text" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(db.updateTodoFields).toHaveBeenCalledWith(7, { description: "Neuer Text" });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText(/Beschreibung/i)).not.toBeInTheDocument();
    });
  });

  it("marks a todo that has a description", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 7, title: "Mit Text", description: "Belege holen" }),
      makeTodo({ id: 8, title: "Ohne Text" }),
    ]);

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText("Mit Text")).toBeInTheDocument());

    expect(container.querySelectorAll(".todo-note-mark")).toHaveLength(1);
  });

  it("previews the description on the kanban card", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 7, title: "Task", description: "Zeile eins\nZeile zwei" }),
    ]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

    expect(await screen.findByText("Zeile eins Zeile zwei")).toBeInTheDocument();
  });
```

Der Helfer `makeTodo` steht bereits in der Datei — er braucht jetzt ein `description: ""` in seinen Vorgabewerten. Ebenso muss `db.updateTodoFields` im `vi.mock("./db", …)`-Block als `vi.fn()` auftauchen; die vorhandenen Einträge zeigen die Form.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx -t "detail modal"`
Expected: FAIL — `Unable to find a label with the text of: /Beschreibung/i`

- [ ] **Step 3: Die Inline-Bearbeitung ausbauen**

In `src/App.tsx`:

1. `editingId`, `editingTitle`, `editingDueDate` samt ihren `useState`-Zeilen entfernen.
2. `startEdit` und `commitEdit` entfernen.
3. In der Listenzeile den gesamten `{editingId === todo.id ? ( … ) : ( … )}`-Ausdruck durch den Nicht-Bearbeiten-Zweig ersetzen und die beiden `editingId !== todo.id &&`-Bedingungen bei `DueDateBadge` und `PrioritySelect` streichen:

```tsx
                <span className="title" onDoubleClick={() => setDetailTodoId(todo.id)}>
                  {todo.title}
                  {todo.description && (
                    <span className="todo-note-mark" aria-label="Hat eine Beschreibung">
                      <NoteIcon />
                    </span>
                  )}
                </span>

                {todo.due_date && (
                  <DueDateBadge overdue={overdue} today={today && !todo.done}>
                    {formatDate(todo.due_date)}
                  </DueDateBadge>
                )}

                <PrioritySelect
                  variant="inline"
                  value={todo.priority}
                  onValueChange={(priority) => handlePriorityChange(todo.id, priority)}
                  aria-label="Priorität ändern"
                />
```

4. Den Stift-Knopf umhängen:

```tsx
                  <IconButton
                    variant="action"
                    onClick={() => setDetailTodoId(todo.id)}
                    aria-label="Bearbeiten"
                  >
                    <PencilIcon />
                  </IconButton>
```

5. Ist `InlineEditInput` danach in `App.tsx` nur noch für Kategorien im Einsatz, bleibt der Import; wird er gar nicht mehr benutzt, entfernen. Gleiches gilt für `updateTodoTitle` und `updateTodoDueDate` aus `./db`.

- [ ] **Step 4: Zustand und Speichern ergänzen**

In `src/App.tsx`, bei den übrigen `useState`-Zeilen:

```tsx
  // Die Aufgabe, deren Detail-Fenster offen ist. Ueber die Id, nicht ueber
  // das Objekt: nach einem Neuladen (auch durch MCP) zeigt das Fenster so den
  // frischen Stand und nicht eine Kopie von vorhin.
  const [detailTodoId, setDetailTodoId] = useState<number | null>(null);
```

Bei den übrigen Handlern:

```tsx
  const closeDetail = useCallback(() => setDetailTodoId(null), []);

  async function handleSaveDetail(id: number, patch: TodoFieldsPatch) {
    const updated = await updateTodoFields(id, patch);
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setError(null);
  }
```

`handleSaveDetail` fängt bewusst nichts ab: das Fenster zeigt den Fehler selbst und bleibt offen.

Am Ende des Renderbaums, bei den anderen Modals:

```tsx
      {detailTodo && (
        <TodoDetailModal
          todo={detailTodo}
          categories={categories}
          onSave={handleSaveDetail}
          onClose={closeDetail}
        />
      )}
```

Dazu, oberhalb des `return`:

```tsx
  const detailTodo = detailTodoId === null ? null : todos.find((t) => t.id === detailTodoId) ?? null;
```

Und die Importe:

```tsx
import { updateTodoFields } from "./db";
import type { TodoFieldsPatch } from "./storeTypes";
import { TodoDetailModal } from "./TodoDetailModal";
import { NoteIcon } from "./ui";
```

(`updateTodoFields` gehört in die bestehende `from "./db"`-Liste, `NoteIcon` in die bestehende `from "./ui"`-Liste.)

- [ ] **Step 5: Die Kanban-Karte**

In `src/App.tsx`, in der Karte direkt hinter `<span className="kanban-card-title">{todo.title}</span>`:

```tsx
                          {todo.description && (
                            <p className="kanban-card-description">
                              {todo.description.replace(/\s*\n+\s*/g, " ")}
                            </p>
                          )}
```

Und am Kartencontainer den Doppelklick ergänzen:

```tsx
                          onDoubleClick={() => setDetailTodoId(todo.id)}
```

Der Umbruch wird für die Vorschau durch ein Leerzeichen ersetzt, damit `-webkit-line-clamp` zwei Zeilen Text zeigt statt zwei Zeilen bis zum ersten Umbruch.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS — auch die vorhandenen Tests, die bisher die Inline-Bearbeitung geprüft haben. Ein Test, der ausdrücklich das Inline-Titelfeld erwartet, wird durch den Modal-Weg ersetzt, nicht gelöscht: was er geprüft hat (Umbenennen funktioniert), muss weiter geprüft werden.

Run: `npm run typecheck && npm test`
Expected: beides grün

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: edit a todo in a detail modal"
```

---

## Task 9: Die Beschreibung im MCP-Store

**Files:**
- Modify: `src-tauri/src/mcp/store.rs` (`Todo`, `TodoRow`, `From<TodoRow>`, `TodoUpdate`, `TODO_COLUMNS`, `add_todo`, `update_todo`)
- Test: `src-tauri/src/mcp/store.rs` (Testmodul am Dateiende)

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/mcp/store.rs`, im `mod tests`-Block bei den übrigen Aufgaben-Tests:

```rust
    #[tokio::test]
    async fn a_new_todo_has_an_empty_description_by_default() {
        let pool = setup().await;

        let todo = add_todo(&pool, "Ohne Text", None, None, None, None)
            .await
            .expect("add");

        assert_eq!(todo.description, "");
    }

    #[tokio::test]
    async fn a_description_survives_creation_and_listing() {
        let pool = setup().await;

        add_todo(&pool, "Mit Text", None, None, None, Some("Zeile eins\nZeile zwei"))
            .await
            .expect("add");

        let todos = list_todos(&pool, None, None, None).await.expect("list");
        assert_eq!(todos[0].description, "Zeile eins\nZeile zwei");
    }

    #[tokio::test]
    async fn update_sets_and_clears_the_description() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Titel", None, None, None, Some("alt"))
            .await
            .expect("add");

        let updated = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                description: Some(Some("neu".to_string())),
                ..Default::default()
            },
        )
        .await
        .expect("update");
        assert_eq!(updated.description, "neu");

        let cleared = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                description: Some(None),
                ..Default::default()
            },
        )
        .await
        .expect("update");
        assert_eq!(cleared.description, "");
    }

    #[tokio::test]
    async fn an_omitted_description_stays_untouched() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Titel", None, None, None, Some("bleibt"))
            .await
            .expect("add");

        let updated = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                title: Some("Neuer Titel".to_string()),
                ..Default::default()
            },
        )
        .await
        .expect("update");

        assert_eq!(updated.description, "bleibt");
        assert_eq!(updated.title, "Neuer Titel");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml description`
Expected: FAIL — `this function takes 5 arguments but 6 arguments were supplied`, `no field 'description' on type 'TodoUpdate'`

- [ ] **Step 3: Typen und Spaltenliste**

In `src-tauri/src/mcp/store.rs`:

`pub struct Todo` um ein Feld hinter `title` ergänzen:

```rust
    pub description: String,
```

`struct TodoRow` ebenso:

```rust
    description: String,
```

In `impl From<TodoRow> for Todo`, im Konstruktor hinter `title: row.title,`:

```rust
            description: row.description,
```

`TODO_COLUMNS`:

```rust
const TODO_COLUMNS: &str = "t.id, t.title, t.description, t.done, t.status, t.priority,
     t.created_at, t.due_date, t.category_id, c.name AS category_name, c.color AS category_color";
```

`TodoUpdate` um ein Feld und `is_empty` um eine Bedingung erweitern:

```rust
pub struct TodoUpdate {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<Option<String>>,
    pub category: Option<Option<String>>,
}

impl TodoUpdate {
    fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.status.is_none()
            && self.priority.is_none()
            && self.due_date.is_none()
            && self.category.is_none()
    }
}
```

- [ ] **Step 4: `add_todo` erweitern**

```rust
pub async fn add_todo(
    pool: &Pool<Sqlite>,
    title: &str,
    priority: Option<&str>,
    due_date: Option<&str>,
    category: Option<&str>,
    description: Option<&str>,
) -> Result<Todo, StoreError> {
```

Im Rumpf, hinter der Kategorie-Aufloesung:

```rust
    let description = description.unwrap_or("");
```

Und das `INSERT` austauschen:

```rust
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO todos (title, description, done, status, priority, created_at, due_date, category_id)
         VALUES (?, ?, 0, 'todo', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?)
         RETURNING id",
    )
    .bind(title)
    .bind(description)
    .bind(priority)
    .bind(due_date)
    .bind(category_id)
    .fetch_one(pool)
    .await?;
```

- [ ] **Step 5: `update_todo` erweitern**

In `update_todo`, bei der Prüfung der übrigen Felder:

```rust
    // `Some(None)` heisst leeren; in der Spalte steht dann der leere String,
    // nicht NULL -- die Spalte ist NOT NULL, und "keine Beschreibung" soll
    // nur eine Schreibweise haben.
    let description = match &update.description {
        Some(Some(text)) => Some(text.to_string()),
        Some(None) => Some(String::new()),
        None => None,
    };
```

Bei den `assignments`, hinter dem Titel:

```rust
    if description.is_some() {
        assignments.push("description = ?");
    }
```

Und bei den `bind`-Aufrufen, in derselben Reihenfolge wie die `assignments`:

```rust
    if let Some(description) = description {
        query = query.bind(description);
    }
```

**Reihenfolge beachten:** `assignments` und `bind`-Aufrufe müssen dieselbe Folge haben, sonst landen Werte in den falschen Spalten. Die Beschreibung steht in beiden Listen direkt hinter dem Titel.

- [ ] **Step 6: Die Aufrufer in tools.rs anpassen**

`store::add_todo` in `src-tauri/src/mcp/tools.rs` bekommt vorerst `None` als sechstes Argument, damit der Code kompiliert; Task 10 füllt es:

```rust
            store::add_todo(
                &self.pool,
                params.title.trim(),
                non_empty(&params.priority),
                non_empty(&params.due_date),
                non_empty(&params.category),
                None,
            )
```

Und im `TodoUpdate`-Literal derselben Datei:

```rust
            description: None,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, alle Tests

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/mcp/store.rs src-tauri/src/mcp/tools.rs
git commit -m "feat: read and write todo descriptions in the mcp store"
```

---

## Task 10: Die Beschreibung an der Tool-Grenze

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs` (Grenzen, `check_multiline`, `AddTodo`, `UpdateTodo`, die beiden Tool-Rümpfe)
- Test: `src-tauri/src/mcp/tools.rs` (Testmodul)

- [ ] **Step 1: Write the failing tests**

Im Testmodul von `src-tauri/src/mcp/tools.rs` (existiert keines, ein `#[cfg(test)] mod tests { use super::*; … }` am Dateiende anlegen):

```rust
    #[test]
    fn a_line_break_is_allowed_in_a_multiline_field() {
        assert!(check_multiline("Die Beschreibung", "Zeile eins\nZeile zwei", 100).is_ok());
    }

    #[test]
    fn other_control_characters_stay_forbidden_in_a_multiline_field() {
        for (input, name) in [("a\rb", "carriage return"), ("a\tb", "tab"), ("a\0b", "nul")] {
            let error = check_multiline("Die Beschreibung", input, 100)
                .expect_err(&format!("{name} must be rejected"));
            assert!(error.contains("Steuerzeichen"), "got: {error}");
        }
    }

    #[test]
    fn the_message_names_the_line_break_that_is_allowed() {
        let error = check_multiline("Die Beschreibung", "a\rb", 100).expect_err("rejected");
        assert!(error.contains("\\n"), "got: {error}");
    }

    #[test]
    fn a_multiline_field_has_a_length_limit() {
        let error = check_multiline("Die Beschreibung", &"z".repeat(101), 100).expect_err("too long");
        assert!(error.contains("101"), "got: {error}");
        assert!(error.contains("100"), "got: {error}");
    }

    #[test]
    fn the_description_limit_is_generous_but_finite() {
        assert!(check_multiline("Die Beschreibung", &"z".repeat(MAX_DESCRIPTION_CHARS), MAX_DESCRIPTION_CHARS).is_ok());
        assert!(check_multiline(
            "Die Beschreibung",
            &"z".repeat(MAX_DESCRIPTION_CHARS + 1),
            MAX_DESCRIPTION_CHARS
        )
        .is_err());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml multiline`
Expected: FAIL — `cannot find function 'check_multiline' in this scope`

- [ ] **Step 3: Grenze und Prüfung schreiben**

In `src-tauri/src/mcp/tools.rs`, bei den übrigen Grenzen:

```rust
/// Eine Beschreibung darf ein paar Absaetze lang sein, kein Dokument.
/// 4000 Zeichen sind etwa anderthalb Seiten Prosa.
const MAX_DESCRIPTION_CHARS: usize = 4000;
```

Hinter `check_text`:

```rust
/// Wie `check_text`, laesst aber den Zeilenumbruch durch.
///
/// Fuer Felder, die mehrere Absaetze tragen duerfen. Erlaubt ist `\n` und
/// sonst nichts: `\r` wird mit abgelehnt, obwohl Clients Zeilenumbrueche gern
/// als `\r\n` schicken. Ein stillschweigend zu `\n` umgeschriebenes `\r\n`
/// gaebe dem Absender etwas anderes zurueck, als er geschickt hat -- dieselbe
/// Entscheidung wie bei "09:07" in `slots.rs`. Die Meldung sagt deshalb, wie
/// der Umbruch auszusehen hat.
fn check_multiline(label: &str, value: &str, max: usize) -> Result<(), String> {
    let length = value.chars().count();
    if length > max {
        return Err(format!(
            "{label} ist mit {length} Zeichen zu lang; erlaubt sind hoechstens {max}."
        ));
    }
    if value.chars().any(|c| c.is_control() && c != '\n') {
        return Err(format!(
            "{label} darf ausser dem Zeilenumbruch keine Steuerzeichen enthalten -- \
             kein Nullbyte, keinen Tabulator und kein Wagenruecklaufzeichen; \
             ein Zeilenumbruch ist als \\n zu schicken."
        ));
    }
    Ok(())
}
```

- [ ] **Step 4: Die Tool-Parameter**

In `struct AddTodo`, hinter `title`:

```rust
    /// Frei formulierter Text zur Aufgabe, hoechstens 4000 Zeichen.
    /// Zeilenumbrueche sind erlaubt und als \n zu schicken; andere
    /// Steuerzeichen werden abgelehnt. Ohne Angabe bleibt sie leer.
    pub description: Option<String>,
```

In `struct UpdateTodo`, hinter `title`:

```rust
    /// Neue Beschreibung, hoechstens 4000 Zeichen. Zeilenumbrueche sind
    /// erlaubt und als \n zu schicken; andere Steuerzeichen werden abgelehnt.
    /// null leert die Beschreibung; das Feld wegzulassen laesst sie
    /// unveraendert. Das ist ein Unterschied: null loescht, weglassen aendert
    /// nichts.
    #[serde(default, deserialize_with = "double_option")]
    #[schemars(with = "Option<String>")]
    pub description: Option<Option<String>>,
```

- [ ] **Step 5: Die Tool-Rümpfe**

In `add_todo` die Prüfkette erweitern und das `None` aus Task 9 ersetzen:

```rust
        let checked = check_text("Der Titel", params.title.trim(), MAX_TITLE_CHARS)
            .and_then(|()| {
                check_multiline(
                    "Die Beschreibung",
                    params.description.as_deref().unwrap_or(""),
                    MAX_DESCRIPTION_CHARS,
                )
            })
            .and_then(|()| check_category(non_empty(&params.category)));
        if let Err(message) = checked {
            return Ok(tool_error(message));
        }
        self.respond_write(
            store::add_todo(
                &self.pool,
                params.title.trim(),
                non_empty(&params.priority),
                non_empty(&params.due_date),
                non_empty(&params.category),
                params.description.as_deref(),
            )
            .await,
        )
```

In `update_todo` ebenso:

```rust
        let checked = check_optional(
            "Der Titel",
            params.title.as_deref().map(str::trim),
            MAX_TITLE_CHARS,
        )
        .and_then(|()| {
            match params.description.as_ref().and_then(|d| d.as_deref()) {
                Some(text) => check_multiline("Die Beschreibung", text, MAX_DESCRIPTION_CHARS),
                None => Ok(()),
            }
        })
        .and_then(|()| check_category(clearable(&params.category).flatten().as_deref()));
        if let Err(message) = checked {
            return Ok(tool_error(message));
        }
        let update = TodoUpdate {
            title: params.title.as_deref().map(str::trim).map(str::to_string),
            // Nicht ueber `clearable`: das trimmt und faltet "" auf None, und
            // beides waere hier falsch. Absaetze am Anfang oder Ende gehoeren
            // dem Text, und "" ist der ausdrueckliche Weg zum Leeren, der
            // `Some(None)` ergeben muss -- genau wie null.
            description: params.description.as_ref().map(|inner| {
                inner.as_deref().filter(|text| !text.is_empty()).map(str::to_string)
            }),
            status: non_empty(&params.status).map(str::to_string),
            priority: non_empty(&params.priority).map(str::to_string),
            due_date: clearable(&params.due_date),
            category: clearable(&params.category),
        };
        self.respond_write(store::update_todo(&self.pool, params.id, update).await)
```

Und die beiden Tool-Beschreibungen um einen Satz ergänzen — `add_todo`: „Eine Beschreibung ist optional und darf mehrere Zeilen haben."; `update_todo`: „Die Beschreibung darf mehrere Zeilen haben; null leert sie."

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, alle Tests

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/mcp/tools.rs
git commit -m "feat: take a description through add_todo and update_todo"
```

---

## Task 11: Der Durchstich im Browser

**Files:**
- Modify: `e2e/todolist.spec.ts`

- [ ] **Step 1: Write the failing test**

In `e2e/todolist.spec.ts`, im `describe`-Block „Layout and UI" oder in einem eigenen `test.describe("Beschreibung", …)` am Dateiende:

```ts
  test("kann eine Beschreibung setzen und im Brett sehen", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    await input.fill("Mit Beschreibung");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();
    await expect(page.getByText("Mit Beschreibung")).toBeVisible();

    await page.getByRole("button", { name: "Aufgabe bearbeiten" }).first().click();
    await page.getByLabel(/Beschreibung/i).fill("Belege aus dem Ordner");
    await page.getByRole("button", { name: /Sichern/i }).click();

    await expect(page.getByLabel(/Beschreibung/i)).not.toBeVisible();

    await page.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }).click();
    await expect(page.getByText("Belege aus dem Ordner")).toBeVisible();
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx playwright test -g "Beschreibung"`
Expected: PASS — der Weg ist nach Task 8 fertig; dieser Test sichert ihn im echten Browser gegen den localStorage-Speicher ab.

Schlägt er fehl, liegt es an der Oberfläche, nicht am Test: Task 8 nacharbeiten, nicht den Test abschwächen.

- [ ] **Step 3: Run the whole suite**

Run: `npx playwright test`
Expected: alle Tests grün. Die Suite flakt gelegentlich unter Last — ein Test, der im Wiederholungslauf durchgeht, ist kein Regress; ein reproduzierbarer Fehlschlag schon.

- [ ] **Step 4: Commit**

```bash
git add e2e/todolist.spec.ts
git commit -m "test: cover the description end to end"
```

---

## Task 12: Die Dokumentation

**Files:**
- Modify: `AGENTS.md` (Abschnitt „MCP-Server")
- Modify: `STYLEGUIDE.md` (Baustein-Katalog, Eintrag `Modal`; Abschnitt „Bewusst nicht extrahiert" falls einschlägig)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: AGENTS.md**

Im Abschnitt „MCP-Server" den Satz über die sieben Tools stehen lassen — es bleiben sieben — und hinter dem Absatz über die Kategorien ergänzen:

```markdown
Eine Aufgabe trägt neben dem Titel eine optionale **Beschreibung**: frei
formulierter Text, höchstens 4000 Zeichen, mehrzeilig. Zeilenumbrüche sind als
`\n` zu schicken; `\r`, Tabulator und Nullbyte werden abgelehnt, statt still
umgeschrieben zu werden. Bei `update_todo` leert `null` die Beschreibung,
Weglassen lässt sie unverändert — dieselbe Regel wie bei Fälligkeit und
Kategorie.
```

- [ ] **Step 2: STYLEGUIDE.md**

Im Eintrag `Modal` die Zeile zur `variant`-Prop auf die dritte Breite erweitern:

```markdown
| `variant` | `"changelog" \| "category" \| "todo"` | Wählt die Panelbreite (520 / 460 / 560 px). |
```

Und im Baustein-Katalog beim Icon-Abschnitt `NoteIcon` erwähnen, falls dort einzelne Icons aufgezählt werden.

- [ ] **Step 3: CHANGELOG.md**

Über dem obersten Eintrag einen neuen Abschnitt anlegen, in der Sprache der bestehenden Einträge — was die Nutzerin davon hat, nicht welche Funktion umgeschrieben wurde:

```markdown
## [Unreleased]

### Hinzugefügt
- Eine Aufgabe kann jetzt eine Beschreibung tragen: Ein Klick auf den Stift in der Zeile — oder ein Doppelklick auf den Titel — öffnet ein Fenster, in dem Titel, Beschreibung, Priorität, Fälligkeit und Kategorie zusammen stehen. Die Beschreibung darf mehrere Absätze haben. Gesichert wird alles auf einmal; Abbrechen verwirft.
- Aufgaben mit Beschreibung sind in der Liste an einem kleinen Notiz-Symbol zu erkennen, im Brett zeigt die Karte die ersten zwei Zeilen.
- Ein KI-Assistent kann die Beschreibung über MCP mitlesen, setzen und wieder leeren.

### Geändert
- Der Titel wird nicht mehr direkt in der Zeile umbenannt, sondern im neuen Fenster. Priorität, Fälligkeit und Kategorie bleiben in der Zeile bedienbar.
```

- [ ] **Step 4: Die ganze Suite**

Run: `npm run typecheck && npm test && cargo test --manifest-path src-tauri/Cargo.toml && npx playwright test`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md STYLEGUIDE.md CHANGELOG.md
git commit -m "docs: document the todo description"
```

---

## Abschluss

Nach Task 12 ist der Stand vollständig: Spalte, beide Speicher, Fenster, Liste, Brett, MCP, Tests und Dokumentation. Vor dem Zusammenführen nach `main` gilt die Regel aus `AGENTS.md` — `npm run typecheck && npm test` muss lokal durchlaufen, dazu die Rust-Tests und die Playwright-Suite.

Für den Abschluss des Zweigs (Merge, Pull Request oder Aufräumen) die Skill `superpowers:finishing-a-development-branch` benutzen.
