import { describe, it, expect } from "vitest";
import {
  fromRow,
  fromCategoryRow,
  TodoRow,
  Todo,
  compareCategoryNames,
  categoryNameKey,
  canonicalCategoryName,
  sortCategories,
  sortTodos,
  Category,
  computeBoardOrder,
  needsRebalance,
  rebalanceBoardOrders,
  sortBoardTodos,
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
      description: "",
      done: true,
      status: "done",
      priority: "medium",
      created_at: "2026-01-01T00:00:00Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
      board_order: 0,
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

  it("defaults a missing description to the empty string", () => {
    const todo = fromRow({
      id: 1,
      title: "Ohne Beschreibung",
      done: 0,
      priority: "medium",
      created_at: "2026-09-13T10:00:00.000Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    });

    expect(todo.description).toBe("");
  });

  it("passes a stored description through unchanged", () => {
    const todo = fromRow({
      id: 2,
      title: "Mit Beschreibung",
      done: 0,
      priority: "medium",
      created_at: "2026-09-13T10:00:00.000Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
      description: "Zeile eins\nZeile zwei",
    });

    expect(todo.description).toBe("Zeile eins\nZeile zwei");
  });

  it("defaults board_order to zero for rows written before the column", () => {
    const todo = fromRow({
      id: 1,
      title: "Alt",
      done: 0,
      priority: "medium",
      created_at: "2026-01-01T00:00:00.000Z",
      due_date: null,
      category_id: null,
      category_name: null,
      category_color: null,
    });
    expect(todo.board_order).toBe(0);
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

describe("sortCategories", () => {
  const cat = (id: number, name: string): Category => ({
    id,
    name,
    time_kind: "internal",
    color: "#111111",
    created_at: "2026-01-01T00:00:00Z",
  });

  it("orders categories the way compareCategoryNames orders their names", () => {
    const unsorted = [cat(1, "Sport"), cat(2, "Ärzte"), cat(3, "xxx"), cat(4, "ärzte"), cat(5, "foo#")];

    expect(sortCategories(unsorted).map((c) => c.name)).toEqual([
      "ärzte",
      "Ärzte",
      "foo#",
      "Sport",
      "xxx",
    ]);
  });

  it("leaves the given array untouched", () => {
    // Die Aufrufer reichen React-State herein; ein in-place-sort wuerde den
    // alten State veraendern und das Neuzeichnen verschlucken.
    const original = [cat(1, "Sport"), cat(2, "Ärzte")];

    sortCategories(original);

    expect(original.map((c) => c.name)).toEqual(["Sport", "Ärzte"]);
  });
});

describe("sortTodos", () => {
  const todo = (id: number, created_at: string): Todo => ({
    id,
    title: `Todo ${id}`,
    description: "",
    done: false,
    status: "todo",
    priority: "medium",
    created_at,
    due_date: null,
    category_id: null,
    category_name: null,
    category_color: null,
    board_order: 0,
  });

  it("orders by created_at, newest first", () => {
    const unsorted = [
      todo(1, "2026-01-01T00:00:00Z"),
      todo(2, "2026-01-03T00:00:00Z"),
      todo(3, "2026-01-02T00:00:00Z"),
    ];

    expect(sortTodos(unsorted).map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("breaks ties on the same created_at by descending id", () => {
    const unsorted = [
      todo(1, "2026-01-01T00:00:00Z"),
      todo(3, "2026-01-01T00:00:00Z"),
      todo(2, "2026-01-01T00:00:00Z"),
    ];

    expect(sortTodos(unsorted).map((t) => t.id)).toEqual([3, 2, 1]);
  });

  it("leaves the given array untouched", () => {
    // Die Aufrufer reichen React-State herein; ein in-place-sort wuerde den
    // alten State veraendern und das Neuzeichnen verschlucken.
    const original = [todo(1, "2026-01-01T00:00:00Z"), todo(2, "2026-01-03T00:00:00Z")];

    sortTodos(original);

    expect(original.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("computeBoardOrder", () => {
  it("puts a card between its two neighbours", () => {
    expect(computeBoardOrder(2, 4)).toBe(3);
  });

  it("puts a card dropped at the top below nothing", () => {
    expect(computeBoardOrder(null, 4)).toBe(3);
  });

  it("puts a card dropped at the bottom above nothing", () => {
    expect(computeBoardOrder(2, null)).toBe(3);
  });

  it("starts an empty lane at zero", () => {
    expect(computeBoardOrder(null, null)).toBe(0);
  });

  it("keeps splitting equal neighbours apart", () => {
    // Zwei Karten mit demselben Wert -- der Normalfall, solange niemand
    // gezogen hat: DEFAULT 0. Der Drop dazwischen muss trotzdem einen Wert
    // liefern, der strikt zwischen beiden liegt, sonst haengt die Reihenfolge
    // am Tie-Breaker statt am Ziehen.
    expect(computeBoardOrder(0, 0)).toBe(0);
    expect(needsRebalance(0, 0)).toBe(true);
  });
});

describe("needsRebalance", () => {
  it("is false for neighbours far enough apart", () => {
    expect(needsRebalance(1, 2)).toBe(false);
  });

  it("is false at the ends of a lane", () => {
    expect(needsRebalance(null, 1)).toBe(false);
    expect(needsRebalance(1, null)).toBe(false);
    expect(needsRebalance(null, null)).toBe(false);
  });

  it("is true once the gap falls below the threshold", () => {
    expect(needsRebalance(1, 1 + 1e-7)).toBe(true);
  });
});

describe("rebalanceBoardOrders", () => {
  it("numbers the lane in its current order", () => {
    const lane = [
      { id: 5, board_order: 0 },
      { id: 6, board_order: 0 },
      { id: 7, board_order: 0.5 },
    ];
    expect(rebalanceBoardOrders(lane)).toEqual([
      { id: 5, board_order: 0 },
      { id: 6, board_order: 1 },
      { id: 7, board_order: 2 },
    ]);
  });
});

describe("sortBoardTodos", () => {
  const card = (over: Partial<Todo>): Todo => ({
    id: 1,
    title: "T",
    description: "",
    done: false,
    status: "todo",
    priority: "medium",
    created_at: "2026-01-01T00:00:00.000Z",
    due_date: null,
    category_id: null,
    category_name: null,
    category_color: null,
    board_order: 0,
    ...over,
  });

  it("sorts by board_order, smallest first", () => {
    const sorted = sortBoardTodos([
      card({ id: 1, board_order: 2 }),
      card({ id: 2, board_order: -1 }),
      card({ id: 3, board_order: 0.5 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("falls back to the due date rule when the position is equal", () => {
    const sorted = sortBoardTodos([
      card({ id: 1, title: "Ohne Datum", priority: "high" }),
      card({ id: 2, title: "Spaet", due_date: "2026-12-01" }),
      card({ id: 3, title: "Frueh", due_date: "2026-01-15", priority: "low" }),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(["Frueh", "Spaet", "Ohne Datum"]);
  });

  it("lets a dragged card beat the due date rule", () => {
    const sorted = sortBoardTodos([
      card({ id: 1, title: "Frueh", due_date: "2026-01-15" }),
      card({ id: 2, title: "Hochgezogen", due_date: "2026-12-01", board_order: -1 }),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(["Hochgezogen", "Frueh"]);
  });

  it("does not sort the array it was given", () => {
    const lane = [card({ id: 1, board_order: 2 }), card({ id: 2, board_order: 1 })];
    sortBoardTodos(lane);
    expect(lane.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("fromCategoryRow", () => {
  const row = {
    id: 1,
    name: "Arbeit",
    color: "#7cc3f7",
    created_at: "2026-09-16T08:00:00.000Z",
  };

  it("nimmt time_kind aus der Zeile", () => {
    expect(fromCategoryRow({ ...row, time_kind: "external" }).time_kind).toBe("external");
  });

  it("faellt auf internal zurueck, wenn die Spalte fehlt", () => {
    expect(fromCategoryRow(row).time_kind).toBe("internal");
  });

  it("faellt auf internal zurueck, wenn der Wert unbekannt ist", () => {
    expect(fromCategoryRow({ ...row, time_kind: "quatsch" }).time_kind).toBe("internal");
  });
});
