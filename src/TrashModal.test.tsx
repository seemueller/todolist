import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TrashModal } from "./TrashModal";
import * as db from "./db";

vi.mock("./db", () => ({
  listDeletedTodos: vi.fn(),
  restoreTodo: vi.fn(),
  purgeTodo: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

const makeTodo = (id: number, title: string) => ({
  id,
  title,
  description: "",
  done: false,
  status: "todo" as const,
  priority: "medium" as const,
  created_at: "2026-01-01T00:00:00Z",
  due_date: null,
  category_id: null,
  category_name: null,
  category_color: null,
});

describe("TrashModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zeigt den Leerzustand", async () => {
    vi.mocked(db.listDeletedTodos).mockResolvedValue([]);

    render(<TrashModal onClose={() => {}} onChanged={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText("Der Papierkorb ist leer.")).toBeInTheDocument()
    );
  });

  it("stellt eine Aufgabe wieder her und meldet die Änderung", async () => {
    const onChanged = vi.fn();
    vi.mocked(db.listDeletedTodos).mockResolvedValue([makeTodo(1, "Zurück")]);
    vi.mocked(db.restoreTodo).mockResolvedValue(makeTodo(1, "Zurück"));

    render(<TrashModal onClose={() => {}} onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText("Zurück")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Wiederherstellen"));

    await waitFor(() => expect(db.restoreTodo).toHaveBeenCalledWith(1));
    expect(onChanged).toHaveBeenCalled();
  });

  it("löscht einen Eintrag endgültig ohne Rückfrage", async () => {
    vi.mocked(db.listDeletedTodos).mockResolvedValue([makeTodo(1, "Weg")]);
    vi.mocked(db.purgeTodo).mockResolvedValue(1);

    render(<TrashModal onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("Weg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Endgültig löschen"));

    await waitFor(() => expect(db.purgeTodo).toHaveBeenCalledWith(1));
  });

  it("leert den Papierkorb erst nach der Rückfrage", async () => {
    vi.mocked(db.listDeletedTodos).mockResolvedValue([makeTodo(1, "Weg"), makeTodo(2, "Auch weg")]);
    vi.mocked(db.purgeTodo).mockResolvedValue(1);

    render(<TrashModal onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("Weg")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Papierkorb leeren" }));
    expect(db.purgeTodo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ja, endgültig löschen" }));

    await waitFor(() => expect(db.purgeTodo).toHaveBeenCalledTimes(2));
  });
});
