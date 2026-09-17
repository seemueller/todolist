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

  it("reicht listRange an den localStorage-Store durch", async () => {
    isTauri.mockReturnValue(false);
    const timeDb = await import("./timeDb");
    await timeDb.saveDay("2026-09-03", [{ slot: 36, category_id: 2, note: "" }]);

    const records = await timeDb.listRange("2026-09-01", "2026-09-30");

    expect(records).toEqual([{ date: "2026-09-03", slot: 36, category_id: 2, note: "" }]);
    expect(select).not.toHaveBeenCalled();
  });

  it("reicht listRange an den SQLite-Store durch", async () => {
    isTauri.mockReturnValue(true);
    select.mockResolvedValue([]);
    const timeDb = await import("./timeDb");

    await timeDb.listRange("2026-09-01", "2026-09-30");

    expect(select).toHaveBeenCalledWith(expect.stringContaining("FROM time_slots"), [
      "2026-09-01",
      "2026-09-30",
    ]);
    expect(localStorage.getItem("todolist_timeslots")).toBeNull();
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
