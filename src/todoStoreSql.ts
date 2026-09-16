// SQLite backend for todos and categories. Implements TodoStore from
// storeTypes.ts; the contracts documented there apply here, this file only
// holds implementation detail.

import {
  Category,
  CategoryRow,
  Priority,
  Todo,
  TodoRow,
  TodoStatus,
  TimeKind,
  fromRow,
  fromCategoryRow,
  sortCategories,
  categoryNameKey,
  canonicalCategoryName,
} from "./types";
import { getDb } from "./sqlClient";
import { TodoStore, TodoFieldsPatch } from "./storeTypes";

const TODO_COLUMNS = `
  t.id, t.title, t.description, t.done, t.status, t.priority, t.created_at,
  t.due_date, t.category_id, c.name AS category_name, c.color AS category_color
`;

// Die eine Stelle, an der steht, was "nicht im Papierkorb" heisst. Jede
// Leseabfrage haengt sie an -- eine vergessene wuerde weggeworfene Aufgaben
// wieder auftauchen lassen. Ohne Tabellen-Alias fuer UPDATE-Statements, die
// keinen kennen.
const NOT_DELETED_HERE = "deleted_at IS NULL";
const NOT_DELETED = `t.${NOT_DELETED_HERE}`;

async function selectTodo(id: number): Promise<Todo> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS}
     FROM todos t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.id = $1 AND ${NOT_DELETED}`,
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
     WHERE ${NOT_DELETED}${filter ? " AND t.category_id = $1" : ""}
     ORDER BY t.created_at DESC, t.id DESC`,
    filter ? [categoryId] : []
  );
  return rows.map(fromRow);
}

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

async function updateColumn(id: number, sql: string, params: unknown[]): Promise<Todo> {
  const db = await getDb();
  // Der Guard haengt hier, nicht in jedem Aufrufer: eine Aufgabe im Papierkorb
  // darf sich nicht still veraendern, waehrend der Aufrufer den
  // "not found"-Fehler von selectTodo bekommt.
  await db.execute(`${sql} AND ${NOT_DELETED_HERE}`, [...params, id]);
  return selectTodo(id);
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
  // Selber Guard wie in updateColumn -- dieser Pfad geht nicht ueber sie.
  await db.execute(
    `UPDATE todos SET ${assignments.join(", ")} WHERE id = $${params.length + 1} AND ${NOT_DELETED_HERE}`,
    [...params, id]
  );
  return selectTodo(id);
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
  // Wirft nicht, wenn die Id unbekannt ist -- wie bisher. Der Aufrufer sieht
  // an der zurueckgegebenen Id nur, worauf er gezielt hat.
  //
  // Das Format ist ausgeschrieben, nicht datetime('now'): die 30-Tage-Frist
  // wird in JavaScript aus toISOString() berechnet ("...T...Z"), waehrend
  // datetime('now') "... ..." (Leerzeichen statt "T", kein "Z") liefert. Ein
  // Vergleich als Text wuerde dann am zehnten Zeichen entscheiden -- Leerzeichen
  // vor "T" -- und nicht an der Uhrzeit, das Loeschfenster waere also falsch.
  await db.execute(
    `UPDATE todos SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $1 AND ${NOT_DELETED_HERE}`,
    [id]
  );
  return id;
}

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

async function purgeTodo(id: number): Promise<number> {
  const db = await getDb();
  // Nur Zeilen im Papierkorb -- eine lebende oder unbekannte Id bleibt
  // folgenlos, siehe Vertrag in storeTypes.ts.
  await db.execute("DELETE FROM todos WHERE id = $1 AND deleted_at IS NOT NULL", [id]);
  return id;
}

async function purgeDeletedBefore(cutoff: string): Promise<number> {
  const db = await getDb();
  // Textvergleich -- gilt nur, weil alle Backends dasselbe ISO-Format
  // schreiben, siehe storeTypes.ts.
  const result = await db.execute(
    "DELETE FROM todos WHERE deleted_at IS NOT NULL AND deleted_at < $1",
    [cutoff]
  );
  return result.rowsAffected;
}

async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    "SELECT id, name, color, created_at, time_kind FROM categories"
  );
  // Sorted here, not in SQL: SQLite's NOCASE collation only case-folds ASCII,
  // so "Ärzte" would land after "Zebra". sortCategories is the one order the
  // localStorage store and the App use too, and there are only ever a handful
  // of categories.
  return sortCategories(rows.map(fromCategoryRow));
}

async function selectCategory(id: number): Promise<Category> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    "SELECT id, name, color, created_at, time_kind FROM categories WHERE id = $1",
    [id]
  );
  if (rows.length === 0) throw new Error(`Category ${id} not found`);
  return fromCategoryRow(rows[0]);
}

// Rejects a create/rename that collides with an existing category name,
// case-insensitively and Unicode-aware (see categoryNameKey in types.ts).
// Done in JavaScript, not left to the DB's `UNIQUE COLLATE NOCASE` constraint:
// NOCASE only case-folds ASCII (so "Ärzte"/"ärzte" would both be accepted),
// and its violation would surface as an opaque SQLite error. `excludeId` lets
// updateCategory allow a category to keep its own name.
async function assertNameAvailable(name: string, excludeId?: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    "SELECT id, name, color, created_at, time_kind FROM categories"
  );
  const key = categoryNameKey(name);
  const collision = rows.find((r) => r.id !== excludeId && categoryNameKey(r.name) === key);
  if (collision) {
    throw new Error(`Es gibt bereits eine Kategorie "${collision.name}".`);
  }
}

async function addCategory(
  name: string,
  color: string,
  timeKind: TimeKind = "internal"
): Promise<Category> {
  await assertNameAvailable(name);
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO categories (name, color, created_at, time_kind) VALUES ($1, $2, $3, $4)",
    [canonicalCategoryName(name), color, new Date().toISOString(), timeKind]
  );
  return selectCategory(result.lastInsertId as number);
}

async function updateCategory(
  id: number,
  name: string,
  color: string,
  timeKind: TimeKind = "internal"
): Promise<Category> {
  await assertNameAvailable(name, id);
  const db = await getDb();
  await db.execute(
    "UPDATE categories SET name = $1, color = $2, time_kind = $3 WHERE id = $4",
    [canonicalCategoryName(name), color, timeKind, id]
  );
  return selectCategory(id);
}

async function deleteCategory(id: number): Promise<number> {
  const db = await getDb();
  // No manual cleanup of referencing todos needed here: migration 4 declares
  // todos.category_id with ON DELETE SET NULL, so the database clears it.
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
  return id;
}

export const sqlTodoStore: TodoStore = {
  listTodos,
  addTodo,
  updateTodoDueDate,
  updateTodoPriority,
  updateTodoCategory,
  updateTodoFields,
  updateTodoStatus,
  toggleTodoDone,
  deleteTodo,
  listDeletedTodos,
  restoreTodo,
  purgeTodo,
  purgeDeletedBefore,
  listCategories,
  addCategory,
  updateCategory,
  deleteCategory,
};
