import Database from "@tauri-apps/plugin-sql";
import { Todo, TodoRow, fromRow } from "./types";

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:todolist.db");
  }
  return dbPromise;
}

export async function listTodos(): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    "SELECT id, title, done, created_at, due_date FROM todos ORDER BY created_at DESC, id DESC"
  );
  return rows.map(fromRow);
}

export async function addTodo(title: string, dueDate: string | null): Promise<Todo> {
  const db = await getDb();
  await db.execute("INSERT INTO todos (title, done, due_date) VALUES ($1, 0, $2)", [title, dueDate]);
  const rows = await db.select<TodoRow[]>(
    "SELECT id, title, done, created_at, due_date FROM todos WHERE id = last_insert_rowid()"
  );
  return fromRow(rows[0]);
}

export async function updateTodoTitle(id: number, title: string): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET title = $1 WHERE id = $2", [title, id]);
  const rows = await db.select<TodoRow[]>(
    "SELECT id, title, done, created_at, due_date FROM todos WHERE id = $1",
    [id]
  );
  return fromRow(rows[0]);
}

export async function updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET due_date = $1 WHERE id = $2", [dueDate, id]);
  const rows = await db.select<TodoRow[]>(
    "SELECT id, title, done, created_at, due_date FROM todos WHERE id = $1",
    [id]
  );
  return fromRow(rows[0]);
}

export async function toggleTodoDone(id: number, done: boolean): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET done = $1 WHERE id = $2", [done ? 1 : 0, id]);
  const rows = await db.select<TodoRow[]>(
    "SELECT id, title, done, created_at, due_date FROM todos WHERE id = $1",
    [id]
  );
  return fromRow(rows[0]);
}

export async function deleteTodo(id: number): Promise<number> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
  return id;
}
