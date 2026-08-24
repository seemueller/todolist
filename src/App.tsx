import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  addTodo,
  addCategory,
  deleteCategory,
  deleteTodo,
  listCategories,
  listTodos,
  toggleTodoDone,
  updateCategory,
  updateTodoCategory,
  updateTodoTitle,
} from "./db";
import { CATEGORY_COLORS, Category, Todo } from "./types";
import { APP_VERSION, CHANGELOG } from "./version";
import "./App.css";

const partyEmojis = ["🎉", "🥳", "✨", "💫", "🌟", "🎊", "🔥", "💥", "⭐", "🚀"];

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [burstEmoji, setBurstEmoji] = useState<{ id: number; emoji: string } | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const changelogRef = useRef<HTMLDivElement>(null);

  // Category state
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryColor, setEditingCategoryColor] = useState("");

  async function refresh() {
    try {
      const [items, cats] = await Promise.all([
        listTodos(categoryFilter),
        listCategories(),
      ]);
      setTodos(items);
      setCategories(cats);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [categoryFilter]);

  const closeChangelog = useCallback(() => setShowChangelog(false), []);

  useEffect(() => {
    if (!showChangelog) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChangelog();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showChangelog, closeChangelog]);

  useEffect(() => {
    if (!showCategoryManager) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCategoryManager();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showCategoryManager]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const todo = await addTodo(title, newCategoryId);
      setTodos((prev) => [todo, ...prev]);
      setNewTitle("");
      setNewCategoryId(null);
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

  async function handleUpdateTodoCategory(id: number, categoryId: number | null) {
    try {
      const updated = await updateTodoCategory(id, categoryId);
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  // ── Category CRUD ──────────────────────────────────────────────────────

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const cat = await addCategory(name, newCategoryColor);
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName("");
      setNewCategoryColor(CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  function startEditCategory(cat: Category) {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
    setEditingCategoryColor(cat.color);
  }

  async function commitEditCategory(id: number) {
    const name = editingCategoryName.trim();
    if (!name) return;
    try {
      const updated = await updateCategory(id, name, editingCategoryColor);
      setCategories((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setError(null);
    } catch (err) {
      setError(String(err));
    }
    setEditingCategoryId(null);
  }

  async function handleDeleteCategory(id: number) {
    try {
      await deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setTodos((prev) => prev.map((t) => (t.category_id === id ? { ...t, category_id: null, category_name: null, category_color: null } : t)));
      if (categoryFilter === id) setCategoryFilter(null);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  function closeCategoryManager() {
    setShowCategoryManager(false);
    setEditingCategoryId(null);
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
        <select
          className="category-select"
          value={newCategoryId ?? ""}
          onChange={(e) => setNewCategoryId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Keine Kategorie</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <button type="submit">Los geht's!</button>
      </form>

      {/* Category filter + manager */}
      <div className="filter-bar">
        <select
          className="category-select filter-select"
          value={categoryFilter ?? ""}
          onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Alle Kategorien</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button"
          onClick={() => setShowCategoryManager(true)}
          aria-label="Kategorien verwalten"
        >
          🏷️
        </button>
      </div>

      {error && <p className="error">⚠️ Fehler: {error}</p>}
      {loading && <p className="muted">Lade Aufgaben... 🌀</p>}

      {!loading && todos.length === 0 && !error && (
        <p className="muted">
          {categoryFilter !== null
            ? "Keine Aufgaben in dieser Kategorie."
            : "Noch keine Aufgaben. Lege deine erste an! 🎯"}
        </p>
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

            {todo.category_name && (
              <span
                className="category-badge"
                style={{ backgroundColor: todo.category_color || "rgba(167,139,250,0.4)" }}
              >
                {todo.category_name}
              </span>
            )}

            <select
              className="category-select todo-select"
              value={todo.category_id ?? ""}
              onChange={(e) =>
                handleUpdateTodoCategory(todo.id, e.target.value ? Number(e.target.value) : null)
              }
              aria-label="Kategorie auswählen"
            >
              <option value="">—</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
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

      {/* Changelog Modal */}
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

      {/* Category Manager Modal */}
      {showCategoryManager && (
        <div className="modal-overlay" onClick={closeCategoryManager}>
          <div className="category-modal" onClick={(e) => e.stopPropagation()}>
            <div className="changelog-header">
              <h2>Kategorien 🏷️</h2>
              <button type="button" className="close-btn" onClick={closeCategoryManager}>✕</button>
            </div>

            <form className="add-category-form" onSubmit={handleAddCategory}>
              <input
                type="text"
                placeholder="Neue Kategorie..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.currentTarget.value)}
              />
              <div className="color-picker">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${newCategoryColor === color ? "active" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewCategoryColor(color)}
                    aria-label={`Farbe ${color} auswählen`}
                  />
                ))}
              </div>
              <button type="submit">Hinzufügen</button>
            </form>

            <ul className="category-list">
              {categories.map((cat) => (
                <li key={cat.id} className="category-item">
                  {editingCategoryId === cat.id ? (
                    <>
                      <input
                        className="edit-input"
                        type="text"
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.currentTarget.value)}
                        onBlur={() => commitEditCategory(cat.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditCategory(cat.id);
                          if (e.key === "Escape") setEditingCategoryId(null);
                        }}
                      />
                      <div className="color-picker inline">
                        {CATEGORY_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`color-swatch ${editingCategoryColor === color ? "active" : ""}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setEditingCategoryColor(color)}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <span
                        className="category-color-dot"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="category-name">{cat.name}</span>
                    </>
                  )}

                  <div className="category-actions">
                    {editingCategoryId === cat.id ? (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => commitEditCategory(cat.id)}
                        aria-label="Speichern"
                      >
                        ✓
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startEditCategory(cat)}
                        aria-label="Bearbeiten"
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => handleDeleteCategory(cat.id)}
                      aria-label="Löschen"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
