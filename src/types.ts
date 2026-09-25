/** "waiting" heisst: blockiert, wartet auf jemand anderen -- offen, aber nicht
 *  in Arbeit. Zaehlt wie "todo" und "in_progress" als nicht erledigt. */
export type TodoStatus = "waiting" | "todo" | "in_progress" | "done";

/**
 * Was fuer eine Art Arbeit eine Aufgabe ist -- unabhaengig von ihrer Kategorie.
 * Drei feste Werte, kein Stammdatum: waere der Typ frei definierbar, waere er
 * eine zweite Kategorie.
 */
export type TodoType = "bug" | "task" | "story";

/** Die Typen in der Reihenfolge, in der die Oberflaeche sie anbietet: nach
 *  Dringlichkeit, nicht mit der Vorgabe zuerst -- ein Fehler steht oben. */
export const TODO_TYPES: TodoType[] = ["bug", "task", "story"];

/** Beschriftungen der Typen fuer die Oberflaeche. */
export const TODO_TYPE_LABELS: Record<TodoType, string> = {
  bug: "Bug",
  task: "Task",
  story: "Story",
};

/**
 * Liest einen gespeicherten Wert als Typ, mit "task" als Rueckfall.
 *
 * Gebaut wie `toTimeKind`: der Rueckfall trifft zwei Faelle zugleich --
 * Eintraege aus der Zeit vor der Spalte (localStorage-Speicher) und Werte, die
 * nicht zu den drei bekannten gehoeren. "task" ist die Vorgabe, weil die
 * grosse Mehrheit der Aufgaben weder Fehler noch Anforderung ist.
 */
export function toTodoType(value: string | null | undefined): TodoType {
  return value === "bug" || value === "story" ? value : "task";
}

export interface Todo {
  id: number;
  title: string;
  /** Frei formulierter Text zur Aufgabe; leerer String heisst "keine Beschreibung". */
  description: string;
  done: boolean;
  status: TodoStatus;
  type: TodoType;
  /** Freie Schlagworte, immer normalisiert (`normalizeTag`) und sortiert.
   *  Leeres Array heisst "keine Tags". */
  tags: string[];
  created_at: string;
  due_date: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  /** Platz der Karte in ihrer Brett-Spalte; kleiner Wert heisst weiter oben.
   *  0 heisst "noch nie gezogen" -- alle unberuehrten Karten teilen sich den
   *  Wert und sortieren sich untereinander nach der Faelligkeitsregel. */
  board_order: number;
}

export interface TodoRow {
  id: number;
  title: string;
  /** Optional, weil der localStorage-Speicher Eintraege aus der Zeit vor
   *  dieser Spalte liefert; `fromRow` setzt dann den leeren String. */
  description?: string;
  done: number;
  created_at: string;
  due_date: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  status?: TodoStatus;
  /** Optional, weil der localStorage-Speicher Eintraege aus der Zeit vor
   *  dieser Spalte liefert; `toTodoType` setzt dann "task". */
  type?: string;
  /** Der SQL-Store liefert die Tags als JSON-Text (json_group_array), der
   *  localStorage-Store als Array; Eintraege aus der Zeit davor gar nicht.
   *  `parseTags` nimmt alle drei. */
  tags?: string | string[];
  board_order?: number;
}

export function fromRow(row: TodoRow): Todo {
  const status = row.status ?? (row.done === 1 ? "done" : "todo");
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    done: status === "done",
    status,
    type: toTodoType(row.type),
    tags: parseTags(row.tags),
    created_at: row.created_at,
    due_date: row.due_date,
    category_id: row.category_id,
    category_name: row.category_name,
    category_color: row.category_color,
    board_order: row.board_order ?? 0,
  };
}

/**
 * Was eine Kategorie fuer die Zeiterfassung bedeutet.
 *
 * "none" ist keine Arbeitszeit (Pause, Privat) und zaehlt nie gegen das Soll;
 * "internal" und "external" sind beide Arbeitszeit und trennen nur, wie sie
 * gebucht wird. Ein Feld statt zweier Flags, damit es die Kombination
 * "keine Arbeitszeit, extern abgerechnet" gar nicht erst gibt.
 */
export type TimeKind = "none" | "internal" | "external";

/** Die Zeitarten in der Reihenfolge, in der die Oberflaeche sie anbietet. */
export const TIME_KINDS: TimeKind[] = ["none", "internal", "external"];

/** Deutsche Beschriftungen der Zeitarten fuer die Oberflaeche. */
export const TIME_KIND_LABELS: Record<TimeKind, string> = {
  none: "Keine",
  internal: "Intern",
  external: "Extern",
};

/**
 * Liest einen gespeicherten Wert als Zeitart, mit "internal" als Rueckfall.
 *
 * Der Rueckfall trifft zwei Faelle zugleich: Eintraege aus der Zeit vor der
 * Spalte (localStorage-Speicher) und Werte, die nicht zu den drei bekannten
 * gehoeren. Beide werden Arbeitszeit, weil das die grosse Mehrheit trifft und
 * eine stillschweigend aus dem Soll fallende Buchung der teurere Irrtum waere.
 */
export function toTimeKind(value: string | null | undefined): TimeKind {
  return value === "none" || value === "external" ? value : "internal";
}

export interface Category {
  id: number;
  name: string;
  color: string;
  created_at: string;
  time_kind: TimeKind;
}

export interface CategoryRow {
  id: number;
  name: string;
  color: string;
  created_at: string;
  /** Optional und breit getypt, weil der localStorage-Speicher Eintraege aus
   *  der Zeit vor dieser Spalte liefert; `toTimeKind` faengt beides ab. */
  time_kind?: string;
}

export function fromCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: row.created_at,
    time_kind: toTimeKind(row.time_kind),
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

/** Laenger darf ein Tag nach der Normalisierung nicht sein. Dieselbe Grenze
 *  steht als MAX_TAG_CHARS in src-tauri/src/tags.rs. */
export const MAX_TAG_CHARS = 40;

/**
 * Die eine Regel, was ein Tag ist: NFC, getrimmt, kleingeschrieben, jede
 * Folge von Leerraum im Inneren ein "-". Leer oder laenger als
 * MAX_TAG_CHARS heisst: kein Tag (`null`).
 *
 * Leerraum ist hier genau Unicodes White_Space, damit Rust (`char::is_whitespace`)
 * dasselbe sieht: JS' `\s` kennt zusaetzlich U+FEFF (BOM), aber nicht U+0085
 * (NEL). Darum wird U+FEFF vorab ueberall entfernt -- vor dem NFC, damit er
 * keine Zeichenfolge auseinanderhaelt -- und U+0085 zaehlt ausdruecklich als
 * Leerraum.
 *
 * `toLowerCase` statt SQLites `NOCASE`, das nur ASCII faltet -- sonst waeren
 * "Ärzte" und "ärzte" zwei Tags. Die Rust-Seite (`tags::normalize_tag`) prueft
 * sich gegen dieselbe Tabelle `src-tauri/src/tag_cases.json`.
 */
export function normalizeTag(raw: string): string | null {
  const tag = raw
    .replace(/﻿/g, "")
    .normalize("NFC")
    .toLowerCase()
    .split(/[\s\u0085]+/)
    .filter((part) => part !== "")
    .join("-");
  if (tag === "" || [...tag].length > MAX_TAG_CHARS) return null;
  return tag;
}

/** Normalisiert eine Menge Tags: Unbrauchbares faellt weg, Dubletten auch,
 *  sortiert wird wie bei Kategorien. */
export function normalizeTags(raw: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const value of raw) {
    const tag = normalizeTag(value);
    if (tag !== null) tags.add(tag);
  }
  return [...tags].sort(compareCategoryNames);
}

/** Liest Tags aus einer Speicherquelle: JSON-Text, Array oder nichts. */
export function parseTags(value: unknown): string[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return normalizeTags(list.filter((item): item is string => typeof item === "string"));
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

/**
 * Die eine Reihenfolge, in der Kategorien ueberall auftauchen — in den
 * Speichern und in der optimistisch aktualisierten Liste der App.
 *
 * Eigene Funktion, weil ein blankes `a.name.localeCompare(b.name)` an der
 * Oberflaeche genau die Divergenz zurueckholt, die `compareCategoryNames`
 * schliesst: WebKitGTK wuerde die frisch angelegte Kategorie anders einsortieren
 * als der Speicher sie beim naechsten Laden liefert.
 *
 * Sortiert auf einer Kopie: die Aufrufer reichen React-State herein.
 */
export function sortCategories(categories: Category[]): Category[] {
  return categories.slice().sort((a, b) => compareCategoryNames(a.name, b.name));
}

/**
 * Die eine Reihenfolge der Aufgabenliste: neueste zuerst, bei gleichem
 * Zeitpunkt die groessere Id zuerst. Genau das, was `listTodos` laut
 * storeTypes.ts zusichert -- und was die optimistisch aktualisierte Liste in
 * App.tsx einhalten muss, damit eine zurueckgeholte Aufgabe dort landet, wo
 * sie nach einem Neustart auch stuende.
 *
 * Sortiert auf einer Kopie: die Aufrufer reichen React-State herein.
 */
export function sortTodos(todos: Todo[]): Todo[] {
  return todos.slice().sort((a, b) => {
    const dateCmp = b.created_at.localeCompare(a.created_at);
    return dateCmp !== 0 ? dateCmp : b.id - a.id;
  });
}

/**
 * Ab welchem Abstand zweier Nachbarn eine Bruchzahl dazwischen nicht mehr
 * verlaesslich ist. Doubles halten rund fuenfzig Halbierungen an derselben
 * Stelle aus; diese Schwelle greift lange davor.
 */
const BOARD_ORDER_EPSILON = 1e-6;

/**
 * Der Platz, den eine Karte zwischen ihren beiden kuenftigen Nachbarn bekommt.
 * `null` heisst "kein Nachbar auf dieser Seite", also Anfang bzw. Ende der
 * Spalte.
 *
 * Eine Bruchzahl statt einer Durchnummerierung, weil ein Drop genau ein UPDATE
 * ausloesen darf: `tauri-plugin-sql` kennt keine Transaktion ueber mehrere
 * Aufrufe (siehe AGENTS.md), eine halb geschriebene Neunummerierung liesse die
 * Spalte in einem Zustand zurueck, den niemand gewollt hat.
 *
 * Liegen beide Nachbarn zu dicht beieinander, liefert das Ergebnis keine echte
 * Trennung mehr -- dafuer fragt der Aufrufer vorher `needsRebalance`.
 */
export function computeBoardOrder(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/**
 * Ob zwischen diese beiden Nachbarn keine Bruchzahl mehr passt, die Ziehende
 * als Reihenfolge wahrnehmen. Trifft vor allem den Alltagsfall zweier noch nie
 * gezogener Karten (beide 0) und -- theoretisch -- viele Drops auf dieselbe
 * Stelle. Der Aufrufer verteilt die Spalte dann einmal neu.
 */
export function needsRebalance(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false;
  return Math.abs(after - before) < BOARD_ORDER_EPSILON;
}

/**
 * Die Spalte neu durchnummeriert, in genau der Reihenfolge, in der sie
 * hereingereicht wurde: 0, 1, 2, ... Der Aufrufer schreibt die Werte
 * anschliessend einzeln.
 */
export function rebalanceBoardOrders<T extends { id: number; board_order: number }>(
  lane: T[]
): { id: number; board_order: number }[] {
  return lane.map((todo, index) => ({ id: todo.id, board_order: index }));
}

/**
 * Die Reihenfolge einer Brett-Spalte: erst der gezogene Platz, dann -- bei
 * Gleichstand -- die Faelligkeit und zuletzt das Alter.
 *
 * Der Tie-Breaker ist kein Beiwerk: solange niemand gezogen hat, stehen alle
 * Karten auf 0, und dann ist er die ganze Sortierung.
 *
 * Sortiert auf einer Kopie: die Aufrufer reichen React-State herein.
 */
export function sortBoardTodos(todos: Todo[]): Todo[] {
  return todos.slice().sort((a, b) => {
    if (a.board_order !== b.board_order) return a.board_order - b.board_order;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}
