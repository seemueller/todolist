# SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move todo, category and time-tracking persistence from `localStorage` to the SQLite database that the Tauri backend already creates, without changing a single call site.

**Architecture:** `db.ts` and `timeDb.ts` keep their exact public signatures and become thin dispatchers. Behind each sits a store object implementing a shared interface — one `localStorage` implementation (used in the browser, in unit tests and in the Playwright E2E suite) and one SQLite implementation (used inside Tauri). A one-shot migration copies existing `localStorage` data into SQLite on first launch.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Playwright, Tauri v2, `@tauri-apps/plugin-sql` (SQLite), Rust.

This is Phase 1 of the design in `docs/superpowers/specs/2026-09-03-mcp-server-design.md`. Phase 2 (the MCP server) gets its own plan and is not part of this one.

---

## Background for someone new to this codebase

**The app.** A desktop todo list built with Tauri v2 — a Rust shell hosting a React frontend in a webview. It has a list/kanban view for todos and a separate week grid for time tracking in quarter-hour slots.

**The surprise.** `src-tauri/src/lib.rs` registers `tauri-plugin-sql` with five migrations that create `todos` and `categories`. Nothing ever writes to those tables. `src/db.ts` and `src/timeDb.ts` both persist to `localStorage`. This plan closes that gap.

**Why it matters.** Data in the webview's `localStorage` is unreachable from Rust. Anything on the Rust side — the MCP server in Phase 2, but also backups or CLI tooling — needs the data in the database file.

**Testing conventions** (see `AGENTS.md`):
- Pure logic → `*.test.ts` next to the source
- React components → `*.test.tsx` next to the component, with the `db` module mocked
- `npm run typecheck && npm test` must pass before anything reaches `main`
- UI changes additionally require `npx playwright test`

**Style conventions** (see `STYLEGUIDE.md`): no emoji, no gradients, colors only via design tokens. This plan touches no UI, so it does not apply here — but do not introduce any.

**Existing comments are in German.** Match that in files that already use it (`timeDb.ts`, `timeSlots.ts`). `db.ts` uses English. Follow whatever the file you are editing already does.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/storeTypes.ts` | create | The `TodoStore` and `TimeStore` interfaces both implementations satisfy |
| `src/todoStoreLocal.ts` | create | Today's `localStorage` logic for todos and categories, moved out of `db.ts` unchanged |
| `src/todoStoreSql.ts` | create | SQLite implementation of `TodoStore` |
| `src/timeStoreLocal.ts` | create | Today's `localStorage` logic for time slots and settings, moved out of `timeDb.ts` |
| `src/timeStoreSql.ts` | create | SQLite implementation of `TimeStore` |
| `src/sqlClient.ts` | create | Detects the Tauri context, opens the database once, hands out the connection |
| `src/migrateLocalStorage.ts` | create | One-shot copy of `localStorage` data into SQLite |
| `src/db.ts` | modify | Shrinks to a dispatcher; public API unchanged |
| `src/timeDb.ts` | modify | Shrinks to a dispatcher; public API unchanged |
| `src/main.tsx` | modify | Awaits the migration before the first render |
| `src-tauri/src/lib.rs` | modify | Migrations 6, 7 and 8 |

Splitting the stores out keeps each file focused on one storage mechanism. `db.ts` and `timeDb.ts` stay as the only thing the rest of the app imports, so no view code changes.

---

## Task 1: Extract the localStorage stores behind an interface

Pure refactor. No behaviour changes. The existing test suite is the safety net.

**Files:**
- Create: `src/storeTypes.ts`
- Create: `src/todoStoreLocal.ts`
- Create: `src/timeStoreLocal.ts`
- Modify: `src/db.ts`
- Modify: `src/timeDb.ts`
- Test: `src/todoStoreLocal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/todoStoreLocal.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { localTodoStore } from "./todoStoreLocal";

describe("localTodoStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores a todo and reads it back", async () => {
    const created = await localTodoStore.addTodo("Schreiben", "high", null, null);
    expect(created.title).toBe("Schreiben");
    expect(created.status).toBe("todo");
    expect(created.done).toBe(false);

    const all = await localTodoStore.listTodos();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
  });

  it("keeps done and status consistent", async () => {
    const created = await localTodoStore.addTodo("Testen", "low", null, null);
    const updated = await localTodoStore.updateTodoStatus(created.id, "done");
    expect(updated.done).toBe(true);

    const back = await localTodoStore.updateTodoStatus(created.id, "in_progress");
    expect(back.done).toBe(false);
  });

  it("denormalises the category name onto the todo", async () => {
    const cat = await localTodoStore.addCategory("Kunde", "#a78bfa");
    const todo = await localTodoStore.addTodo("Meeting", "medium", null, cat.id);
    expect(todo.category_name).toBe("Kunde");
    expect(todo.category_color).toBe("#a78bfa");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/todoStoreLocal.test.ts`
Expected: FAIL — `Failed to resolve import "./todoStoreLocal"`

- [ ] **Step 3: Define the interfaces**

Create `src/storeTypes.ts`:

```ts
import { Category, Priority, Todo, TodoStatus } from "./types";
import { DaySlot } from "./timeSlots";
import { TimeSettings } from "./timeDb";

/** Everything db.ts needs from a storage backend. */
export interface TodoStore {
  listTodos(categoryId?: number | null): Promise<Todo[]>;
  addTodo(
    title: string,
    priority: Priority,
    dueDate: string | null,
    categoryId?: number | null
  ): Promise<Todo>;
  updateTodoTitle(id: number, title: string): Promise<Todo>;
  updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo>;
  updateTodoPriority(id: number, priority: Priority): Promise<Todo>;
  updateTodoCategory(id: number, categoryId: number | null): Promise<Todo>;
  updateTodoStatus(id: number, status: TodoStatus): Promise<Todo>;
  toggleTodoDone(id: number, done: boolean): Promise<Todo>;
  deleteTodo(id: number): Promise<number>;
  listCategories(): Promise<Category[]>;
  addCategory(name: string, color: string): Promise<Category>;
  updateCategory(id: number, name: string, color: string): Promise<Category>;
  deleteCategory(id: number): Promise<number>;
}

/** Everything timeDb.ts needs from a storage backend. */
export interface TimeStore {
  getSettings(): Promise<TimeSettings>;
  saveSettings(settings: TimeSettings): Promise<TimeSettings>;
  listSlots(date: string): Promise<DaySlot[]>;
  saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]>;
  paintSlots(date: string, indices: number[], categoryId: number | null): Promise<DaySlot[]>;
  setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]>;
  clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]>;
}
```

- [ ] **Step 4: Move the localStorage code into the new store files**

Create `src/todoStoreLocal.ts`. Move lines 1–226 of the current `src/db.ts` here verbatim — every helper (`generateId`, `now`, `loadTodos`, `migrateTodos`, `saveTodos`, `loadCategories`, `saveCategories`, `selectTodos`, `findCategory`) and every exported function. Then change the twelve `export function` declarations to plain `function` declarations and add one export at the bottom:

```ts
import { TodoStore } from "./storeTypes";

// ... all the moved helpers and functions, with `export` removed ...

export const localTodoStore: TodoStore = {
  listTodos,
  addTodo,
  updateTodoTitle,
  updateTodoDueDate,
  updateTodoPriority,
  updateTodoCategory,
  updateTodoStatus,
  toggleTodoDone,
  deleteTodo,
  listCategories,
  addCategory,
  updateCategory,
  deleteCategory,
};
```

Do the same for `src/timeStoreLocal.ts` with lines 1–135 of `src/timeDb.ts` — but leave `TimeSettings`, `DEFAULT_SETTINGS` and `TimeSlotRecord` exported from `timeDb.ts`, because other modules import them from there. `timeStoreLocal.ts` imports them back:

```ts
import { DaySlot, applyPaint, setBlockNote as setNoteOnBlock } from "./timeSlots";
import { TimeSettings, DEFAULT_SETTINGS, TimeSlotRecord } from "./timeDb";
import { TimeStore } from "./storeTypes";

// ... all the moved helpers and functions, with `export` removed ...

export const localTimeStore: TimeStore = {
  getSettings,
  saveSettings,
  listSlots,
  saveDay,
  paintSlots,
  setBlockNote,
  clearBlock,
};
```

- [ ] **Step 5: Turn db.ts and timeDb.ts into dispatchers**

Replace the whole body of `src/db.ts` with:

```ts
import { Priority, Todo, TodoStatus, Category, TodoRow, CategoryRow, fromRow, fromCategoryRow } from "./types";
import { localTodoStore } from "./todoStoreLocal";
import { TodoStore } from "./storeTypes";

function store(): TodoStore {
  return localTodoStore;
}

export function listTodos(categoryId?: number | null): Promise<Todo[]> {
  return store().listTodos(categoryId);
}

export function addTodo(
  title: string,
  priority: Priority,
  dueDate: string | null,
  categoryId?: number | null
): Promise<Todo> {
  return store().addTodo(title, priority, dueDate, categoryId);
}

export function updateTodoTitle(id: number, title: string): Promise<Todo> {
  return store().updateTodoTitle(id, title);
}

export function updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo> {
  return store().updateTodoDueDate(id, dueDate);
}

export function updateTodoPriority(id: number, priority: Priority): Promise<Todo> {
  return store().updateTodoPriority(id, priority);
}

export function updateTodoCategory(id: number, categoryId: number | null): Promise<Todo> {
  return store().updateTodoCategory(id, categoryId);
}

export function updateTodoStatus(id: number, status: TodoStatus): Promise<Todo> {
  return store().updateTodoStatus(id, status);
}

export function toggleTodoDone(id: number, done: boolean): Promise<Todo> {
  return store().toggleTodoDone(id, done);
}

export function deleteTodo(id: number): Promise<number> {
  return store().deleteTodo(id);
}

export function listCategories(): Promise<Category[]> {
  return store().listCategories();
}

export function addCategory(name: string, color: string): Promise<Category> {
  return store().addCategory(name, color);
}

export function updateCategory(id: number, name: string, color: string): Promise<Category> {
  return store().updateCategory(id, name, color);
}

export function deleteCategory(id: number): Promise<number> {
  return store().deleteCategory(id);
}

// Type exports for test compatibility
export type { TodoRow, CategoryRow };
export { fromRow, fromCategoryRow };
```

Replace the body of `src/timeDb.ts` the same way, keeping the type and constant exports at the top:

```ts
// Persistenz der Zeiterfassung. Die Fachlogik (Bloecke, Notiz-Vererbung) liegt in
// timeSlots.ts; hier wird nur an den passenden Speicher weitergereicht.

import { DaySlot } from "./timeSlots";
import { localTimeStore } from "./timeStoreLocal";
import { TimeStore } from "./storeTypes";

/** Einstellungen der Zeiterfassung. */
export interface TimeSettings {
  /** Sollzeit je regulaerem Arbeitstag, in Viertelstunden. 32 = 8:00. */
  targetSlotsPerDay: number;
  /** Samstag und Sonntag mit anzeigen. */
  showWeekend: boolean;
}

/** Acht Stunden am Tag, Wochenende aus. */
export const DEFAULT_SETTINGS: TimeSettings = {
  targetSlotsPerDay: 32,
  showWeekend: false,
};

/** Eine gebuchte Viertelstunde, wie sie im Speicher liegt. */
export interface TimeSlotRecord extends DaySlot {
  date: string;
}

function store(): TimeStore {
  return localTimeStore;
}

export function getSettings(): Promise<TimeSettings> {
  return store().getSettings();
}

export function saveSettings(settings: TimeSettings): Promise<TimeSettings> {
  return store().saveSettings(settings);
}

export function listSlots(date: string): Promise<DaySlot[]> {
  return store().listSlots(date);
}

export function saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]> {
  return store().saveDay(date, slots);
}

export function paintSlots(
  date: string,
  indices: number[],
  categoryId: number | null
): Promise<DaySlot[]> {
  return store().paintSlots(date, indices, categoryId);
}

export function setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]> {
  return store().setBlockNote(date, slot, note);
}

export function clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]> {
  return store().clearBlock(date, startSlot, endSlot);
}
```

Note the import cycle between `timeDb.ts` and `timeStoreLocal.ts` — `timeDb` imports the store, the store imports the types back. This is fine because the types are erased at compile time and `DEFAULT_SETTINGS` is only read inside functions, never at module top level. If Vitest ever reports `DEFAULT_SETTINGS` as undefined, move the three type declarations into `src/storeTypes.ts` and re-export them from `timeDb.ts`.

> **Amended after review — see "Amendment 1" below.** The cycle was resolved
> immediately rather than left in place, so the three declarations now live in
> `src/timeTypes.ts`. Every later task imports `TimeSettings`,
> `DEFAULT_SETTINGS` and `TimeSlotRecord` from `./timeTypes`, not `./timeDb`.

- [ ] **Step 6: Run the full suite**

Run: `npm run typecheck && npm test`
Expected: PASS — all existing tests plus the three new ones in `todoStoreLocal.test.ts`

- [ ] **Step 7: Run the E2E suite**

Run: `npx playwright test`
Expected: PASS — nothing user-visible changed

- [ ] **Step 8: Commit**

```bash
git add src/storeTypes.ts src/todoStoreLocal.ts src/timeStoreLocal.ts src/todoStoreLocal.test.ts src/db.ts src/timeDb.ts
git commit -m "refactor: put the localStorage persistence behind a store interface"
```

---

## Amendment 1 — after the Task 1 review

Task 1 shipped as `3638b28`, then a code quality review produced four findings,
fixed in `0fd6d1d`. What later tasks need to know:

**`src/timeTypes.ts` now exists.** It holds `TimeSettings`, `DEFAULT_SETTINGS`
and `TimeSlotRecord`. The import cycle the plan had accepted was resolved
straight away instead of being deferred, because Task 6 replaces `store()` with
exactly the module-scope form that makes the cycle bite — and the resulting
failure is a silent `undefined` under Vite's SSR transform, not a load-time
error. `timeDb.ts` re-exports all three, so `TimeTrackingView.tsx` was untouched.
The code blocks in Tasks 5 and 7 have been updated to import from `./timeTypes`.

**The interfaces in `src/storeTypes.ts` now carry the operation contracts** —
`listTodos`'s sort order, the `Todo N not found` error, the denormalised
`category_name`/`category_color`, `listCategories`'s alphabetical order, the
trimmed category names, and the seven time-tracking guarantees. Tasks 4 and 5
implement against those comments; read them before writing the SQL stores, and
if an SQL implementation cannot keep a contract, say so rather than quietly
diverging.

**`src/timeStoreLocal.test.ts` now exists** with six tests. It is the behaviour
baseline for Task 5: the SQLite time store must satisfy the same cases.

**Known flaky test, not a regression.** `TimeTrackingView > zeigt eine positive
Differenz, sobald das Soll erreicht ist` intermittently times out at Vitest's
default 5 s. Reproduced on the untouched `3638b28`, so it predates this work. If
it fails in a later task, re-run before investigating; do not treat it as caused
by your change and do not "fix" it as a side quest.

**Storage-independent rules still live in the local stores.** `clampTarget`,
`migrateTodos`, the sort orders in `selectTodos`/`listCategories` and the
category denormalisation are rules, not storage details. Tasks 4 and 5 must not
copy them by hand — every divergence becomes a silent behaviour difference
between the browser and the desktop app. Where a rule is needed on both sides,
move it into a shared module (`types.ts` for todo rules, `timeSlots.ts` for time
rules) and have both stores call it.

---

## Task 2: Add the missing migrations

**Files:**
- Modify: `src-tauri/src/lib.rs:66-107` (the `migrations` vector)
- Test: `src/migrations.test.ts` (create)

The migration list lives in Rust, but a TypeScript test can read the file and assert its shape. That is cheap and catches the mistake that actually happens: reusing a version number, which makes `tauri-plugin-sql` fail at startup with an error nobody sees until they run the desktop app.

- [ ] **Step 1: Write the failing test**

Create `src/migrations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";

// Node's URL, not the global one: under environment "jsdom" the global URL
// resolves this against http://localhost:3000 and ignores the file:// base,
// so readFileSync would throw "The URL must be of scheme file".
const source = readFileSync(new NodeURL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

function migrationVersions(): number[] {
  return [...source.matchAll(/version:\s*(\d+)/g)].map((m) => Number(m[1]));
}

describe("sql migrations", () => {
  it("numbers migrations consecutively from 1 without duplicates", () => {
    const versions = migrationVersions();
    expect(versions).toEqual(versions.map((_, i) => i + 1));
  });

  it("creates the tables the time tracking needs", () => {
    expect(source).toContain("CREATE TABLE IF NOT EXISTS time_slots");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS time_settings");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS app_settings");
  });

  it("gives todos a status column", () => {
    expect(source).toContain("ALTER TABLE todos ADD COLUMN status");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/migrations.test.ts`
Expected: FAIL — the last two tests fail, because `time_slots`, `time_settings`, `app_settings` and the `status` column do not exist yet

- [ ] **Step 3: Add the migrations**

In `src-tauri/src/lib.rs`, insert these three entries at the end of the `migrations` vector, after the `version: 5` entry:

```rust
        Migration {
            version: 6,
            description: "add_status_column",
            sql: "ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'todo';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_time_tables",
            sql: "CREATE TABLE IF NOT EXISTS time_slots (
                date TEXT NOT NULL,
                slot INTEGER NOT NULL,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                note TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (date, slot)
            );
            CREATE TABLE IF NOT EXISTS time_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                target_slots_per_day INTEGER NOT NULL DEFAULT 32,
                show_weekend INTEGER NOT NULL DEFAULT 0
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_app_settings",
            sql: "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/migrations.test.ts`
Expected: PASS — all three tests

- [ ] **Step 5: Verify the Rust side still compiles**

Run: `cd src-tauri && cargo check && cd ..`
Expected: `Finished` with no errors

> **Amended:** no Rust toolchain exists in the environment this plan was
> executed in — `cargo`, `rustc` and `rustup` are all absent. This step was
> skipped and the Rust edit was reviewed by eye instead. See "Amendment 2".

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src/migrations.test.ts
git commit -m "feat: add migrations for status, time tracking and app settings"
```

---

## Amendment 2 — after Task 2

**The plan's test snippet was wrong.** `new URL(relative, import.meta.url)` does
not work under `environment: "jsdom"`: jsdom replaces the global `URL`, resolves
the relative path against `http://localhost:3000` and discards the `file://`
base, so `readFileSync` throws `The URL must be of scheme file`. Verified
directly — the resolved href really is `http://localhost:3000/src-tauri/src/lib.rs`.
The fix is `import { URL as NodeURL } from "node:url"`. Any later task that reads
a file from a test must do the same.

**`@types/node` is now a devDependency.** The project had none, so `node:fs` and
`node:url` did not typecheck. Added at `^22`.

**No Rust toolchain in this environment.** ~~`cargo`, `rustc` and `rustup` are
all absent, so nothing in this plan can compile or run the Rust side.~~

**Resolved during Task 4.** The toolchain and the Tauri system libraries were
installed (`rustup default stable`; `pkg-config`, `sqlite3`,
`libwebkit2gtk-4.1-dev`, `libsoup-3.0-dev`, `librsvg2-dev`,
`libayatana-appindicator3-dev`, `libxdo-dev`, `libssl-dev`, `build-essential`,
`file`). `cargo check` in `src-tauri` then finished clean in 2m08s with
rustc 1.98.1, so Task 2's migrations are compiled, not merely read. Task 9 is
no longer blocked and must be executed before Phase 1 counts as done.

The risk that remains until Task 9 runs: a wrong column name in a query or a
`tauri-plugin-sql` binding quirk would pass every mocked test in Tasks 3 to 8
and only surface when the desktop app first opens the database.

---

## Task 3: Open the database

**Files:**
- Create: `src/sqlClient.ts`
- Test: `src/sqlClient.test.ts`

`@tauri-apps/plugin-sql` exposes a `Database` class with a static `load(path)`. Loading is asynchronous and must happen exactly once — every store call goes through this module.

Detecting Tauri: the Tauri v2 webview sets `window.__TAURI_INTERNALS__`. In the browser and under jsdom it is absent.

- [ ] **Step 1: Write the failing test**

Create `src/sqlClient.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const load = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: (path: string) => load(path) },
}));

describe("sqlClient", () => {
  beforeEach(() => {
    vi.resetModules();
    load.mockReset();
    // A fresh object per call, so `toBe` below really proves the cache: with
    // mockResolvedValue both callers would get the same reference even if
    // load() ran twice, and only the call count would catch it.
    load.mockImplementation(() => Promise.resolve({ select: vi.fn(), execute: vi.fn() }));
    delete (globalThis as any).window.__TAURI_INTERNALS__;
  });

  it("reports no Tauri context outside the desktop app", async () => {
    const { isTauri } = await import("./sqlClient");
    expect(isTauri()).toBe(false);
  });

  it("reports a Tauri context when the internals are present", async () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    const { isTauri } = await import("./sqlClient");
    expect(isTauri()).toBe(true);
  });

  it("opens the database only once for concurrent callers", async () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    const { getDb } = await import("./sqlClient");
    const [a, b] = await Promise.all([getDb(), getDb()]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("sqlite:todolist.db");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sqlClient.test.ts`
Expected: FAIL — `Failed to resolve import "./sqlClient"`

- [ ] **Step 3: Write the implementation**

Create `src/sqlClient.ts`:

```ts
import Database from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:todolist.db";

let pending: Promise<Database> | null = null;

/**
 * True inside the Tauri webview, false in a plain browser. Vite dev and the
 * Playwright suite run in a plain browser, so they keep the localStorage stores.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The one database connection. Concurrent callers share a single load(). */
export function getDb(): Promise<Database> {
  if (!pending) {
    pending = Database.load(DB_PATH);
  }
  return pending;
}
```

The tests reset the cache with `vi.resetModules()` rather than an exported reset
helper, so none is needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sqlClient.test.ts`
Expected: PASS — all three tests

- [ ] **Step 5: Commit**

```bash
git add src/sqlClient.ts src/sqlClient.test.ts
git commit -m "feat: add the SQLite connection helper"
```

---

## Task 4: SQLite store for todos

**Files:**
- Create: `src/todoStoreSql.ts`
- Test: `src/todoStoreSql.test.ts`

The tests mock `sqlClient` and assert on the SQL that gets issued and on the mapping of returned rows. They are not a substitute for running the real app — Task 9 covers that — but they pin down the query shape and the row mapping, which is where the mistakes live.

Every read joins `categories` so that `category_name` and `category_color` come along, matching what `Todo` promises today.

- [ ] **Step 1: Write the failing test**

Create `src/todoStoreSql.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const select = vi.fn();
const execute = vi.fn();

vi.mock("./sqlClient", () => ({
  getDb: () => Promise.resolve({ select, execute }),
  isTauri: () => true,
}));

import { sqlTodoStore } from "./todoStoreSql";

const ROW = {
  id: 7,
  title: "Schreiben",
  done: 0,
  status: "todo",
  priority: "high",
  created_at: "2026-09-03T08:00:00.000Z",
  due_date: null,
  category_id: 2,
  category_name: "Kunde",
  category_color: "#a78bfa",
};

describe("sqlTodoStore", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
  });

  it("joins the category when listing todos", async () => {
    select.mockResolvedValue([ROW]);
    const todos = await sqlTodoStore.listTodos();

    const sql = select.mock.calls[0][0] as string;
    expect(sql).toContain("LEFT JOIN categories");
    expect(todos[0].category_name).toBe("Kunde");
    expect(todos[0].done).toBe(false);
  });

  it("filters by category when one is given", async () => {
    select.mockResolvedValue([ROW]);
    await sqlTodoStore.listTodos(2);

    expect(select.mock.calls[0][0]).toContain("WHERE t.category_id = $1");
    expect(select.mock.calls[0][1]).toEqual([2]);
  });

  it("inserts a todo and reads the stored row back", async () => {
    execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 });
    select.mockResolvedValue([ROW]);

    const created = await sqlTodoStore.addTodo("Schreiben", "high", null, 2);

    expect(execute.mock.calls[0][0]).toContain("INSERT INTO todos");
    expect(created.id).toBe(7);
    expect(created.category_name).toBe("Kunde");
  });

  it("writes done and status together", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([{ ...ROW, status: "done", done: 1 }]);

    const updated = await sqlTodoStore.updateTodoStatus(7, "done");

    expect(execute.mock.calls[0][0]).toContain("SET status = $1, done = $2");
    expect(execute.mock.calls[0][1]).toEqual(["done", 1, 7]);
    expect(updated.done).toBe(true);
  });

  it("throws when the todo to update does not exist", async () => {
    execute.mockResolvedValue({ rowsAffected: 0 });
    select.mockResolvedValue([]);

    await expect(sqlTodoStore.updateTodoTitle(99, "x")).rejects.toThrow("Todo 99 not found");
  });

  it("sorts categories by name", async () => {
    select.mockResolvedValue([]);
    await sqlTodoStore.listCategories();
    expect(select.mock.calls[0][0]).toContain("ORDER BY name COLLATE NOCASE");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/todoStoreSql.test.ts`
Expected: FAIL — `Failed to resolve import "./todoStoreSql"`

- [ ] **Step 3: Write the implementation**

Create `src/todoStoreSql.ts`:

```ts
import { Category, CategoryRow, Priority, Todo, TodoRow, TodoStatus, fromRow, fromCategoryRow } from "./types";
import { getDb } from "./sqlClient";
import { TodoStore } from "./storeTypes";

const TODO_COLUMNS = `
  t.id, t.title, t.done, t.status, t.priority, t.created_at, t.due_date,
  t.category_id, c.name AS category_name, c.color AS category_color
`;

async function selectTodo(id: number): Promise<Todo> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS}
     FROM todos t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.id = $1`,
    [id]
  );
  if (rows.length === 0) throw new Error(`Todo ${id} not found`);
  return fromRow(rows[0]);
}

async function listTodos(categoryId?: number | null): Promise<Todo[]> {
  const db = await getDb();
  const filter = categoryId !== undefined && categoryId !== null;
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS}
     FROM todos t LEFT JOIN categories c ON c.id = t.category_id
     ${filter ? "WHERE t.category_id = $1" : ""}
     ORDER BY t.created_at DESC, t.id DESC`,
    filter ? [categoryId] : []
  );
  return rows.map(fromRow);
}

async function addTodo(
  title: string,
  priority: Priority,
  dueDate: string | null,
  categoryId?: number | null
): Promise<Todo> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO todos (title, done, status, priority, created_at, due_date, category_id)
     VALUES ($1, 0, 'todo', $2, $3, $4, $5)`,
    [title, priority, new Date().toISOString(), dueDate, categoryId ?? null]
  );
  return selectTodo(result.lastInsertId as number);
}

async function updateColumn(id: number, sql: string, params: unknown[]): Promise<Todo> {
  const db = await getDb();
  await db.execute(sql, [...params, id]);
  return selectTodo(id);
}

function updateTodoTitle(id: number, title: string): Promise<Todo> {
  return updateColumn(id, "UPDATE todos SET title = $1 WHERE id = $2", [title]);
}

function updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo> {
  return updateColumn(id, "UPDATE todos SET due_date = $1 WHERE id = $2", [dueDate]);
}

function updateTodoPriority(id: number, priority: Priority): Promise<Todo> {
  return updateColumn(id, "UPDATE todos SET priority = $1 WHERE id = $2", [priority]);
}

function updateTodoCategory(id: number, categoryId: number | null): Promise<Todo> {
  return updateColumn(id, "UPDATE todos SET category_id = $1 WHERE id = $2", [categoryId]);
}

function updateTodoStatus(id: number, status: TodoStatus): Promise<Todo> {
  return updateColumn(id, "UPDATE todos SET status = $1, done = $2 WHERE id = $3", [
    status,
    status === "done" ? 1 : 0,
  ]);
}

function toggleTodoDone(id: number, done: boolean): Promise<Todo> {
  return updateTodoStatus(id, done ? "done" : "todo");
}

async function deleteTodo(id: number): Promise<number> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
  return id;
}

async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    "SELECT id, name, color, created_at FROM categories ORDER BY name COLLATE NOCASE ASC"
  );
  return rows.map(fromCategoryRow);
}

async function selectCategory(id: number): Promise<Category> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    "SELECT id, name, color, created_at FROM categories WHERE id = $1",
    [id]
  );
  if (rows.length === 0) throw new Error(`Category ${id} not found`);
  return fromCategoryRow(rows[0]);
}

async function addCategory(name: string, color: string): Promise<Category> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO categories (name, color, created_at) VALUES ($1, $2, $3)",
    [name.trim(), color, new Date().toISOString()]
  );
  return selectCategory(result.lastInsertId as number);
}

async function updateCategory(id: number, name: string, color: string): Promise<Category> {
  const db = await getDb();
  await db.execute("UPDATE categories SET name = $1, color = $2 WHERE id = $3", [
    name.trim(),
    color,
    id,
  ]);
  return selectCategory(id);
}

async function deleteCategory(id: number): Promise<number> {
  const db = await getDb();
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
  return id;
}

export const sqlTodoStore: TodoStore = {
  listTodos,
  addTodo,
  updateTodoTitle,
  updateTodoDueDate,
  updateTodoPriority,
  updateTodoCategory,
  updateTodoStatus,
  toggleTodoDone,
  deleteTodo,
  listCategories,
  addCategory,
  updateCategory,
  deleteCategory,
};
```

Two things worth knowing. `category_name` and `category_color` are no longer stored on the todo — they come from the join, so the denormalisation bookkeeping in `addCategory` and `updateCategory` that the localStorage store needs disappears here. And `todos.category_id` already carries `ON DELETE SET NULL` from migration 4, so deleting a category leaves its todos intact.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/todoStoreSql.test.ts`
Expected: PASS — all six tests

- [ ] **Step 5: Commit**

```bash
git add src/todoStoreSql.ts src/todoStoreSql.test.ts
git commit -m "feat: add the SQLite store for todos and categories"
```

---

## Task 5: SQLite store for time tracking

**Files:**
- Create: `src/timeStoreSql.ts`
- Test: `src/timeStoreSql.test.ts`

`saveDay` replaces the whole day: delete every slot for that date, then insert the given ones. Both statements run inside a transaction so a crash midway cannot leave the day half-written.

The domain logic stays in `timeSlots.ts`. `paintSlots` and `setBlockNote` read the day, run the pure function, and write the result back — exactly as the localStorage store does.

- [ ] **Step 1: Write the failing test**

Create `src/timeStoreSql.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const select = vi.fn();
const execute = vi.fn();

vi.mock("./sqlClient", () => ({
  getDb: () => Promise.resolve({ select, execute }),
  isTauri: () => true,
}));

import { sqlTimeStore } from "./timeStoreSql";
import { DEFAULT_SETTINGS } from "./timeTypes";

describe("sqlTimeStore", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
    execute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("falls back to the defaults when no settings row exists", async () => {
    select.mockResolvedValue([]);
    await expect(sqlTimeStore.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("reads the stored settings", async () => {
    select.mockResolvedValue([{ target_slots_per_day: 30, show_weekend: 1 }]);
    await expect(sqlTimeStore.getSettings()).resolves.toEqual({
      targetSlotsPerDay: 30,
      showWeekend: true,
    });
  });

  it("clamps an absurd target before storing it", async () => {
    const stored = await sqlTimeStore.saveSettings({ targetSlotsPerDay: 999, showWeekend: false });
    expect(stored.targetSlotsPerDay).toBe(64);
    expect(execute.mock.calls[0][1]).toEqual([64, 0]);
  });

  it("reads a day sorted by slot", async () => {
    select.mockResolvedValue([
      { slot: 36, category_id: 2, note: "Meeting" },
      { slot: 37, category_id: 2, note: "Meeting" },
    ]);
    const slots = await sqlTimeStore.listSlots("2026-09-03");

    expect(select.mock.calls[0][0]).toContain("ORDER BY slot");
    expect(select.mock.calls[0][1]).toEqual(["2026-09-03"]);
    expect(slots).toHaveLength(2);
  });

  it("replaces a day inside a transaction", async () => {
    await sqlTimeStore.saveDay("2026-09-03", [{ slot: 36, category_id: 2, note: "" }]);

    const statements = execute.mock.calls.map((call) => call[0] as string);
    expect(statements[0]).toContain("BEGIN");
    expect(statements.some((s) => s.includes("DELETE FROM time_slots"))).toBe(true);
    expect(statements.some((s) => s.includes("INSERT INTO time_slots"))).toBe(true);
    expect(statements[statements.length - 1]).toContain("COMMIT");
  });

  it("clears a block by painting it with no category", async () => {
    select.mockResolvedValue([
      { slot: 36, category_id: 2, note: "Meeting" },
      { slot: 37, category_id: 2, note: "Meeting" },
    ]);
    const remaining = await sqlTimeStore.clearBlock("2026-09-03", 36, 38);
    expect(remaining).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/timeStoreSql.test.ts`
Expected: FAIL — `Failed to resolve import "./timeStoreSql"`

- [ ] **Step 3: Write the implementation**

Create `src/timeStoreSql.ts`:

```ts
// SQLite-Variante der Zeit-Persistenz. Gleiche Semantik wie timeStoreLocal.ts:
// ein Tag wird immer komplett ersetzt, die Fachlogik bleibt in timeSlots.ts.

import { DaySlot, applyPaint, setBlockNote as setNoteOnBlock } from "./timeSlots";
import { TimeSettings, DEFAULT_SETTINGS } from "./timeTypes";
import { TimeStore } from "./storeTypes";
import { getDb } from "./sqlClient";

/** Soll je Tag zwischen 0:00 und 16:00; alles andere waere ein Tippfehler. */
const MAX_TARGET_SLOTS = 64;

function clampTarget(slots: number): number {
  if (!Number.isFinite(slots)) return DEFAULT_SETTINGS.targetSlotsPerDay;
  return Math.min(MAX_TARGET_SLOTS, Math.max(0, Math.round(slots)));
}

interface SettingsRow {
  target_slots_per_day: number;
  show_weekend: number;
}

interface SlotRow {
  slot: number;
  category_id: number;
  note: string;
}

async function getSettings(): Promise<TimeSettings> {
  const db = await getDb();
  const rows = await db.select<SettingsRow[]>(
    "SELECT target_slots_per_day, show_weekend FROM time_settings WHERE id = 1"
  );
  if (rows.length === 0) return DEFAULT_SETTINGS;
  return {
    targetSlotsPerDay: clampTarget(Number(rows[0].target_slots_per_day)),
    showWeekend: rows[0].show_weekend === 1,
  };
}

async function saveSettings(settings: TimeSettings): Promise<TimeSettings> {
  const stored: TimeSettings = {
    targetSlotsPerDay: clampTarget(settings.targetSlotsPerDay),
    showWeekend: settings.showWeekend === true,
  };
  const db = await getDb();
  await db.execute(
    `INSERT INTO time_settings (id, target_slots_per_day, show_weekend)
     VALUES (1, $1, $2)
     ON CONFLICT(id) DO UPDATE SET target_slots_per_day = $1, show_weekend = $2`,
    [stored.targetSlotsPerDay, stored.showWeekend ? 1 : 0]
  );
  return stored;
}

async function listSlots(date: string): Promise<DaySlot[]> {
  const db = await getDb();
  const rows = await db.select<SlotRow[]>(
    "SELECT slot, category_id, note FROM time_slots WHERE date = $1 ORDER BY slot ASC",
    [date]
  );
  return rows.map((row) => ({ slot: row.slot, category_id: row.category_id, note: row.note }));
}

async function saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM time_slots WHERE date = $1", [date]);
    for (const slot of slots) {
      await db.execute(
        "INSERT INTO time_slots (date, slot, category_id, note) VALUES ($1, $2, $3, $4)",
        [date, slot.slot, slot.category_id, slot.note ?? ""]
      );
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
  return slots;
}

async function paintSlots(
  date: string,
  indices: number[],
  categoryId: number | null
): Promise<DaySlot[]> {
  const current = await listSlots(date);
  return saveDay(date, applyPaint(current, indices, categoryId));
}

async function setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]> {
  const current = await listSlots(date);
  return saveDay(date, setNoteOnBlock(current, slot, note));
}

function clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]> {
  const indices: number[] = [];
  for (let slot = startSlot; slot < endSlot; slot++) indices.push(slot);
  return paintSlots(date, indices, null);
}

export const sqlTimeStore: TimeStore = {
  getSettings,
  saveSettings,
  listSlots,
  saveDay,
  paintSlots,
  setBlockNote,
  clearBlock,
};
```

`clampTarget` and `MAX_TARGET_SLOTS` now exist in both time stores. That is deliberate duplication of six lines rather than a shared module that would exist only to hold them; if a third caller ever appears, move them into `timeSlots.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/timeStoreSql.test.ts`
Expected: PASS — all six tests

- [ ] **Step 5: Commit**

```bash
git add src/timeStoreSql.ts src/timeStoreSql.test.ts
git commit -m "feat: add the SQLite store for time tracking"
```

---

## Amendment 3 — after Task 5

**The plan's transaction was not a transaction.** Task 5 as written had `saveDay`
issue `BEGIN`, the statements, and `COMMIT` as separate `db.execute` calls.
Reading the plugin's source settles it — `tauri-plugin-sql` 2.4.0,
`src/wrapper.rs:167`:

```rust
let result = pool.execute(query).await?;
```

That runs against the **pool**, so sqlx acquires a connection, runs the one
statement and releases it, for every call. The four calls can land on four
different connections. `BEGIN` then opens a transaction on a connection that
nothing else in the sequence necessarily uses, and the `DELETE` and `INSERT`s
run in autocommit on whatever connection they happen to get. A failure partway
through would leave a half-deleted day and no rollback — in a time-tracking app,
silently destroyed work.

**The fix, implemented in `891f26b`:** a Tauri command `replace_time_day` in
`src-tauri/src/lib.rs` resolves the plugin's own pool from
`tauri_plugin_sql::DbInstances` and runs the delete-then-insert inside a real
`pool.begin()` transaction. `sqlx 0.8` is now a direct dependency of the Rust
crate — the same version the plugin already resolved, verified as a single entry
in `Cargo.lock`. `timeStoreSql.saveDay` calls the command through `invoke`
instead of issuing SQL.

The transactional body sits in `replace_time_day_tx(pool, date, slots)`, separate
from the command, so it is reachable from a test without a running app. Three
Rust tests run against an in-memory SQLite pool; the third forces a mid-batch
failure with a duplicate `(date, slot)` and asserts the day is unchanged
afterwards. These are the first tests in the project that touch a real database.

**Two corrections for anyone reading the plugin's source:**

- `DbPool::sqlite()` does not exist in 2.4.0 — the whole `impl DbPool` block
  holding it is inside a block comment. Match on the `DbPool::Sqlite(pool)`
  variant directly; a public enum's tuple-variant fields are public.
- `#[tauri::command]`'s camelCase conversion applies only to the command's own
  top-level parameters, not to fields inside a struct argument. `TimeSlotInput`
  deserializes `category_id` by its literal name, which is what the JS side
  sends, so no `#[serde(rename_all)]` is needed.

**`clampTarget` is now shared.** It moved from `timeStoreLocal.ts` into
`timeSlots.ts`, where the storage-agnostic time logic lives, and both stores
import it. Its non-finite fallback returns the literal `32` rather than
`DEFAULT_SETTINGS.targetSlotsPerDay`, because importing `timeTypes.ts` into
`timeSlots.ts` would recreate the cycle Amendment 1 broke.

**One ordering trap closed (`ce4f747`).** `DbInstances` holds no entry until the
JS side calls `Database.load` at least once, so a `saveDay` that ran before
anything else touched the database would fail with a confusing message about a
missing connection string. `saveDay` now awaits the cached `getDb()` first.

**Harmless, but worth knowing:** the plugin binds every JSON number as `f64`.
SQLite's `INTEGER` affinity converts integral values back losslessly, including
the timestamp-sized ids the Task 7 migration carries over — verified against a
real SQLite: `1788444257074` stores as `integer`.

---

## Task 6: Switch the dispatchers over

**Files:**
- Modify: `src/db.ts` (the `store()` function)
- Modify: `src/timeDb.ts` (the `store()` function)
- Test: `src/db.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/db.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const isTauri = vi.fn();

vi.mock("./sqlClient", () => ({
  isTauri: () => isTauri(),
  getDb: () => Promise.resolve({ select: vi.fn(), execute: vi.fn() }),
}));

describe("db backend selection", () => {
  beforeEach(() => {
    vi.resetModules();
    isTauri.mockReset();
    localStorage.clear();
  });

  it("uses the localStorage store outside Tauri", async () => {
    isTauri.mockReturnValue(false);
    const db = await import("./db");
    const created = await db.addTodo("Browser", "low", null, null);
    expect(localStorage.getItem("todolist_todos")).toContain("Browser");
    expect(created.title).toBe("Browser");
  });

  it("uses the SQLite store inside Tauri", async () => {
    isTauri.mockReturnValue(true);
    const db = await import("./db");
    await db.listTodos().catch(() => undefined);
    expect(localStorage.getItem("todolist_todos")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — the second test fails, because `db.ts` always uses the localStorage store and writes nothing to SQLite

- [ ] **Step 3: Wire in the selection**

In `src/db.ts`, replace the import block and the `store()` function:

```ts
import { localTodoStore } from "./todoStoreLocal";
import { sqlTodoStore } from "./todoStoreSql";
import { isTauri } from "./sqlClient";
import { TodoStore } from "./storeTypes";

function store(): TodoStore {
  return isTauri() ? sqlTodoStore : localTodoStore;
}
```

In `src/timeDb.ts`, the same:

```ts
import { localTimeStore } from "./timeStoreLocal";
import { sqlTimeStore } from "./timeStoreSql";
import { isTauri } from "./sqlClient";
import { TimeStore } from "./storeTypes";

function store(): TimeStore {
  return isTauri() ? sqlTimeStore : localTimeStore;
}
```

The check runs per call, not once at module load. That keeps it testable and costs one property lookup.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS — both tests

- [ ] **Step 5: Run the full suite**

Run: `npm run typecheck && npm test`
Expected: PASS — jsdom has no `__TAURI_INTERNALS__`, so every existing test keeps using the localStorage store

- [ ] **Step 6: Commit**

```bash
git add src/db.ts src/timeDb.ts src/db.test.ts
git commit -m "feat: use SQLite inside Tauri and localStorage in the browser"
```

---

## Task 7: One-shot migration of existing data

**Files:**
- Create: `src/migrateLocalStorage.ts`
- Test: `src/migrateLocalStorage.test.ts`

Runs once, on the first launch after the update. Copies categories first (todos and slots reference them), then todos, then slots and settings, then sets the flag.

Categories carry a `UNIQUE COLLATE NOCASE` constraint on `name` from migration 2, which `localStorage` never enforced. Two categories differing only in case would abort the insert, so the migration maps them onto the first one it saw.

IDs from `localStorage` are timestamps, not sequence values. They are inserted explicitly to keep the references between todos, slots and categories intact.

- [ ] **Step 1: Write the failing test**

Create `src/migrateLocalStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const select = vi.fn();
const execute = vi.fn();

vi.mock("./sqlClient", () => ({
  getDb: () => Promise.resolve({ select, execute }),
  isTauri: () => true,
}));

import { migrateLocalStorage, MIGRATED_FLAG } from "./migrateLocalStorage";

function statements(): string[] {
  return execute.mock.calls.map((call) => call[0] as string);
}

describe("migrateLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    select.mockReset();
    execute.mockReset();
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([]);
  });

  it("sets the flag and writes nothing when localStorage is empty", async () => {
    await migrateLocalStorage();
    expect(statements().some((s) => s.includes("INSERT INTO todos"))).toBe(false);
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
  });

  it("does nothing at all on a second run", async () => {
    localStorage.setItem(MIGRATED_FLAG, "1");
    localStorage.setItem("todolist_todos", JSON.stringify([{ id: 1, title: "x", done: false }]));
    await migrateLocalStorage();
    expect(execute).not.toHaveBeenCalled();
  });

  it("copies categories before todos", async () => {
    localStorage.setItem(
      "todolist_categories",
      JSON.stringify([{ id: 5, name: "Kunde", color: "#a78bfa", created_at: "2026-01-01" }])
    );
    localStorage.setItem(
      "todolist_todos",
      JSON.stringify([
        {
          id: 9,
          title: "Meeting",
          done: false,
          status: "todo",
          priority: "medium",
          created_at: "2026-01-02",
          due_date: null,
          category_id: 5,
        },
      ])
    );

    await migrateLocalStorage();

    const order = statements();
    const catIndex = order.findIndex((s) => s.includes("INSERT INTO categories"));
    const todoIndex = order.findIndex((s) => s.includes("INSERT INTO todos"));
    expect(catIndex).toBeGreaterThan(-1);
    expect(todoIndex).toBeGreaterThan(catIndex);
  });

  it("derives status from done for old todos", async () => {
    localStorage.setItem(
      "todolist_todos",
      JSON.stringify([
        { id: 9, title: "Alt", done: true, priority: "low", created_at: "2026-01-02", due_date: null },
      ])
    );

    await migrateLocalStorage();

    const call = execute.mock.calls.find((c) => (c[0] as string).includes("INSERT INTO todos"));
    expect(call?.[1]).toContain("done");
  });

  it("merges categories whose names differ only in case", async () => {
    localStorage.setItem(
      "todolist_categories",
      JSON.stringify([
        { id: 1, name: "Kunde", color: "#a78bfa", created_at: "2026-01-01" },
        { id: 2, name: "kunde", color: "#f87171", created_at: "2026-01-01" },
      ])
    );
    localStorage.setItem(
      "todolist_timeslots",
      JSON.stringify([{ date: "2026-09-03", slot: 36, category_id: 2, note: "" }])
    );

    await migrateLocalStorage();

    const inserts = execute.mock.calls.filter((c) => (c[0] as string).includes("INSERT INTO categories"));
    expect(inserts).toHaveLength(1);

    const slotCall = execute.mock.calls.find((c) => (c[0] as string).includes("INSERT INTO time_slots"));
    expect(slotCall?.[1]).toContain(1);
  });

  it("drops slots whose category no longer exists", async () => {
    localStorage.setItem(
      "todolist_timeslots",
      JSON.stringify([{ date: "2026-09-03", slot: 36, category_id: 404, note: "" }])
    );

    await migrateLocalStorage();

    expect(statements().some((s) => s.includes("INSERT INTO time_slots"))).toBe(false);
  });

  it("skips a corrupt key and still migrates the rest", async () => {
    localStorage.setItem("todolist_categories", "{not json");
    localStorage.setItem(
      "todolist_time_settings",
      JSON.stringify({ targetSlotsPerDay: 30, showWeekend: true })
    );

    await migrateLocalStorage();

    expect(statements().some((s) => s.includes("INTO time_settings"))).toBe(true);
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
  });

  it("rolls back and leaves the flag unset when a write fails", async () => {
    localStorage.setItem(
      "todolist_categories",
      JSON.stringify([{ id: 1, name: "Kunde", color: "#a78bfa", created_at: "2026-01-01" }])
    );
    execute.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO categories")) return Promise.reject(new Error("disk full"));
      return Promise.resolve({ rowsAffected: 1 });
    });

    await expect(migrateLocalStorage()).rejects.toThrow("disk full");
    expect(statements()).toContain("ROLLBACK");
    expect(localStorage.getItem(MIGRATED_FLAG)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/migrateLocalStorage.test.ts`
Expected: FAIL — `Failed to resolve import "./migrateLocalStorage"`

- [ ] **Step 3: Write the implementation**

Create `src/migrateLocalStorage.ts`:

```ts
// Einmaliger Umzug der Altdaten aus localStorage nach SQLite. Laeuft beim ersten
// Start nach dem Update, danach sperrt das Flag. Die alten Keys bleiben liegen:
// sie kosten nichts und sind das Netz, falls hier etwas schiefgeht.

import { getDb, isTauri } from "./sqlClient";

export const MIGRATED_FLAG = "todolist_migrated_to_sqlite";

const TODOS_KEY = "todolist_todos";
const CATEGORIES_KEY = "todolist_categories";
const SLOTS_KEY = "todolist_timeslots";
const SETTINGS_KEY = "todolist_time_settings";

/** Liest einen Key; kaputtes JSON wird zu null, nicht zu einem Absturz. */
function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readArray(key: string): any[] {
  const value = readKey(key);
  return Array.isArray(value) ? value : [];
}

export async function migrateLocalStorage(): Promise<void> {
  if (!isTauri()) return;
  if (localStorage.getItem(MIGRATED_FLAG) === "1") return;

  const categories = readArray(CATEGORIES_KEY);
  const todos = readArray(TODOS_KEY);
  const slots = readArray(SLOTS_KEY);
  const settings = readKey(SETTINGS_KEY) as
    | { targetSlotsPerDay?: unknown; showWeekend?: unknown }
    | null;

  // Kategorienamen sind in SQLite UNIQUE COLLATE NOCASE. localStorage kannte die
  // Regel nicht, also bildet die Karte spaete Duplikate auf die erste ID ab.
  const idByLowerName = new Map<string, number>();
  const remappedId = new Map<number, number>();
  const uniqueCategories: any[] = [];

  for (const category of categories) {
    if (typeof category?.id !== "number" || typeof category?.name !== "string") continue;
    const key = category.name.trim().toLowerCase();
    const existing = idByLowerName.get(key);
    if (existing !== undefined) {
      remappedId.set(category.id, existing);
      continue;
    }
    idByLowerName.set(key, category.id);
    remappedId.set(category.id, category.id);
    uniqueCategories.push(category);
  }

  function resolveCategory(id: unknown): number | null {
    if (typeof id !== "number") return null;
    return remappedId.get(id) ?? null;
  }

  const db = await getDb();
  await db.execute("BEGIN");
  try {
    for (const category of uniqueCategories) {
      await db.execute(
        "INSERT INTO categories (id, name, color, created_at) VALUES ($1, $2, $3, $4)",
        [
          category.id,
          category.name.trim(),
          typeof category.color === "string" ? category.color : "#a78bfa",
          typeof category.created_at === "string" ? category.created_at : new Date().toISOString(),
        ]
      );
    }

    for (const todo of todos) {
      if (typeof todo?.id !== "number" || typeof todo?.title !== "string") continue;
      const status = typeof todo.status === "string" ? todo.status : todo.done ? "done" : "todo";
      await db.execute(
        `INSERT INTO todos (id, title, done, status, priority, created_at, due_date, category_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          todo.id,
          todo.title,
          status === "done" ? 1 : 0,
          status,
          typeof todo.priority === "string" ? todo.priority : "medium",
          typeof todo.created_at === "string" ? todo.created_at : new Date().toISOString(),
          typeof todo.due_date === "string" ? todo.due_date : null,
          resolveCategory(todo.category_id),
        ]
      );
    }

    for (const slot of slots) {
      if (typeof slot?.date !== "string" || typeof slot?.slot !== "number") continue;
      const categoryId = resolveCategory(slot.category_id);
      if (categoryId === null) continue;
      await db.execute(
        "INSERT INTO time_slots (date, slot, category_id, note) VALUES ($1, $2, $3, $4)",
        [slot.date, slot.slot, categoryId, typeof slot.note === "string" ? slot.note : ""]
      );
    }

    if (settings) {
      await db.execute(
        `INSERT INTO time_settings (id, target_slots_per_day, show_weekend)
         VALUES (1, $1, $2)
         ON CONFLICT(id) DO UPDATE SET target_slots_per_day = $1, show_weekend = $2`,
        [
          Number.isFinite(Number(settings.targetSlotsPerDay))
            ? Math.min(64, Math.max(0, Math.round(Number(settings.targetSlotsPerDay))))
            : 32,
          settings.showWeekend === true ? 1 : 0,
        ]
      );
    }

    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }

  localStorage.setItem(MIGRATED_FLAG, "1");
}
```

The flag is set only after `COMMIT`. A failure leaves it unset, so the next launch retries — with a clean database, because the transaction rolled back.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/migrateLocalStorage.test.ts`
Expected: PASS — all eight tests

- [ ] **Step 5: Commit**

```bash
git add src/migrateLocalStorage.ts src/migrateLocalStorage.test.ts
git commit -m "feat: migrate existing localStorage data into SQLite once"
```

---

## Task 8: Run the migration before the first render

**Files:**
- Modify: `src/main.tsx`
- Test: `src/main.test.tsx` (create)

If React rendered first, `App.tsx` would call `listTodos()` against an empty database and show nothing until a reload.

- [ ] **Step 1: Write the failing test**

Create `src/main.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";

const migrate = vi.fn();
const render = vi.fn();

vi.mock("./migrateLocalStorage", () => ({
  migrateLocalStorage: () => migrate(),
  MIGRATED_FLAG: "todolist_migrated_to_sqlite",
}));

vi.mock("react-dom/client", () => ({
  default: { createRoot: () => ({ render }) },
}));

vi.mock("./App", () => ({ default: () => null }));

describe("main", () => {
  beforeEach(() => {
    vi.resetModules();
    migrate.mockReset();
    render.mockReset();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("migrates before rendering", async () => {
    const order: string[] = [];
    migrate.mockImplementation(() => {
      order.push("migrate");
      return Promise.resolve();
    });
    render.mockImplementation(() => {
      order.push("render");
    });

    await import("./main");
    await vi.waitFor(() => expect(render).toHaveBeenCalled());

    expect(order).toEqual(["migrate", "render"]);
  });

  it("still renders when the migration fails", async () => {
    migrate.mockRejectedValue(new Error("disk full"));

    await import("./main");
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main.test.tsx`
Expected: FAIL — the first test fails, `order` is `["render"]`, because `main.tsx` does not call the migration

- [ ] **Step 3: Write the implementation**

Replace `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { migrateLocalStorage } from "./migrateLocalStorage";

function start(): void {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Migration first, otherwise the first render reads an empty database. A failed
// migration must not keep the app from starting: the flag stays unset, so the
// next launch retries.
migrateLocalStorage()
  .catch((error) => console.error("localStorage migration failed", error))
  .finally(start);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main.test.tsx`
Expected: PASS — both tests

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/main.test.tsx
git commit -m "feat: run the localStorage migration before the first render"
```

---

## Amendment 4 — after Tasks 6 to 8

**The migration does not use a transaction, deliberately.** The plan wrapped it
in `BEGIN`/`COMMIT`, which Amendment 3 already established is not a transaction
through this plugin. Here that would have been worse than useless: a partial run
leaves the flag unset, the next launch retries, the `INSERT`s hit ids that now
exist, and the migration wedges permanently on a primary-key violation. So every
row insert is `INSERT OR IGNORE` and the whole thing is idempotent — a crashed
run is simply completed by the next launch. Verified against a real SQLite: the
full statement sequence run twice leaves an identical database.

**`INSERT OR IGNORE` does not suppress foreign-key violations.** Only PRIMARY
KEY, UNIQUE, CHECK and NOT NULL conflicts are ignored; an FK violation still
aborts with `SQLITE_CONSTRAINT_FOREIGNKEY`. This is not a footnote — it is the
reason the migration resolves category ids by re-reading `SELECT id, name FROM
categories` after inserting them, rather than trusting a local map. Without that
second pass, any user who already had a category in the database would hit a
genuine FK error on every todo and slot referencing it, and the migration would
fail for exactly the people who have data worth migrating.

**A todo whose category cannot be resolved is migrated with `category_id = NULL`,
not dropped.** The text is the user's data; the category is metadata. Time slots
must be dropped in that case instead, because `time_slots.category_id` is NOT
NULL and a slot without a category means nothing.

**Settings are seeded, not upserted.** `time_settings` uses `INSERT OR IGNORE`
like everything else. With `ON CONFLICT DO UPDATE` a failed first run followed by
the user changing their daily target would have had the retry silently restore
the old value.

**`start()` must sit outside the migration's catch.** With `.then(() => start(null))
.catch(...)`, a render failure lands in the catch, tells the user their data
migration failed when it succeeded, and renders a second time onto a container
that already has a root. The chain now converts a failure to a value and calls
`start` exactly once, at the end.

**Known first-launch cost, accepted.** The migration issues one IPC round trip
per row. A user with a few hundred todos and a year of bookings waits on the
order of seconds, once, with a blank window. Every later launch is a single
`localStorage.getItem`. Not worth a loading screen for a one-time event.

**Known limitation, accepted.** `INSERT OR IGNORE` cannot distinguish "this row
was already migrated on a previous attempt" from "two localStorage rows collided
on one id". The collision needs two records created in the same millisecond
drawing the same value from `Math.floor(Math.random() * 1000)`, and its
consequence is one record not appearing while the original stays in
`localStorage`. Detecting it would mean inventing a reporting channel this
codebase does not have.

**Reading test output:** `npx playwright test` reports 52 passed with 2 flaky out
of 54 collected — `e2e/timetracking.spec.ts:160` and `e2e/todolist.spec.ts:569`,
both green on retry and unrelated to this work. Read the summary line, not the
count.

---

## Task 9: Verify against the real application

Everything so far ran against mocks. This task is the one that proves SQLite actually works.

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md` (test file list)

- [ ] **Step 1: Run every automated check**

```bash
npm run typecheck && npm test && npx playwright test
cd src-tauri && cargo check && cd ..
```

Expected: all green. Do not continue past a failure — fix it first.

- [ ] **Step 2: Start the desktop app with existing data**

Run: `npm run tauri dev`

Then, by hand:

1. The todos and time bookings that were there before the change are all still present.
2. Create a todo, give it a category and a due date, drag it to another kanban column.
3. Book a block in the time tracking view and give it a note.
4. Close the app completely and start it again — everything from steps 2 and 3 is still there.

- [ ] **Step 3: Confirm the data is in the database**

Find `todolist.db` in the Tauri app data directory (Linux: `~/.local/share/<bundle-identifier>/`; the identifier is in `src-tauri/tauri.conf.json`). Then:

```bash
sqlite3 ~/.local/share/<bundle-identifier>/todolist.db \
  "SELECT count(*) FROM todos; SELECT count(*) FROM time_slots; SELECT key FROM app_settings;"
```

Expected: the counts match what the app shows. `app_settings` is empty — Phase 2 fills it.

- [ ] **Step 4: Confirm the migration does not run twice**

In the app's devtools console:

```js
localStorage.getItem("todolist_migrated_to_sqlite")
```

Expected: `"1"`. Restart the app; no todo is duplicated.

- [ ] **Step 5: Update the documentation**

In `AGENTS.md`, extend the "Test Files" list with the new files:

```markdown
- `src/todoStoreLocal.test.ts` — unit tests for the localStorage todo store
- `src/todoStoreSql.test.ts` — unit tests for the SQLite todo store (`sqlClient` is mocked)
- `src/timeStoreSql.test.ts` — unit tests for the SQLite time store (`sqlClient` is mocked)
- `src/sqlClient.test.ts` — unit tests for the database connection helper
- `src/db.test.ts` — unit tests for the backend selection
- `src/migrations.test.ts` — checks the migration list in `src-tauri/src/lib.rs`
- `src/migrateLocalStorage.test.ts` — unit tests for the one-shot data migration
- `src/main.test.tsx` — checks that the migration runs before the first render
```

In `CHANGELOG.md`, add an entry under a new `Unreleased` heading:

```markdown
## Unreleased

### Changed

- Todos, categories and time bookings are now stored in SQLite instead of the
  webview's localStorage. Existing data is migrated once on first launch; the old
  localStorage entries are kept as a fallback. In the browser (Vite dev, E2E
  tests) localStorage remains in use.
```

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md CHANGELOG.md
git commit -m "docs: record the move to SQLite persistence"
```

---

## Done when

- `npm run typecheck && npm test` passes
- `npx playwright test` passes
- `cd src-tauri && cargo check` passes
- Todos and time bookings created in the desktop app survive a restart, and
  `sqlite3` finds them in `todolist.db`
- Pre-existing localStorage data showed up unchanged after the update

At that point Phase 1 is complete and the checkpoint is reached. Phase 2 — the
MCP server — gets its own plan.
