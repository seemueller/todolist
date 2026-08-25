export type Priority = "low" | "medium" | "high";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  priority: Priority;
  created_at: string;
  due_date: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
}

export interface TodoRow {
  id: number;
  title: string;
  done: number;
  priority: Priority;
  created_at: string;
  due_date: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
}

export function fromRow(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    done: row.done === 1,
    priority: row.priority,
    created_at: row.created_at,
    due_date: row.due_date,
    category_id: row.category_id,
    category_name: row.category_name,
    category_color: row.category_color,
  };
}

export interface Category {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface CategoryRow {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export function fromCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: row.created_at,
  };
}

export const CATEGORY_COLORS = [
  "#a78bfa",
  "#f472b6",
  "#4facfe",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#60a5fa",
  "#c084fc",
  "#fb923c",
  "#2dd4bf",
];
