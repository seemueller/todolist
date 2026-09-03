import { describe, it, expect, beforeEach, vi } from "vitest";

const select = vi.fn();
const execute = vi.fn();

vi.mock("./sqlClient", () => ({
  getDb: () => Promise.resolve({ select, execute }),
  isTauri: () => true,
}));

import { sqlTodoStore } from "./todoStoreSql";

const ROW = {
  id: 7,
  title: "Schreiben",
  done: 0,
  status: "todo",
  priority: "high",
  created_at: "2026-09-03T08:00:00.000Z",
  due_date: null,
  category_id: 2,
  category_name: "Kunde",
  category_color: "#a78bfa",
};

describe("sqlTodoStore", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
  });

  it("joins the category when listing todos", async () => {
    select.mockResolvedValue([ROW]);
    const todos = await sqlTodoStore.listTodos();

    const sql = select.mock.calls[0][0] as string;
    expect(sql).toContain("LEFT JOIN categories");
    expect(todos[0].category_name).toBe("Kunde");
    expect(todos[0].done).toBe(false);
  });

  it("filters by category when one is given", async () => {
    select.mockResolvedValue([ROW]);
    await sqlTodoStore.listTodos(2);

    expect(select.mock.calls[0][0]).toContain("WHERE t.category_id = $1");
    expect(select.mock.calls[0][1]).toEqual([2]);
  });

  it("inserts a todo and reads the stored row back", async () => {
    execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 });
    select.mockResolvedValue([ROW]);

    const created = await sqlTodoStore.addTodo("Schreiben", "high", null, 2);

    expect(execute.mock.calls[0][0]).toContain("INSERT INTO todos");
    expect(created.id).toBe(7);
    expect(created.category_name).toBe("Kunde");
  });

  it("writes done and status together", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([{ ...ROW, status: "done", done: 1 }]);

    const updated = await sqlTodoStore.updateTodoStatus(7, "done");

    expect(execute.mock.calls[0][0]).toContain("SET status = $1, done = $2");
    expect(execute.mock.calls[0][1]).toEqual(["done", 1, 7]);
    expect(updated.done).toBe(true);
  });

  it("throws when the todo to update does not exist", async () => {
    execute.mockResolvedValue({ rowsAffected: 0 });
    select.mockResolvedValue([]);

    await expect(sqlTodoStore.updateTodoTitle(99, "x")).rejects.toThrow("Todo 99 not found");
  });

  it("sorts categories the way German readers expect", async () => {
    // Rows deliberately out of order, and not sorted the way SQLite's NOCASE
    // collation would sort them either (that would put "Ärzte" after "Zebra").
    select.mockResolvedValue([
      { id: 1, name: "Zebra", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
      { id: 2, name: "Apfel", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
      { id: 3, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    const categories = await sqlTodoStore.listCategories();

    expect(categories.map((c) => c.name)).toEqual(["Apfel", "Ärzte", "Zebra"]);
  });
});
