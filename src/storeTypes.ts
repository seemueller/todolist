import { Category, Priority, Todo, TodoStatus } from "./types";
import { DaySlot } from "./timeSlots";
import { TimeSettings } from "./timeTypes";

/**
 * Everything db.ts needs from a storage backend. Every implementation must keep
 * these contracts, since the views rely on them regardless of which backend is
 * active.
 */
export interface TodoStore {
  /** Alle Todos, neueste zuerst (nach created_at, bei Gleichstand nach id); optional auf eine Kategorie gefiltert. */
  listTodos(categoryId?: number | null): Promise<Todo[]>;
  /** Legt ein neues Todo im Status "todo" an; category_name/category_color werden aus der Kategorie denormalisiert. */
  addTodo(
    title: string,
    priority: Priority,
    dueDate: string | null,
    categoryId?: number | null
  ): Promise<Todo>;
  /** Lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoTitle(id: number, title: string): Promise<Todo>;
  /** Lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo>;
  /** Lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoPriority(id: number, priority: Priority): Promise<Todo>;
  /** Aktualisiert category_id und denormalisiert category_name/category_color neu; lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoCategory(id: number, categoryId: number | null): Promise<Todo>;
  /** Haelt `done` konsistent zu `status` ("done" <=> done === true); lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoStatus(id: number, status: TodoStatus): Promise<Todo>;
  /** Haelt `status` konsistent zu `done`; lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  toggleTodoDone(id: number, done: boolean): Promise<Todo>;
  deleteTodo(id: number): Promise<number>;
  /**
   * Alle Kategorien, sortiert mit `compareCategoryNames` aus `types.ts` (nicht
   * nach einer DB-Kollation) — das ist der Vertrag, jedes Backend muss
   * dieselbe Reihenfolge liefern. Ein blosses `name.localeCompare(...)`
   * reicht dafuer nicht: WebKitGTK (Desktop/Tauri) gewichtet Gross-/
   * Kleinschreibung auf der primaeren Kollationsstufe und sortiert deshalb
   * jeden grossgeschriebenen Namen vor jedem kleingeschriebenen, waehrend
   * Node/Chromium das erst auf der tertiaeren Stufe tun — `compareCategoryNames`
   * vergleicht zuerst die kleingeschriebenen Namen, um diese Engine-Differenz
   * zu vermeiden.
   */
  listCategories(): Promise<Category[]>;
  /**
   * Legt eine neue Kategorie an; `name` wird getrimmt. Lehnt ab, wenn bereits
   * eine Kategorie mit demselben `categoryNameKey` (getrimmt, `de`-lowercase,
   * Unicode-aware — dieselbe Normalisierung wie beim Sortieren) existiert, mit
   * der Meldung `Es gibt bereits eine Kategorie "<vorhandener Name>".` — als
   * Promise-Rejection, nie als synchroner throw. Das ist bewusst strenger als
   * SQLites `UNIQUE COLLATE NOCASE`, das nur ASCII case-faltet.
   */
  addCategory(name: string, color: string): Promise<Category>;
  /**
   * Aktualisiert Name (getrimmt) und Farbe und denormalisiert beides auf alle
   * referenzierenden Todos; lehnt mit `Category <id> not found` ab, wenn `id`
   * keine bestehende Kategorie referenziert. Lehnt ausserdem wie `addCategory`
   * ab, wenn der neue Name mit einer *anderen* Kategorie kollidiert (dieselbe
   * Kategorie darf ihren eigenen Namen in anderer Gross-/Kleinschreibung
   * behalten) — beides als Promise-Rejection, nie als synchroner throw.
   */
  updateCategory(id: number, name: string, color: string): Promise<Category>;
  /**
   * Loescht die Kategorie; Todos, die sie referenzierten, verlieren sie
   * (category_id/category_name/category_color werden null), werden aber nicht
   * geloescht. Zeitbuchungen bleiben unangetastet: sie behalten ihre jetzt ins
   * Leere zeigende `category_id` und werden weder geloescht noch geleert. Die
   * Wochenansicht rechnet damit und beschriftet sie mit "Geloeschte Kategorie";
   * eine Buchung ohne Kategorie ist im Datenmodell gar nicht darstellbar, weil
   * `applyPaint` in timeSlots.ts `category_id === null` als "Slot leeren" liest.
   */
  deleteCategory(id: number): Promise<number>;
}

/** Everything timeDb.ts needs from a storage backend. */
export interface TimeStore {
  /** Einstellungen lesen; fehlende oder kaputte Werte fallen auf die Vorgabe zurueck. */
  getSettings(): Promise<TimeSettings>;
  /** Einstellungen schreiben und die tatsaechlich gespeicherten Werte zurueckgeben. */
  saveSettings(settings: TimeSettings): Promise<TimeSettings>;
  /** Alle Buchungen eines Tages, nach Slot sortiert. */
  listSlots(date: string): Promise<DaySlot[]>;
  /**
   * Schreibt den kompletten Tagesstand. Die View nutzt das am Ende eines Zuges:
   * waehrend gezogen wird, rechnet sie die Vorschau selbst, gespeichert wird einmal.
   */
  saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]>;
  /**
   * Malt oder leert Slots eines Tages und gibt den neuen Tagesstand zurueck.
   * `categoryId` null leert die Slots.
   */
  paintSlots(date: string, indices: number[], categoryId: number | null): Promise<DaySlot[]>;
  /** Setzt die Notiz des Blocks, in dem `slot` liegt. */
  setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]>;
  /** Loescht einen ganzen Block. */
  clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]>;
}
