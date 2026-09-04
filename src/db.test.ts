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
    const created = await db.addTodo("Browser", "low", null, null);
    expect(localStorage.getItem("todolist_todos")).toContain("Browser");
    expect(created.title).toBe("Browser");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("uses the SQLite store inside Tauri", async () => {
    isTauri.mockReturnValue(true);
    select.mockResolvedValue([]);
    const db = await import("./db");
    await db.listTodos().catch(() => undefined);
    expect(getDb).toHaveBeenCalled();
    expect(localStorage.getItem("todolist_todos")).toBeNull();
  });
});
