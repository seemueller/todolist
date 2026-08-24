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
}));

vi.mock("./version", () => ({
  APP_VERSION: "0.2.0",
  CHANGELOG: [],
}));

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
      { id: 1, title: "Buy milk", done: false, created_at: "2026-01-01T00:00:00Z" },
      { id: 2, title: "Walk dog", done: true, created_at: "2026-01-01T00:00:00Z" },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Buy milk")).toBeInTheDocument();
      expect(screen.getByText("Walk dog")).toBeInTheDocument();
    });
  });

  it("adds a new todo on form submit", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);
    vi.mocked(db.addTodo).mockResolvedValue({
      id: 1,
      title: "New task",
      done: false,
      created_at: "2026-01-01T00:00:00Z",
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/Was steht an/i);
    const button = screen.getByRole("button", { name: /Los geht's/i });

    fireEvent.change(input, { target: { value: "New task" } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(db.addTodo).toHaveBeenCalledWith("New task");
      expect(screen.getByText("New task")).toBeInTheDocument();
    });
  });

  it("does not add empty todo", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([]);

    render(<App />);

    const button = screen.getByRole("button", { name: /Los geht's/i });
    fireEvent.click(button);

    expect(db.addTodo).not.toHaveBeenCalled();
  });

  it("toggles todo done status", async () => {
    const todo = { id: 1, title: "Toggle me", done: false, created_at: "2026-01-01T00:00:00Z" };
    const updated = { ...todo, done: true };

    vi.mocked(db.listTodos).mockResolvedValue([todo]);
    vi.mocked(db.toggleTodoDone).mockResolvedValue(updated);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Toggle me")).toBeInTheDocument();
    });

    const checkbox = screen.getByRole("checkbox", { name: /Toggle me/i });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(db.toggleTodoDone).toHaveBeenCalledWith(1, true);
    });
  });

  it("deletes a todo", async () => {
    const todo = { id: 1, title: "Delete me", done: false, created_at: "2026-01-01T00:00:00Z" };

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
      { id: 1, title: "Open", done: false, created_at: "2026-01-01T00:00:00Z" },
      { id: 2, title: "Done", done: true, created_at: "2026-01-01T00:00:00Z" },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/1 von 2 Aufgabe/i)).toBeInTheDocument();
    });
  });

  it("shows completion message when all todos are done", async () => {
    vi.mocked(db.listTodos).mockResolvedValue([
      { id: 1, title: "Done", done: true, created_at: "2026-01-01T00:00:00Z" },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Alles erledigt/i)).toBeInTheDocument();
    });
  });
});
