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
    "SELECT id, title, done, created_at FROM todos ORDER BY created_at DESC, id DESC"
  );
  return rows.map(fromRow);
}

export async function addTodo(title: string): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO todos (title, done) VALUES ($1, 0)", [title]);
}

export async function updateTodoTitle(id: number, title: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE todos SET title = $1 WHERE id = $2", [title, id]);
}

export async function toggleTodoDone(id: number, done: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE todos SET done = $1 WHERE id = $2", [done ? 1 : 0, id]);
}

export async function deleteTodo(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
}
