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
  description: "Vorbereitung fuer den Kunden",
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

  it("rejects rather than throwing synchronously for a missing todo", async () => {
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

  it("does not let a decomposed umlaut slip a duplicate past the check", async () => {
    select.mockResolvedValue([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    await expect(sqlTodoStore.addCategory("A\u0308rzte", "#111111")).rejects.toThrow(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );

    expect(execute).not.toHaveBeenCalled();
  });

  it("writes a decomposed name to the database in its composed form", async () => {
    select.mockResolvedValueOnce([]);
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    select.mockResolvedValueOnce([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    await sqlTodoStore.addCategory(" A\u0308rzte ", "#000000");

    expect(execute.mock.calls[0][1][0]).toBe("Ärzte");
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

  it("selects the description column", async () => {
    select.mockResolvedValue([ROW]);
    const [todo] = await sqlTodoStore.listTodos();

    expect(select.mock.calls[0][0]).toContain("t.description");
    expect(todo.description).toBe("Vorbereitung fuer den Kunden");
  });

  it("writes the description when creating a todo", async () => {
    execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 });
    select.mockResolvedValue([ROW]);

    await sqlTodoStore.addTodo("Mit Text", "medium", null, null, "Zeile eins\nZeile zwei");

    expect(execute.mock.calls[0][0]).toContain("description");
    expect(execute.mock.calls[0][1]).toEqual([
      "Mit Text",
      "Zeile eins\nZeile zwei",
      "medium",
      expect.any(String),
      null,
      null,
    ]);
  });

  it("writes an empty description when none was given", async () => {
    execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 });
    select.mockResolvedValue([ROW]);

    await sqlTodoStore.addTodo("Ohne Text", "medium", null);

    expect(execute.mock.calls[0][1]).toEqual([
      "Ohne Text",
      "",
      "medium",
      expect.any(String),
      null,
      null,
    ]);
  });

  describe("updateTodoFields", () => {
    it("writes exactly the given fields in a single statement", async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });
      select.mockResolvedValue([ROW]);

      await sqlTodoStore.updateTodoFields(7, { title: "Neu", description: "Text" });

      expect(execute).toHaveBeenCalledTimes(1);
      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain("title = $1");
      expect(sql).toContain("description = $2");
      expect(sql).not.toContain("priority");
      expect(params).toEqual(["Neu", "Text", 7]);
    });

    it("writes nothing for an empty patch", async () => {
      select.mockResolvedValue([ROW]);

      await sqlTodoStore.updateTodoFields(7, {});

      expect(execute).not.toHaveBeenCalled();
    });
  });
});
