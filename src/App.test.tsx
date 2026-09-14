import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";
import * as db from "./db";
import { debugLogs, clearDebugLogs, installDebugInterceptor } from "./debug";

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
  updateTodoFields: vi.fn(),
}));

vi.mock("./version", () => ({
  APP_VERSION: "0.2.0",
  CHANGELOG: [],
}));

vi.mock("./CustomTitleBar", () => ({
  CustomTitleBar: () => null,
}));

const todoBase = { description: "", priority: "medium" as const, due_date: null, category_id: null as number | null, category_name: null as string | null, category_color: null as string | null, status: "todo" as const };

const makeTodo = (overrides = {}) => ({
  id: 1,
  title: "Test",
  done: false,
  created_at: "2026-01-01T00:00:00Z",
  ...todoBase,
  ...overrides,
});

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
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
      expect(screen.getByText("Walk dog")).toBeInTheDocument();
    });
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
    vi.mocked(db.updateTodoStatus).mockResolvedValue(
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
      expect(db.updateTodoStatus).toHaveBeenCalledWith(7, "in_progress");
    });

    const messages = debugLogs.map((l) => l.message);
    expect(messages.some((m) => m.includes("dragstart für Aufgabe 7"))).toBe(true);
    expect(messages.some((m) => m.includes('nach "in_progress" verschoben'))).toBe(true);
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

    expect(await screen.findByLabelText(/Beschreibung/i)).toBeInTheDocument();
  });

  it("opens the detail modal on a double click on the title", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.doubleClick(screen.getByText("Task"));

    expect(await screen.findByLabelText(/Beschreibung/i)).toBeInTheDocument();
  });

  it("writes the changed fields through updateTodoFields", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);
    vi.mocked(db.updateTodoFields).mockResolvedValue(
      makeTodo({ id: 7, title: "Task", description: "Neuer Text" }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText("Task")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Aufgabe bearbeiten" }));
    fireEvent.change(await screen.findByLabelText(/Beschreibung/i), {
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

    expect(await screen.findByLabelText(/Beschreibung/i)).toBeInTheDocument();
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
    // Exakt, nicht als Muster: mit gesetzter Beschreibung matcht /Beschreibung/i
    // auch die Notiz-Markierung "Hat eine Beschreibung" in der Zeile dahinter.
    fireEvent.change(await screen.findByLabelText("Beschreibung"), {
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
});

describe("die Rückgängig-Leiste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
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
