# Papierkorb und Rückgängig — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gelöschte Aufgaben landen in einem Papierkorb statt verloren zu gehen — mit Rückgängig in der Oberfläche, einem Papierkorb-Fenster und 30 Tagen Aufbewahrung.

**Architecture:** Eine Spalte `deleted_at` auf `todos`; jeder Lesepfad filtert sie über eine Konstante je Backend. `deleteTodo` setzt die Spalte, `purgeTodo` löscht wirklich. Alle drei Speicher-Implementierungen (SQLite-Frontend, localStorage, Rust/MCP) tragen dieselbe Semantik.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, Tauri 2 mit tauri-plugin-sql, Rust mit sqlx und rmcp, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-papierkorb-undo-design.md`

**Vor jedem Commit:** `npm run typecheck && npm run lint && npm test` (bei Rust-Änderungen zusätzlich `npm run test:rust && npm run lint:rust`).

---

### Task 1: Migration 11 — die Spalte

**Files:**
- Modify: `src-tauri/src/lib.rs` (Migrationsliste, nach Version 10)
- Test: `src/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/migrations.test.ts` anhängen, innerhalb von `describe("sql migrations", ...)`:

```ts
  it("adds the deleted_at column the trash needs", () => {
    expect(source).toContain("add_deleted_at_to_todos");
    expect(source).toContain("ALTER TABLE todos ADD COLUMN deleted_at TEXT DEFAULT NULL;");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/migrations.test.ts`
Expected: FAIL — `expected '…' to contain 'add_deleted_at_to_todos'`

- [ ] **Step 3: Write minimal implementation**

In `src-tauri/src/lib.rs`, direkt hinter der Migration mit `version: 10` und vor dem schließenden `];`:

```rust
        // Eine geloeschte Aufgabe verschwindet nicht, sie bekommt einen
        // Zeitstempel: gesetzt heisst "liegt im Papierkorb". Der Wert traegt
        // zugleich die Aufbewahrungsfrist, eine zweite Spalte braucht es nicht.
        Migration {
            version: 11,
            description: "add_deleted_at_to_todos",
            sql: "ALTER TABLE todos ADD COLUMN deleted_at TEXT DEFAULT NULL;",
            kind: MigrationKind::Up,
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/migrations.test.ts`
Expected: PASS (beide Tests, auch der auf fortlaufende Nummern)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src/migrations.test.ts
git commit -m "feat: add the deleted_at column a trash needs"
```

---

### Task 2: SQLite-Store — weich löschen und überall filtern

**Files:**
- Modify: `src/todoStoreSql.ts`
- Test: `src/todoStoreSql.test.ts`

Der Store wird in seinen Tests gegen einen `sqlClient`-Mock gefahren; die Tests
prüfen das abgesetzte SQL, nicht eine echte Datenbank. Sieh dir den Kopf von
`src/todoStoreSql.test.ts` an, bevor du die Tests schreibst — `db.select` und
`db.execute` sind dort bereits als Mocks vorbereitet.

- [ ] **Step 1: Write the failing test**

An `src/todoStoreSql.test.ts` anhängen:

```ts
describe("der Papierkorb im SQLite-Store", () => {
  it("löscht weich statt die Zeile zu entfernen", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });

    await sqlTodoStore.deleteTodo(7);

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("UPDATE todos");
    expect(sql).toContain("deleted_at");
    expect(sql).not.toContain("DELETE FROM todos");
    expect(params).toEqual([7]);
  });

  it("blendet den Papierkorb aus jeder Leseabfrage aus", async () => {
    select.mockResolvedValue([]);

    await sqlTodoStore.listTodos();
    await sqlTodoStore.listTodos(3);

    for (const [sql] of select.mock.calls) {
      expect(sql).toContain("t.deleted_at IS NULL");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/todoStoreSql.test.ts`
Expected: FAIL — das erste `execute`-SQL ist `DELETE FROM todos WHERE id = $1`

- [ ] **Step 3: Write minimal implementation**

In `src/todoStoreSql.ts` direkt unter `TODO_COLUMNS` einfügen:

```ts
// Die eine Stelle, an der steht, was "nicht im Papierkorb" heisst. Jede
// Leseabfrage haengt sie an -- eine vergessene wuerde weggeworfene Aufgaben
// wieder auftauchen lassen.
const NOT_DELETED = "t.deleted_at IS NULL";
```

`selectTodo` bekommt die Bedingung in seine `WHERE`-Zeile:

```ts
     WHERE t.id = $1 AND ${NOT_DELETED}`,
```

`listTodos` baut seine `WHERE`-Zeile neu:

```ts
async function listTodos(categoryId?: number | null): Promise<Todo[]> {
  const db = await getDb();
  const filter = categoryId !== undefined && categoryId !== null;
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS}
     FROM todos t LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${NOT_DELETED}${filter ? " AND t.category_id = $1" : ""}
     ORDER BY t.created_at DESC, t.id DESC`,
    filter ? [categoryId] : []
  );
  return rows.map(fromRow);
}
```

`deleteTodo` löscht weich:

```ts
async function deleteTodo(id: number): Promise<number> {
  const db = await getDb();
  // Wirft nicht, wenn die Id unbekannt ist -- wie bisher. Der Aufrufer sieht
  // an der zurueckgegebenen Id nur, worauf er gezielt hat.
  await db.execute(
    "UPDATE todos SET deleted_at = datetime('now') WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/todoStoreSql.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoStoreSql.ts src/todoStoreSql.test.ts
git commit -m "feat: send deleted todos to the trash in the SQLite store"
```

---

### Task 3: localStorage-Store — dieselbe Semantik ohne SQL

**Files:**
- Modify: `src/todoStoreLocal.ts`
- Test: `src/todoStoreLocal.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/todoStoreLocal.test.ts` anhängen (die Datei arbeitet gegen das echte
`localStorage` von jsdom; sieh dir das `beforeEach` am Dateianfang an):

```ts
describe("der Papierkorb im localStorage-Store", () => {
  it("nimmt eine gelöschte Aufgabe aus der Liste, behält sie aber gespeichert", async () => {
    const todo = await localTodoStore.addTodo("Weg damit", "medium", null);

    await localTodoStore.deleteTodo(todo.id);

    expect(await localTodoStore.listTodos()).toEqual([]);
    const raw = JSON.parse(localStorage.getItem("todolist_todos") ?? "[]");
    expect(raw).toHaveLength(1);
    expect(raw[0].deleted_at).toEqual(expect.any(String));
  });

  it("gibt eine Aufgabe ohne den internen Zeitstempel heraus", async () => {
    const todo = await localTodoStore.addTodo("Bleibt", "medium", null);

    const [listed] = await localTodoStore.listTodos();

    expect(listed).toEqual(todo);
    expect("deleted_at" in listed).toBe(false);
  });

  it("nimmt auch einer Aufgabe im Papierkorb die gelöschte Kategorie", async () => {
    const kategorie = await localTodoStore.addCategory("Kunde", "#111111");
    const todo = await localTodoStore.addTodo("Weg damit", "medium", null, kategorie.id);
    await localTodoStore.deleteTodo(todo.id);

    await localTodoStore.deleteCategory(kategorie.id);

    const raw = JSON.parse(localStorage.getItem("todolist_todos") ?? "[]");
    expect(raw[0].category_id).toBeNull();
    expect(raw[0].deleted_at).toEqual(expect.any(String));
  });

  it("behandelt eine Aufgabe im Papierkorb wie eine unbekannte Id", async () => {
    const todo = await localTodoStore.addTodo("Weg damit", "medium", null);
    await localTodoStore.deleteTodo(todo.id);

    await expect(localTodoStore.toggleTodoDone(todo.id, true)).rejects.toThrow(
      `Todo ${todo.id} not found`
    );
    await expect(localTodoStore.updateTodoPriority(todo.id, "high")).rejects.toThrow(
      `Todo ${todo.id} not found`
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/todoStoreLocal.test.ts`
Expected: FAIL — nach `deleteTodo` ist der Rohbestand leer (`toHaveLength(1)` schlägt fehl)

- [ ] **Step 3: Write minimal implementation**

In `src/todoStoreLocal.ts` unter den Schlüssel-Konstanten einfügen:

```ts
/** Wie eine Aufgabe im localStorage liegt: mit dem Papierkorb-Zeitstempel, den
 *  der `Todo`-Typ bewusst nicht kennt. Gesetzt heisst "liegt im Papierkorb". */
type StoredTodoRecord = Todo & { deleted_at?: string | null };

/** Streift den internen Zeitstempel ab, bevor eine Aufgabe den Store verlaesst. */
function toTodo(stored: StoredTodoRecord): Todo {
  const { deleted_at: _deleted, ...todo } = stored;
  return todo;
}

function isInTrash(stored: StoredTodoRecord): boolean {
  return typeof stored.deleted_at === "string";
}
```

`loadTodos` und `saveTodos` arbeiten ab jetzt auf `StoredTodoRecord[]` —
Rückgabetyp und Parameter entsprechend ändern, die Körper bleiben. `migrateTodos`
gibt ebenfalls `StoredTodoRecord[]` zurück; ihr Rückgabetyp wird von `Todo[]` auf
`StoredTodoRecord[]` geändert, sonst nichts.

`selectTodos` filtert und streift ab:

```ts
function selectTodos(categoryId?: number | null): Todo[] {
  let todos = loadTodos().filter((t) => !isInTrash(t));
  if (categoryId !== undefined && categoryId !== null) {
    todos = todos.filter((t) => t.category_id === categoryId);
  }
  return todos
    .slice()
    .sort((a, b) => {
      const dateCmp = b.created_at.localeCompare(a.created_at);
      if (dateCmp !== 0) return dateCmp;
      return b.id - a.id;
    })
    .map(toTodo);
}
```

Jede Schreibfunktion, die heute `todos.findIndex((t) => t.id === id)` benutzt
(`updateTodoDueDate`, `updateTodoPriority`, `updateTodoCategory`,
`updateTodoFields`, `updateTodoStatus`, `toggleTodoDone`), sucht ab jetzt:

```ts
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
```

und gibt am Ende `Promise.resolve(toTodo(todos[idx]))` statt
`Promise.resolve(todos[idx])` zurück.

`deleteTodo` markiert statt zu filtern:

```ts
function deleteTodo(id: number): Promise<number> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx !== -1) {
    todos[idx] = { ...todos[idx], deleted_at: now() };
    saveTodos(todos);
  }
  return Promise.resolve(id);
}
```

`addTodo` bleibt unverändert: eine neue Aufgabe hat schlicht kein `deleted_at`.

`deleteCategory` räumt weiterhin über den ganzen Bestand — auch über den
Papierkorb; das ist der in der Spec festgelegte Randfall und schon so
implementiert, weil die Schleife über `loadTodos()` läuft.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/todoStoreLocal.test.ts`
Expected: PASS, auch alle bestehenden Tests der Datei

- [ ] **Step 5: Commit**

```bash
git add src/todoStoreLocal.ts src/todoStoreLocal.test.ts
git commit -m "feat: send deleted todos to the trash in the localStorage store"
```

---

### Task 4: Papierkorb lesen und wiederherstellen

**Files:**
- Modify: `src/storeTypes.ts`, `src/todoStoreSql.ts`, `src/todoStoreLocal.ts`, `src/db.ts`
- Test: `src/todoStoreSql.test.ts`, `src/todoStoreLocal.test.ts`, `src/db.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/todoStoreLocal.test.ts` anhängen:

```ts
describe("listDeletedTodos und restoreTodo im localStorage-Store", () => {
  it("zeigt zuletzt Gelöschtes zuerst", async () => {
    const erste = await localTodoStore.addTodo("Erste", "medium", null);
    const zweite = await localTodoStore.addTodo("Zweite", "medium", null);

    await localTodoStore.deleteTodo(erste.id);
    await localTodoStore.deleteTodo(zweite.id);

    const trash = await localTodoStore.listDeletedTodos();
    expect(trash.map((t) => t.title)).toEqual(["Zweite", "Erste"]);
    expect("deleted_at" in trash[0]).toBe(false);
  });

  it("holt eine Aufgabe zurück in die Liste", async () => {
    const todo = await localTodoStore.addTodo("Zurück", "medium", null);
    await localTodoStore.deleteTodo(todo.id);

    const restored = await localTodoStore.restoreTodo(todo.id);

    expect(restored).toEqual(todo);
    expect(await localTodoStore.listTodos()).toEqual([todo]);
    expect(await localTodoStore.listDeletedTodos()).toEqual([]);
  });

  it("lehnt das Wiederherstellen einer nicht gelöschten Aufgabe ab", async () => {
    const todo = await localTodoStore.addTodo("Lebt", "medium", null);

    await expect(localTodoStore.restoreTodo(todo.id)).rejects.toThrow(
      `Todo ${todo.id} not found`
    );
  });
});
```

An `src/todoStoreSql.test.ts` anhängen:

```ts
describe("listDeletedTodos und restoreTodo im SQLite-Store", () => {
  it("liest den Papierkorb, zuletzt Gelöschtes zuerst", async () => {
    select.mockResolvedValue([]);

    await sqlTodoStore.listDeletedTodos();

    const [sql] = select.mock.calls[0];
    expect(sql).toContain("t.deleted_at IS NOT NULL");
    expect(sql).toContain("ORDER BY t.deleted_at DESC, t.id DESC");
  });

  it("setzt den Zeitstempel beim Wiederherstellen zurück", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([
      {
        id: 7,
        title: "Zurück",
        description: "",
        done: 0,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-01T00:00:00Z",
        due_date: null,
        category_id: null,
        category_name: null,
        category_color: null,
      },
    ]);

    const restored = await sqlTodoStore.restoreTodo(7);

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("SET deleted_at = NULL");
    expect(params).toEqual([7]);
    expect(restored.id).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/todoStoreLocal.test.ts src/todoStoreSql.test.ts`
Expected: FAIL — `localTodoStore.listDeletedTodos is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/storeTypes.ts`, im `TodoStore`-Interface direkt hinter `deleteTodo`:

```ts
  /**
   * Was im Papierkorb liegt, zuletzt Geloeschtes zuerst. `deleteTodo` legt
   * hier ab, `restoreTodo` holt zurueck, `purgeTodo` raeumt endgueltig weg.
   */
  listDeletedTodos(): Promise<Todo[]>;
  /** Holt eine Aufgabe aus dem Papierkorb zurueck; lehnt mit `Todo <id> not found` ab, wenn `id` nicht im Papierkorb liegt — als Promise-Rejection, nie als synchroner throw. */
  restoreTodo(id: number): Promise<Todo>;
```

Und der Kommentar über `deleteTodo` wird ergänzt:

```ts
  /** Legt die Aufgabe in den Papierkorb (setzt `deleted_at`); eine unbekannte oder bereits abgelegte Id bleibt folgenlos. Endgueltig entfernt erst `purgeTodo`. */
  deleteTodo(id: number): Promise<number>;
```

In `src/todoStoreSql.ts`:

```ts
async function listDeletedTodos(): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS}
     FROM todos t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.deleted_at IS NOT NULL
     ORDER BY t.deleted_at DESC, t.id DESC`
  );
  return rows.map(fromRow);
}

async function restoreTodo(id: number): Promise<Todo> {
  const db = await getDb();
  const result = await db.execute(
    "UPDATE todos SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
    [id]
  );
  if (result.rowsAffected === 0) throw new Error(`Todo ${id} not found`);
  return selectTodo(id);
}
```

Beide in das `sqlTodoStore`-Objekt aufnehmen, hinter `deleteTodo`.

In `src/todoStoreLocal.ts`:

```ts
function listDeletedTodos(): Promise<Todo[]> {
  const trash = loadTodos()
    .filter(isInTrash)
    .sort((a, b) => {
      const cmp = (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "");
      return cmp !== 0 ? cmp : b.id - a.id;
    })
    .map(toTodo);
  return Promise.resolve(trash);
}

function restoreTodo(id: number): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && isInTrash(t));
  if (idx === -1) return Promise.reject(new Error(`Todo ${id} not found`));
  todos[idx] = { ...todos[idx], deleted_at: null };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}
```

Beide in das `localTodoStore`-Objekt aufnehmen.

In `src/db.ts`, hinter `deleteTodo`:

```ts
export function listDeletedTodos(): Promise<Todo[]> {
  return store().listDeletedTodos();
}

export function restoreTodo(id: number): Promise<Todo> {
  return store().restoreTodo(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — alle Dateien

- [ ] **Step 5: Commit**

```bash
git add src/storeTypes.ts src/todoStoreSql.ts src/todoStoreLocal.ts src/db.ts src/todoStoreSql.test.ts src/todoStoreLocal.test.ts
git commit -m "feat: read the trash and restore from it"
```

---

### Task 5: Endgültig löschen und Frist

**Files:**
- Modify: `src/storeTypes.ts`, `src/todoStoreSql.ts`, `src/todoStoreLocal.ts`, `src/db.ts`
- Test: `src/todoStoreSql.test.ts`, `src/todoStoreLocal.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/todoStoreLocal.test.ts` anhängen:

```ts
describe("purgeTodo und purgeDeletedBefore im localStorage-Store", () => {
  it("entfernt eine Aufgabe unwiederbringlich", async () => {
    const todo = await localTodoStore.addTodo("Endgültig", "medium", null);
    await localTodoStore.deleteTodo(todo.id);

    await localTodoStore.purgeTodo(todo.id);

    expect(await localTodoStore.listDeletedTodos()).toEqual([]);
    expect(JSON.parse(localStorage.getItem("todolist_todos") ?? "[]")).toEqual([]);
  });

  it("entfernt nur, was vor dem Stichtag gelöscht wurde", async () => {
    // Zwei Aufgaben von Hand in den Speicher legen, damit die Zeitstempel fest
    // stehen: der Store bekommt den Stichtag herein, er kennt keine Uhr.
    localStorage.setItem(
      "todolist_todos",
      JSON.stringify([
        { id: 1, title: "Alt", description: "", done: false, status: "todo", priority: "medium", created_at: "2026-01-01T00:00:00Z", due_date: null, category_id: null, category_name: null, category_color: null, deleted_at: "2026-01-02T00:00:00Z" },
        { id: 2, title: "Neu", description: "", done: false, status: "todo", priority: "medium", created_at: "2026-01-01T00:00:00Z", due_date: null, category_id: null, category_name: null, category_color: null, deleted_at: "2026-03-01T00:00:00Z" },
      ])
    );

    const removed = await localTodoStore.purgeDeletedBefore("2026-02-01T00:00:00Z");

    expect(removed).toBe(1);
    expect((await localTodoStore.listDeletedTodos()).map((t) => t.title)).toEqual(["Neu"]);
  });

  it("lässt eine nicht gelöschte Aufgabe vom Stichtag unberührt", async () => {
    const todo = await localTodoStore.addTodo("Lebt", "medium", null);

    const removed = await localTodoStore.purgeDeletedBefore("2099-01-01T00:00:00Z");

    expect(removed).toBe(0);
    expect(await localTodoStore.listTodos()).toEqual([todo]);
  });
});
```

An `src/todoStoreSql.test.ts` anhängen:

```ts
describe("purgeTodo und purgeDeletedBefore im SQLite-Store", () => {
  it("entfernt die Zeile wirklich", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });

    await sqlTodoStore.purgeTodo(7);

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("DELETE FROM todos");
    expect(params).toEqual([7]);
  });

  it("räumt nur den Papierkorb vor dem Stichtag", async () => {
    execute.mockResolvedValue({ rowsAffected: 3 });

    const removed = await sqlTodoStore.purgeDeletedBefore("2026-02-01T00:00:00Z");

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("deleted_at IS NOT NULL");
    expect(sql).toContain("deleted_at < $1");
    expect(params).toEqual(["2026-02-01T00:00:00Z"]);
    expect(removed).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/todoStoreLocal.test.ts src/todoStoreSql.test.ts`
Expected: FAIL — `localTodoStore.purgeTodo is not a function`

- [ ] **Step 3: Write minimal implementation**

Der Vergleich `deleted_at < cutoff` ist ein Textvergleich. Er traegt nur, weil
alle drei Speicher denselben ISO-Zeitstempel schreiben: der localStorage-Store
ueber `now()` (`toISOString()`), die beiden SQL-Speicher ueber
`strftime('%Y-%m-%dT%H:%M:%fZ','now')`. Aendert sich eines dieser Formate,
raeumt die Frist falsch.

In `src/storeTypes.ts`, hinter `restoreTodo`:

```ts
  /** Entfernt eine Aufgabe unwiederbringlich; gibt die Id zurueck. */
  purgeTodo(id: number): Promise<number>;
  /**
   * Entfernt unwiederbringlich alles, was vor `cutoff` (ISO-Zeitstempel) in den
   * Papierkorb gelegt wurde, und gibt die Anzahl zurueck. Der Stichtag kommt
   * vom Aufrufer -- der Store kennt keine Uhr, damit seine Tests keine brauchen.
   */
  purgeDeletedBefore(cutoff: string): Promise<number>;
```

In `src/todoStoreSql.ts`:

```ts
async function purgeTodo(id: number): Promise<number> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
  return id;
}

async function purgeDeletedBefore(cutoff: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM todos WHERE deleted_at IS NOT NULL AND deleted_at < $1",
    [cutoff]
  );
  return result.rowsAffected;
}
```

In `src/todoStoreLocal.ts`:

```ts
function purgeTodo(id: number): Promise<number> {
  saveTodos(loadTodos().filter((t) => t.id !== id));
  return Promise.resolve(id);
}

function purgeDeletedBefore(cutoff: string): Promise<number> {
  const todos = loadTodos();
  const kept = todos.filter((t) => !(isInTrash(t) && (t.deleted_at as string) < cutoff));
  saveTodos(kept);
  return Promise.resolve(todos.length - kept.length);
}
```

Beide Funktionen in die jeweiligen Store-Objekte aufnehmen.

In `src/db.ts`:

```ts
export function purgeTodo(id: number): Promise<number> {
  return store().purgeTodo(id);
}

export function purgeDeletedBefore(cutoff: string): Promise<number> {
  return store().purgeDeletedBefore(cutoff);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storeTypes.ts src/todoStoreSql.ts src/todoStoreLocal.ts src/db.ts src/todoStoreSql.test.ts src/todoStoreLocal.test.ts
git commit -m "feat: empty the trash, by hand and by cutoff"
```

---

### Task 6: Rust-Store — weich löschen und filtern

**Files:**
- Modify: `src-tauri/src/mcp/store.rs`
- Test: `src-tauri/src/mcp/store.rs` (Modul `#[cfg(test)]` am Dateiende)

Die Rust-Tests laufen gegen eine echte SQLite-Datenbank im Speicher; `setup()`
im Testmodul legt sie an. Prüfe dort, ob das Schema die Spalte `deleted_at`
kennt — falls `setup()` das Schema selbst anlegt und nicht die Migrationen aus
`lib.rs` fährt, muss die Spalte dort ergänzt werden, sonst schlagen alle Tests
mit `no such column` fehl.

- [ ] **Step 1: Write the failing test**

Im Testmodul von `src-tauri/src/mcp/store.rs` anhängen:

```rust
    #[tokio::test]
    async fn delete_todo_moves_a_todo_to_the_trash() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Weg damit", None, None, None, None)
            .await
            .expect("add");

        delete_todo(&pool, todo.id).await.expect("delete");

        let stamp: Option<(Option<String>,)> =
            sqlx::query_as("SELECT deleted_at FROM todos WHERE id = ?")
                .bind(todo.id)
                .fetch_optional(&pool)
                .await
                .expect("select");
        assert!(
            stamp.expect("row still there").0.is_some(),
            "the row must survive with a deleted_at stamp"
        );
    }

    #[tokio::test]
    async fn list_todos_hides_the_trash() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Weg damit", None, None, None, None)
            .await
            .expect("add");
        delete_todo(&pool, todo.id).await.expect("delete");

        let todos = list_todos(&pool, None, None, None).await.expect("list");

        assert!(todos.is_empty(), "a todo in the trash must not be listed");
    }

    #[tokio::test]
    async fn update_todo_does_not_touch_a_todo_in_the_trash() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Weg damit", None, None, None, None)
            .await
            .expect("add");
        delete_todo(&pool, todo.id).await.expect("delete");

        let update = TodoUpdate {
            title: Some("Neuer Titel".to_string()),
            ..Default::default()
        };
        let result = update_todo(&pool, todo.id, update).await;

        assert!(
            result.is_err(),
            "a todo in the trash must be unknown to update_todo"
        );

        // Der Fehler allein genuegt nicht: die Zeile darf sich auch nicht
        // still veraendert haben.
        let title: (String,) = sqlx::query_as("SELECT title FROM todos WHERE id = ?")
            .bind(todo.id)
            .fetch_one(&pool)
            .await
            .expect("row");
        assert_eq!(
            title.0, "Weg damit",
            "a rejected update must not have written anything"
        );
    }

    #[tokio::test]
    async fn a_todo_in_the_trash_is_unknown_to_writes() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Weg damit", None, None, None, None)
            .await
            .expect("add");
        delete_todo(&pool, todo.id).await.expect("delete");

        let again = delete_todo(&pool, todo.id).await;

        assert!(again.is_err(), "deleting twice must report an unknown id");
    }
```

Passe die Argumentliste von `add_todo` und die Felder von `TodoUpdate` an die
tatsächlichen Signaturen in dieser Datei an — sieh in den bestehenden Tests
`update_todo_changes_only_the_given_fields` und
`update_todo_reports_an_unknown_id_as_a_tool_error` nach, wie beide dort
aufgebaut werden. Trägt `TodoUpdate` kein `Default`, baue die Struktur wie der
bestehende Test sie baut, statt `..Default::default()` zu benutzen.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml delete_todo_moves`
Expected: FAIL — die Zeile ist weg, `row still there` schlägt fehl

- [ ] **Step 3: Write minimal implementation**

In `src-tauri/src/mcp/store.rs`, direkt unter `TODO_COLUMNS`:

```rust
/// Die eine Stelle, an der steht, was "nicht im Papierkorb" heisst. Spiegelt
/// `NOT_DELETED` in src/todoStoreSql.ts.
const NOT_DELETED: &str = "t.deleted_at IS NULL";
```

(Die unaliasierte Schwester `NOT_DELETED_HERE` fuer die UPDATE-Statements
kommt weiter unten dazu.)

`select_todo` bekommt die Bedingung:

```rust
        "SELECT {TODO_COLUMNS}
         FROM todos t LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.id = ? AND {NOT_DELETED}"
```

In `list_todos` startet die Bedingungsliste nicht mehr leer:

```rust
    let mut conditions: Vec<&str> = vec![NOT_DELETED];
```

Damit ist `where_clause` immer gefüllt; der `if conditions.is_empty()`-Zweig
kann entfallen und durch

```rust
    let where_clause = format!("WHERE {}", conditions.join(" AND "));
```

ersetzt werden. Die Reihenfolge der `bind`-Aufrufe bleibt unverändert, weil
`NOT_DELETED` keinen Parameter trägt.

`delete_todo` löscht weich:

```rust
/// Legt eine Aufgabe in den Papierkorb und gibt zurueck, was abgelegt wurde.
/// Die Zeile bleibt stehen; endgueltig entfernt sie nur die Oberflaeche.
///
/// Das Zeitformat ist ausgeschrieben und nicht `datetime('now')`: die
/// 30-Tage-Frist wird in JavaScript aus `toISOString()` berechnet, und ein
/// Textvergleich der beiden Formate entschiede am zehnten Zeichen
/// (Leerzeichen vor "T") statt an der Uhrzeit. Dieselbe Formel steht in
/// src/todoStoreSql.ts.
pub async fn delete_todo(pool: &Pool<Sqlite>, id: i64) -> Result<Todo, StoreError> {
    let todo = select_todo(pool, id).await?;
    sqlx::query(
        "UPDATE todos SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(todo)
}
```

**Der Papierkorb muss auch die Schreibpfade schuetzen.** `select_todo` davor
reicht nicht: `update_todo` setzt seine SET-Liste dynamisch zusammen und
schreibt mit `WHERE id = ?`. Ohne Bedingung liefe der Schreibvorgang gegen eine
weggeworfene Aufgabe durch, und erst das `select_todo` danach meldete den
Fehler — die Zeile waere trotzdem veraendert. Haenge darum, analog zu
`NOT_DELETED_HERE` in `src/todoStoreSql.ts`, an jedes UPDATE auf `todos`:

```rust
/// Ohne Tabellen-Alias: ein UPDATE kennt keinen. Spiegelt `NOT_DELETED_HERE`
/// in src/todoStoreSql.ts.
const NOT_DELETED_HERE: &str = "deleted_at IS NULL";
```

Pruefe jede Stelle in `store.rs`, die `UPDATE todos` absetzt, und ergaenze sie.
Die sichtbare Wirkung bleibt: ein Schreibzugriff auf eine Aufgabe im Papierkorb
endet weiter als `Todo <id> not found` — nur ist jetzt auch wirklich nichts
geschrieben worden.

`select_todo` davor sorgt dafür, dass eine bereits abgelegte oder unbekannte Id
denselben Fehler liefert wie bisher.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:rust && npm run lint:rust`
Expected: PASS, keine Clippy-Warnung

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mcp/store.rs
git commit -m "feat: make the MCP store delete softly"
```

---

### Task 7: MCP-Werkzeugbeschreibung

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs:472-474`
- Test: `src-tauri/src/mcp/tools.rs` (Testmodul)

- [ ] **Step 1: Write the failing test**

Im Testmodul von `src-tauri/src/mcp/tools.rs` anhängen:

Der bestehende Test `delete_todo_removes_the_todo` (ab Zeile 1024) wird
umbenannt und in seiner Erwartung gedreht — die Zeile bleibt jetzt stehen:

```rust
    #[tokio::test]
    async fn delete_todo_moves_the_todo_to_the_trash() {
        let (server, pool) = server().await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at) VALUES ('Weg damit', '2026-01-02T00:00:00.000Z')
             RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        let result = server
            .delete_todo(Parameters(super::DeleteTodo { id }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["title"], "Weg damit");

        // Die Zeile bleibt -- nur mit Zeitstempel, damit die Oberflaeche sie
        // wieder herholen kann.
        let stamp: (Option<String>,) = sqlx::query_as("SELECT deleted_at FROM todos WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .expect("the row must still be there");
        assert!(
            stamp.0.is_some(),
            "the tool must leave the row recoverable"
        );
    }

    #[tokio::test]
    async fn delete_todo_reports_an_id_already_in_the_trash_as_a_tool_error() {
        let (server, pool) = server().await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at) VALUES ('Weg damit', '2026-01-02T00:00:00.000Z')
             RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        server
            .delete_todo(Parameters(super::DeleteTodo { id }))
            .await
            .expect("first delete");
        let result = server
            .delete_todo(Parameters(super::DeleteTodo { id }))
            .await
            .expect("a second delete is not a protocol error");

        tool_error(&result, &id.to_string());
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml delete_todo_leaves`
Expected: FAIL, solange der Test noch nicht kompiliert oder die Erwartung nicht trägt

- [ ] **Step 3: Write minimal implementation**

In `src-tauri/src/mcp/tools.rs` die Beschreibung von `delete_todo` ersetzen:

```rust
    #[tool(
        description = "Legt eine Aufgabe in den Papierkorb der TodoList-App und gibt zurueck, was abgelegt wurde. Nicht endgueltig: die Nutzerin kann sie in der App wiederherstellen, und nach 30 Tagen raeumt die App sie selbst weg. Zum Abhaken ist stattdessen \"update_todo\" mit dem Status \"done\" gedacht."
    )]
```

Am Code darunter ändert sich nichts — `store::delete_todo` löscht seit Task 6
weich.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:rust && npm run lint:rust`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mcp/tools.rs
git commit -m "docs: tell the model that delete_todo is recoverable"
```

---

### Task 8: Aufräumen beim Start

**Files:**
- Create: `src/trashRetention.ts`
- Modify: `src/main.tsx`
- Test: `src/trashRetention.test.ts`, `src/main.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/trashRetention.test.ts` anlegen:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cutoffFor, TRASH_RETENTION_DAYS } from "./trashRetention";

describe("trashRetention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hält 30 Tage", () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it("rechnet den Stichtag von einem gegebenen Jetzt zurück", () => {
    const cutoff = cutoffFor(new Date("2026-03-31T12:00:00.000Z"));

    expect(cutoff).toBe("2026-03-01T12:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/trashRetention.test.ts`
Expected: FAIL — `Failed to resolve import "./trashRetention"`

- [ ] **Step 3: Write minimal implementation**

`src/trashRetention.ts` anlegen:

```ts
// Die Aufbewahrungsfrist des Papierkorbs, an einer Stelle. Die Stores kennen
// keine Uhr -- sie bekommen den fertigen Stichtag herein, damit ihre Tests
// ohne Zeitstellen auskommen.

export const TRASH_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Der Zeitpunkt, vor dem Weggeworfenes nicht mehr aufgehoben wird. */
export function cutoffFor(now: Date): string {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * MS_PER_DAY).toISOString();
}
```

In `src/main.tsx` den Import ergänzen:

```tsx
import { purgeDeletedBefore } from "./db";
import { cutoffFor } from "./trashRetention";
```

und die Startkette erweitern — der Aufruf hängt hinter der Migration, weil er
die Datenbank braucht, die sie herstellt:

```tsx
migrateLocalStorage()
  .then(() => null)
  .catch((error) => {
    console.error("localStorage migration failed", error);
    return MIGRATION_ERROR_MESSAGE;
  })
  .then(async (migrationError) => {
    // Misslungenes Aufraeumen kostet keine Daten und bekommt darum kein
    // Banner: die Meldung landet in der Konsole, der Start laeuft weiter.
    try {
      await purgeDeletedBefore(cutoffFor(new Date()));
    } catch (error) {
      console.error("purging the trash failed", error);
    }
    return migrationError;
  })
  .then(start);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/trashRetention.test.ts src/main.test.tsx`
Expected: PASS. Schlägt `main.test.tsx` fehl, weil sein `./db`-Mock die neue
Funktion nicht kennt, ergänze dort `purgeDeletedBefore: vi.fn(() => Promise.resolve(0))`.

- [ ] **Step 5: Commit**

```bash
git add src/trashRetention.ts src/trashRetention.test.ts src/main.tsx src/main.test.tsx
git commit -m "feat: purge the trash older than 30 days on startup"
```

---

### Task 9: Die Rückgängig-Leiste

**Files:**
- Modify: `src/App.tsx` (`handleDelete` ab Zeile 353, Rumpf bei den Hinweisen um Zeile 720)
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

An `src/App.test.tsx` anhängen. Ergänze zuvor im `vi.mock("./db", ...)`-Block
die Einträge `restoreTodo: vi.fn()`, `listDeletedTodos: vi.fn(() => Promise.resolve([]))`,
`purgeTodo: vi.fn()`, `purgeDeletedBefore: vi.fn(() => Promise.resolve(0))`.

```ts
describe("die Rückgängig-Leiste", () => {
  it("bietet nach dem Löschen an, die Aufgabe zurückzuholen", async () => {
    const todo = makeTodo({ id: 1, title: "Versehentlich" });
    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.deleteTodo).mockResolvedValue(1);
    vi.mocked(db.restoreTodo).mockResolvedValue(todo);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Versehentlich")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Löschen"));

    await waitFor(() => expect(screen.getByText(/Versehentlich.*gelöscht/i)).toBeInTheDocument());
    expect(screen.queryByText("Versehentlich")).not.toBe(null);

    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));

    await waitFor(() => expect(db.restoreTodo).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Rückgängig" })).not.toBeInTheDocument()
    );
  });

  it("zeigt nur die zuletzt gelöschte Aufgabe an", async () => {
    const erste = makeTodo({ id: 1, title: "Erste" });
    const zweite = makeTodo({ id: 2, title: "Zweite" });
    vi.mocked(db.listTodos).mockResolvedValue([erste, zweite]);
    vi.mocked(db.deleteTodo).mockImplementation((id: number) => Promise.resolve(id));

    render(<App />);
    await waitFor(() => expect(screen.getByText("Erste")).toBeInTheDocument());

    const [ersterKnopf, zweiterKnopf] = screen.getAllByLabelText("Löschen");
    fireEvent.click(ersterKnopf);
    await waitFor(() => expect(screen.getByText(/Erste.*gelöscht/i)).toBeInTheDocument());
    fireEvent.click(zweiterKnopf);

    await waitFor(() => expect(screen.getByText(/Zweite.*gelöscht/i)).toBeInTheDocument());
    expect(screen.queryByText(/Erste.*gelöscht/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Rückgängig" })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — es gibt keinen Text „… gelöscht"

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx` den Import um `restoreTodo` erweitern (aus `./db`) und beim
übrigen State ergänzen:

```tsx
  // Die zuletzt geloeschte Aufgabe, solange das Rueckgaengig angeboten wird.
  // Nur eine: das naechste Loeschen ersetzt den Eintrag, statt Hinweise zu
  // stapeln. Kein Timer -- nichts verschwindet, waehrend jemand hinsieht.
  const [justDeleted, setJustDeleted] = useState<{ id: number; title: string } | null>(null);
```

`handleDelete` merkt sich die Aufgabe:

```tsx
  async function handleDelete(id: number) {
    const doomed = todos.find((t) => t.id === id);
    try {
      await deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setJustDeleted(doomed ? { id, title: doomed.title } : null);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleUndoDelete() {
    if (!justDeleted) return;
    try {
      const restored = await restoreTodo(justDeleted.id);
      setTodos((prev) =>
        [...prev, restored].sort((a, b) => {
          const dateCmp = b.created_at.localeCompare(a.created_at);
          return dateCmp !== 0 ? dateCmp : b.id - a.id;
        })
      );
      setJustDeleted(null);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }
```

Die Leiste kommt in den Rumpf, direkt über `{error && <p className="error">…}`:

```tsx
        {justDeleted && (
          <div className="undo-bar">
            <span>„{justDeleted.title}" gelöscht.</span>
            <button type="button" className="undo-bar-action" onClick={handleUndoDelete}>
              Rückgängig
            </button>
            <IconButton
              variant="icon"
              onClick={() => setJustDeleted(null)}
              aria-label="Hinweis schließen"
            >
              <CloseIcon />
            </IconButton>
          </div>
        )}
```

`CloseIcon` aus `./ui` importieren, falls dort noch nicht geschehen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: offer an undo right after deleting a todo"
```

---

### Task 10: Das Papierkorb-Fenster

**Files:**
- Create: `src/TrashModal.tsx`
- Modify: `src/ui/Modal.tsx` (Variante `trash`)
- Test: `src/TrashModal.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/TrashModal.test.tsx` anlegen:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TrashModal } from "./TrashModal";
import * as db from "./db";

vi.mock("./db", () => ({
  listDeletedTodos: vi.fn(),
  restoreTodo: vi.fn(),
  purgeTodo: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

const makeTodo = (id: number, title: string) => ({
  id,
  title,
  description: "",
  done: false,
  status: "todo" as const,
  priority: "medium" as const,
  created_at: "2026-01-01T00:00:00Z",
  due_date: null,
  category_id: null,
  category_name: null,
  category_color: null,
});

describe("TrashModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zeigt den Leerzustand", async () => {
    vi.mocked(db.listDeletedTodos).mockResolvedValue([]);

    render(<TrashModal onClose={() => {}} onChanged={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText("Der Papierkorb ist leer.")).toBeInTheDocument()
    );
  });

  it("stellt eine Aufgabe wieder her und meldet die Änderung", async () => {
    const onChanged = vi.fn();
    vi.mocked(db.listDeletedTodos).mockResolvedValue([makeTodo(1, "Zurück")]);
    vi.mocked(db.restoreTodo).mockResolvedValue(makeTodo(1, "Zurück"));

    render(<TrashModal onClose={() => {}} onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText("Zurück")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Wiederherstellen"));

    await waitFor(() => expect(db.restoreTodo).toHaveBeenCalledWith(1));
    expect(onChanged).toHaveBeenCalled();
  });

  it("löscht einen Eintrag endgültig ohne Rückfrage", async () => {
    vi.mocked(db.listDeletedTodos).mockResolvedValue([makeTodo(1, "Weg")]);
    vi.mocked(db.purgeTodo).mockResolvedValue(1);

    render(<TrashModal onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("Weg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Endgültig löschen"));

    await waitFor(() => expect(db.purgeTodo).toHaveBeenCalledWith(1));
  });

  it("leert den Papierkorb erst nach der Rückfrage", async () => {
    vi.mocked(db.listDeletedTodos).mockResolvedValue([makeTodo(1, "Weg"), makeTodo(2, "Auch weg")]);
    vi.mocked(db.purgeTodo).mockResolvedValue(1);

    render(<TrashModal onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("Weg")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Papierkorb leeren" }));
    expect(db.purgeTodo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ja, endgültig löschen" }));

    await waitFor(() => expect(db.purgeTodo).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TrashModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./TrashModal"`

- [ ] **Step 3: Write minimal implementation**

In `src/ui/Modal.tsx` die Variante ergänzen:

```ts
export type ModalVariant = "changelog" | "category" | "todo" | "trash";

const VARIANT_CLASS: Record<ModalVariant, string> = {
  changelog: "changelog-modal",
  category: "category-modal",
  todo: "todo-modal",
  trash: "trash-modal",
};
```

`src/TrashModal.tsx` anlegen:

```tsx
// Der Papierkorb: was geloescht wurde, bis es endgueltig weg ist. Eigene Datei
// und eigener State -- App.tsx haelt den Papierkorb nicht mit, er wird selten
// gebraucht und laedt sich beim Oeffnen selbst.

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { listDeletedTodos, purgeTodo, restoreTodo } from "./db";
import { DATA_CHANGED_EVENT } from "./events";
import { isTauri } from "./sqlClient";
import { Todo } from "./types";
import { IconButton, Modal, TrashIcon } from "./ui";
import { UndoIcon } from "./ui/icons";

export interface TrashModalProps {
  onClose: () => void;
  /** Gerufen, wenn sich am Bestand etwas geaendert hat: die Liste dahinter muss neu laden. */
  onChanged: () => void;
}

export function TrashModal({ onClose, onChanged }: TrashModalProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const load = useCallback(async () => {
    try {
      setTodos(await listDeletedTodos());
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Ein Agent kann nebenher loeschen; ohne das zeigte das Fenster alte Staende.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen(DATA_CHANGED_EVENT, () => {
      void load();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [load]);

  async function handleRestore(id: number) {
    try {
      await restoreTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      onChanged();
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handlePurge(id: number) {
    try {
      await purgeTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleEmpty() {
    try {
      for (const todo of todos) await purgeTodo(todo.id);
      setTodos([]);
      setConfirmEmpty(false);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal variant="trash" title="Papierkorb" onClose={onClose} closeLabel="Schließen">
      {error && <p className="error">Fehler: {error}</p>}

      {todos.length === 0 && <p className="muted">Der Papierkorb ist leer.</p>}

      <ul className="trash-list">
        {todos.map((todo) => (
          <li key={todo.id} className="trash-item">
            <span className="trash-title">{todo.title}</span>
            <div className="trash-actions">
              <IconButton
                variant="icon"
                onClick={() => handleRestore(todo.id)}
                aria-label="Wiederherstellen"
              >
                <UndoIcon />
              </IconButton>
              <IconButton
                variant="icon"
                danger
                onClick={() => handlePurge(todo.id)}
                aria-label="Endgültig löschen"
              >
                <TrashIcon />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      {todos.length > 0 && !confirmEmpty && (
        <button type="button" className="trash-empty" onClick={() => setConfirmEmpty(true)}>
          Papierkorb leeren
        </button>
      )}

      {confirmEmpty && (
        <div className="trash-confirm">
          <p>Alle {todos.length} Aufgaben endgültig löschen? Das lässt sich nicht rückgängig machen.</p>
          <button type="button" onClick={handleEmpty}>
            Ja, endgültig löschen
          </button>
          <button type="button" onClick={() => setConfirmEmpty(false)}>
            Abbrechen
          </button>
        </div>
      )}
    </Modal>
  );
}
```

In `src/ui/icons.tsx` ein `UndoIcon` ergänzen, im Stil der dort vorhandenen
Icons (24×24, `stroke="currentColor"`, kein `fill`):

```tsx
export function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 7h7a3 3 0 1 1 0 6H6M3 7l3-3M3 7l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

Und in `src/ui/index.ts` mit exportieren, so wie die übrigen Icons dort stehen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/TrashModal.test.tsx`
Expected: PASS (alle vier Tests)

- [ ] **Step 5: Commit**

```bash
git add src/TrashModal.tsx src/TrashModal.test.tsx src/ui/Modal.tsx src/ui/icons.tsx src/ui/index.ts
git commit -m "feat: add the trash window"
```

---

### Task 11: Das Fenster in die App hängen

**Files:**
- Modify: `src/App.tsx` (Kopfleiste um Zeile 639, Modal-Block um Zeile 1011)
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

An `src/App.test.tsx` anhängen:

```ts
describe("der Papierkorb-Knopf", () => {
  it("öffnet das Papierkorb-Fenster", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.listDeletedTodos).mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(db.listTodos).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText("Papierkorb"));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Papierkorb" })).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Papierkorb`

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx` importieren:

```tsx
import { TrashModal } from "./TrashModal";
```

State ergänzen:

```tsx
  const [showTrash, setShowTrash] = useState(false);
```

Der Knopf kommt neben den Kategorien-Knopf in der Kopfleiste (um Zeile 639),
im selben Muster wie dieser:

```tsx
            <IconButton variant="icon" onClick={() => setShowTrash(true)} aria-label="Papierkorb">
              <TrashIcon />
            </IconButton>
```

Und das Fenster zu den übrigen Modals (um Zeile 1011):

```tsx
      {showTrash && (
        <TrashModal
          onClose={() => setShowTrash(false)}
          onChanged={() => {
            void reload();
            setJustDeleted(null);
          }}
        />
      )}
```

`reload` ist die bereits vorhandene Funktion, die Aufgaben und Kategorien neu
lädt (Kommentar „Laedt Aufgaben und Kategorien neu." um Zeile 188) — prüfe ihren
genauen Namen und nutze ihn. Das `setJustDeleted(null)` verhindert, dass die
Rückgängig-Leiste auf eine Aufgabe zeigt, die soeben aus dem Fenster
wiederhergestellt oder endgültig gelöscht wurde.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: reach the trash from the header"
```

---

### Task 12: Styling

**Files:**
- Modify: `src/App.css`

Lies zuerst `STYLEGUIDE.md`. Farben ausschließlich über die vorhandenen Tokens,
keine Verläufe, keine Emoji. Orientiere dich am Block für `.category-modal` und
`.category-item`, der dieselbe Form hat.

- [ ] **Step 1: Write the styles**

Ans Ende von `src/App.css` anhängen. Alle Farben kommen aus den Tokens in
`:root`; `.trash-item` übernimmt Maße und Rahmen von `.category-item`, damit
beide Fenster gleich aussehen.

```css
/* ── Papierkorb und Rückgängig ──────────────────────────────────────────── */

.undo-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 11px 13px;
  border: var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  box-shadow: var(--shadow-sm);
}

.undo-bar span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo-bar-action {
  border: var(--border-thin);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  padding: 5px 11px;
  cursor: pointer;
}

.undo-bar-action:hover {
  background: var(--highlight);
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
}

.trash-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 13px;
  border: var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.trash-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-actions {
  display: flex;
  gap: 6px;
}

.trash-empty {
  border: var(--border-thin);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--accent-ink);
  padding: 7px 13px;
  cursor: pointer;
}

.trash-empty:hover {
  background: var(--surface-muted);
}

.trash-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 11px 13px;
  border: var(--border-muted);
  border-radius: var(--radius-md);
  background: var(--canvas-sunken);
}

.trash-confirm p {
  flex-basis: 100%;
  margin: 0;
}

.trash-confirm button {
  border: var(--border-thin);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  padding: 5px 11px;
  cursor: pointer;
}
```

Fehlt eine der Token-Variablen in `:root`, nimm die nächstliegende vorhandene —
neue Tokens gehören nicht in diese Aufgabe.

- [ ] **Step 2: Sichtprüfen**

Run: `npm run dev`, dann eine Aufgabe löschen, das Rückgängig ansehen, den
Papierkorb öffnen, einen Eintrag wiederherstellen und einen endgültig löschen.
Erwartet: keine überlaufenden Zeilen, Knöpfe auf einer Linie, in hellem und
dunklem Erscheinungsbild lesbar.

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "style: dress the undo bar and the trash window"
```

---

### Task 13: E2E und Changelog

**Files:**
- Modify: `e2e/todolist.spec.ts`, `CHANGELOG.md`

- [ ] **Step 1: Write the failing test**

An `e2e/todolist.spec.ts` anhängen. Sieh dir an, wie die bestehenden Tests eine
Aufgabe anlegen, und nutze dieselben Hilfen:

```ts
test.describe("Papierkorb", () => {
  test("holt eine gelöschte Aufgabe über Rückgängig zurück", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/Was steht an/i).fill("Versehentlich");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();
    await expect(page.getByText("Versehentlich")).toBeVisible();

    await page.getByLabel("Löschen").first().click();
    await expect(page.getByText(/Versehentlich.*gelöscht/)).toBeVisible();

    await page.getByRole("button", { name: "Rückgängig" }).click();

    await expect(page.getByText("Versehentlich")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rückgängig" })).toHaveCount(0);
  });

  test("holt eine gelöschte Aufgabe aus dem Papierkorb zurück", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/Was steht an/i).fill("Im Papierkorb");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();
    await page.getByLabel("Löschen").first().click();

    await page.getByLabel("Papierkorb").click();
    await expect(page.getByRole("heading", { name: "Papierkorb" })).toBeVisible();
    await page.getByLabel("Wiederherstellen").click();
    await expect(page.getByText("Der Papierkorb ist leer.")).toBeVisible();
    await page.getByLabel("Schließen").click();

    await expect(page.getByText("Im Papierkorb")).toBeVisible();
  });
});
```

Eingabefeld und Knopf sind dieselben, die `can add a new todo` (ab Zeile 14)
benutzt.

- [ ] **Step 2: Run test to verify it fails oder passt**

Run: `npm run test:e2e -- --grep Papierkorb`
Expected: PASS, wenn Task 9 bis 12 sitzen. Schlägt einer fehl, liegt der Fehler
in der Verdrahtung, nicht im Test.

- [ ] **Step 3: Changelog schreiben**

In `CHANGELOG.md` unter `## [Unveröffentlicht]` einen Abschnitt ergänzen:

```markdown
### Hinzugefügt
- Gelöschte Aufgaben landen im Papierkorb statt verloren zu gehen. Direkt nach dem Löschen bietet die App „Rückgängig" an; darüber hinaus sammelt ein Papierkorb-Fenster (Knopf im Kopf) alles Gelöschte, aus dem einzeln wiederhergestellt oder endgültig gelöscht werden kann. Nach 30 Tagen räumt die App den Papierkorb beim Start selbst auf.
- Was ein KI-Assistent über MCP löscht, liegt ebenfalls im Papierkorb und lässt sich dort zurückholen.
```

- [ ] **Step 4: Alles prüfen**

Run: `npm run typecheck && npm run lint && npm test && npm run test:rust && npm run lint:rust && npm run test:e2e`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add e2e/todolist.spec.ts CHANGELOG.md
git commit -m "test: cover the trash end to end"
```

---

## Was nicht dazugehört

Aus der Spec übernommen, damit es unterwegs nicht hineinrutscht:

- Kategorien werden nicht soft-gelöscht.
- Kein MCP-Werkzeug zum Durchsuchen oder Wiederherstellen des Papierkorbs.
- Keine Mehrfachauswahl im Papierkorb, kein „alles wiederherstellen".
- Kein Undo für andere Aktionen als Löschen.
