import { describe, it, expect, beforeEach, vi } from "vitest";

const isTauri = vi.fn();
const select = vi.fn();
const execute = vi.fn();
const getDb = vi.fn(() => Promise.resolve({ select, execute }));

vi.mock("./sqlClient", () => ({
  isTauri: () => isTauri(),
  getDb: () => getDb(),
}));

describe("db backend selection", () => {
  beforeEach(() => {
    vi.resetModules();
    isTauri.mockReset();
    select.mockReset();
    execute.mockReset();
    getDb.mockClear();
    localStorage.clear();
  });

  it("uses the localStorage store outside Tauri", async () => {
    isTauri.mockReturnValue(false);
    const db = await import("./db");
    const created = await db.addTodo("Browser", null, null);
    expect(localStorage.getItem("todolist_todos")).toContain("Browser");
    expect(created.title).toBe("Browser");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("uses the SQLite store inside Tauri", async () => {
    isTauri.mockReturnValue(true);
    select.mockResolvedValue([]);
    const db = await import("./db");
    await db.listTodos();
    expect(getDb).toHaveBeenCalled();
    expect(localStorage.getItem("todolist_todos")).toBeNull();
  });

  it("forwards updateTodoBoardOrder to the localStorage store outside Tauri", async () => {
    isTauri.mockReturnValue(false);
    const db = await import("./db");
    const created = await db.addTodo("Browser", null, null);

    const moved = await db.updateTodoBoardOrder(created.id, -1.5);

    expect(moved.board_order).toBe(-1.5);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("forwards updateTodoStatusAndOrder to the localStorage store outside Tauri", async () => {
    isTauri.mockReturnValue(false);
    const db = await import("./db");
    const created = await db.addTodo("Browser", null, null);

    const moved = await db.updateTodoStatusAndOrder(created.id, "done", 2);

    expect(moved.status).toBe("done");
    expect(moved.board_order).toBe(2);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("forwards the type as addTodo's fifth argument to the store", async () => {
    // Der Compiler deckt diese Stelle nicht ab: eine Fassade mit weniger
    // Parametern bleibt zuweisbar, ein vergessenes Argument faellt also still
    // unter den Tisch und jede Aufgabe entstuende als "task".
    isTauri.mockReturnValue(false);
    const db = await import("./db");

    const created = await db.addTodo("Login kaputt", null, null, "", "bug");

    expect(created.type).toBe("bug");
    expect(localStorage.getItem("todolist_todos")).toContain('"type":"bug"');
  });

  it("leaves addTodo's type at the store's default when the caller omits it", async () => {
    isTauri.mockReturnValue(false);
    const db = await import("./db");

    const created = await db.addTodo("Ohne Typ", null);

    expect(created.type).toBe("task");
  });
});
