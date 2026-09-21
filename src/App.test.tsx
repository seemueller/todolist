import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import App from "./App";
import * as db from "./db";
import { debugLogs, clearDebugLogs, installDebugInterceptor } from "./debug";
import type { Category } from "./types";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// Pro Test umschaltbar: ausserhalb von Tauri darf sich die App gar nicht erst
// auf Ereignisse anmelden -- darauf baut die Playwright-Suite im Browser.
let insideTauri = true;
vi.mock("./sqlClient", () => ({
  isTauri: () => insideTauri,
  getDb: () => Promise.reject(new Error("in Tests nicht verfuegbar")),
}));

type EventHandler = (event: { payload: unknown }) => void;
const handlers = new Map<string, EventHandler[]>();
const unlistenMock = vi.fn();
const listenMock = vi.fn((name: string, handler: EventHandler) => {
  handlers.set(name, [...(handlers.get(name) ?? []), handler]);
  return Promise.resolve(unlistenMock);
});
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: EventHandler) => listenMock(name, handler),
}));

/** Feuert ein Backend-Ereignis auf allen angemeldeten Zuhoerern. */
function emit(name: string) {
  for (const handler of handlers.get(name) ?? []) handler({ payload: null });
}

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: () => Promise.resolve(false),
    minimize: () => Promise.resolve(),
    maximize: () => Promise.resolve(),
    unmaximize: () => Promise.resolve(),
    close: () => Promise.resolve(),
  }),
}));

vi.mock("./db", () => ({
  listTodos: vi.fn(),
  listCategories: vi.fn(() => Promise.resolve([])),
  addTodo: vi.fn(),
  deleteTodo: vi.fn(),
  restoreTodo: vi.fn(),
  listDeletedTodos: vi.fn(() => Promise.resolve([])),
  purgeTodo: vi.fn(),
  purgeDeletedBefore: vi.fn(() => Promise.resolve(0)),
  toggleTodoDone: vi.fn(),
  updateTodoDueDate: vi.fn(),
  updateTodoPriority: vi.fn(),
  updateTodoStatus: vi.fn(),
  updateTodoBoardOrder: vi.fn(),
  updateTodoStatusAndOrder: vi.fn(),
  updateTodoFields: vi.fn(),
  updateTodoCategory: vi.fn(),
  addCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock("./version", () => ({
  APP_VERSION: "0.2.0",
  CHANGELOG: [],
}));

vi.mock("./CustomTitleBar", () => ({
  CustomTitleBar: () => null,
}));

const todoBase = { description: "", priority: "medium" as const, due_date: null, category_id: null as number | null, category_name: null as string | null, category_color: null as string | null, status: "todo" as const, board_order: 0 };

const makeTodo = (overrides = {}) => ({
  id: 1,
  title: "Test",
  done: false,
  created_at: "2026-01-01T00:00:00Z",
  ...todoBase,
  ...overrides,
});

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 1,
  name: "Arbeit",
  color: "#7cc3f7",
  created_at: "2026-01-01T00:00:00Z",
  time_kind: "internal",
  ...overrides,
});

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
    localStorage.clear();
  });

  it("shows empty state when no todos exist", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Noch keine Aufgaben/i)).toBeInTheDocument();
    });
  });

  it("shows the migration error banner on mount and keeps it after todos load", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);

    render(<App migrationError="Die Übernahme deiner bestehenden Daten ist fehlgeschlagen." />);

    expect(
      screen.getByText(/Die Übernahme deiner bestehenden Daten ist fehlgeschlagen\./i),
    ).toBeInTheDocument();

    // Das anschliessende erfolgreiche Laden der Liste darf das Banner nicht
    // sofort wieder wegwischen.
    await waitFor(() => {
      expect(db.listTodos).toHaveBeenCalled();
      expect(screen.queryByText(/Lade Aufgaben/i)).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/Die Übernahme deiner bestehenden Daten ist fehlgeschlagen\./i),
    ).toBeInTheDocument();
  });

  it("renders existing todos", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 1, title: "Buy milk", done: false }),
      makeTodo({ id: 2, title: "Walk dog", done: true }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Buy milk")).toBeInTheDocument();
    });
    // Die Liste startet auf "Offen"; die erledigte Aufgabe erscheint erst
    // ueber die Statusleiste.
    expect(screen.queryByText("Walk dog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Status Alle" }));
    expect(screen.getByText("Walk dog")).toBeInTheDocument();
  });

  it("adds a new todo on form submit", async () => {
    const addedTodo = makeTodo({ title: "New task" });
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.addTodo).mockResolvedValue(addedTodo);

    render(<App />);

    const input = screen.getByPlaceholderText(/Was steht an/i);
    const button = screen.getByRole("button", { name: /Aufgabe hinzufügen/i });

    fireEvent.change(input, { target: { value: "New task" } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(db.addTodo).toHaveBeenCalledWith("New task", "medium", null, null);
    });
  });

  it("does not add empty todo", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);

    render(<App />);

    const button = screen.getByRole("button", { name: /Aufgabe hinzufügen/i });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(db.addTodo).not.toHaveBeenCalled();
  });

  it("toggles todo done status", async () => {
    const todo = makeTodo({ title: "Toggle me", done: false });
    const updated = { ...todo, done: true };

    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.toggleTodoDone).mockResolvedValue(updated);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Toggle me")).toBeInTheDocument();
    });

    const checkbox = screen.getByRole("button", { name: /Toggle me als erledigt markieren/i });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(db.toggleTodoDone).toHaveBeenCalledWith(1, true);
    });
  });

  it("deletes a todo", async () => {
    const todo = makeTodo({ title: "Delete me", done: false });

    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.deleteTodo).mockResolvedValue(1);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Delete me")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: "Löschen" });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(db.deleteTodo).toHaveBeenCalledWith(1);
    });
  });

  it("shows error when listTodos fails", async () => {
    vi.mocked(db.listTodos).mockRejectedValue(new Error("DB error"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Fehler/i)).toBeInTheDocument();
    });
  });

  it("shows remaining count", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 1, title: "Open", done: false }),
      makeTodo({ id: 2, title: "Done", done: true }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/1 von 2 Aufgabe/i)).toBeInTheDocument();
    });
  });

  it("shows completion message when all todos are done", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ title: "Done", done: true }),
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Alles erledigt/i)).toBeInTheDocument();
    });
  });

  it("toggles to kanban view", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ title: "Task" })]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Task")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/Zu tun/i)).toBeInTheDocument();
      expect(screen.getByText(/In Bearbeitung/i)).toBeInTheDocument();
      expect(screen.getByText(/Erledigt/i)).toBeInTheDocument();
    });
  });

  it("moves a card between lanes on drop and records it in the debug log", async () => {
    // Im laufenden Programm installiert main.tsx den Interceptor vor dem
    // ersten Render; hier rendert der Test App direkt, also uebernimmt er das.
    installDebugInterceptor();
    clearDebugLogs();
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);
    vi.mocked(db.updateTodoStatusAndOrder).mockResolvedValue(
      makeTodo({ id: 7, title: "Task", status: "in_progress" }),
    );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

    const card = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(".kanban-card");
      if (!found) throw new Error("keine Kanban-Karte gefunden");
      return found;
    });
    const lanes = container.querySelectorAll<HTMLElement>(".kanban-lane");
    expect(lanes.length).toBe(3);

    let payload = "";
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: (_type: string, value: string) => {
        payload = value;
      },
      getData: () => payload,
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(lanes[1], { dataTransfer });

    await waitFor(() => {
      // Status und Platz gehen in einem Schreibvorgang weg -- die leere
      // Zielspalte nimmt die Karte auf Platz 0.
      expect(db.updateTodoStatusAndOrder).toHaveBeenCalledWith(7, "in_progress", 0);
    });

    const messages = debugLogs.map((l) => l.message);
    expect(messages.some((m) => m.includes("dragstart für Aufgabe 7"))).toBe(true);
    expect(messages.some((m) => m.includes('nach "in_progress" an Platz 0 verschoben'))).toBe(true);
  });

  it("reports a failed update check instead of staying silent", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    invokeMock.mockRejectedValue("Network Error: 404 Not Found");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Noch keine Aufgaben/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Nach Updates suchen/i }));

    await waitFor(() => {
      expect(screen.getByText(/Update-Prüfung fehlgeschlagen/i)).toBeInTheDocument();
      expect(screen.getByText(/404 Not Found/i)).toBeInTheDocument();
    });
  });

  it("reports when no update is available", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    invokeMock.mockResolvedValue({ update_available: false });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Noch keine Aufgaben/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Nach Updates suchen/i }));

    await waitFor(() => {
      expect(screen.getByText(/Kein Update verfügbar/i)).toBeInTheDocument();
    });
  });

  describe("Nachladen, wenn der MCP-Server schreibt", () => {
    it("meldet sich beim Mount auf todolist:data-changed an", async () => {
      vi.mocked(db.listTodos).mockResolvedValue([]);

      render(<App />);

      await waitFor(() => {
        expect(listenMock).toHaveBeenCalledWith(
          "todolist:data-changed",
          expect.any(Function),
        );
      });
    });

    it("laedt Aufgaben und Kategorien neu, sobald das Ereignis feuert", async () => {
      vi.mocked(db.listTodos).mockResolvedValue([]);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/Noch keine Aufgaben/i)).toBeInTheDocument();
      });
      await waitFor(() => expect(listenMock).toHaveBeenCalled());

      vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ title: "Von Claude" })]);
      await act(async () => {
        emit("todolist:data-changed");
      });

      expect(await screen.findByText("Von Claude")).toBeInTheDocument();
    });

    it("raeumt eine stehende Fehlermeldung weg, wenn das Nachladen glueckt", async () => {
      // Der Fehler gehoert zu einem frueheren Versuch. Bleibt er nach einem
      // geglueckten Nachladen stehen, beschwert sich die App ueber etwas, das
      // inzwischen erledigt ist.
      vi.mocked(db.listTodos).mockRejectedValue(new Error("DB error"));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/DB error/i)).toBeInTheDocument();
      });
      await waitFor(() => expect(listenMock).toHaveBeenCalled());

      vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ title: "Von Claude" })]);
      await act(async () => {
        emit("todolist:data-changed");
      });

      expect(await screen.findByText("Von Claude")).toBeInTheDocument();
      expect(screen.queryByText(/DB error/i)).not.toBeInTheDocument();
    });

    it("meldet sich beim Unmount wieder ab", async () => {
      vi.mocked(db.listTodos).mockResolvedValue([]);

      const { unmount } = render(<App />);
      await waitFor(() => expect(listenMock).toHaveBeenCalled());

      unmount();

      expect(unlistenMock).toHaveBeenCalled();
    });

    it("meldet sich ausserhalb von Tauri gar nicht erst an", async () => {
      insideTauri = false;
      vi.mocked(db.listTodos).mockResolvedValue([]);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/Noch keine Aufgaben/i)).toBeInTheDocument();
      });
      expect(listenMock).not.toHaveBeenCalled();
    });
  });

  it("opens the detail modal from the pencil button", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Aufgabe bearbeiten" }));

    expect(await screen.findByLabelText("Beschreibung")).toBeInTheDocument();
  });

  it("opens the detail modal on a double click on the title", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.doubleClick(screen.getByText("Task"));

    expect(await screen.findByLabelText("Beschreibung")).toBeInTheDocument();
  });

  it("writes the changed fields through updateTodoFields", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);
    vi.mocked(db.updateTodoFields).mockResolvedValue(
      makeTodo({ id: 7, title: "Task", description: "Neuer Text" }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Aufgabe bearbeiten" }));
    fireEvent.change(await screen.findByLabelText("Beschreibung"), {
      target: { value: "Neuer Text" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(db.updateTodoFields).toHaveBeenCalledWith(7, { description: "Neuer Text" });
    });
    // Exakt, nicht als Muster: die Notiz-Markierung in der Zeile heisst "Hat eine
    // Beschreibung" und steht nach dem Sichern da -- ein /Beschreibung/i faende sie.
    await waitFor(() => {
      expect(screen.queryByLabelText("Beschreibung")).not.toBeInTheDocument();
    });
  });

  it("closes the detail modal and says so when the todo is deleted elsewhere", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());
    await waitFor(() => expect(listenMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Aufgabe bearbeiten" }));
    expect(await screen.findByLabelText("Beschreibung")).toBeInTheDocument();

    // Ein anderer Client loescht die Aufgabe; die App laedt nach.
    vi.mocked(db.listTodos).mockResolvedValue([]);
    await act(async () => {
      emit("todolist:data-changed");
    });

    expect(await screen.findByText(/zwischenzeitlich gelöscht/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Beschreibung")).not.toBeInTheDocument();
  });

  it("renames a todo through the detail modal", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);
    vi.mocked(db.updateTodoFields).mockResolvedValue(makeTodo({ id: 7, title: "Umbenannt" }));

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.doubleClick(screen.getByText("Task"));
    fireEvent.change(await screen.findByLabelText(/Titel/i), {
      target: { value: "Umbenannt" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(db.updateTodoFields).toHaveBeenCalledWith(7, { title: "Umbenannt" });
    });
    expect(await screen.findByText("Umbenannt")).toBeInTheDocument();
  });

  it("marks a todo that has a description", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 7, title: "Mit Text", description: "Belege holen" }),
      makeTodo({ id: 8, title: "Ohne Text" }),
    ]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Mit Text")).toBeInTheDocument());

    expect(screen.getAllByLabelText("Hat eine Beschreibung")).toHaveLength(1);
  });

  it("opens the detail modal on a double click on the kanban card", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

    const card = await waitFor(() => screen.getByText("Task").closest(".kanban-card"));
    fireEvent.doubleClick(card!);

    expect(await screen.findByLabelText("Beschreibung")).toBeInTheDocument();
  });

  it("clears the description through the detail modal", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 7, title: "Task", description: "Belege holen" }),
    ]);
    vi.mocked(db.updateTodoFields).mockResolvedValue(
      makeTodo({ id: 7, title: "Task", description: "" }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Aufgabe bearbeiten" }));
    // Mit gesetzter Beschreibung oeffnet das Fenster im Lesemodus; das Textfeld
    // gibt es erst nach dem Umschalten.
    fireEvent.click(await screen.findByRole("button", { name: "Beschreibung bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Beschreibung"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(db.updateTodoFields).toHaveBeenCalledWith(7, { description: "" });
    });
  });

  it("previews the description on the kanban card", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 7, title: "Task", description: "Zeile eins\nZeile zwei" }),
    ]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

    expect(await screen.findByText("Zeile eins Zeile zwei")).toBeInTheDocument();
  });

  it("sorts the kanban cards by due date, the furthest in the future at the bottom", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 1, title: "Ohne Datum", priority: "high" }),
      makeTodo({ id: 2, title: "Spaet", due_date: "2026-12-01" }),
      makeTodo({ id: 3, title: "Frueh", due_date: "2026-01-15", priority: "low" }),
    ]);

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText("Frueh")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

    await waitFor(() => {
      const titles = Array.from(
        container.querySelectorAll<HTMLElement>(".kanban-card-title")
      ).map((el) => el.textContent);
      expect(titles).toEqual(["Frueh", "Spaet", "Ohne Datum"]);
    });
  });

  it("puts a dragged card where it was dropped, ahead of the due date rule", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 1, title: "Frueh", due_date: "2026-01-15" }),
      makeTodo({ id: 2, title: "Hochgezogen", due_date: "2026-12-01", board_order: -1 }),
      makeTodo({ id: 3, title: "Runtergezogen", due_date: "2026-01-01", board_order: 5 }),
    ]);

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText("Frueh")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

    await waitFor(() => {
      const titles = Array.from(
        container.querySelectorAll<HTMLElement>(".kanban-card-title")
      ).map((el) => el.textContent);
      expect(titles).toEqual(["Hochgezogen", "Frueh", "Runtergezogen"]);
    });
  });

  /** Ein DataTransfer-Ersatz: jsdom bringt keinen mit. */
  function makeDataTransfer() {
    let payload = "";
    return {
      effectAllowed: "",
      dropEffect: "",
      setData: (_type: string, value: string) => {
        payload = value;
      },
      getData: () => payload,
    };
  }

  /** Gibt der Karte eine Hoehe, damit die Mitte-Berechnung etwas zu rechnen hat. */
  function stubRect(card: HTMLElement) {
    card.getBoundingClientRect = () =>
      ({ top: 0, height: 100, bottom: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  }

  /**
   * jsdom kennt kein `DragEvent`: `fireEvent.dragOver` baut dann ein nacktes
   * `Event`, und `clientY` faellt unterwegs weg. Also selbst ein MouseEvent
   * bauen -- das traegt die Koordinate -- und den DataTransfer anhaengen.
   */
  function fireDrag(
    type: "dragstart" | "dragover" | "drop" | "dragend",
    element: HTMLElement,
    dataTransfer: ReturnType<typeof makeDataTransfer>,
    clientY = 0,
  ) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    fireEvent(element, event);
  }

  async function renderBoard(todos: ReturnType<typeof makeTodo>[]) {
    vi.mocked(db.listTodos).mockResolvedValue(todos);
    const { container } = render(<App />);
    // Nicht ueber einen Titel warten: erledigte Aufgaben blendet die Liste in
    // ihrer Voreinstellung aus, im Brett stehen sie trotzdem.
    fireEvent.click(await screen.findByRole("button", { name: /Zur Ansicht Brett wechseln/i }));
    await waitFor(() => {
      expect(container.querySelectorAll(".kanban-card").length).toBe(todos.length);
    });
    return container;
  }

  it("moves a card above its neighbour inside the lane", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockResolvedValue(
      makeTodo({ id: 2, title: "Zweite", board_order: -1 }),
    );

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(first);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", second, dataTransfer);
    // Obere Haelfte der ersten Karte: davor einfuegen.
    fireDrag("dragover", first, dataTransfer, 10);
    fireDrag("drop", first, dataTransfer, 10);

    await waitFor(() => {
      expect(db.updateTodoBoardOrder).toHaveBeenCalledWith(2, -1);
    });
    expect(db.updateTodoStatusAndOrder).not.toHaveBeenCalled();
  });

  it("moves a card below its neighbour inside the lane", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockResolvedValue(
      makeTodo({ id: 1, title: "Erste", board_order: 2 }),
    );

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(second);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", first, dataTransfer);
    // Untere Haelfte der zweiten Karte: dahinter einfuegen.
    fireDrag("dragover", second, dataTransfer, 90);
    fireDrag("drop", second, dataTransfer, 90);

    await waitFor(() => {
      expect(db.updateTodoBoardOrder).toHaveBeenCalledWith(1, 2);
    });
  });

  it("sets status and position in one write when the card changes lane", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Laeuft", status: "in_progress", board_order: 0 }),
      makeTodo({ id: 2, title: "Offen", status: "todo", board_order: 0 }),
    ]);
    vi.mocked(db.updateTodoStatusAndOrder).mockResolvedValue(
      makeTodo({ id: 2, title: "Offen", status: "in_progress", board_order: -1 }),
    );

    const cards = container.querySelectorAll<HTMLElement>(".kanban-card");
    const running = Array.from(cards).find((c) => c.textContent?.includes("Laeuft")) as HTMLElement;
    const open = Array.from(cards).find((c) => c.textContent?.includes("Offen")) as HTMLElement;
    stubRect(running);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", open, dataTransfer);
    fireDrag("dragover", running, dataTransfer, 10);
    fireDrag("drop", running, dataTransfer, 10);

    await waitFor(() => {
      expect(db.updateTodoStatusAndOrder).toHaveBeenCalledWith(2, "in_progress", -1);
    });
    expect(db.updateTodoStatus).not.toHaveBeenCalled();
  });

  it("shows an insertion line while dragging over a card", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(first);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", second, dataTransfer);
    fireDrag("dragover", first, dataTransfer, 10);

    await waitFor(() => {
      expect(container.querySelector(".kanban-drop-indicator")).not.toBeNull();
    });
  });

  it("clears the insertion line when the drag is abandoned", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(first);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", second, dataTransfer);
    fireDrag("dragover", first, dataTransfer, 10);
    await waitFor(() => {
      expect(container.querySelector(".kanban-drop-indicator")).not.toBeNull();
    });

    fireDrag("dragend", second, dataTransfer);

    await waitFor(() => {
      expect(container.querySelector(".kanban-drop-indicator")).toBeNull();
    });
  });

  it("draws one insertion line when a card hovers over its own place", async () => {
    // Die Anzahl, nicht nur die Anwesenheit: der Index der gezogenen Karte
    // faellt mit dem der Karte darunter zusammen, und das gaebe zwei Linien.
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
      makeTodo({ id: 3, title: "Dritte", board_order: 2 }),
    ]);

    const cards = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(cards[1]);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", cards[1], dataTransfer);
    fireDrag("dragover", cards[1], dataTransfer, 10);

    await waitFor(() => {
      expect(container.querySelectorAll(".kanban-drop-indicator").length).toBe(1);
    });
  });

  it("draws one insertion line when the last card hovers over itself", async () => {
    // Am Spaltenende trifft der Index der gezogenen Karte ausserdem auf die
    // Bedingung fuer die Linie hinter der letzten Karte.
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);

    const [, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(second);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", second, dataTransfer);
    fireDrag("dragover", second, dataTransfer, 10);

    await waitFor(() => {
      expect(container.querySelectorAll(".kanban-drop-indicator").length).toBe(1);
    });
  });

  it("renumbers the lane when two neighbours sit on the same position", async () => {
    // Beide Karten stehen auf 0 -- der Normalfall, solange niemand gezogen
    // hat. Zwischen ihnen ist kein Platz, also wird die Spalte neu verteilt.
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0, due_date: "2026-01-01" }),
      makeTodo({ id: 2, title: "Zweite", board_order: 0, due_date: "2026-02-01" }),
      makeTodo({ id: 3, title: "Dritte", board_order: 0, due_date: "2026-03-01" }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockImplementation((id, order) =>
      Promise.resolve(makeTodo({ id, title: `#${id}`, board_order: order })),
    );

    const cards = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(cards[1]);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", cards[2], dataTransfer);
    fireDrag("dragover", cards[1], dataTransfer, 10);
    fireDrag("drop", cards[1], dataTransfer, 10);

    await waitFor(() => {
      // Jede Karte der Spalte bekommt einen eigenen Wert, die gezogene den
      // Platz, auf den sie gezogen wurde.
      expect(vi.mocked(db.updateTodoBoardOrder).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("shows the insertion line over an empty lane too", async () => {
    const container = await renderBoard([makeTodo({ id: 1, title: "Erste", board_order: 0 })]);

    const [card] = container.querySelectorAll<HTMLElement>(".kanban-card");
    const lanes = container.querySelectorAll<HTMLElement>(".kanban-lane");
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", card, dataTransfer);
    // "In Bearbeitung" ist leer -- dort gibt es keine Karte, ueber der die
    // Linie haengen koennte, also muss die Spalte selbst sie zeigen.
    fireDrag("dragover", lanes[1], dataTransfer);

    await waitFor(() => {
      expect(lanes[1].querySelectorAll(".kanban-drop-indicator").length).toBe(1);
    });
    expect(lanes[0].querySelector(".kanban-drop-indicator")).toBeNull();
  });

  it("writes nothing when a card is dropped on its own place", async () => {
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);

    const [, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(second);
    const dataTransfer = makeDataTransfer();

    // Obere Haelfte der eigenen Karte: genau die Stelle, an der sie steht.
    fireDrag("dragstart", second, dataTransfer);
    fireDrag("dragover", second, dataTransfer, 10);
    fireDrag("drop", second, dataTransfer, 10);

    // Die Einfuegelinie verschwindet, aber geschrieben wird nichts.
    await waitFor(() => {
      expect(container.querySelector(".kanban-drop-indicator")).toBeNull();
    });
    expect(db.updateTodoBoardOrder).not.toHaveBeenCalled();
    expect(db.updateTodoStatusAndOrder).not.toHaveBeenCalled();
  });

  it("renumbers the hidden cards of the lane too when a filter is active", async () => {
    // Beim Umnummerieren duerfen die ausgeblendeten Karten nicht auf ihren
    // alten Werten stehenbleiben -- sonst tauchen sie zwischen den sichtbaren
    // auf, sobald der Filter faellt.
    vi.mocked(db.listCategories).mockResolvedValue([
      makeCategory({ id: 1, name: "Arbeit" }),
      makeCategory({ id: 2, name: "Privat", color: "#6fcf7f" }),
    ]);
    const lane = [
      makeTodo({ id: 1, title: "A", board_order: 0, due_date: "2026-01-01", category_id: 1, category_name: "Arbeit" }),
      makeTodo({ id: 2, title: "B", board_order: 0, due_date: "2026-02-01", category_id: 1, category_name: "Arbeit" }),
      makeTodo({ id: 3, title: "C", board_order: 0, due_date: "2026-03-01", category_id: 1, category_name: "Arbeit" }),
      makeTodo({ id: 4, title: "H", board_order: 0, due_date: "2026-04-01", category_id: 2, category_name: "Privat" }),
    ];
    const container = await renderBoard(lane);
    vi.mocked(db.updateTodoBoardOrder).mockImplementation((id, order) =>
      Promise.resolve({ ...lane.find((t) => t.id === id)!, board_order: order }),
    );

    const titlesNow = () =>
      Array.from(container.querySelectorAll<HTMLElement>(".kanban-card-title")).map(
        (el) => el.textContent,
      );

    fireEvent.click(await screen.findByRole("button", { name: "Kategorie Arbeit" }));
    await waitFor(() => expect(titlesNow()).toEqual(["A", "B", "C"]));

    // "C" zwischen "A" und "B" ziehen -- die beiden stossen auf derselben
    // Position aneinander, also wird umnummeriert.
    const cards = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(cards[1]);
    const dataTransfer = makeDataTransfer();
    fireDrag("dragstart", cards[2], dataTransfer);
    fireDrag("dragover", cards[1], dataTransfer, 10);
    fireDrag("drop", cards[1], dataTransfer, 10);

    await waitFor(() => expect(titlesNow()).toEqual(["A", "C", "B"]));

    // Filter aus: "H" muss hinter den dreien stehen, nicht zwischen ihnen.
    fireEvent.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));
    await waitFor(() => expect(titlesNow()).toEqual(["A", "C", "B", "H"]));
  });

  it("keeps a half-written rebalance on screen and reports the failure", async () => {
    // Die Spalte wird Karte fuer Karte umnummeriert; bricht das in der Mitte
    // ab, steht die Haelfte schon in der Datenbank. Die Werte sind so gewaehlt,
    // dass die halbe Stellung eine andere Titelreihenfolge ergibt als die alte
    // -- sonst wuerde der Test den Unterschied gar nicht sehen.
    const lane = [
      makeTodo({ id: 1, title: "Karte A", board_order: 0, due_date: "2026-01-01" }),
      makeTodo({ id: 2, title: "Karte B", board_order: 0, due_date: "2026-02-01" }),
      makeTodo({ id: 3, title: "Karte C", board_order: -5, due_date: "2026-03-01" }),
    ];
    const container = await renderBoard(lane);

    const titlesNow = () =>
      Array.from(container.querySelectorAll<HTMLElement>(".kanban-card-title")).map(
        (el) => el.textContent,
      );
    expect(titlesNow()).toEqual(["Karte C", "Karte A", "Karte B"]);

    // Geschrieben wird in der neuen Reihenfolge: A auf 0, C auf 1, B auf 2.
    // Der dritte Aufruf scheitert.
    vi.mocked(db.updateTodoBoardOrder).mockImplementation((id, order) => {
      if (id === 2) return Promise.reject("Datenbank weg");
      const base = lane.find((t) => t.id === id)!;
      return Promise.resolve({ ...base, board_order: order });
    });

    const cards = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(cards[2]);
    const dataTransfer = makeDataTransfer();

    // "Karte C" zwischen A und B ziehen: dort stossen zwei Karten auf
    // derselben Position aneinander, also wird umnummeriert.
    fireDrag("dragstart", cards[0], dataTransfer);
    fireDrag("dragover", cards[2], dataTransfer, 10);
    fireDrag("drop", cards[2], dataTransfer, 10);

    // A steht auf 0 und C auf 1, B ist nie geschrieben worden -- weder die
    // alte Reihenfolge ("Karte C" vorn) noch die fertige ("Karte C" in der
    // Mitte), sondern genau die halbe.
    await waitFor(() => {
      expect(titlesNow()).toEqual(["Karte A", "Karte B", "Karte C"]);
    });

    // Das Fehler-Banner zeichnet nur die Listenansicht, also dort nachsehen,
    // ob der Fehlschlag gemeldet und nicht verschluckt wurde.
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Liste wechseln/i }));
    expect(screen.getByText(/Datenbank weg/i)).toBeInTheDocument();
  });

  it("zeigt eine fehlgeschlagene Kartenverschiebung auch im Brett, ohne dass man in die Liste wechseln muss", async () => {
    // Das Fehler-Banner steckte bislang nur im Zweig der Listenansicht --
    // schlaegt ein Drag im Brett fehl, blieb die Oberflaeche stumm.
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Erste", board_order: 0 }),
      makeTodo({ id: 2, title: "Zweite", board_order: 1 }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockRejectedValue("Datenbank weg");

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(first);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", second, dataTransfer);
    fireDrag("dragover", first, dataTransfer, 10);
    fireDrag("drop", first, dataTransfer, 10);

    await waitFor(() => {
      expect(screen.getByText(/Datenbank weg/i)).toBeInTheDocument();
    });
  });

  it("keeps a reorder inside the done lane a plain position write", async () => {
    // Das Feuerwerk (`burstId`/`.done-flash`) zeichnet nur die Listenansicht;
    // im Brett ist es nicht sichtbar. Pruefbar ist deshalb der Schreibpfad:
    // eine Karte, die "erledigt" bleibt, darf keinen Status-Schreibvorgang
    // ausloesen.
    const container = await renderBoard([
      makeTodo({ id: 1, title: "Fertig A", status: "done", done: true, board_order: 0 }),
      makeTodo({ id: 2, title: "Fertig B", status: "done", done: true, board_order: 1 }),
    ]);
    vi.mocked(db.updateTodoBoardOrder).mockResolvedValue(
      makeTodo({ id: 2, title: "Fertig B", status: "done", done: true, board_order: -1 }),
    );

    const [first, second] = container.querySelectorAll<HTMLElement>(".kanban-card");
    stubRect(first);
    const dataTransfer = makeDataTransfer();

    fireDrag("dragstart", second, dataTransfer);
    fireDrag("dragover", first, dataTransfer, 10);
    fireDrag("drop", first, dataTransfer, 10);

    await waitFor(() => expect(db.updateTodoBoardOrder).toHaveBeenCalledWith(2, -1));
    expect(db.updateTodoStatusAndOrder).not.toHaveBeenCalled();
    expect(db.updateTodoStatus).not.toHaveBeenCalled();
  });
});

describe("die Rückgängig-Leiste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
    localStorage.clear();
  });

  it("bietet nach dem Löschen an, die Aufgabe zurückzuholen", async () => {
    const todo = makeTodo({ id: 1, title: "Versehentlich" });
    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.deleteTodo).mockResolvedValue(1);
    vi.mocked(db.restoreTodo).mockResolvedValue(todo);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Versehentlich")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Löschen"));

    await waitFor(() => expect(screen.getByText(/Versehentlich.*gelöscht/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));

    await waitFor(() => expect(db.restoreTodo).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Rückgängig" })).not.toBeInTheDocument()
    );
  });

  it("zeigt nur die zuletzt gelöschte Aufgabe an", async () => {
    const erste = makeTodo({ id: 1, title: "Erste" });
    const zweite = makeTodo({ id: 2, title: "Zweite" });
    vi.mocked(db.listTodos).mockResolvedValue([erste, zweite]);
    vi.mocked(db.deleteTodo).mockImplementation((id: number) => Promise.resolve(id));

    render(<App />);
    await waitFor(() => expect(screen.getByText("Erste")).toBeInTheDocument());

    const [ersterKnopf, zweiterKnopf] = screen.getAllByLabelText("Löschen");
    fireEvent.click(ersterKnopf);
    await waitFor(() => expect(screen.getByText(/Erste.*gelöscht/i)).toBeInTheDocument());
    fireEvent.click(zweiterKnopf);

    await waitFor(() => expect(screen.getByText(/Zweite.*gelöscht/i)).toBeInTheDocument());
    expect(screen.queryByText(/Erste.*gelöscht/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Rückgängig" })).toHaveLength(1);
  });

  it("behaelt die Leiste, wenn das Zurueckholen fehlschlaegt", async () => {
    const todo = makeTodo({ id: 1, title: "Versehentlich" });
    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.deleteTodo).mockResolvedValue(1);
    vi.mocked(db.restoreTodo).mockRejectedValue(new Error("boom"));

    render(<App />);
    await waitFor(() => expect(screen.getByText("Versehentlich")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Löschen"));
    await waitFor(() => expect(screen.getByText(/Versehentlich.*gelöscht/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));

    await waitFor(() =>
      expect(screen.getByText(/Wiederherstellen fehlgeschlagen/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Rückgängig" })).toBeInTheDocument();
  });

  it("schliesst die Leiste ueber den Schliessen-Knopf, ohne wiederherzustellen", async () => {
    const todo = makeTodo({ id: 1, title: "Versehentlich" });
    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.deleteTodo).mockResolvedValue(1);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Versehentlich")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Löschen"));
    await waitFor(() => expect(screen.getByText(/Versehentlich.*gelöscht/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Hinweis schließen"));

    expect(screen.queryByRole("button", { name: "Rückgängig" })).not.toBeInTheDocument();
    expect(db.restoreTodo).not.toHaveBeenCalled();
  });

  it("zeigt keine Leiste, wenn das Loeschen fehlschlaegt", async () => {
    const todo = makeTodo({ id: 1, title: "Versehentlich" });
    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.deleteTodo).mockRejectedValue(new Error("boom"));

    render(<App />);
    await waitFor(() => expect(screen.getByText("Versehentlich")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Löschen"));

    await waitFor(() => expect(screen.getByText(/Fehler/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Rückgängig" })).not.toBeInTheDocument();
  });
});

describe("die Voreinstellung der Liste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
    localStorage.clear();
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 1, title: "Offene Aufgabe", done: false }),
      makeTodo({ id: 2, title: "Erledigte Aufgabe", done: true }),
    ]);
  });

  it("startet die Liste auf 'Offen'", async () => {
    render(<App />);

    expect(await screen.findByRole("button", { name: "Status Offen" })).toHaveClass("active");
    expect(screen.getByText("Offene Aufgabe")).toBeInTheDocument();
    expect(screen.queryByText("Erledigte Aufgabe")).not.toBeInTheDocument();
  });

  it("merkt sich die Wahl", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Offene Aufgabe")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Status Alle" }));

    expect(localStorage.getItem("todolist.statusFilter")).toBe("all");
  });

  it("nimmt die gemerkte Wahl beim naechsten Start wieder auf", async () => {
    localStorage.setItem("todolist.statusFilter", "done");

    render(<App />);

    expect(await screen.findByText("Erledigte Aufgabe")).toBeInTheDocument();
    expect(screen.queryByText("Offene Aufgabe")).not.toBeInTheDocument();
  });

  it("setzt 'Zuruecksetzen' auf 'Offen', nicht auf 'Alle'", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Offene Aufgabe")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Status Alle" }));
    fireEvent.click(screen.getByText("Zurücksetzen"));

    expect(screen.getByRole("button", { name: "Status Offen" })).toHaveClass("active");
    expect(localStorage.getItem("todolist.statusFilter")).toBe("open");
  });

  it("weist 'Offen' nicht als aktiven Filter aus", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Offene Aufgabe")).toBeInTheDocument());

    expect(screen.queryByText("Zurücksetzen")).not.toBeInTheDocument();
  });
});

describe("der Kategorie-Filter im Brett", () => {
  const arbeit = makeCategory({ id: 1, name: "Arbeit" });
  const privat = makeCategory({ id: 2, name: "Privat", color: "#6fcf7f" });

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
    localStorage.clear();
    vi.mocked(db.listCategories).mockResolvedValue([arbeit, privat]);
    vi.mocked(db.listTodos).mockResolvedValue([
      makeTodo({ id: 1, title: "Arbeit-Aufgabe", category_id: 1, category_name: "Arbeit" }),
      makeTodo({ id: 2, title: "Privat-Aufgabe", category_id: 2, category_name: "Privat" }),
      makeTodo({ id: 3, title: "Aufgabe ohne Kategorie" }),
    ]);
  });

  /** Rendert die App und schaltet auf das Brett um. */
  async function renderBoard() {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Arbeit-Aufgabe")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));
    await screen.findByRole("button", { name: "Alle Kategorien" });
  }

  it("zeigt ohne Auswahl alle Aufgaben", async () => {
    await renderBoard();

    expect(screen.getByText("Arbeit-Aufgabe")).toBeInTheDocument();
    expect(screen.getByText("Privat-Aufgabe")).toBeInTheDocument();
    expect(screen.getByText("Aufgabe ohne Kategorie")).toBeInTheDocument();
  });

  it("filtert das Brett auf die gewaehlten Kategorien", async () => {
    await renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));

    expect(screen.getByText("Arbeit-Aufgabe")).toBeInTheDocument();
    expect(screen.queryByText("Privat-Aufgabe")).not.toBeInTheDocument();
    expect(screen.queryByText("Aufgabe ohne Kategorie")).not.toBeInTheDocument();
  });

  it("sammelt mehrere Kategorien statt sie zu ersetzen", async () => {
    await renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));
    fireEvent.click(screen.getByRole("button", { name: "Kategorie Privat" }));

    expect(screen.getByText("Arbeit-Aufgabe")).toBeInTheDocument();
    expect(screen.getByText("Privat-Aufgabe")).toBeInTheDocument();
    expect(screen.queryByText("Aufgabe ohne Kategorie")).not.toBeInTheDocument();
  });

  it("nimmt einen zweiten Klick auf denselben Chip wieder zurueck", async () => {
    await renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));
    fireEvent.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));

    expect(screen.getByText("Privat-Aufgabe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alle Kategorien" })).toHaveClass("active");
  });

  it("zeigt mit 'Ohne Kategorie' die Aufgaben ohne Kategorie", async () => {
    await renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Ohne Kategorie" }));

    expect(screen.getByText("Aufgabe ohne Kategorie")).toBeInTheDocument();
    expect(screen.queryByText("Arbeit-Aufgabe")).not.toBeInTheDocument();
  });

  it("zeigt nach 'Alle' wieder alles", async () => {
    await renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));
    fireEvent.click(screen.getByRole("button", { name: "Alle Kategorien" }));

    expect(screen.getByText("Privat-Aufgabe")).toBeInTheDocument();
    expect(screen.getByText("Aufgabe ohne Kategorie")).toBeInTheDocument();
  });

  // Bleibt die Id der geloeschten Kategorie in der Auswahl stehen, ist der Chip
  // weg, "Alle" aber weiter inaktiv -- und das Brett zeigt keine Karte mehr.
  it("nimmt eine geloeschte Kategorie aus der Auswahl", async () => {
    vi.mocked(db.deleteCategory).mockResolvedValue(1);
    await renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));
    expect(screen.queryByText("Privat-Aufgabe")).not.toBeInTheDocument();

    // Das Kategorien-Fenster haengt an der Filterleiste der Liste, also zurueck.
    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Liste wechseln/i }));
    fireEvent.click(screen.getByLabelText("Kategorien verwalten"));
    const item = (await screen.findByLabelText("Zeitart Arbeit")).closest(
      ".category-item",
    ) as HTMLElement;
    fireEvent.click(within(item).getByLabelText("Löschen"));
    await waitFor(() => expect(db.deleteCategory).toHaveBeenCalledWith(1));

    fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

    expect(await screen.findByText("Privat-Aufgabe")).toBeInTheDocument();
    expect(screen.getByText("Arbeit-Aufgabe")).toBeInTheDocument();
    expect(screen.getByText("Aufgabe ohne Kategorie")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alle Kategorien" })).toHaveClass("active");
  });
});

describe("die Zeitart im Kategorien-Fenster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
    localStorage.clear();
  });

  it("legt eine Kategorie mit gewaehlter Zeitart an", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.listCategories).mockResolvedValue([]);
    vi.mocked(db.addCategory).mockResolvedValue(
      makeCategory({ id: 2, name: "Kunde X", time_kind: "external" }),
    );

    render(<App />);
    await waitFor(() => expect(db.listCategories).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText("Kategorien verwalten"));
    fireEvent.change(await screen.findByPlaceholderText(/Neue Kategorie/i), {
      target: { value: "Kunde X" },
    });
    fireEvent.click(screen.getByLabelText("Zeitart neue Kategorie: Extern"));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() =>
      expect(db.addCategory).toHaveBeenCalledWith("Kunde X", expect.any(String), "external"),
    );
  });

  it("faellt nach dem Anlegen auf Intern zurueck", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.listCategories).mockResolvedValue([]);
    vi.mocked(db.addCategory).mockResolvedValue(
      makeCategory({ id: 2, name: "Kunde X", time_kind: "external" }),
    );

    render(<App />);
    await waitFor(() => expect(db.listCategories).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText("Kategorien verwalten"));
    fireEvent.change(await screen.findByPlaceholderText(/Neue Kategorie/i), {
      target: { value: "Kunde X" },
    });
    fireEvent.click(screen.getByLabelText("Zeitart neue Kategorie: Extern"));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => expect(db.addCategory).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByLabelText("Zeitart neue Kategorie: Intern")).toHaveClass("active"),
    );
  });

  it("stellt die Zeitart einer bestehenden Kategorie um", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.listCategories).mockResolvedValue([makeCategory()]);
    vi.mocked(db.updateCategory).mockResolvedValue(makeCategory({ time_kind: "none" }));

    render(<App />);
    await waitFor(() => expect(db.listCategories).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText("Kategorien verwalten"));
    fireEvent.click(await screen.findByLabelText("Zeitart Arbeit: Keine"));

    await waitFor(() =>
      expect(db.updateCategory).toHaveBeenCalledWith(1, "Arbeit", "#7cc3f7", "none"),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Zeitart Arbeit: Keine")).toHaveClass("active"),
    );
  });

  it("zeigt die gespeicherte Zeitart als gewaehlt an", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.listCategories).mockResolvedValue([makeCategory({ time_kind: "external" })]);

    render(<App />);
    await waitFor(() => expect(db.listCategories).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText("Kategorien verwalten"));

    expect(await screen.findByLabelText("Zeitart Arbeit: Extern")).toHaveClass("active");
    expect(screen.getByLabelText("Zeitart Arbeit: Intern")).not.toHaveClass("active");
  });
});

describe("der Papierkorb-Knopf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
    localStorage.clear();
  });

  it("öffnet das Papierkorb-Fenster", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.listDeletedTodos).mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(db.listTodos).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText("Papierkorb"));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Papierkorb" })).toBeInTheDocument()
    );
  });

  it("zieht die Rückgängig-Leiste zurück, wenn im Papierkorb endgültig gelöscht wird", async () => {
    const todo = makeTodo({ id: 1, title: "Versehentlich" });
    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.deleteTodo).mockResolvedValue(1);
    vi.mocked(db.listDeletedTodos).mockResolvedValue([todo]);
    vi.mocked(db.purgeTodo).mockResolvedValue(1);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Versehentlich")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Löschen"));
    await waitFor(() => expect(screen.getByText(/Versehentlich.*gelöscht/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Papierkorb"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Papierkorb" })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByLabelText("Endgültig löschen"));

    await waitFor(() => expect(db.purgeTodo).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Rückgängig" })).not.toBeInTheDocument()
    );
  });
});
