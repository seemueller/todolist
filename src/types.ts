export type Priority = "low" | "medium" | "high";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  priority: Priority;
  created_at: string;
  due_date: string | null;
}

export interface TodoRow {
  id: number;
  title: string;
  done: number;
  priority: Priority;
  created_at: string;
  due_date: string | null;
}

export function fromRow(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    done: row.done === 1,
    priority: row.priority,
    created_at: row.created_at,
    due_date: row.due_date,
  };
}
