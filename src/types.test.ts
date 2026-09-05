import { describe, it, expect } from "vitest";
import {
  fromRow,
  TodoRow,
  Todo,
  compareCategoryNames,
  categoryNameKey,
  canonicalCategoryName,
} from "./types";

/** "Ärzte" zerlegt: A plus kombinierendes Trema (NFD). */
const NFD_AERZTE = "A\u0308rzte";
/** Dasselbe Wort mit einem vorkomponierten Ä (NFC). */
const NFC_AERZTE = "\u00c4rzte";

describe("fromRow", () => {
  it("converts a database row to a Todo with done=true", () => {
    const row: TodoRow = {
      id: 1,
      title: "Test task",
      done: 1,
      priority: "medium",
      created_at: "2026-01-01T00:00:00Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    };

    const result: Todo = fromRow(row);

    expect(result).toEqual({
      id: 1,
      title: "Test task",
      done: true,
      status: "done",
      priority: "medium",
      created_at: "2026-01-01T00:00:00Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    });
  });

  it("converts a database row to a Todo with done=false", () => {
    const row: TodoRow = {
      id: 2,
      title: "Open task",
      done: 0,
      priority: "low",
      created_at: "2026-06-15T12:00:00Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    };

    const result: Todo = fromRow(row);

    expect(result.done).toBe(false);
    expect(result.id).toBe(2);
    expect(result.title).toBe("Open task");
  });

  it("preserves all fields from the row", () => {
    const row: TodoRow = {
      id: 99,
      title: "Preserve fields",
      done: 1,
      priority: "high",
      created_at: "2025-12-31T23:59:59Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    };

    const result = fromRow(row);

    expect(result.id).toBe(row.id);
    expect(result.title).toBe(row.title);
    expect(result.created_at).toBe(row.created_at);
  });

  it("treats non-1 done values as false", () => {
    const row: TodoRow = {
      id: 3,
      title: "Edge case",
      done: 2,
      priority: "medium",
      created_at: "2026-01-01T00:00:00Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    };

    const result = fromRow(row);

    expect(result.done).toBe(false);
  });
});

describe("compareCategoryNames", () => {
  it("orders umlauts the way German readers expect", () => {
    const names = ["Zebra", "Apfel", "Ärzte"];
    expect(names.slice().sort(compareCategoryNames)).toEqual(["Apfel", "Ärzte", "Zebra"]);
  });

  it("does not group all uppercase-initial names before all lowercase-initial ones", () => {
    // This is exactly the case a bare `localeCompare` gets wrong in
    // WebKitGTK: it weighs case at the primary collation level, so it would
    // produce ["Ärzte", "Sport", "ärzte", "foo#", "xxx"] here instead.
    const names = ["Ärzte", "ärzte", "Sport", "foo#", "xxx"];
    expect(names.slice().sort(compareCategoryNames)).toEqual([
      "ärzte",
      "Ärzte",
      "foo#",
      "Sport",
      "xxx",
    ]);
  });
});

describe("categoryNameKey", () => {
  it("gives a decomposed name the same key as its composed twin", () => {
    // Zwei Schreibweisen desselben Wortes: das Ä einmal als ein Codepoint,
    // einmal als A plus kombinierendes Trema. Sie sehen identisch aus, also
    // muessen sie fuer die App derselbe Name sein.
    expect(NFD_AERZTE).not.toBe(NFC_AERZTE);
    expect(categoryNameKey(NFD_AERZTE)).toBe(categoryNameKey(NFC_AERZTE));
  });

  it("still folds case and whitespace", () => {
    expect(categoryNameKey("  ÄRZTE ")).toBe(categoryNameKey("ärzte"));
  });
});

describe("canonicalCategoryName", () => {
  it("stores the composed form", () => {
    expect(canonicalCategoryName(` ${NFD_AERZTE} `)).toBe(NFC_AERZTE);
  });
});
