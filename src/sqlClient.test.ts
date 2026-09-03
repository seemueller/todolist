import { describe, it, expect, beforeEach, vi } from "vitest";

const load = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: (path: string) => load(path) },
}));

describe("sqlClient", () => {
  beforeEach(() => {
    vi.resetModules();
    load.mockReset();
    load.mockResolvedValue({ select: vi.fn(), execute: vi.fn() });
    delete (globalThis as any).window.__TAURI_INTERNALS__;
  });

  it("reports no Tauri context outside the desktop app", async () => {
    const { isTauri } = await import("./sqlClient");
    expect(isTauri()).toBe(false);
  });

  it("reports a Tauri context when the internals are present", async () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    const { isTauri } = await import("./sqlClient");
    expect(isTauri()).toBe(true);
  });

  it("opens the database only once for concurrent callers", async () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    const { getDb } = await import("./sqlClient");
    const [a, b] = await Promise.all([getDb(), getDb()]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("sqlite:todolist.db");
  });
});
