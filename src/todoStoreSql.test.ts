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

    expect(select.mock.calls[0][0]).toContain("t.deleted_at IS NULL AND t.category_id = $1");
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

  describe("der Papierkorb im SQLite-Store", () => {
    it("loescht weich statt die Zeile zu entfernen", async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });

      await sqlTodoStore.deleteTodo(7);

      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain("UPDATE todos");
      expect(sql).toContain("deleted_at");
      expect(sql).not.toContain("DELETE FROM todos");
      expect(params).toEqual([7]);
    });

    it("schreibt den Zeitstempel im gleichen Format wie toISOString", async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });

      await sqlTodoStore.deleteTodo(7);

      const [sql] = execute.mock.calls[0];
      expect(sql).toContain("strftime('%Y-%m-%dT%H:%M:%fZ','now')");
      expect(sql).not.toContain("datetime('now')");
    });

    it("blendet den Papierkorb aus jeder Leseabfrage aus", async () => {
      select.mockResolvedValue([]);

      await sqlTodoStore.listTodos();
      await sqlTodoStore.listTodos(3);

      for (const [sql] of select.mock.calls) {
        expect(sql).toContain("t.deleted_at IS NULL");
      }
    });

    it("schreibt nichts, wenn die Aufgabe im Papierkorb liegt", async () => {
      execute.mockResolvedValue({ rowsAffected: 0 });
      select.mockResolvedValue([ROW]);

      await sqlTodoStore.updateTodoPriority(7, "low");
      expect(execute.mock.calls[0][0]).toContain("AND deleted_at IS NULL");

      execute.mockClear();
      await sqlTodoStore.updateTodoFields(7, { title: "Neuer Titel" });
      expect(execute.mock.calls[0][0]).toContain("AND deleted_at IS NULL");
    });
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

    const updated = await sqlTodoStore.updateCategory(1, "ärzte", "#111111", "internal");

    expect(updated.name).toBe("ärzte");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects renaming a category to another category's name", async () => {
    select.mockResolvedValue([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
      { id: 2, name: "Sport", color: "#111111", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    await expect(sqlTodoStore.updateCategory(2, "ärzte", "#222222", "internal")).rejects.toThrow(
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

  it("schreibt time_kind beim Anlegen", async () => {
    select.mockResolvedValueOnce([]);
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    select.mockResolvedValueOnce([
      {
        id: 1,
        name: "Kunde X",
        color: "#7cc3f7",
        created_at: "2026-09-16T08:00:00.000Z",
        time_kind: "external",
      },
    ]);

    await sqlTodoStore.addCategory("Kunde X", "#7cc3f7", "external");

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("time_kind");
    expect(params).toContain("external");
  });

  it("legt ohne Angabe als internal an", async () => {
    select.mockResolvedValueOnce([]);
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    select.mockResolvedValueOnce([
      {
        id: 1,
        name: "Arbeit",
        color: "#7cc3f7",
        created_at: "2026-09-16T08:00:00.000Z",
        time_kind: "internal",
      },
    ]);

    await sqlTodoStore.addCategory("Arbeit", "#7cc3f7");

    expect(execute.mock.calls[0][1]).toContain("internal");
  });

  it("schreibt time_kind beim Aendern", async () => {
    select.mockResolvedValueOnce([]);
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValueOnce([
      {
        id: 1,
        name: "Arbeit",
        color: "#7cc3f7",
        created_at: "2026-09-16T08:00:00.000Z",
        time_kind: "none",
      },
    ]);

    await sqlTodoStore.updateCategory(1, "Arbeit", "#7cc3f7", "none");

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("time_kind = ");
    expect(params).toContain("none");
  });

  it("schreibt beim Anlegen den Unicode-Schluessel als name_key mit", async () => {
    select.mockResolvedValueOnce([]);
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    select.mockResolvedValueOnce([
      { id: 1, name: "Ärzte", color: "#000000", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    await sqlTodoStore.addCategory("Ärzte", "#000000");

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("name_key");
    // categoryNameKey faltet "Ärzte" Unicode-bewusst auf "ärzte" -- genau der
    // Schluessel, den der eindeutige Index aus Migration 15 haelt.
    expect(params).toContain("ärzte");
  });

  it("schreibt beim Umbenennen den name_key neu", async () => {
    select.mockResolvedValueOnce([]);
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValueOnce([
      { id: 1, name: "Ärzte", color: "#111111", created_at: "2026-09-03T08:00:00.000Z" },
    ]);

    await sqlTodoStore.updateCategory(1, "Ärzte", "#111111", "internal");

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("name_key = ");
    expect(params).toContain("ärzte");
  });

  it("liest time_kind aus der Zeile", async () => {
    select.mockResolvedValue([
      {
        id: 1,
        name: "Arbeit",
        color: "#7cc3f7",
        created_at: "2026-09-16T08:00:00.000Z",
        time_kind: "external",
      },
    ]);

    const [category] = await sqlTodoStore.listCategories();

    expect(select.mock.calls[0][0]).toContain("time_kind");
    expect(category.time_kind).toBe("external");
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
      "task",
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
      "task",
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

    it("clears a description with the empty string rather than skipping the field", async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });
      select.mockResolvedValue([ROW]);

      await sqlTodoStore.updateTodoFields(7, { description: "" });

      expect(execute).toHaveBeenCalledTimes(1);
      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain("description = $1");
      expect(params).toEqual(["", 7]);
    });

    it("writes nothing for an empty patch", async () => {
      select.mockResolvedValue([ROW]);

      await sqlTodoStore.updateTodoFields(7, {});

      expect(execute).not.toHaveBeenCalled();
    });

    it("sets category_id when a category is given", async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });
      select.mockResolvedValue([ROW]);

      await sqlTodoStore.updateTodoFields(7, { categoryId: 3 });

      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain("category_id = $1");
      expect(params).toEqual([3, 7]);
    });

    it("clears category_id when the patch sets it to null", async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });
      select.mockResolvedValue([ROW]);

      await sqlTodoStore.updateTodoFields(7, { categoryId: null });

      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain("category_id = $1");
      expect(params).toEqual([null, 7]);
    });

    it("rejects rather than throwing synchronously for an unknown id", async () => {
      execute.mockResolvedValue({ rowsAffected: 0 });
      select.mockResolvedValue([]);

      const result = sqlTodoStore.updateTodoFields(999, { title: "Neu" });

      await expect(result).rejects.toThrow("Todo 999 not found");
    });
  });

  describe("listDeletedTodos und restoreTodo im SQLite-Store", () => {
    it("liest den Papierkorb, zuletzt Gelöschtes zuerst", async () => {
      select.mockResolvedValue([]);

      await sqlTodoStore.listDeletedTodos();

      const [sql] = select.mock.calls[0];
      expect(sql).toContain("t.deleted_at IS NOT NULL");
      expect(sql).toContain("ORDER BY t.deleted_at DESC, t.id DESC");
    });

    it("setzt den Zeitstempel beim Wiederherstellen zurück", async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });
      select.mockResolvedValue([
        {
          id: 7,
          title: "Zurück",
          description: "",
          done: 0,
          status: "todo",
          priority: "medium",
          created_at: "2026-01-01T00:00:00Z",
          due_date: null,
          category_id: null,
          category_name: null,
          category_color: null,
        },
      ]);

      const restored = await sqlTodoStore.restoreTodo(7);

      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain("SET deleted_at = NULL");
      expect(params).toEqual([7]);
      expect(restored.id).toBe(7);
    });

    it("lehnt das Wiederherstellen ab, wenn die Aufgabe nicht im Papierkorb liegt", async () => {
      execute.mockResolvedValue({ rowsAffected: 0 });

      await expect(sqlTodoStore.restoreTodo(999)).rejects.toThrow("Todo 999 not found");
    });
  });

  describe("purgeTodo und purgeDeletedBefore im SQLite-Store", () => {
    it("entfernt die Zeile wirklich", async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });

      await sqlTodoStore.purgeTodo(7);

      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain("DELETE FROM todos");
      expect(sql).toContain("deleted_at IS NOT NULL");
      expect(params).toEqual([7]);
    });

    it("bleibt bei einer lebenden oder unbekannten Id folgenlos", async () => {
      execute.mockResolvedValue({ rowsAffected: 0 });

      const result = await sqlTodoStore.purgeTodo(999);

      expect(result).toBe(999);
    });

    it("räumt nur den Papierkorb vor dem Stichtag", async () => {
      execute.mockResolvedValue({ rowsAffected: 3 });

      const removed = await sqlTodoStore.purgeDeletedBefore("2026-02-01T00:00:00Z");

      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain("deleted_at IS NOT NULL");
      expect(sql).toContain("deleted_at < $1");
      expect(params).toEqual(["2026-02-01T00:00:00Z"]);
      expect(removed).toBe(3);
    });
  });

  it("reads the board position back with the row", async () => {
    select.mockResolvedValue([{ ...ROW, board_order: 2.5 }]);
    const todos = await sqlTodoStore.listTodos();

    expect(select.mock.calls[0][0]).toContain("t.board_order");
    expect(todos[0].board_order).toBe(2.5);
  });

  it("writes only the board position when a card moves inside its lane", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([{ ...ROW, board_order: 1.5 }]);

    const updated = await sqlTodoStore.updateTodoBoardOrder(7, 1.5);

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("UPDATE todos SET board_order = $1 WHERE id = $2");
    expect(sql).toContain("deleted_at IS NULL");
    expect(params).toEqual([1.5, 7]);
    expect(updated.board_order).toBe(1.5);
  });

  it("writes status, done and position in a single statement", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([{ ...ROW, status: "done", done: 1, board_order: 3 }]);

    const updated = await sqlTodoStore.updateTodoStatusAndOrder(7, "done", 3);

    const [sql, params] = execute.mock.calls[0];
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sql).toContain("SET status = $1, done = $2, board_order = $3");
    expect(params).toEqual(["done", 1, 3, 7]);
    expect(updated.done).toBe(true);
  });

  it("rejects an unknown id on both new writes", async () => {
    execute.mockResolvedValue({ rowsAffected: 0 });
    select.mockResolvedValue([]);

    await expect(sqlTodoStore.updateTodoBoardOrder(99, 1)).rejects.toThrow("Todo 99 not found");
    await expect(sqlTodoStore.updateTodoStatusAndOrder(99, "todo", 1)).rejects.toThrow(
      "Todo 99 not found"
    );
  });
});

describe("Aufgabentyp", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
  });

  it("schreibt beim Anlegen ohne Angabe den Typ task", async () => {
    execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 });
    select.mockResolvedValue([ROW]);

    await sqlTodoStore.addTodo("Ohne Typ", "medium", null);

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO todos");
    expect(sql).toContain("type");
    expect(params).toContain("task");
  });

  it("schreibt den angegebenen Typ", async () => {
    execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 });
    select.mockResolvedValue([ROW]);

    await sqlTodoStore.addTodo("Login kaputt", "high", null, null, "", "bug");

    const params = execute.mock.calls[0][1] as unknown[];
    expect(params).toContain("bug");
    expect(params).not.toContain("task");
  });

  it("liest die Typspalte mit und reicht sie durch", async () => {
    select.mockResolvedValue([{ ...ROW, type: "story" }]);

    const todos = await sqlTodoStore.listTodos();

    expect(select.mock.calls[0][0]).toContain("t.type");
    expect(todos[0].type).toBe("story");
  });

  it("setzt den Typ im Patch", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([ROW]);

    await sqlTodoStore.updateTodoFields(7, { type: "story" });

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("type = $1");
    expect(params).toEqual(["story", 7]);
  });

  it("fasst den Typ nicht an, wenn der Patch ihn nicht nennt", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    select.mockResolvedValue([ROW]);

    await sqlTodoStore.updateTodoFields(7, { title: "Neuer Titel" });

    expect(execute.mock.calls[0][0]).not.toContain("type =");
  });
});
