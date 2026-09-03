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
  /** Wirft, wenn `id` kein bestehendes Todo referenziert. */
  updateTodoTitle(id: number, title: string): Promise<Todo>;
  /** Wirft, wenn `id` kein bestehendes Todo referenziert. */
  updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo>;
  /** Wirft, wenn `id` kein bestehendes Todo referenziert. */
  updateTodoPriority(id: number, priority: Priority): Promise<Todo>;
  /** Aktualisiert category_id und denormalisiert category_name/category_color neu; wirft, wenn `id` kein bestehendes Todo referenziert. */
  updateTodoCategory(id: number, categoryId: number | null): Promise<Todo>;
  /** Haelt `done` konsistent zu `status` ("done" <=> done === true); wirft, wenn `id` kein bestehendes Todo referenziert. */
  updateTodoStatus(id: number, status: TodoStatus): Promise<Todo>;
  /** Haelt `status` konsistent zu `done`; wirft, wenn `id` kein bestehendes Todo referenziert. */
  toggleTodoDone(id: number, done: boolean): Promise<Todo>;
  deleteTodo(id: number): Promise<number>;
  /** Alle Kategorien, sortiert nach `name.localeCompare` (nicht nach einer DB-Kollation) — das ist der Vertrag, jedes Backend muss dieselbe Reihenfolge liefern. */
  listCategories(): Promise<Category[]>;
  /** Legt eine neue Kategorie an; `name` wird getrimmt. */
  addCategory(name: string, color: string): Promise<Category>;
  /** Aktualisiert Name (getrimmt) und Farbe und denormalisiert beides auf alle referenzierenden Todos; wirft, wenn `id` keine bestehende Kategorie referenziert. */
  updateCategory(id: number, name: string, color: string): Promise<Category>;
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
