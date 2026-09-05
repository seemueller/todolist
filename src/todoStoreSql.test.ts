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

  it("sorts case-insensitively across mixed initial case, not just by locale", async () => {
    // A bare localeCompare would pass with Apfel/Ärzte/Zebra above but still
    // fail here: WebKitGTK groups every uppercase-initial name before every
    // lowercase-initial one, so "Ärzte" (uppercase) would sort before
    // "apfel" and "sport" (lowercase) instead of between them.
    select.mockResolvedValue([
      { id: 1, name: "Zebra", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
      { id: 2, name: "apfel", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
      { id: 3, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
      { id: 4, name: "sport", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    const categories = await sqlTodoStore.listCategories();

    expect(categories.map((c) => c.name)).toEqual(["apfel", "Ärzte", "sport", "Zebra"]);
  });

  it("rejects creating a category whose name collides case-insensitively", async () => {
    select.mockResolvedValue([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    await expect(sqlTodoStore.addCategory("ärzte", "#111111")).rejects.toThrow(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );

    expect(execute).not.toHaveBeenCalled();
  });

  it("allows creating a genuinely new category name", async () => {
    select.mockResolvedValueOnce([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);
    execute.mockResolvedValue({ lastInsertId: 2, rowsAffected: 1 });
    select.mockResolvedValueOnce([
      { id: 2, name: "Sport", color: "#111111", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    const created = await sqlTodoStore.addCategory("Sport", "#111111");

    expect(created.name).toBe("Sport");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows renaming a category to its own current name in a different case", async () => {
    select.mockResolvedValueOnce([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValueOnce([
      { id: 1, name: "ärzte", color: "#111111", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    const updated = await sqlTodoStore.updateCategory(1, "ärzte", "#111111");

    expect(updated.name).toBe("ärzte");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects renaming a category to another category's name", async () => {
    select.mockResolvedValue([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
      { id: 2, name: "Sport", color: "#111111", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    await expect(sqlTodoStore.updateCategory(2, "ärzte", "#222222")).rejects.toThrow(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );

    expect(execute).not.toHaveBeenCalled();
  });

  it("does not let leading or trailing whitespace slip a duplicate past the check", async () => {
    select.mockResolvedValue([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    await expect(sqlTodoStore.addCategory("  ärzte  ", "#111111")).rejects.toThrow(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );

    expect(execute).not.toHaveBeenCalled();
  });

  it("deletes a category and relies on the foreign key to clear it off todos", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });

    await sqlTodoStore.deleteCategory(2);

    // No cleanup query against todos here: migration 4 declares
    // todos.category_id with ON DELETE SET NULL, so SQLite clears it itself.
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toContain("DELETE FROM categories WHERE id = $1");
    expect(execute.mock.calls[0][1]).toEqual([2]);
  });

  it("does not touch time bookings when deleting a category", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });

    await sqlTodoStore.deleteCategory(2);

    // Der Store ist gemockt, geprueft wird darum das abgesetzte SQL: keine
    // Anweisung darf time_slots anfassen -- weder loeschen noch leeren. Dass
    // auch die Datenbank selbst nichts kaskadiert, sichert der Rust-Test
    // `deleting_a_category_keeps_its_time_bookings` in src-tauri/src/lib.rs;
    // bis Migration 9 tat sie es (ON DELETE CASCADE aus Migration 7).
    const statements = [
      ...execute.mock.calls.map((call) => call[0] as string),
      ...select.mock.calls.map((call) => call[0] as string),
    ];
    expect(statements.some((sql) => sql.includes("time_slots"))).toBe(false);
  });
});
