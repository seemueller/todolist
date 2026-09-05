import { describe, it, expect, beforeEach, vi } from "vitest";

const select = vi.fn();
const execute = vi.fn();
const getDb = vi.fn(() => Promise.resolve({ select, execute }));
const isTauri = vi.fn();

vi.mock("./sqlClient", () => ({
  getDb: () => getDb(),
  isTauri: () => isTauri(),
}));

import { migrateLocalStorage, MIGRATED_FLAG } from "./migrateLocalStorage";

const TODOS_KEY = "todolist_todos";
const CATEGORIES_KEY = "todolist_categories";
const SLOTS_KEY = "todolist_timeslots";
const SETTINGS_KEY = "todolist_time_settings";

function set(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

describe("migrateLocalStorage", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
    getDb.mockClear();
    isTauri.mockReset();
    localStorage.clear();

    // Default: inside Tauri, like the shipped app.
    isTauri.mockReturnValue(true);
    // Default: no rows already present, every insert lands.
    execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
    // Default: post-insert category lookup used to resolve ids finds nothing extra.
    select.mockResolvedValue([]);
  });

  it("does nothing when localStorage is empty, but sets the flag", async () => {
    await migrateLocalStorage();

    // Kein Datenbankzugriff ueberhaupt -- nicht mal ein Verbindungsaufbau --
    // auf einer frischen Installation ohne Altdaten.
    expect(getDb).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
  });

  it("does nothing outside Tauri: no database access, flag stays unset", async () => {
    isTauri.mockReturnValue(false);
    set(CATEGORIES_KEY, [{ id: 1, name: "Arbeit", color: "#fff", created_at: "2026-01-01" }]);

    await migrateLocalStorage();

    expect(getDb).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    // Im Browser lief nie eine Migration -- das Flag zu setzen waere falsch,
    // sollte die App spaeter doch einmal in Tauri laufen.
    expect(localStorage.getItem(MIGRATED_FLAG)).toBeNull();
  });

  it("does not touch the database on a second run once the flag is set", async () => {
    localStorage.setItem(MIGRATED_FLAG, "1");
    set(CATEGORIES_KEY, [{ id: 1, name: "Arbeit", color: "#fff", created_at: "2026-01-01" }]);

    await migrateLocalStorage();

    expect(select).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("inserts categories before todos", async () => {
    set(CATEGORIES_KEY, [{ id: 1, name: "Arbeit", color: "#fff", created_at: "2026-01-01" }]);
    set(TODOS_KEY, [
      {
        id: 10,
        title: "Schreiben",
        done: false,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-02",
        due_date: null,
        category_id: 1,
      },
    ]);
    // Resolve step reads back categories after insert.
    select.mockResolvedValue([{ id: 1, name: "Arbeit" }]);

    await migrateLocalStorage();

    const categoryCallIndex = execute.mock.calls.findIndex((c) =>
      String(c[0]).includes("INSERT OR IGNORE INTO categories")
    );
    const todoCallIndex = execute.mock.calls.findIndex((c) =>
      String(c[0]).includes("INSERT OR IGNORE INTO todos")
    );
    expect(categoryCallIndex).toBeGreaterThanOrEqual(0);
    expect(todoCallIndex).toBeGreaterThan(categoryCallIndex);
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
  });

  it("derives status from done when a todo has no status", async () => {
    set(TODOS_KEY, [
      {
        id: 10,
        title: "Schreiben",
        done: true,
        created_at: "2026-01-02",
        due_date: null,
        category_id: null,
      },
    ]);

    await migrateLocalStorage();

    const todoCall = execute.mock.calls.find((c) => String(c[0]).includes("INSERT OR IGNORE INTO todos"));
    expect(todoCall).toBeDefined();
    // params: id, title, done, status, priority, created_at, due_date, category_id
    const params = todoCall![1] as unknown[];
    expect(params[2]).toBe(1); // done -> 1
    expect(params[3]).toBe("done"); // status derived
    expect(params[4]).toBe("medium"); // priority default
  });

  it("maps two categories differing only in case onto one id, and rewrites a slot referencing the second", async () => {
    set(CATEGORIES_KEY, [
      { id: 1, name: "Arbeit", color: "#111", created_at: "2026-01-01" },
      { id: 2, name: "arbeit", color: "#222", created_at: "2026-01-02" },
    ]);
    set(SLOTS_KEY, [{ date: "2026-01-05", slot: 3, category_id: 2, note: "" }]);
    // After inserting, the DB only actually holds one row for "Arbeit", id 1
    // (the second insert was ignored by the UNIQUE COLLATE NOCASE constraint).
    select.mockResolvedValue([{ id: 1, name: "Arbeit" }]);

    await migrateLocalStorage();

    const categoryCalls = execute.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT OR IGNORE INTO categories")
    );
    expect(categoryCalls).toHaveLength(1);
    expect(categoryCalls[0][1]).toEqual([1, "Arbeit", "#111", "2026-01-01"]);

    const slotCall = execute.mock.calls.find((c) => String(c[0]).includes("INSERT OR IGNORE INTO time_slots"));
    expect(slotCall).toBeDefined();
    const params = slotCall![1] as unknown[];
    // date, slot, category_id, note -- category_id rewritten to the surviving id (1)
    expect(params).toEqual(["2026-01-05", 3, 1, ""]);
  });

  it("resolves a category that already existed in the database under a different id", async () => {
    // localStorage still has its own timestamp id for "Kunde" -- the app was
    // used normally before the update, so the database already has its own
    // row for the same name (case-insensitively), under a different id. The
    // INSERT OR IGNORE for id 555 below is a no-op against the real DB
    // because of the UNIQUE COLLATE NOCASE constraint on name; the mock
    // reflects that by never including 555 in what `select` reports back.
    set(CATEGORIES_KEY, [{ id: 555, name: "kunde", color: "#333", created_at: "2026-01-01" }]);
    set(TODOS_KEY, [
      {
        id: 10,
        title: "Rechnung",
        done: false,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-02",
        due_date: null,
        category_id: 555,
      },
    ]);
    set(SLOTS_KEY, [{ date: "2026-01-05", slot: 3, category_id: 555, note: "" }]);
    // The database's own pre-existing row: id 1, name "Kunde" -- a different
    // id than the localStorage timestamp, same name modulo case.
    select.mockResolvedValue([{ id: 1, name: "Kunde" }]);

    await migrateLocalStorage();

    const todoCall = execute.mock.calls.find((c) => String(c[0]).includes("INSERT OR IGNORE INTO todos"));
    expect(todoCall).toBeDefined();
    const todoParams = todoCall![1] as unknown[];
    // id, title, done, status, priority, created_at, due_date, category_id
    expect(todoParams[7]).toBe(1); // rewritten to the database's id, not 555

    const slotCall = execute.mock.calls.find((c) => String(c[0]).includes("INSERT OR IGNORE INTO time_slots"));
    expect(slotCall).toBeDefined();
    const slotParams = slotCall![1] as unknown[];
    expect(slotParams).toEqual(["2026-01-05", 3, 1, ""]);
  });

  it("still resolves a category that was renamed between two migration attempts", async () => {
    // Ein erster Versuch schrieb die Kategorien und brach dann ab, bevor die
    // Slots dran waren -- das Flag blieb also ungesetzt, wie vorgesehen.
    // Danach benennt die Nutzerin "Kunde" in "Kundenprojekt" um. Beim Retry
    // findet eine reine Namenssuche den alten localStorage-Namen nicht mehr;
    // die Zeile steht aber laengst unter genau der localStorage-ID in der DB.
    set(CATEGORIES_KEY, [{ id: 555, name: "Kunde", color: "#333", created_at: "2026-01-01" }]);
    set(SLOTS_KEY, [{ date: "2026-01-05", slot: 3, category_id: 555, note: "Termin" }]);
    select.mockResolvedValue([{ id: 555, name: "Kundenprojekt" }]);

    await migrateLocalStorage();

    const slotCall = execute.mock.calls.find((c) =>
      String(c[0]).includes("INSERT OR IGNORE INTO time_slots")
    );
    expect(slotCall).toBeDefined();
    expect(slotCall![1]).toEqual(["2026-01-05", 3, 555, "Termin"]);
  });

  it("skips a slot whose category does not exist at all", async () => {
    set(SLOTS_KEY, [{ date: "2026-01-05", slot: 3, category_id: 999, note: "" }]);
    select.mockResolvedValue([]); // no categories in the db

    await migrateLocalStorage();

    const slotCall = execute.mock.calls.find((c) => String(c[0]).includes("INSERT OR IGNORE INTO time_slots"));
    expect(slotCall).toBeUndefined();
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
  });

  it("skips a key with corrupt JSON but still migrates the others and sets the flag", async () => {
    localStorage.setItem(CATEGORIES_KEY, "{not json");
    set(TODOS_KEY, [
      {
        id: 10,
        title: "Schreiben",
        done: false,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-02",
        due_date: null,
        category_id: null,
      },
    ]);

    await migrateLocalStorage();

    const categoryCalls = execute.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT OR IGNORE INTO categories")
    );
    expect(categoryCalls).toHaveLength(0);
    const todoCall = execute.mock.calls.find((c) => String(c[0]).includes("INSERT OR IGNORE INTO todos"));
    expect(todoCall).toBeDefined();
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
  });

  it("does not set the flag when an insert fails, so the next launch retries", async () => {
    set(TODOS_KEY, [
      {
        id: 10,
        title: "Schreiben",
        done: false,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-02",
        due_date: null,
        category_id: null,
      },
    ]);
    execute.mockRejectedValue(new Error("db is locked"));

    await expect(migrateLocalStorage()).rejects.toThrow("db is locked");

    expect(localStorage.getItem(MIGRATED_FLAG)).toBeNull();
  });

  it("does not overwrite a time_settings row that already exists (retry after a partial migration)", async () => {
    // The first launch's migration failed after writing settings but before
    // the flag was set (e.g. a later insert threw). Between that failed
    // attempt and the retry, the user changed their daily target inside the
    // app -- that's now the newer value and must win over the stale
    // localStorage copy the retry is about to see again.
    set(SETTINGS_KEY, { targetSlotsPerDay: 4, showWeekend: true });

    await migrateLocalStorage();

    const settingsCall = execute.mock.calls.find((c) => String(c[0]).includes("time_settings"));
    expect(settingsCall).toBeDefined();
    expect(String(settingsCall![0])).toMatch(/INSERT OR IGNORE INTO time_settings/);
    expect(String(settingsCall![0])).not.toMatch(/ON CONFLICT/i);
  });

  it("clamps an out-of-range target and binds show_weekend as 1, like the regular save path", async () => {
    set(SETTINGS_KEY, { targetSlotsPerDay: 999, showWeekend: true });

    await migrateLocalStorage();

    const settingsCall = execute.mock.calls.find((c) => String(c[0]).includes("time_settings"));
    expect(settingsCall).toBeDefined();
    const params = settingsCall![1] as unknown[];
    // target_slots_per_day, show_weekend -- id is the literal 1 in the SQL, not bound
    expect(params[0]).toBe(64); // clampTarget's MAX_TARGET_SLOTS ceiling
    expect(params[1]).toBe(1); // bound as 0/1, not a JS boolean -- see timeStoreSql.ts
  });

  it("coerces a non-boolean showWeekend to false / 0, and falls back to the clampTarget default for a null target", async () => {
    // Number(null) is 0, not NaN -- without an explicit guard this would
    // migrate as a target of 0 instead of falling back to 32.
    set(SETTINGS_KEY, { targetSlotsPerDay: null, showWeekend: "yes" });

    await migrateLocalStorage();

    const settingsCall = execute.mock.calls.find((c) => String(c[0]).includes("time_settings"));
    expect(settingsCall).toBeDefined();
    const params = settingsCall![1] as unknown[];
    expect(params[0]).toBe(32);
    expect(params[1]).toBe(0);
  });

  it("does not touch time_settings when the settings key is absent, even though other data migrates", async () => {
    set(TODOS_KEY, [
      {
        id: 10,
        title: "Schreiben",
        done: false,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-02",
        due_date: null,
        category_id: null,
      },
    ]);

    await migrateLocalStorage();

    const settingsCall = execute.mock.calls.find((c) => String(c[0]).includes("time_settings"));
    expect(settingsCall).toBeUndefined();
    const todoCall = execute.mock.calls.find((c) => String(c[0]).includes("INSERT OR IGNORE INTO todos"));
    expect(todoCall).toBeDefined();
  });

  it("skips a category with a non-numeric id", async () => {
    set(CATEGORIES_KEY, [{ id: "not-a-number", name: "Arbeit", color: "#fff", created_at: "2026-01-01" }]);

    await migrateLocalStorage();

    const categoryCalls = execute.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT OR IGNORE INTO categories")
    );
    expect(categoryCalls).toHaveLength(0);
  });

  it("migrates a todo whose category does not resolve with category_id NULL, rather than dropping it", async () => {
    // The category referenced by this todo was never in the export (or was
    // itself skipped), so resolveCategory() has nothing to map it to. The
    // todo must still be migrated -- category_id NULL, not lost entirely.
    set(TODOS_KEY, [
      {
        id: 10,
        title: "Verwaist",
        done: false,
        status: "todo",
        priority: "medium",
        created_at: "2026-01-02",
        due_date: null,
        category_id: 999,
      },
    ]);

    await migrateLocalStorage();

    const todoCall = execute.mock.calls.find((c) => String(c[0]).includes("INSERT OR IGNORE INTO todos"));
    expect(todoCall).toBeDefined();
    const params = todoCall![1] as unknown[];
    // id, title, done, status, priority, created_at, due_date, category_id
    expect(params[0]).toBe(10);
    expect(params[7]).toBeNull();
  });
});
