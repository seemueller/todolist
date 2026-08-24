import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { addTodo, deleteTodo, listTodos, toggleTodoDone, updateTodoPriority, updateTodoTitle } from "./db";
import { Priority, Todo } from "./types";
import { APP_VERSION, CHANGELOG } from "./version";
import "./App.css";

const partyEmojis = ["🎉", "🥳", "✨", "💫", "🌟", "🎊", "🔥", "💥", "⭐", "🚀"];

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [burstEmoji, setBurstEmoji] = useState<{ id: number; emoji: string } | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "done">("all");
  const [searchQuery, setSearchQuery] = useState("");
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
      const todo = await addTodo(title, newPriority);
      setTodos((prev) => [todo, ...prev]);
      setNewTitle("");
      setNewPriority("medium");
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

  async function handlePriorityChange(id: number, priority: Priority) {
    try {
      const updated = await updateTodoPriority(id, priority);
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
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

  const filteredTodos = todos.filter((todo) => {
    if (statusFilter === "open" && todo.done) return false;
    if (statusFilter === "done" && !todo.done) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!todo.title.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  const hasActiveFilter = statusFilter !== "all" || searchQuery;

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
        <select
          className="priority-select"
          value={newPriority}
          onChange={(e) => setNewPriority(e.currentTarget.value as Priority)}
          aria-label="Priorität"
        >
          <option value="low">Niedrig</option>
          <option value="medium">Mittel</option>
          <option value="high">Hoch</option>
        </select>
        <button type="submit">Los geht's!</button>
      </form>

      <div className="filter-bar">
        <div className="status-filter">
          <button
            type="button"
            className={statusFilter === "all" ? "active" : ""}
            onClick={() => setStatusFilter("all")}
          >
            Alle
          </button>
          <button
            type="button"
            className={statusFilter === "open" ? "active" : ""}
            onClick={() => setStatusFilter("open")}
          >
            Offen
          </button>
          <button
            type="button"
            className={statusFilter === "done" ? "active" : ""}
            onClick={() => setStatusFilter("done")}
          >
            Erledigt
          </button>
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="Suche..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />
      </div>

      {hasActiveFilter && (
        <div className="active-filters">
          <span className="filter-label">
            {statusFilter === "all"
              ? "Alle"
              : statusFilter === "open"
                ? "Offen"
                : "Erledigt"}
            {searchQuery ? ` • Suche: "${searchQuery}"` : ""}
          </span>
          <button
            type="button"
            className="clear-filters"
            onClick={() => {
              setStatusFilter("all");
              setSearchQuery("");
            }}
          >
            Zurücksetzen ✕
          </button>
        </div>
      )}

      {error && <p className="error">⚠️ Fehler: {error}</p>}
      {loading && <p className="muted">Lade Aufgaben... 🌀</p>}

      {!loading && todos.length === 0 && !error && (
        <p className="muted">Noch keine Aufgaben. Lege deine erste an! 🎯</p>
      )}

      {!loading && hasActiveFilter && filteredTodos.length === 0 && (
        <p className="muted">Keine Aufgaben gefunden 🔍</p>
      )}

      <ul className="todo-list">
        {filteredTodos.map((todo) => (
          <li key={todo.id} className={`${todo.done ? "done" : ""} priority-${todo.priority}`}>
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

            <span className={`priority-dot priority-dot-${todo.priority}`} title={`Priorität: ${todo.priority === "low" ? "niedrig" : todo.priority === "medium" ? "mittel" : "hoch"}`} />

            <select
              className="priority-select-inline"
              value={todo.priority}
              onChange={(e) => handlePriorityChange(todo.id, e.currentTarget.value as Priority)}
              aria-label="Priorität ändern"
            >
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
            </select>

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
          {hasActiveFilter
            ? `${filteredTodos.length} von ${todos.length} Aufgabe(n) angezeigt`
            : remaining === 0
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
