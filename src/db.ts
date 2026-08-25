import { Priority, Todo, TodoRow, TodoStatus, Category, CategoryRow, fromRow, fromCategoryRow } from "./types";

// ── In-memory + localStorage fallback ────────────────────────────────────

const TODOS_KEY = "todolist_todos";
const CATEGORIES_KEY = "todolist_categories";

function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function now(): string {
  return new Date().toISOString();
}

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(TODOS_KEY);
    if (!raw) return [];
    return migrateTodos(JSON.parse(raw));
  } catch {
    return [];
  }
}

function migrateTodos(todos: any[]): Todo[] {
  return todos.map((todo) => {
    if (todo.status) return todo;
    const status: TodoStatus = todo.done ? "done" : "todo";
    return { ...todo, status, done: status === "done" };
  });
}

function saveTodos(todos: Todo[]): void {
  localStorage.setItem(TODOS_KEY, JSON.stringify(todos));
}

function loadCategories(): Category[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveCategories(categories: Category[]): void {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

// ── Browser DB implementation ────────────────────────────────────────────

function selectTodos(categoryId?: number | null): Todo[] {
  let todos = loadTodos();
  if (categoryId !== undefined && categoryId !== null) {
    todos = todos.filter((t) => t.category_id === categoryId);
  }
  return todos
    .slice()
    .sort((a, b) => {
      const dateCmp = b.created_at.localeCompare(a.created_at);
      if (dateCmp !== 0) return dateCmp;
      return b.id - a.id;
    });
}

function findCategory(id: number): Category | undefined {
  return loadCategories().find((c) => c.id === id);
}

// ── Todos ────────────────────────────────────────────────────────────────

export function listTodos(categoryId?: number | null): Promise<Todo[]> {
  return Promise.resolve(selectTodos(categoryId));
}

export function addTodo(
  title: string,
  priority: Priority,
  dueDate: string | null,
  categoryId?: number | null
): Promise<Todo> {
  const todos = loadTodos();
  const todo: Todo = {
    id: generateId(),
    title,
    done: false,
    status: "todo",
    priority,
    created_at: now(),
    due_date: dueDate,
    category_id: categoryId ?? null,
    category_name: categoryId ? findCategory(categoryId)?.name ?? null : null,
    category_color: categoryId ? findCategory(categoryId)?.color ?? null : null,
  };
  todos.unshift(todo);
  saveTodos(todos);
  return Promise.resolve(todo);
}

export function updateTodoTitle(id: number, title: string): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], title };
  saveTodos(todos);
  return Promise.resolve(todos[idx]);
}

export function updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], due_date: dueDate };
  saveTodos(todos);
  return Promise.resolve(todos[idx]);
}

export function updateTodoPriority(id: number, priority: Priority): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], priority };
  saveTodos(todos);
  return Promise.resolve(todos[idx]);
}

export function updateTodoCategory(id: number, categoryId: number | null): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  const cat = categoryId ? findCategory(categoryId) : null;
  todos[idx] = {
    ...todos[idx],
    category_id: categoryId,
    category_name: cat?.name ?? null,
    category_color: cat?.color ?? null,
  };
  saveTodos(todos);
  return Promise.resolve(todos[idx]);
}

export function updateTodoStatus(id: number, status: TodoStatus): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  todos[idx] = { ...todos[idx], status, done: status === "done" };
  saveTodos(todos);
  return Promise.resolve(todos[idx]);
}

export function toggleTodoDone(id: number, done: boolean): Promise<Todo> {
  const todos = loadTodos();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Todo ${id} not found`);
  const status: TodoStatus = done ? "done" : "todo";
  todos[idx] = { ...todos[idx], done, status };
  saveTodos(todos);
  return Promise.resolve(todos[idx]);
}

export function deleteTodo(id: number): Promise<number> {
  const todos = loadTodos().filter((t) => t.id !== id);
  saveTodos(todos);
  return Promise.resolve(id);
}

// ── Categories ───────────────────────────────────────────────────────────

export function listCategories(): Promise<Category[]> {
  return Promise.resolve(
    loadCategories().slice().sort((a, b) => a.name.localeCompare(b.name))
  );
}

export function addCategory(name: string, color: string): Promise<Category> {
  const categories = loadCategories();
  const cat: Category = {
    id: generateId(),
    name: name.trim(),
    color,
    created_at: now(),
  };
  categories.push(cat);
  saveCategories(categories);

  // Update existing todos that reference this category
  const todos = loadTodos();
  for (const todo of todos) {
    if (todo.category_id === cat.id) {
      todo.category_name = cat.name;
      todo.category_color = cat.color;
    }
  }
  saveTodos(todos);

  return Promise.resolve(cat);
}

export function updateCategory(id: number, name: string, color: string): Promise<Category> {
  const categories = loadCategories();
  const idx = categories.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Category ${id} not found`);
  categories[idx] = { ...categories[idx], name: name.trim(), color };
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

export function deleteCategory(id: number): Promise<number> {
  const categories = loadCategories().filter((c) => c.id !== id);
  saveCategories(categories);
  return Promise.resolve(id);
}

// Type exports for test compatibility
export type { TodoRow, CategoryRow };
export { fromRow, fromCategoryRow };
