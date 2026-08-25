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
  updateTodoDueDate,
  updateTodoPriority,
  updateTodoTitle,
} from "./db";
import { CATEGORY_COLORS, Category, Priority, Todo } from "./types";
import { APP_VERSION, CHANGELOG } from "./version";
import { CustomTitleBar } from "./CustomTitleBar";
import "./App.css";

const partyEmojis = ["🎉", "🥳", "✨", "💫", "🌟", "🎊", "🔥", "💥", "⭐", "🚀"];

type DueDateFilter = "all" | "today" | "overdue" | "upcoming" | "none";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dueDate === todayStr();
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dueDate < todayStr();
}

function isDueUpcoming(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = todayStr();
  return dueDate > today;
}

function formatDate(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateMidnight = new Date(date);
  dateMidnight.setHours(0, 0, 0, 0);

  if (dateMidnight.getTime() === today.getTime()) return "Heute";
  if (dateMidnight.getTime() === tomorrow.getTime()) return "Morgen";

  return `${d}.${m}.`;
}

const filterLabels: Record<DueDateFilter, string> = {
  all: "Alle",
  today: "Heute",
  overdue: "Überfällig",
  upcoming: "Künftig",
  none: "Ohne Datum",
};

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDueDate, setEditingDueDate] = useState("");
  const [burstEmoji, setBurstEmoji] = useState<{ id: number; emoji: string } | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "done">("all");
  const [searchQuery, setSearchQuery] = useState("");
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
        listTodos(),
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
      const dueDate = newDueDate || null;
      const todo = await addTodo(title, newPriority, dueDate, newCategoryId);
      setTodos((prev) => [todo, ...prev]);
      setNewTitle("");
      setNewPriority("medium");
      setNewDueDate("");
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
    setEditingDueDate(todo.due_date || "");
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
    try {
      const dueDate = editingDueDate || null;
      const updated = await updateTodoDueDate(id, dueDate);
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setError(null);
    } catch (err) {
      setError(String(err));
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
  const filteredTodos = todos.filter((todo) => {
    if (dueDateFilter === "today" && !isDueToday(todo.due_date)) return false;
    if (dueDateFilter === "overdue" && (!isOverdue(todo.due_date) || todo.done)) return false;
    if (dueDateFilter === "upcoming" && !isDueUpcoming(todo.due_date)) return false;
    if (dueDateFilter === "none" && todo.due_date) return false;
    if (statusFilter === "open" && todo.done) return false;
    if (statusFilter === "done" && !todo.done) return false;
    if (categoryFilter !== null && todo.category_id !== categoryFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!todo.title.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  const hasActiveFilter = dueDateFilter !== "all" || statusFilter !== "all" || searchQuery || categoryFilter !== null;

  return (
    <div className="app-shell">
      <CustomTitleBar />

      <main className="app">
        <header className="app-header">
          <h1>TodoList</h1>
          <p className="app-subtitle">Behalte den Überblick</p>
        </header>

        <form className="add-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Was steht an?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.currentTarget.value)}
          />
          <input
            type="date"
            className="date-input"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.currentTarget.value)}
            title="Fälligkeitsdatum (optional)"
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
          <button type="submit" aria-label="Aufgabe hinzufügen">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
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
        </form>

        <div className="filter-bar">
          {(Object.keys(filterLabels) as DueDateFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`filter-btn ${dueDateFilter === key ? "active" : ""}`}
              onClick={() => setDueDateFilter(key)}
            >
              {filterLabels[key]}
            </button>
          ))}
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

        {hasActiveFilter && (
          <div className="active-filters">
            <span className="filter-label">
              {filterLabels[dueDateFilter]}
              {statusFilter !== "all"
                ? ` • ${statusFilter === "open" ? "Offen" : "Erledigt"}`
                : ""}
              {categoryFilter !== null
                ? ` • ${categories.find((c) => c.id === categoryFilter)?.name || "Kategorie"}`
                : ""}
              {searchQuery ? ` • Suche: "${searchQuery}"` : ""}
            </span>
            <button
              type="button"
              className="clear-filters"
              onClick={() => {
                setDueDateFilter("all");
                setStatusFilter("all");
                setSearchQuery("");
                setCategoryFilter(null);
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
          {filteredTodos.map((todo) => {
            const overdue = !todo.done && isOverdue(todo.due_date);
            const today = isDueToday(todo.due_date);

            return (
              <li
                key={todo.id}
                className={[
                  todo.done ? "done" : "",
                  overdue ? "overdue" : "",
                  today && !todo.done ? "due-today" : "",
                  `priority-${todo.priority}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  className="checkbox"
                  onClick={() => handleToggle(todo)}
                  aria-label={`${todo.title} als erledigt markieren`}
                >
                  {todo.done && (
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <path d="M2 7l4 4 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </button>

                {editingId === todo.id ? (
                  <div className="edit-row">
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
                    <input
                      type="date"
                      className="edit-date-input"
                      value={editingDueDate}
                      onChange={(e) => setEditingDueDate(e.currentTarget.value)}
                      onBlur={() => commitEdit(todo.id)}
                    />
                  </div>
                ) : (
                  <span className="title" onDoubleClick={() => startEdit(todo)}>
                    {todo.title}
                  </span>
                )}

                {editingId !== todo.id && todo.due_date && (
                  <span className={`due-date-badge ${overdue ? "overdue" : ""} ${today && !todo.done ? "today" : ""}`}>
                    {formatDate(todo.due_date)}
                  </span>
                )}

                {editingId !== todo.id && (
                  <span className={`priority-dot priority-dot-${todo.priority}`} title={`Priorität: ${todo.priority === "low" ? "niedrig" : todo.priority === "medium" ? "mittel" : "hoch"}`} />
                )}

                {editingId !== todo.id && (
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

                <div className="todo-actions">
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => startEdit(todo)}
                    aria-label="Bearbeiten"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <path d="M9.5 2.5l2 2M2 12l.5-2.5L9.5 3l2 2L5 11.5 2 12z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="action-btn danger"
                    onClick={() => handleDelete(todo.id)}
                    aria-label="Löschen"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <path d="M3 4h8M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M6 7v4M8 7v4M4 4l.5 7a1 1 0 001 1h3a1 1 0 001-1L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </button>
                </div>

                {burstEmoji?.id === todo.id && (
                  <span
                    className="emoji-burst"
                    style={{
                      animation: "emoji-burst 0.8s ease-out forwards",
                    }}
                  >
                    {burstEmoji.emoji}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {!loading && todos.length > 0 && (
          <p className="footer">
            {hasActiveFilter
              ? `${filteredTodos.length} von ${todos.length} Aufgabe(n) angezeigt`
              : remaining === 0
                ? "Alles erledigt!"
                : `${remaining} von ${todos.length} Aufgabe(n) offen`}
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
      </main>

      {/* Changelog Modal */}
      {showChangelog && (
        <div className="modal-overlay" onClick={closeChangelog}>
          <div className="changelog-modal" ref={changelogRef} onClick={(e) => e.stopPropagation()}>
            <div className="changelog-header">
              <h2>Changelog</h2>
              <button type="button" className="close-btn" onClick={closeChangelog}>
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
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
    </div>
  );
}

export default App;
