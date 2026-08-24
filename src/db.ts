import Database from "@tauri-apps/plugin-sql";
import { Priority, Todo, TodoRow, fromRow } from "./types";

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:todolist.db");
  }
  return dbPromise;
}

const SELECT_TODO = "SELECT id, title, done, priority, created_at, due_date FROM todos";

export async function listTodos(): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `${SELECT_TODO} ORDER BY created_at DESC, id DESC`
  );
  return rows.map(fromRow);
}

export async function addTodo(title: string, priority: Priority, dueDate: string | null): Promise<Todo> {
  const db = await getDb();
  await db.execute("INSERT INTO todos (title, done, priority, due_date) VALUES ($1, 0, $2, $3)", [title, priority, dueDate]);
  const rows = await db.select<TodoRow[]>(
    `${SELECT_TODO} WHERE id = last_insert_rowid()`
  );
  return fromRow(rows[0]);
}

export async function updateTodoTitle(id: number, title: string): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET title = $1 WHERE id = $2", [title, id]);
  const rows = await db.select<TodoRow[]>(
    `${SELECT_TODO} WHERE id = $1`,
    [id]
  );
  return fromRow(rows[0]);
}

export async function updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET due_date = $1 WHERE id = $2", [dueDate, id]);
  const rows = await db.select<TodoRow[]>(
    `${SELECT_TODO} WHERE id = $1`,
    [id]
  );
  return fromRow(rows[0]);
}

export async function toggleTodoDone(id: number, done: boolean): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET done = $1 WHERE id = $2", [done ? 1 : 0, id]);
  const rows = await db.select<TodoRow[]>(
    `${SELECT_TODO} WHERE id = $1`,
    [id]
  );
  return fromRow(rows[0]);
}

export async function updateTodoPriority(id: number, priority: Priority): Promise<Todo> {
  const db = await getDb();
  await db.execute("UPDATE todos SET priority = $1 WHERE id = $2", [priority, id]);
  const rows = await db.select<TodoRow[]>(
    `${SELECT_TODO} WHERE id = $1`,
    [id]
  );
  return fromRow(rows[0]);
}

export async function deleteTodo(id: number): Promise<number> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
  return id;
}
