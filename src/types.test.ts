import { describe, it, expect } from "vitest";
import { fromRow, TodoRow, Todo } from "./types";

describe("fromRow", () => {
  it("converts a database row to a Todo with done=true", () => {
    const row: TodoRow = {
      id: 1,
      title: "Test task",
      done: 1,
      created_at: "2026-01-01T00:00:00Z",
      due_date: null,
    };

    const result: Todo = fromRow(row);

    expect(result).toEqual({
      id: 1,
      title: "Test task",
      done: true,
      created_at: "2026-01-01T00:00:00Z",
      due_date: null,
    });
  });

  it("converts a database row to a Todo with done=false", () => {
    const row: TodoRow = {
      id: 2,
      title: "Open task",
      done: 0,
      created_at: "2026-06-15T12:00:00Z",
      due_date: null,
    };

    const result: Todo = fromRow(row);

    expect(result.done).toBe(false);
    expect(result.id).toBe(2);
    expect(result.title).toBe("Open task");
  });

  it("preserves all fields from the row", () => {
    const row: TodoRow = {
      id: 99,
      title: "Preserve fields",
      done: 1,
      created_at: "2025-12-31T23:59:59Z",
      due_date: null,
    };

    const result = fromRow(row);

    expect(result.id).toBe(row.id);
    expect(result.title).toBe(row.title);
    expect(result.created_at).toBe(row.created_at);
  });

  it("treats non-1 done values as false", () => {
    const row: TodoRow = {
      id: 3,
      title: "Edge case",
      done: 2,
      created_at: "2026-01-01T00:00:00Z",
      due_date: null,
    };

    const result = fromRow(row);

    expect(result.done).toBe(false);
  });
});
