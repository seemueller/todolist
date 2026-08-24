import Database from "@tauri-apps/plugin-sql";
import { Todo, TodoRow, Category, CategoryRow, fromRow, fromCategoryRow } from "./types";

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:todolist.db");
  }
  return dbPromise;
}

// ── Todos ────────────────────────────────────────────────────────────────

export async function listTodos(categoryId?: number | null): Promise<Todo[]> {
  const db = await getDb();
  let query =
    "SELECT t.id, t.title, t.done, t.created_at, t.category_id, c.name AS category_name, c.color AS category_color " +
    "FROM todos t LEFT JOIN categories c ON t.category_id = c.id";
  if (categoryId !== undefined && categoryId !== null) {
    query += " WHERE t.category_id = $1";
  }
  query += " ORDER BY t.created_at DESC, t.id DESC";

  const rows = await db.select<TodoRow[]>(query, categoryId !== undefined && categoryId !== null ? [categoryId] : []);
  return rows.map(fromRow);
}

export async function addTodo(title: string, categoryId?: number | null): Promise<Todo> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO todos (title, done, category_id) VALUES ($1, 0, $2)",
    [title, categoryId ?? null]
  );
  const rows = await db.select<TodoRow[]>(
    "SELECT t.id, t.title, t.done, t.created_at, t.category_id, c.name AS category_name, c.color AS category_color " +
    "FROM todos t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = last_insert_rowid()"
  );
  return fromRow(rows[0]);
}

export async function updateTodoTitle(id: number, title: string): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET title = $1 WHERE id = $2", [title, id]);
  const rows = await db.select<TodoRow[]>(
    "SELECT t.id, t.title, t.done, t.created_at, t.category_id, c.name AS category_name, c.color AS category_color " +
    "FROM todos t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = $1",
    [id]
  );
  return fromRow(rows[0]);
}

export async function updateTodoCategory(id: number, categoryId: number | null): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET category_id = $1 WHERE id = $2", [categoryId, id]);
  const rows = await db.select<TodoRow[]>(
    "SELECT t.id, t.title, t.done, t.created_at, t.category_id, c.name AS category_name, c.color AS category_color " +
    "FROM todos t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = $1",
    [id]
  );
  return fromRow(rows[0]);
}

export async function toggleTodoDone(id: number, done: boolean): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET done = $1 WHERE id = $2", [done ? 1 : 0, id]);
  const rows = await db.select<TodoRow[]>(
    "SELECT t.id, t.title, t.done, t.created_at, t.category_id, c.name AS category_name, c.color AS category_color " +
    "FROM todos t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = $1",
    [id]
  );
  return fromRow(rows[0]);
}

export async function deleteTodo(id: number): Promise<number> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
  return id;
}

// ── Categories ───────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    "SELECT id, name, color, created_at FROM categories ORDER BY name"
  );
  return rows.map(fromCategoryRow);
}

export async function addCategory(name: string, color: string): Promise<Category> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO categories (name, color) VALUES ($1, $2)",
    [name.trim(), color]
  );
  const rows = await db.select<CategoryRow[]>(
    "SELECT id, name, color, created_at FROM categories WHERE id = last_insert_rowid()"
  );
  return fromCategoryRow(rows[0]);
}

export async function updateCategory(id: number, name: string, color: string): Promise<Category> {
  const db = await getDb();
  await db.execute(
    "UPDATE categories SET name = $1, color = $2 WHERE id = $3",
    [name.trim(), color, id]
  );
  const rows = await db.select<CategoryRow[]>(
    "SELECT id, name, color, created_at FROM categories WHERE id = $1",
    [id]
  );
  return fromCategoryRow(rows[0]);
}

export async function deleteCategory(id: number): Promise<number> {
  const db = await getDb();
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
  return id;
}
