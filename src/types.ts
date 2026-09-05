export type Priority = "low" | "medium" | "high";
export type TodoStatus = "todo" | "in_progress" | "done";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  status: TodoStatus;
  priority: Priority;
  created_at: string;
  due_date: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
}

export interface TodoRow {
  id: number;
  title: string;
  done: number;
  priority: Priority;
  created_at: string;
  due_date: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  status?: TodoStatus;
}

export function fromRow(row: TodoRow): Todo {
  const status = row.status ?? (row.done === 1 ? "done" : "todo");
  return {
    id: row.id,
    title: row.title,
    done: status === "done",
    status,
    priority: row.priority,
    created_at: row.created_at,
    due_date: row.due_date,
    category_id: row.category_id,
    category_name: row.category_name,
    category_color: row.category_color,
  };
}

export interface Category {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface CategoryRow {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export function fromCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: row.created_at,
  };
}

/**
 * The canonical stored form of a category name: composed (NFC) and trimmed.
 *
 * Applied when a name is written, so the database never holds two spellings of
 * the same word. `categoryNameKey` normalises on the way out too, so names
 * stored before this existed still compare correctly.
 */
export function canonicalCategoryName(name: string): string {
  return name.normalize("NFC").trim();
}

/**
 * Normalises a category name to the key that decides whether two names "are
 * the same" — for both sorting and uniqueness. Composes to NFC, trims
 * whitespace and lowercases with the German locale, so "Ärzte", " ärzte " and
 * "ärzte" all collapse to one key. Both `compareCategoryNames` and the
 * duplicate checks in the stores build on this single definition, so ordering
 * and uniqueness can never disagree about what counts as the same name.
 *
 * The NFC step is not cosmetic: "Ä" can be one codepoint or an "A" followed by
 * a combining diaeresis. The two render identically, so without composing them
 * first the app would happily create two categories a reader cannot tell
 * apart — the same duplicate-category bug the case folding already closes,
 * arriving through a different door.
 */
export function categoryNameKey(name: string): string {
  return canonicalCategoryName(name).toLocaleLowerCase("de");
}

/**
 * Sorts category names the way German readers expect, and identically across
 * both storage backends (localStorage and SQLite).
 *
 * A bare `a.localeCompare(b, "de")` is not enough: WebKitGTK (the engine
 * behind the desktop Tauri build) weighs case at the *primary* collation
 * level, so it groups every uppercase-initial name before every
 * lowercase-initial one ("Ärzte, Sport, ärzte, foo#, xxx") — Node and
 * Chromium weigh case at the tertiary level instead, giving the ordering a
 * German reader actually expects ("ärzte, Ärzte, foo#, Sport, xxx"). Both
 * engines agree that "Ärzte" < "B" and both resolve the "de" locale; the
 * divergence is only in how case is weighted.
 *
 * Comparing the lowercased keys first keeps case out of the primary
 * comparison entirely, so both engines land on the same order; the second
 * `localeCompare` only breaks ties between names that differ solely in case.
 */
export function compareCategoryNames(a: string, b: string): number {
  return categoryNameKey(a).localeCompare(categoryNameKey(b), "de") || a.localeCompare(b, "de");
}

export const CATEGORY_COLORS = [
  "#7cc3f7",
  "#efaee6",
  "#ffd43b",
  "#6fcf7f",
  "#e5401a",
  "#b9a4f0",
  "#f9a03f",
  "#7fd8d0",
];
