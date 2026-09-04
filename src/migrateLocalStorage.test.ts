import { describe, it, expect, beforeEach, vi } from "vitest";

const select = vi.fn();
const execute = vi.fn();

vi.mock("./sqlClient", () => ({
  getDb: () => Promise.resolve({ select, execute }),
  isTauri: () => true,
}));

import { migrateLocalStorage, MIGRATED_FLAG } from "./migrateLocalStorage";

const TODOS_KEY = "todolist_todos";
const CATEGORIES_KEY = "todolist_categories";
const SLOTS_KEY = "todolist_timeslots";

function set(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

describe("migrateLocalStorage", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
    localStorage.clear();

    // Default: no rows already present, every insert lands.
    execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
    // Default: post-insert category lookup used to resolve ids finds nothing extra.
    select.mockResolvedValue([]);
  });

  it("does nothing when localStorage is empty, but sets the flag", async () => {
    await migrateLocalStorage();

    expect(execute).not.toHaveBeenCalled();
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
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
});
