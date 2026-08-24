export interface Todo {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
}

export interface TodoRow {
  id: number;
  title: string;
  done: number;
  created_at: string;
}

export function fromRow(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    done: row.done === 1,
    created_at: row.created_at,
  };
}
