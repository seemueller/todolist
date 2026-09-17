import { Priority, TimeKind, Todo, TodoStatus, Category } from "./types";
import { localTodoStore } from "./todoStoreLocal";
import { sqlTodoStore } from "./todoStoreSql";
import { isTauri } from "./sqlClient";
import { TodoStore, TodoFieldsPatch } from "./storeTypes";

function store(): TodoStore {
  return isTauri() ? sqlTodoStore : localTodoStore;
}

export function listTodos(categoryId?: number | null): Promise<Todo[]> {
  return store().listTodos(categoryId);
}

export function addTodo(
  title: string,
  priority: Priority,
  dueDate: string | null,
  categoryId?: number | null,
  description?: string
): Promise<Todo> {
  return store().addTodo(title, priority, dueDate, categoryId, description);
}

export function updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo> {
  return store().updateTodoDueDate(id, dueDate);
}

export function updateTodoPriority(id: number, priority: Priority): Promise<Todo> {
  return store().updateTodoPriority(id, priority);
}

export function updateTodoCategory(id: number, categoryId: number | null): Promise<Todo> {
  return store().updateTodoCategory(id, categoryId);
}

export function updateTodoFields(id: number, patch: TodoFieldsPatch): Promise<Todo> {
  return store().updateTodoFields(id, patch);
}

/**
 * Setzt den Status ohne Brett-Kontext. Seit das Brett Status und Position in
 * einem Schreibvorgang setzt, hat sie in der Oberflaeche keinen Aufrufer mehr
 * -- sie bleibt, damit diese Fassade den Store-Vertrag vollstaendig spiegelt.
 */
export function updateTodoStatus(id: number, status: TodoStatus): Promise<Todo> {
  return store().updateTodoStatus(id, status);
}

export function updateTodoBoardOrder(id: number, order: number): Promise<Todo> {
  return store().updateTodoBoardOrder(id, order);
}

export function updateTodoStatusAndOrder(
  id: number,
  status: TodoStatus,
  order: number
): Promise<Todo> {
  return store().updateTodoStatusAndOrder(id, status, order);
}

export function toggleTodoDone(id: number, done: boolean): Promise<Todo> {
  return store().toggleTodoDone(id, done);
}

export function deleteTodo(id: number): Promise<number> {
  return store().deleteTodo(id);
}

export function listDeletedTodos(): Promise<Todo[]> {
  return store().listDeletedTodos();
}

export function restoreTodo(id: number): Promise<Todo> {
  return store().restoreTodo(id);
}

export function purgeTodo(id: number): Promise<number> {
  return store().purgeTodo(id);
}

export function purgeDeletedBefore(cutoff: string): Promise<number> {
  return store().purgeDeletedBefore(cutoff);
}

export function listCategories(): Promise<Category[]> {
  return store().listCategories();
}

export function addCategory(
  name: string,
  color: string,
  timeKind?: TimeKind
): Promise<Category> {
  return store().addCategory(name, color, timeKind);
}

export function updateCategory(
  id: number,
  name: string,
  color: string,
  timeKind: TimeKind
): Promise<Category> {
  return store().updateCategory(id, name, color, timeKind);
}

export function deleteCategory(id: number): Promise<number> {
  return store().deleteCategory(id);
}
