import { describe, it, expect, beforeEach, vi } from "vitest";

const select = vi.fn();
const execute = vi.fn();
const invoke = vi.fn();

vi.mock("./sqlClient", () => ({
  getDb: () => Promise.resolve({ select, execute }),
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { sqlTimeStore } from "./timeStoreSql";
import { DEFAULT_SETTINGS } from "./timeTypes";

describe("sqlTimeStore", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
    execute.mockResolvedValue({ rowsAffected: 1 });
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  it("falls back to the defaults when no settings row exists", async () => {
    select.mockResolvedValue([]);
    await expect(sqlTimeStore.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("reads the stored settings", async () => {
    select.mockResolvedValue([{ target_slots_per_day: 30, show_weekend: 1 }]);
    await expect(sqlTimeStore.getSettings()).resolves.toEqual({
      targetSlotsPerDay: 30,
      showWeekend: true,
    });
  });

  it("clamps an absurd target before storing it", async () => {
    const stored = await sqlTimeStore.saveSettings({ targetSlotsPerDay: 999, showWeekend: false });
    expect(stored.targetSlotsPerDay).toBe(64);
    expect(execute.mock.calls[0][1]).toEqual([64, 0]);
  });

  it("reads a day sorted by slot", async () => {
    select.mockResolvedValue([
      { slot: 36, category_id: 2, note: "Meeting" },
      { slot: 37, category_id: 2, note: "Meeting" },
    ]);
    const slots = await sqlTimeStore.listSlots("2026-09-03");

    expect(select.mock.calls[0][0]).toContain("ORDER BY slot");
    expect(select.mock.calls[0][1]).toEqual(["2026-09-03"]);
    expect(slots).toHaveLength(2);
  });

  it("replaces a day via the replace_time_day command", async () => {
    await sqlTimeStore.saveDay("2026-09-03", [
      { slot: 36, category_id: 2, note: "Meeting" },
      { slot: 37, category_id: 2, note: "" },
    ]);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("replace_time_day", {
      date: "2026-09-03",
      slots: [
        { slot: 36, category_id: 2, note: "Meeting" },
        { slot: 37, category_id: 2, note: "" },
      ],
    });
  });

  it("defaults a slot's note to an empty string when it carries none", async () => {
    await sqlTimeStore.saveDay("2026-09-03", [
      { slot: 36, category_id: 2 } as unknown as { slot: number; category_id: number; note: string },
    ]);

    expect(invoke).toHaveBeenCalledWith("replace_time_day", {
      date: "2026-09-03",
      slots: [{ slot: 36, category_id: 2, note: "" }],
    });
  });

  it("clears a block by painting it with no category", async () => {
    select.mockResolvedValue([
      { slot: 36, category_id: 2, note: "Meeting" },
      { slot: 37, category_id: 2, note: "Meeting" },
    ]);
    const remaining = await sqlTimeStore.clearBlock("2026-09-03", 36, 38);
    expect(remaining).toEqual([]);
  });
});
