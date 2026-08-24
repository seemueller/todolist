import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { addTodo, deleteTodo, listTodos, toggleTodoDone, updateTodoTitle } from "./db";
import { Todo } from "./types";
import { APP_VERSION, CHANGELOG } from "./version";
import "./App.css";

const partyEmojis = ["🎉", "🥳", "✨", "💫", "🌟", "🎊", "🔥", "💥", "⭐", "🚀"];

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [burstEmoji, setBurstEmoji] = useState<{ id: number; emoji: string } | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const changelogRef = useRef<HTMLDivElement>(null);

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

  const closeChangelog = useCallback(() => setShowChangelog(false), []);

  useEffect(() => {
    if (!showChangelog) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChangelog();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showChangelog, closeChangelog]);

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
    if (!todo.done) {
      const randomEmoji = partyEmojis[Math.floor(Math.random() * partyEmojis.length)];
      setBurstEmoji({ id: todo.id, emoji: randomEmoji });
      setTimeout(() => setBurstEmoji(null), 800);
    }
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
      <h1>TodoList ✨</h1>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Was steht an? 🚀"
          value={newTitle}
          onChange={(e) => setNewTitle(e.currentTarget.value)}
        />
        <button type="submit">Los geht's!</button>
      </form>

      {error && <p className="error">⚠️ Fehler: {error}</p>}
      {loading && <p className="muted">Lade Aufgaben... 🌀</p>}

      {!loading && todos.length === 0 && !error && (
        <p className="muted">Noch keine Aufgaben. Lege deine erste an! 🎯</p>
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
              ✏️
            </button>
            <button
              type="button"
              className="icon-button danger"
              onClick={() => handleDelete(todo.id)}
              aria-label="Löschen"
            >
              🗑️
            </button>

            {burstEmoji?.id === todo.id && (
              <span
                style={{
                  position: "absolute",
                  right: "1.5rem",
                  top: "-1rem",
                  fontSize: "1.5rem",
                  animation: "emoji-burst 0.8s ease-out forwards",
                  pointerEvents: "none",
                }}
              >
                {burstEmoji.emoji}
              </span>
            )}
          </li>
        ))}
      </ul>

      {!loading && todos.length > 0 && (
        <p className="footer">
          {remaining === 0
            ? "Alles erledigt! 🎉"
            : `${remaining} von ${todos.length} Aufgabe(n) offen 🎯`}
        </p>
      )}

      <footer className="app-footer">
        <span className="version">v{APP_VERSION}</span>
        <button
          type="button"
          className="changelog-btn"
          onClick={() => setShowChangelog(true)}
        >
          Changelog
        </button>
      </footer>

      {showChangelog && (
        <div className="modal-overlay" onClick={closeChangelog}>
          <div className="changelog-modal" ref={changelogRef} onClick={(e) => e.stopPropagation()}>
            <div className="changelog-header">
              <h2>Changelog</h2>
              <button type="button" className="close-btn" onClick={closeChangelog}>✕</button>
            </div>
            <div className="changelog-body">
              {CHANGELOG.map((entry) => (
                <div key={entry.version} className="changelog-entry">
                  <div className="changelog-version">
                    <span className="version-badge">{entry.version}</span>
                    <span className="version-date">{entry.date}</span>
                  </div>
                  <ul>
                    {entry.changes.map((change, i) => (
                      <li key={i}>{change}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
