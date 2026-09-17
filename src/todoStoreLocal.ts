// localStorage backend for todos and categories. Implements TodoStore from
// storeTypes.ts; the contracts documented there apply here, this file only
// holds implementation detail.

import {
  Priority,
  Todo,
  TodoStatus,
  Category,
  CategoryRow,
  TimeKind,
  fromCategoryRow,
  sortCategories,
  sortTodos,
  categoryNameKey,
  canonicalCategoryName,
} from "./types";
import { TodoStore, TodoFieldsPatch } from "./storeTypes";

// ── localStorage persistence ─────────────────────────────────────────────

const TODOS_KEY = "todolist_todos";
const CATEGORIES_KEY = "todolist_categories";

/** Wie eine Aufgabe im localStorage liegt: mit dem Papierkorb-Zeitstempel, den
 *  der `Todo`-Typ bewusst nicht kennt. Gesetzt heisst "liegt im Papierkorb". */
type StoredTodoRecord = Todo & { deleted_at?: string | null };

/** Streift den internen Zeitstempel ab, bevor eine Aufgabe den Store verlaesst. */
function toTodo(stored: StoredTodoRecord): Todo {
  const { deleted_at: _deleted, ...todo } = stored;
  return todo;
}

// Als Typ-Praedikat formuliert (statt schlicht boolean): so narrowt TypeScript
// `deleted_at` an jeder Aufrufstelle automatisch auf `string`, auch in einer
// `isInTrash(t) && ...`-Verkettung -- kein Cast noetig, etwa in
// `purgeDeletedBefore`.
//
// Ein fehlendes `deleted_at` und ein gesetztes `deleted_at: null` bedeuten
// beide "nicht im Papierkorb" und werden hier absichtlich nicht
// unterschieden -- nach einem Loeschen-dann-Wiederherstellen traegt der
// Datensatz `null` als echten Schluessel, eine nie geloeschte Aufgabe hat ihn
// gar nicht. Eine spaetere "Aufraeum"-Aenderung sollte das `null` deshalb
// nicht entfernen, ohne Serialisierung und Iteration (`"deleted_at" in ...`,
// `JSON.stringify`) an allen Aufrufstellen zu pruefen.
function isInTrash(stored: StoredTodoRecord): stored is StoredTodoRecord & { deleted_at: string } {
  return typeof stored.deleted_at === "string";
}

function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function now(): string {
  return new Date().toISOString();
}

// Papierkorb-Zeitstempel duerfen sich nicht wiederholen: `deleteTodo` kann
// mehrfach innerhalb derselben Millisekunde laufen (typischerweise in Tests),
// und `listDeletedTodos` sortiert nach `deleted_at` -- ein Gleichstand wuerde
// die Sortierung von der Zufallszahl in `generateId` abhaengig machen statt
// von der Loeschreihenfolge. Der neue Zeitstempel ist deshalb mindestens eine
// Millisekunde nach dem juengsten bereits im Papierkorb liegenden.
function nextDeletedAt(todos: StoredTodoRecord[]): string {
  const latestMs = todos
    .filter(isInTrash)
    .reduce((max, t) => Math.max(max, Date.parse(t.deleted_at as string)), 0);
  return new Date(Math.max(Date.now(), latestMs + 1)).toISOString();
}

function loadTodos(): StoredTodoRecord[] {
  try {
    const raw = localStorage.getItem(TODOS_KEY);
    if (!raw) return [];
    return migrateTodos(JSON.parse(raw));
  } catch {
    return [];
  }
}

// Holt Eintraege aus aelteren Staenden auf den heutigen Stand: `status` kam
// mit dem Brett dazu, `description` mit dem Detail-Fenster. Beides fehlt in
// Daten, die davor geschrieben wurden.
/** Ein Eintrag so, wie ihn ein aelterer Stand geschrieben haben kann: `status`
 *  und `description` koennen fehlen. */
type StoredTodo = Omit<StoredTodoRecord, "status" | "description" | "board_order"> &
  Partial<Pick<StoredTodoRecord, "status" | "description" | "board_order">>;

function migrateTodos(todos: StoredTodo[]): StoredTodoRecord[] {
  return todos.map((todo) => {
    const description = todo.description ?? "";
    const board_order = todo.board_order ?? 0;
    if (todo.status) return { ...todo, description, board_order, status: todo.status };
    const status: TodoStatus = todo.done ? "done" : "todo";
    return { ...todo, description, board_order, status, done: status === "done" };
  });
}

function saveTodos(todos: StoredTodoRecord[]): void {
  localStorage.setItem(TODOS_KEY, JSON.stringify(todos));
}

function loadCategories(): Category[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return [];
    // Jede Zeile durch fromCategoryRow: Eintraege aus der Zeit vor der Zeitart
    // liegen ohne time_kind im Speicher und bekommen so den Vorgabewert
    // "internal" -- dieselbe Rolle, die in SQLite der Spaltenvorgabewert hat.
    return (JSON.parse(raw) as CategoryRow[]).map(fromCategoryRow);
  } catch {
    return [];
  }
}

function saveCategories(categories: Category[]): void {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

// ── Derived reads ────────────────────────────────────────────────────────

function selectTodos(categoryId?: number | null): Todo[] {
  let todos = loadTodos().filter((t) => !isInTrash(t));
  if (categoryId !== undefined && categoryId !== null) {
    todos = todos.filter((t) => t.category_id === categoryId);
  }
  return sortTodos(todos).map(toTodo);
}

function findCategory(id: number): Category | undefined {
  return loadCategories().find((c) => c.id === id);
}

// ── Todos ────────────────────────────────────────────────────────────────

function listTodos(categoryId?: number | null): Promise<Todo[]> {
  return Promise.resolve(selectTodos(categoryId));
}

function addTodo(
  title: string,
  priority: Priority,
  dueDate: string | null,
  categoryId?: number | null,
  description = ""
): Promise<Todo> {
  const todos = loadTodos();
  const todo: Todo = {
    id: generateId(),
    title,
    description,
    done: false,
    status: "todo",
    priority,
    created_at: now(),
    due_date: dueDate,
    category_id: categoryId ?? null,
    category_name: categoryId ? findCategory(categoryId)?.name ?? null : null,
    category_color: categoryId ? findCategory(categoryId)?.color ?? null : null,
    board_order: 0,
  };
  todos.unshift(todo);
  saveTodos(todos);
  return Promise.resolve(todo);
}

async function updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], due_date: dueDate };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

async function updateTodoPriority(id: number, priority: Priority): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], priority };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

async function updateTodoCategory(id: number, categoryId: number | null): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  const cat = categoryId ? findCategory(categoryId) : null;
  todos[idx] = {
    ...todos[idx],
    category_id: categoryId,
    category_name: cat?.name ?? null,
    category_color: cat?.color ?? null,
  };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

async function updateTodoFields(id: number, patch: TodoFieldsPatch): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);

  const next = { ...todos[idx] };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueDate !== undefined) next.due_date = patch.dueDate;
  if (patch.categoryId !== undefined) {
    const cat = patch.categoryId === null ? null : findCategory(patch.categoryId);
    next.category_id = patch.categoryId;
    next.category_name = cat?.name ?? null;
    next.category_color = cat?.color ?? null;
  }

  todos[idx] = next;
  saveTodos(todos);
  return Promise.resolve(toTodo(next));
}

async function updateTodoStatus(id: number, status: TodoStatus): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], status, done: status === "done" };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

async function updateTodoBoardOrder(id: number, order: number): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], board_order: order };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

async function updateTodoStatusAndOrder(
  id: number,
  status: TodoStatus,
  order: number
): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], status, done: status === "done", board_order: order };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

async function toggleTodoDone(id: number, done: boolean): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  const status: TodoStatus = done ? "done" : "todo";
  todos[idx] = { ...todos[idx], done, status };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

function deleteTodo(id: number): Promise<number> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && !isInTrash(t));
  if (idx !== -1) {
    todos[idx] = { ...todos[idx], deleted_at: nextDeletedAt(todos) };
    saveTodos(todos);
  }
  return Promise.resolve(id);
}

function listDeletedTodos(): Promise<Todo[]> {
  const trash = loadTodos()
    .filter(isInTrash)
    .sort((a, b) => {
      const cmp = (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "");
      return cmp !== 0 ? cmp : b.id - a.id;
    })
    .map(toTodo);
  return Promise.resolve(trash);
}

function restoreTodo(id: number): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id && isInTrash(t));
  if (idx === -1) return Promise.reject(new Error(`Todo ${id} not found`));
  todos[idx] = { ...todos[idx], deleted_at: null };
  saveTodos(todos);
  return Promise.resolve(toTodo(todos[idx]));
}

function purgeTodo(id: number): Promise<number> {
  // Nur Zeilen im Papierkorb -- eine lebende oder unbekannte Id bleibt
  // folgenlos, siehe Vertrag in storeTypes.ts.
  saveTodos(loadTodos().filter((t) => !(t.id === id && isInTrash(t))));
  return Promise.resolve(id);
}

function purgeDeletedBefore(cutoff: string): Promise<number> {
  const todos = loadTodos();
  // Textvergleich -- gilt nur, weil alle Backends dasselbe ISO-Format
  // schreiben, siehe storeTypes.ts.
  const kept = todos.filter((t) => !(isInTrash(t) && t.deleted_at < cutoff));
  // Kein Schreiben, wenn nichts entfernt wurde: task 8 ruft das bei jedem
  // Programmstart auf, ein unveraendertes setItem loest sonst in jedem
  // offenen Tab unnoetig ein storage-Event aus.
  if (kept.length !== todos.length) saveTodos(kept);
  return Promise.resolve(todos.length - kept.length);
}

// ── Categories ───────────────────────────────────────────────────────────

function listCategories(): Promise<Category[]> {
  return Promise.resolve(sortCategories(loadCategories()));
}

// Rejects a create/rename that collides with an existing category name,
// case-insensitively and Unicode-aware (see categoryNameKey in types.ts).
// `excludeId` lets updateCategory allow a category to keep its own name.
function assertNameAvailable(categories: Category[], name: string, excludeId?: number): void {
  const key = categoryNameKey(name);
  const collision = categories.find((c) => c.id !== excludeId && categoryNameKey(c.name) === key);
  if (collision) {
    throw new Error(`Es gibt bereits eine Kategorie "${collision.name}".`);
  }
}

async function addCategory(
  name: string,
  color: string,
  timeKind: TimeKind = "internal"
): Promise<Category> {
  const categories = loadCategories();
  assertNameAvailable(categories, name);
  const cat: Category = {
    id: generateId(),
    name: canonicalCategoryName(name),
    color,
    created_at: now(),
    time_kind: timeKind,
  };
  categories.push(cat);
  saveCategories(categories);

  return Promise.resolve(cat);
}

async function updateCategory(
  id: number,
  name: string,
  color: string,
  timeKind: TimeKind
): Promise<Category> {
  const categories = loadCategories();
  const idx = categories.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Category ${id} not found`);
  assertNameAvailable(categories, name, id);
  categories[idx] = {
    ...categories[idx],
    name: canonicalCategoryName(name),
    color,
    time_kind: timeKind,
  };
  saveCategories(categories);

  // Update todos referencing this category
  const todos = loadTodos();
  for (const todo of todos) {
    if (todo.category_id === id) {
      todo.category_name = categories[idx].name;
      todo.category_color = categories[idx].color;
    }
  }
  saveTodos(todos);

  return Promise.resolve(categories[idx]);
}

function deleteCategory(id: number): Promise<number> {
  const categories = loadCategories().filter((c) => c.id !== id);
  saveCategories(categories);

  // Clear the category off todos that referenced it, instead of leaving it
  // dangling: the SQL store gets this for free via ON DELETE SET NULL.
  const todos = loadTodos();
  for (const todo of todos) {
    if (todo.category_id === id) {
      todo.category_id = null;
      todo.category_name = null;
      todo.category_color = null;
    }
  }
  saveTodos(todos);

  return Promise.resolve(id);
}

export const localTodoStore: TodoStore = {
  listTodos,
  addTodo,
  updateTodoDueDate,
  updateTodoPriority,
  updateTodoCategory,
  updateTodoFields,
  updateTodoStatus,
  updateTodoBoardOrder,
  updateTodoStatusAndOrder,
  toggleTodoDone,
  deleteTodo,
  listDeletedTodos,
  restoreTodo,
  purgeTodo,
  purgeDeletedBefore,
  listCategories,
  addCategory,
  updateCategory,
  deleteCategory,
};
