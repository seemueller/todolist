// SQLite backend for todos and categories. Implements TodoStore from
// storeTypes.ts; the contracts documented there apply here, this file only
// holds implementation detail.

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
    "SELECT id, name, color, created_at FROM categories"
  );
  // Sorted here, not in SQL: SQLite's NOCASE collation only case-folds ASCII,
  // so "Ärzte" would land after "Zebra". localeCompare matches what the
  // localStorage store does, and there are only ever a handful of categories.
  return rows.map(fromCategoryRow).sort((a, b) => a.name.localeCompare(b.name));
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
