import { describe, it, expect, beforeEach, vi } from "vitest";

const isTauri = vi.fn();
const select = vi.fn();
const execute = vi.fn();
const invoke = vi.fn();
const getDb = vi.fn(() => Promise.resolve({ select, execute }));

vi.mock("./sqlClient", () => ({
  isTauri: () => isTauri(),
  getDb: () => getDb(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("timeDb backend selection", () => {
  beforeEach(() => {
    vi.resetModules();
    isTauri.mockReset();
    select.mockReset();
    execute.mockReset();
    execute.mockResolvedValue({ rowsAffected: 1 });
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    getDb.mockClear();
    localStorage.clear();
  });

  it("uses the localStorage store outside Tauri", async () => {
    isTauri.mockReturnValue(false);
    const timeDb = await import("./timeDb");
    await timeDb.saveDay("2026-09-03", [{ slot: 36, category_id: 2, note: "" }]);
    expect(localStorage.getItem("todolist_timeslots")).toContain("36");
    expect(getDb).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("uses the SQLite store inside Tauri", async () => {
    isTauri.mockReturnValue(true);
    const timeDb = await import("./timeDb");
    await timeDb.saveDay("2026-09-03", [{ slot: 36, category_id: 2, note: "" }]);
    expect(invoke).toHaveBeenCalledWith("replace_time_day", {
      date: "2026-09-03",
      slots: [{ slot: 36, category_id: 2, note: "" }],
    });
    expect(localStorage.getItem("todolist_timeslots")).toBeNull();
  });
});
