import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import * as db from "./db";

vi.mock("./db", () => ({
  listTodos: vi.fn(),
  addTodo: vi.fn(),
  deleteTodo: vi.fn(),
  toggleTodoDone: vi.fn(),
  updateTodoTitle: vi.fn(),
  updateTodoDueDate: vi.fn(),
  updateTodoPriority: vi.fn(),
}));

vi.mock("./version", () => ({
  APP_VERSION: "0.2.0",
  CHANGELOG: [],
}));

vi.mock("./CustomTitleBar", () => ({
  CustomTitleBar: () => null,
}));

const makeTodo = (overrides = {}) => ({
  id: 1,
  title: "Test",
  done: false,
  priority: "medium" as const,
  created_at: "2026-01-01T00:00:00Z",
  due_date: null,
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
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.addTodo).mockResolvedValue(makeTodo({ title: "New task" }));

    render(<App />);

    const input = screen.getByPlaceholderText(/Was steht an/i);
    const button = screen.getByRole("button", { name: /Aufgabe hinzufügen/i });

    fireEvent.change(input, { target: { value: "New task" } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(db.addTodo).toHaveBeenCalledWith("New task", "medium", null);
      expect(screen.getByText("New task")).toBeInTheDocument();
    });
  });

  it("does not add empty todo", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);

    render(<App />);

    const button = screen.getByRole("button", { name: /Aufgabe hinzufügen/i });
    fireEvent.click(button);

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
});
