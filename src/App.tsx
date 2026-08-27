import { invoke, isTauri } from "@tauri-apps/api/core";
import { DragEvent, FormEvent, KeyboardEvent, ReactNode, useCallback, useEffect, useState } from "react";
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
  updateTodoStatus,
  updateTodoTitle,
} from "./db";
import { installDebugInterceptor } from "./debug";
import { CATEGORY_COLORS, Category, Priority, Todo, TodoStatus } from "./types";
import { APP_VERSION, CHANGELOG } from "./version";
import { CustomTitleBar } from "./CustomTitleBar";
import { DebugLogPanel } from "./DebugLogPanel";
import {
  BoardViewIcon,
  CategoryBadge,
  CategorySelect,
  CheckIcon,
  ChevronLeftIcon,
  ColorPicker,
  DueDateBadge,
  FilterChip,
  IconButton,
  InlineEditInput,
  LaneDoneIcon,
  LaneProgressIcon,
  LaneTodoIcon,
  ListViewIcon,
  Modal,
  PencilIcon,
  PlusIcon,
  PrioritySelect,
  TagIcon,
  TrashIcon,
  UpdateIcon,
} from "./ui";
import "./App.css";

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
  const [burstId, setBurstId] = useState<number | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [checkUpdate, setCheckUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  // Rueckmeldung der Update-Pruefung: Fehler oder "kein Update". Ohne diese
  // Anzeige laeuft der Knopf ins Leere, wenn der Endpunkt nicht erreichbar ist.
  const [updateStatus, setUpdateStatus] = useState<{ kind: "info" | "error"; text: string } | null>(
    null,
  );
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "done">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Category state
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryColor, setEditingCategoryColor] = useState("");

  // Kanban view state
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [draggedTodoId, setDraggedTodoId] = useState<number | null>(null);
  const [dragOverLane, setDragOverLane] = useState<TodoStatus | null>(null);

  // Debug log panel (Ctrl+Shift+L)
  const [showDebug, setShowDebug] = useState(false);
  const closeDebug = useCallback(() => setShowDebug(false), []);

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

  useEffect(() => {
    installDebugInterceptor();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        setShowDebug((d) => !d);
      }
    }
    document.addEventListener("keydown", handleKey as any);
    return () => document.removeEventListener("keydown", handleKey as any);
  }, []);

  const closeChangelog = useCallback(() => setShowChangelog(false), []);

  useEffect(() => {
    if (!checkUpdate) return;
    setCheckingUpdate(true);
    setUpdateStatus(null);
    (async () => {
      if (!isTauri()) {
        setUpdateStatus({
          kind: "info",
          text: "Updates stehen nur in der installierten App zur Verfügung, nicht im Browser.",
        });
        setCheckingUpdate(false);
        setCheckUpdate(false);
        return;
      }
      try {
        const result = await invoke<{ update_available: boolean; version?: string }>(
          "check_for_update",
        );
        if (result.update_available && result.version) {
          setUpdateAvailable(result.version);
        } else {
          setUpdateStatus({
            kind: "info",
            text: `Version ${APP_VERSION} ist aktuell. Kein Update verfügbar.`,
          });
        }
      } catch (err) {
        setUpdateStatus({ kind: "error", text: `Update-Prüfung fehlgeschlagen: ${String(err)}` });
      } finally {
        setCheckingUpdate(false);
        setCheckUpdate(false);
      }
    })();
  }, [checkUpdate]);

  const handleInstallUpdate = useCallback(async () => {
    setInstallingUpdate(true);
    try {
      await invoke("install_update");
      setUpdateAvailable(null);
      setUpdateStatus({
        kind: "info",
        text: "Update installiert. Die Anwendung startet neu, um die neue Version zu laden.",
      });
    } catch (err) {
      setUpdateAvailable(null);
      setUpdateStatus({ kind: "error", text: `Installation fehlgeschlagen: ${String(err)}` });
    } finally {
      setInstallingUpdate(false);
    }
  }, []);

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
      setBurstId(todo.id);
      setTimeout(() => setBurstId(null), 800);
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

  // ── Kanban drag-and-drop ──────────────────────────────────────────────

  const kanbanLanes: { status: TodoStatus; label: string; icon: ReactNode; color: string }[] = [
    { status: "todo", label: "Zu tun", icon: <LaneTodoIcon />, color: "#7cc3f7" },
    { status: "in_progress", label: "In Bearbeitung", icon: <LaneProgressIcon />, color: "#ffd43b" },
    { status: "done", label: "Erledigt", icon: <LaneDoneIcon />, color: "#6fcf7f" },
  ];

  async function handleDropOnLane(todoId: number, targetStatus: TodoStatus) {
    try {
      const updated = await updateTodoStatus(todoId, targetStatus);
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (targetStatus === "done") {
        setBurstId(todoId);
        setTimeout(() => setBurstId(null), 800);
      }
      setError(null);
      console.log(`drag: Aufgabe ${todoId} nach "${targetStatus}" verschoben`);
    } catch (err) {
      console.error(`drag: Verschieben von Aufgabe ${todoId} fehlgeschlagen:`, String(err));
      setError(String(err));
    } finally {
      setDraggedTodoId(null);
      setDragOverLane(null);
    }
  }

  function handleDragStart(e: DragEvent, todoId: number) {
    setDraggedTodoId(todoId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(todoId));
    console.log(`drag: dragstart für Aufgabe ${todoId}`);
  }

  function handleChildDragStart(e: DragEvent) {
    e.stopPropagation();
  }

  function handleLaneDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleLaneDragLeave(e: DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverLane(null);
  }

  function handleLaneDrop(e: DragEvent, targetStatus: TodoStatus) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const todoId = Number(raw);
    console.log(`drag: drop auf "${targetStatus}", dataTransfer="${raw}"`);
    if (todoId) {
      handleDropOnLane(todoId, targetStatus);
    } else {
      console.warn(`drag: drop ohne verwertbare Aufgaben-ID (dataTransfer="${raw}")`);
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

  const closeCategoryManager = useCallback(() => {
    setShowCategoryManager(false);
    setEditingCategoryId(null);
  }, []);

  const remaining = todos.filter((t) => !t.done).length;
  const headerCount = todos.length === 0 ? "Keine Aufgaben" : `${remaining} offen`;
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
          <p className="app-subtitle">{headerCount}</p>
          <button
            type="button"
            className={`view-toggle ${viewMode === "kanban" ? "kanban-active" : ""}`}
            onClick={() => setViewMode((v) => (v === "list" ? "kanban" : "list"))}
            aria-label={viewMode === "list" ? "Zum Kanban-Brett wechseln" : "Zur Listenansicht wechseln"}
            title={viewMode === "list" ? "Kanban-Brett" : "Liste"}
          >
            {viewMode === "list" ? <BoardViewIcon /> : <ListViewIcon />}
          </button>
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
          <CategorySelect
            categories={categories}
            value={newCategoryId}
            onValueChange={setNewCategoryId}
            placeholderLabel="Keine Kategorie"
          />
          <PrioritySelect value={newPriority} onValueChange={setNewPriority} aria-label="Priorität" />
          <button type="submit" aria-label="Aufgabe hinzufügen">
            <PlusIcon />
          </button>
        </form>

        {viewMode === "list" && (
          <>
            <div className="filter-bar">
          <div className="filter-row">
            {(Object.keys(filterLabels) as DueDateFilter[]).map((key) => (
              <FilterChip
                key={key}
                active={dueDateFilter === key}
                onClick={() => setDueDateFilter(key)}
              >
                {filterLabels[key]}
              </FilterChip>
            ))}
            <div className="status-filter">
              <FilterChip variant="segment" active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                Alle
              </FilterChip>
              <FilterChip variant="segment" active={statusFilter === "open"} onClick={() => setStatusFilter("open")}>
                Offen
              </FilterChip>
              <FilterChip variant="segment" active={statusFilter === "done"} onClick={() => setStatusFilter("done")}>
                Erledigt
              </FilterChip>
            </div>
          </div>
          <div className="filter-row">
            <input
              type="text"
              className="search-input"
              placeholder="Suche..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <CategorySelect
              className="filter-select"
              categories={categories}
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              placeholderLabel="Alle Kategorien"
            />
            <IconButton
              variant="icon"
              onClick={() => setShowCategoryManager(true)}
              aria-label="Kategorien verwalten"
            >
              <TagIcon />
              Kategorien
            </IconButton>
          </div>
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
              Zurücksetzen
            </button>
          </div>
        )}
        {error && <p className="error">Fehler: {error}</p>}
        {loading && <p className="muted">Lade Aufgaben …</p>}

        {!loading && todos.length === 0 && !error && (
          <p className="muted">Noch keine Aufgaben. Lege deine erste an — Titel eintippen, Enter drücken.</p>
        )}

        {!loading && hasActiveFilter && filteredTodos.length === 0 && (
          <p className="muted">Keine Aufgaben gefunden. Setz den Filter auf „Alle“ zurück.</p>
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
                <IconButton
                  variant="checkbox"
                  onClick={() => handleToggle(todo)}
                  aria-label={`${todo.title} als erledigt markieren`}
                >
                  {todo.done && <CheckIcon />}
                </IconButton>

                {editingId === todo.id ? (
                  <div className="edit-row">
                    <InlineEditInput
                      value={editingTitle}
                      autoFocus
                      onValueChange={setEditingTitle}
                      onCommit={() => commitEdit(todo.id)}
                      onCancel={() => setEditingId(null)}
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
                  <DueDateBadge overdue={overdue} today={today && !todo.done}>
                    {formatDate(todo.due_date)}
                  </DueDateBadge>
                )}

                {editingId !== todo.id && (
                  <PrioritySelect
                    variant="inline"
                    value={todo.priority}
                    onValueChange={(priority) => handlePriorityChange(todo.id, priority)}
                    aria-label="Priorität ändern"
                  />
                )}

                {todo.category_name && (
                  <CategoryBadge color={todo.category_color}>{todo.category_name}</CategoryBadge>
                )}

                <CategorySelect
                  className="todo-select"
                  categories={categories}
                  value={todo.category_id}
                  onValueChange={(categoryId) => handleUpdateTodoCategory(todo.id, categoryId)}
                  placeholderLabel="—"
                  aria-label="Kategorie auswählen"
                />

                <div className="todo-actions">
                  <IconButton variant="action" onClick={() => startEdit(todo)} aria-label="Bearbeiten">
                    <PencilIcon />
                  </IconButton>
                  <IconButton
                    variant="action"
                    danger
                    onClick={() => handleDelete(todo.id)}
                    aria-label="Löschen"
                  >
                    <TrashIcon />
                  </IconButton>
                </div>

                {burstId === todo.id && (
                  <span className="done-flash" aria-hidden="true">
                    <CheckIcon />
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
          </>
        )}

        {viewMode === "kanban" && (
          <div className="kanban-wrapper">
            {kanbanLanes.map((lane) => {
              const laneTodos = todos
                .filter((t) => t.status === lane.status)
                .sort((a, b) => {
                  const priorityOrder = { high: 0, medium: 1, low: 2 };
                  const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                  if (pDiff !== 0) return pDiff;
                  return b.created_at.localeCompare(a.created_at);
                });

              return (
                <div
                  key={lane.status}
                  className={`kanban-lane ${dragOverLane === lane.status ? "drag-over" : ""}`}
                  onDragOver={(e) => {
                    handleLaneDragOver(e);
                    setDragOverLane(lane.status);
                  }}
                  onDragLeave={handleLaneDragLeave}
                  onDrop={(e) => handleLaneDrop(e, lane.status)}
                >
                  <div className="kanban-lane-header" style={{ backgroundColor: lane.color }}>
                    <span className="kanban-lane-icon">{lane.icon}</span>
                    <h3>{lane.label}</h3>
                    <span className="kanban-count">{laneTodos.length}</span>
                  </div>

                  <div className="kanban-lane-body">
                    {laneTodos.map((todo) => {
                      const overdue = !todo.done && isOverdue(todo.due_date);
                      const today = isDueToday(todo.due_date);

                      return (
                        <div
                          key={todo.id}
                          className={`kanban-card priority-${todo.priority} ${todo.done ? "done" : ""} ${overdue ? "overdue" : ""} ${today && !todo.done ? "due-today" : ""} ${
                            draggedTodoId === todo.id ? "dragging" : ""
                          }`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, todo.id)}
                        >
                          <span className="kanban-card-title">{todo.title}</span>

                          <div className="kanban-card-meta">
                            {todo.due_date && (
                              <DueDateBadge variant="kanban" overdue={overdue} today={today && !todo.done}>
                                {formatDate(todo.due_date)}
                              </DueDateBadge>
                            )}
                            {todo.category_name && (
                              <CategoryBadge variant="kanban" color={todo.category_color}>
                                {todo.category_name}
                              </CategoryBadge>
                            )}
                          </div>

                          <div className="kanban-card-actions">
                              <IconButton
                                variant="kanban"
                                onDragStart={handleChildDragStart}
                                onClick={() => handleToggle(todo)}
                                aria-label={`${todo.title} Status ändern`}
                                title={todo.status === "done" ? "Zurück zu \"Zu tun\"" : "Als erledigt markieren"}
                              >
                                {todo.status === "done" ? <ChevronLeftIcon /> : <CheckIcon />}
                              </IconButton>
                              <IconButton
                                variant="kanban"
                                danger
                                onDragStart={handleChildDragStart}
                                onClick={() => handleDelete(todo.id)}
                                aria-label="Löschen"
                              >
                                <TrashIcon />
                              </IconButton>
                            </div>
                        </div>
                      );
                    })}

                    {laneTodos.length === 0 && (
                      <div className="kanban-lane-empty">
                        Keine Aufgaben
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="app-footer">
          <button
            type="button"
            className="update-btn"
            onClick={() => setCheckUpdate(true)}
            disabled={checkingUpdate}
            aria-label="Nach Updates suchen"
          >
            <UpdateIcon />
            {checkingUpdate ? "Prüfe..." : "Update"}
          </button>
          <span className="version">v{APP_VERSION}</span>
          <button
            type="button"
            className="debug-btn"
            onClick={() => setShowDebug(true)}
            aria-label="Debug Logs"
          >
            Debug
          </button>
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
        <Modal variant="changelog" title="Changelog" onClose={closeChangelog} closeLabel="Schließen">
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
        </Modal>
      )}

      {/* Update Modal */}
      {updateAvailable && (
        <Modal variant="changelog" title="Update verfügbar" onClose={() => setUpdateAvailable(null)} closeLabel="Schließen">
          <div className="update-modal-body">
            <p>Version <strong>{updateAvailable}</strong> ist verfügbar.</p>
            <button
              type="button"
              className="update-install-btn"
              onClick={handleInstallUpdate}
              disabled={installingUpdate}
            >
              {installingUpdate ? "Wird installiert..." : "Herunterladen & installieren"}
            </button>
          </div>
        </Modal>
      )}

      {/* Rueckmeldung der Update-Pruefung */}
      {updateStatus && (
        <Modal
          variant="changelog"
          title={updateStatus.kind === "error" ? "Update fehlgeschlagen" : "Update"}
          onClose={() => setUpdateStatus(null)}
          closeLabel="Schließen"
        >
          <div className="update-modal-body">
            <p className={updateStatus.kind === "error" ? "update-status-error" : undefined}>
              {updateStatus.text}
            </p>
          </div>
        </Modal>
      )}

      {/* Category Manager Modal */}
      {showCategoryManager && (
        <Modal variant="category" title="Kategorien" onClose={closeCategoryManager} closeLabel="Schließen">

            <form className="add-category-form" onSubmit={handleAddCategory}>
              <input
                type="text"
                placeholder="Neue Kategorie..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.currentTarget.value)}
              />
              <ColorPicker
                value={newCategoryColor}
                onSelect={setNewCategoryColor}
                swatchLabel={(color) => `Farbe ${color} auswählen`}
              />
              <button type="submit">Hinzufügen</button>
            </form>

            <ul className="category-list">
              {categories.map((cat) => (
                <li key={cat.id} className="category-item">
                  {editingCategoryId === cat.id ? (
                    <>
                      <InlineEditInput
                        value={editingCategoryName}
                        onValueChange={setEditingCategoryName}
                        onCommit={() => commitEditCategory(cat.id)}
                        onCancel={() => setEditingCategoryId(null)}
                      />
                      <ColorPicker
                        inline
                        value={editingCategoryColor}
                        onSelect={setEditingCategoryColor}
                        swatchLabel={(color) => `Farbe ${color} auswählen`}
                      />
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
                      <IconButton
                        variant="icon"
                        onClick={() => commitEditCategory(cat.id)}
                        aria-label="Speichern"
                      >
                        <CheckIcon />
                      </IconButton>
                    ) : (
                      <IconButton
                        variant="icon"
                        onClick={() => startEditCategory(cat)}
                        aria-label="Bearbeiten"
                      >
                        <PencilIcon />
                      </IconButton>
                    )}
                    <IconButton
                      variant="icon"
                      danger
                      onClick={() => handleDeleteCategory(cat.id)}
                      aria-label="Löschen"
                    >
                      <TrashIcon />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
        </Modal>
      )}

      {showDebug && <DebugLogPanel onClose={closeDebug} />}
    </div>
  );
}

export default App;
