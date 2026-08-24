import { FormEvent, useEffect, useState } from "react";
import { addTodo, deleteTodo, listTodos, toggleTodoDone, updateTodoTitle } from "./db";
import { Todo } from "./types";
import "./App.css";

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  async function refresh() {
    try {
      const items = await listTodos();
      setTodos(items);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const todo = await addTodo(title);
      setTodos((prev) => [todo, ...prev]);
      setNewTitle("");
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleToggle(todo: Todo) {
    try {
      const updated = await toggleTodoDone(todo.id, !todo.done);
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
  }

  async function commitEdit(id: number) {
    const title = editingTitle.trim();
    if (title) {
      try {
        const updated = await updateTodoTitle(id, title);
        setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setError(null);
      } catch (err) {
        setError(String(err));
      }
    }
    setEditingId(null);
  }

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <main className="app">
      <h1>TodoList</h1>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Neue Aufgabe hinzufügen..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.currentTarget.value)}
        />
        <button type="submit">Hinzufügen</button>
      </form>

      {error && <p className="error">Fehler: {error}</p>}
      {loading && <p className="muted">Lade Aufgaben...</p>}

      {!loading && todos.length === 0 && !error && (
        <p className="muted">Noch keine Aufgaben. Lege deine erste Aufgabe an!</p>
      )}

      <ul className="todo-list">
        {todos.map((todo) => (
          <li key={todo.id} className={todo.done ? "done" : ""}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => handleToggle(todo)}
              aria-label={`${todo.title} als erledigt markieren`}
            />
            {editingId === todo.id ? (
              <input
                className="edit-input"
                type="text"
                value={editingTitle}
                autoFocus
                onChange={(e) => setEditingTitle(e.currentTarget.value)}
                onBlur={() => commitEdit(todo.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(todo.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <span className="title" onDoubleClick={() => startEdit(todo)}>
                {todo.title}
              </span>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={() => startEdit(todo)}
              aria-label="Bearbeiten"
            >
              ✎
            </button>
            <button
              type="button"
              className="icon-button danger"
              onClick={() => handleDelete(todo.id)}
              aria-label="Löschen"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {!loading && todos.length > 0 && (
        <p className="footer muted">
          {remaining} von {todos.length} Aufgabe(n) offen
        </p>
      )}
    </main>
  );
}

export default App;
