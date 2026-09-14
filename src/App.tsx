import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  DragEvent,
  FormEvent,
  ReactNode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  addTodo,
  addCategory,
  deleteCategory,
  deleteTodo,
  restoreTodo,
  listCategories,
  listTodos,
  toggleTodoDone,
  updateCategory,
  updateTodoCategory,
  updateTodoFields,
  updateTodoPriority,
  updateTodoStatus,
} from "./db";
import { DATA_CHANGED_EVENT } from "./events";
import { isTauri } from "./sqlClient";
import type { TodoFieldsPatch } from "./storeTypes";
import { CATEGORY_COLORS, Category, Priority, sortCategories, Todo, TodoStatus } from "./types";
import { APP_VERSION, CHANGELOG } from "./version";
import { CustomTitleBar } from "./CustomTitleBar";
import { McpSettings } from "./McpSettings";
import { TimeTrackingView } from "./TimeTrackingView";
import { TodoDetailModal } from "./TodoDetailModal";

/** Die drei Ansichten der App. */
type ViewMode = "list" | "kanban" | "time";

/** Reihenfolge und Beschriftung der Segment-Leiste im Kopf. */
const VIEW_OPTIONS: { mode: ViewMode; label: string; Icon: typeof ListViewIcon }[] = [
  { mode: "list", label: "Liste", Icon: ListViewIcon },
  { mode: "kanban", label: "Brett", Icon: BoardViewIcon },
  { mode: "time", label: "Zeit", Icon: ClockViewIcon },
];
import {
  BoardViewIcon,
  CategoryBadge,
  CategorySelect,
  CheckIcon,
  ChevronLeftIcon,
  ClockViewIcon,
  CloseIcon,
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
  NoteIcon,
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

// Das Debug-Panel ist ein Werkzeug der Entwicklung und hat im ausgelieferten
// Programm nichts zu suchen. `import.meta.env.DEV` ist im Produktionsbuild die
// Konstante false, der Zweig faellt also samt `import()` weg -- das Panel
// landet dort weder im Bundle noch als eigener Chunk. In der Entwicklung wird
// es erst geladen, wenn es zum ersten Mal gezeigt wird.
const DebugLogPanel = import.meta.env.DEV
  ? lazy(() => import("./DebugLogPanel").then((mod) => ({ default: mod.DebugLogPanel })))
  : null;

type AppProps = {
  /** Fehlermeldung aus der localStorage-Migration in main.tsx, falls sie
   *  fehlgeschlagen ist. Wird einmalig als Startwert des Fehler-Banners
   *  uebernommen -- siehe migrateLocalStorage.ts. */
  migrationError?: string | null;
};

function App({ migrationError = null }: AppProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(migrationError);
  // Die zuletzt geloeschte Aufgabe, solange das Rueckgaengig angeboten wird.
  // Nur eine: das naechste Loeschen ersetzt den Eintrag, statt Hinweise zu
  // stapeln. Kein Timer -- nichts verschwindet, waehrend jemand hinsieht.
  const [justDeleted, setJustDeleted] = useState<{ id: number; title: string } | null>(null);
  // Die Aufgabe, deren Detail-Fenster offen ist. Ueber die Id, nicht ueber das
  // Objekt: die Liste bleibt so die einzige Quelle dafuer, ob die Aufgabe noch
  // existiert -- darauf baut die Loesch-Erkennung weiter unten. Das Fenster
  // selbst haelt bewusst einen eigenen, eingefrorenen Entwurf und folgt
  // spaeteren Aenderungen der Aufgabe nicht -- siehe die Begruendung in
  // TodoDetailModal.
  const [detailTodoId, setDetailTodoId] = useState<number | null>(null);
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
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [draggedTodoId, setDraggedTodoId] = useState<number | null>(null);
  const [dragOverLane, setDragOverLane] = useState<TodoStatus | null>(null);

  // Debug log panel (Ctrl+Shift+L)
  const [showDebug, setShowDebug] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const closeDebug = useCallback(() => setShowDebug(false), []);

  /**
   * Laedt Aufgaben und Kategorien neu.
   *
   * `clearErrorOnSuccess` entscheidet, ob ein geglueckter Ladevorgang eine
   * stehende Fehlermeldung wegnimmt. Die Regel dahinter: geloescht wird nur ein
   * Fehler, der aelter ist als der Anlass des Neuladens.
   *
   * * **Mount (`false`).** Der einzige Fehler, der hier schon stehen kann, ist
   *   die Migrationswarnung aus main.tsx (ueber die migrationError-Prop). Sie
   *   ist nicht veraltet, sondern gerade erst entstanden -- der erste
   *   erfolgreiche Ladevorgang wuerde sie wegwischen, bevor sie jemand liest.
   * * **`todolist:data-changed` (`true`).** Der MCP-Server hat geschrieben, wir
   *   lesen den neuen Stand. Was hier noch steht, gehoert zu einem frueheren
   *   Versuch; bleibt es stehen, beschwert sich die App ueber etwas, das
   *   inzwischen erledigt ist.
   *
   * Jede andere Aktion (Hinzufuegen, Loeschen, ...) setzt und loescht ihren
   * eigenen Fehler selbst und geht nicht durch `refresh()`.
   */
  async function refresh(clearErrorOnSuccess = false) {
    try {
      const [items, cats] = await Promise.all([
        listTodos(),
        listCategories(),
      ]);
      setTodos(items);
      setCategories(cats);
      if (clearErrorOnSuccess) setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Der MCP-Server schreibt am Frontend vorbei in dieselbe Datenbank. Ohne
  // dieses Ereignis sieht die offene App eine ueber Claude angelegte Aufgabe
  // erst nach einem Neustart.
  //
  // `listen` gibt sein Abmelden erst spaeter zurueck. Faellt die Komponente
  // vorher weg -- unter React.StrictMode passiert genau das bei jedem Mount --,
  // muss das eintreffende Abmelden sofort gerufen werden, sonst bleibt ein
  // Zuhoerer haengen und jedes Ereignis laedt doppelt nach.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: UnlistenFn | null = null;
    let dropped = false;
    listen(DATA_CHANGED_EVENT, () => {
      refresh(true);
    }).then((stop) => {
      if (dropped) stop();
      else unlisten = stop;
    });
    return () => {
      dropped = true;
      unlisten?.();
    };
  }, []);

  // Der Interceptor selbst wird in main.tsx installiert, noch vor dem ersten
  // Render -- sonst fehlten im Panel genau die Meldungen des Starts.

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Der globale Typ, nicht Reacts synthetischer: das Ereignis kommt hier
    // direkt vom document, nicht aus einem JSX-Handler.
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        setShowDebug((d) => !d);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const closeChangelog = useCallback(() => setShowChangelog(false), []);
  const closeMcp = useCallback(() => setShowMcp(false), []);

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
    const doomed = todos.find((t) => t.id === id);
    try {
      await deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setJustDeleted(doomed ? { id, title: doomed.title } : null);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleUndoDelete() {
    if (!justDeleted) return;
    try {
      const restored = await restoreTodo(justDeleted.id);
      setTodos((prev) =>
        [...prev, restored].sort((a, b) => {
          const dateCmp = b.created_at.localeCompare(a.created_at);
          return dateCmp !== 0 ? dateCmp : b.id - a.id;
        })
      );
      setJustDeleted(null);
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

  const closeDetail = useCallback(() => setDetailTodoId(null), []);

  // Verschwindet die offene Aufgabe aus der Liste -- etwa weil ein anderer
  // MCP-Client sie geloescht hat --, faellt `detailTodo` auf null und das
  // Fenster waere kommentarlos weg. Der Entwurf ist nicht zu retten, es gibt
  // nichts mehr, wohin man ihn schreiben koennte; aber wer gerade getippt hat,
  // muss erfahren, warum sein Fenster zugeht.
  //
  // `loading` schuetzt den ersten Ladevorgang: solange er laeuft, ist die leere
  // Liste kein Loeschen, sondern nur noch kein Ergebnis.
  useEffect(() => {
    if (loading || detailTodoId === null) return;
    if (todos.some((t) => t.id === detailTodoId)) return;
    setDetailTodoId(null);
    setError("Die Aufgabe wurde zwischenzeitlich gelöscht. Nicht gespeicherte Änderungen sind verloren.");
  }, [loading, detailTodoId, todos]);

  // Faengt bewusst nichts ab: das Detail-Fenster zeigt den Fehler selbst und
  // bleibt offen, damit der Entwurf nicht verloren geht.
  async function handleSaveDetail(id: number, patch: TodoFieldsPatch) {
    const updated = await updateTodoFields(id, patch);
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setError(null);
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
      setCategories((prev) => sortCategories([...prev, cat]));
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
        sortCategories(prev.map((c) => (c.id === updated.id ? updated : c)))
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

  const detailTodo = detailTodoId === null ? null : todos.find((t) => t.id === detailTodoId) ?? null;

  const hasActiveFilter = dueDateFilter !== "all" || statusFilter !== "all" || searchQuery || categoryFilter !== null;

  return (
    <div className="app-shell">
      <CustomTitleBar />

      <main className="app">
        <header className="app-header">
          <h1>TodoList</h1>
          <p className="app-subtitle">{headerCount}</p>
          <div className="view-switch" role="group" aria-label="Ansicht">
            {VIEW_OPTIONS.map(({ mode, label, Icon }) => (
              <FilterChip
                key={mode}
                variant="segment"
                active={viewMode === mode}
                onClick={() => setViewMode(mode)}
                aria-label={`Zur Ansicht ${label} wechseln`}
                title={label}
              >
                <Icon />
                {label}
              </FilterChip>
            ))}
          </div>
        </header>

        {viewMode !== "time" && (
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
        )}

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
        {justDeleted && (
          <div className="undo-bar">
            <span>„{justDeleted.title}" gelöscht.</span>
            <button type="button" className="undo-bar-action" onClick={handleUndoDelete}>
              Rückgängig
            </button>
            <IconButton
              variant="icon"
              onClick={() => setJustDeleted(null)}
              aria-label="Hinweis schließen"
            >
              <CloseIcon />
            </IconButton>
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

                <span className="title" onDoubleClick={() => setDetailTodoId(todo.id)}>
                  {todo.title}
                  {todo.description && (
                    <span className="todo-note-mark" role="img" aria-label="Hat eine Beschreibung">
                      <NoteIcon />
                    </span>
                  )}
                </span>

                {todo.due_date && (
                  <DueDateBadge overdue={overdue} today={today && !todo.done}>
                    {formatDate(todo.due_date)}
                  </DueDateBadge>
                )}

                <PrioritySelect
                  variant="inline"
                  value={todo.priority}
                  onValueChange={(priority) => handlePriorityChange(todo.id, priority)}
                  aria-label="Priorität ändern"
                />

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
                  <IconButton
                    variant="action"
                    onClick={() => setDetailTodoId(todo.id)}
                    aria-label="Aufgabe bearbeiten"
                  >
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
                          onDoubleClick={() => setDetailTodoId(todo.id)}
                        >
                          <span className="kanban-card-title">{todo.title}</span>

                          {/* Der Umbruch wird fuer die Vorschau zum Leerzeichen, damit
                              -webkit-line-clamp zwei Zeilen Text zeigt statt zwei Zeilen
                              bis zum ersten Umbruch. */}
                          {todo.description && (
                            <p className="kanban-card-description">
                              {todo.description.replace(/\s*\n+\s*/g, " ")}
                            </p>
                          )}

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

        {viewMode === "time" && (
          <TimeTrackingView
            categories={categories}
            onManageCategories={() => setShowCategoryManager(true)}
          />
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
          {import.meta.env.DEV && (
            <button
              type="button"
              className="debug-btn"
              onClick={() => setShowDebug(true)}
              aria-label="Debug Logs"
            >
              Debug
            </button>
          )}
          <button
            type="button"
            className="mcp-btn"
            onClick={() => setShowMcp(true)}
            aria-label="MCP-Server"
          >
            MCP
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

      {/* Detail-Fenster einer Aufgabe. Der `key` erzwingt einen frischen Mount je
          Aufgabe: das Fenster nimmt seinen Entwurf und den Ausgangsstand nur beim
          ersten Render aus den Props -- ohne `key` zeigte ein Wechsel auf eine
          andere Aufgabe noch den Entwurf der vorigen. */}
      {detailTodo && (
        <TodoDetailModal
          key={detailTodo.id}
          todo={detailTodo}
          categories={categories}
          onSave={handleSaveDetail}
          onClose={closeDetail}
        />
      )}

      {/* MCP-Server: Status, Token und die Zeile fuer den Client */}
      {showMcp && (
        <Modal variant="category" title="MCP-Server" onClose={closeMcp} closeLabel="Schließen">
          <McpSettings />
        </Modal>
      )}

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
                        aria-label="Kategorie bearbeiten"
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

      {DebugLogPanel && showDebug && (
        <Suspense fallback={null}>
          <DebugLogPanel onClose={closeDebug} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
