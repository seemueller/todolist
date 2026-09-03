import { Category, Priority, Todo, TodoStatus } from "./types";
import { DaySlot } from "./timeSlots";
import { TimeSettings } from "./timeDb";

/** Everything db.ts needs from a storage backend. */
export interface TodoStore {
  listTodos(categoryId?: number | null): Promise<Todo[]>;
  addTodo(
    title: string,
    priority: Priority,
    dueDate: string | null,
    categoryId?: number | null
  ): Promise<Todo>;
  updateTodoTitle(id: number, title: string): Promise<Todo>;
  updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo>;
  updateTodoPriority(id: number, priority: Priority): Promise<Todo>;
  updateTodoCategory(id: number, categoryId: number | null): Promise<Todo>;
  updateTodoStatus(id: number, status: TodoStatus): Promise<Todo>;
  toggleTodoDone(id: number, done: boolean): Promise<Todo>;
  deleteTodo(id: number): Promise<number>;
  listCategories(): Promise<Category[]>;
  addCategory(name: string, color: string): Promise<Category>;
  updateCategory(id: number, name: string, color: string): Promise<Category>;
  deleteCategory(id: number): Promise<number>;
}

/** Everything timeDb.ts needs from a storage backend. */
export interface TimeStore {
  getSettings(): Promise<TimeSettings>;
  saveSettings(settings: TimeSettings): Promise<TimeSettings>;
  listSlots(date: string): Promise<DaySlot[]>;
  saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]>;
  paintSlots(date: string, indices: number[], categoryId: number | null): Promise<DaySlot[]>;
  setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]>;
  clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]>;
}
