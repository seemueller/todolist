import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";
import * as db from "./db";
import { debugLogs, clearDebugLogs } from "./debug";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: () => true,
}));

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
  toggleTodoDone: vi.fn(),
  updateTodoTitle: vi.fn(),
  updateTodoDueDate: vi.fn(),
  updateTodoPriority: vi.fn(),
  updateTodoStatus: vi.fn(),
}));

vi.mock("./version", () => ({
  APP_VERSION: "0.2.0",
  CHANGELOG: [],
}));

vi.mock("./CustomTitleBar", () => ({
  CustomTitleBar: () => null,
}));

const todoBase = { priority: "medium" as const, due_date: null, category_id: null as number | null, category_name: null as string | null, category_color: null as string | null, status: "todo" as const };

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
  });

  it("shows empty state when no todos exist", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Noch keine Aufgaben/i)).toBeInTheDocument();
    });
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

    const toggleBtn = screen.getByRole("button", { name: /Zum Kanban-Brett wechseln/i });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/Zu tun/i)).toBeInTheDocument();
      expect(screen.getByText(/In Bearbeitung/i)).toBeInTheDocument();
      expect(screen.getByText(/Erledigt/i)).toBeInTheDocument();
    });
  });

  it("moves a card between lanes on drop and records it in the debug log", async () => {
    clearDebugLogs();
    vi.mocked(db.listTodos).mockResolvedValue([makeTodo({ id: 7, title: "Task" })]);
    vi.mocked(db.updateTodoStatus).mockResolvedValue(
      makeTodo({ id: 7, title: "Task", status: "in_progress" }),
    );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Zum Kanban-Brett wechseln/i }));

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
});
