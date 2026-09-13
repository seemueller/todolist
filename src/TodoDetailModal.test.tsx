import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TodoDetailModal } from "./TodoDetailModal";
import { Category, Todo } from "./types";

const categories: Category[] = [
  { id: 1, name: "Arbeit", color: "#7cc3f7", created_at: "2026-01-01T00:00:00.000Z" },
];

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 7,
    title: "Steuererklärung",
    description: "",
    done: false,
    status: "todo",
    priority: "medium",
    created_at: "2026-09-13T10:00:00.000Z",
    due_date: null,
    category_id: null,
    category_name: null,
    category_color: null,
    ...overrides,
  };
}

function renderModal(overrides: Partial<Todo> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <TodoDetailModal
      todo={makeTodo(overrides)}
      categories={categories}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  return { onSave, onClose };
}

describe("TodoDetailModal", () => {
  it("shows the current values of the todo", () => {
    renderModal({ description: "Belege holen", priority: "high", due_date: "2026-09-20" });

    expect(screen.getByLabelText(/Titel/i)).toHaveValue("Steuererklärung");
    expect(screen.getByLabelText(/Beschreibung/i)).toHaveValue("Belege holen");
    expect(screen.getByLabelText(/Priorität/i)).toHaveValue("high");
    expect(screen.getByLabelText(/Fällig/i)).toHaveValue("2026-09-20");
  });

  it("saves only the fields that changed", async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), {
      target: { value: "Zeile eins\nZeile zwei" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { description: "Zeile eins\nZeile zwei" });
    });
  });

  it("closes without saving when nothing changed", async () => {
    const { onSave, onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("discards the draft on cancel", () => {
    const { onSave, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "verworfen" } });
    fireEvent.click(screen.getByRole("button", { name: /Abbrechen/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses an empty title and stays open", async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText(/Titel/i), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    expect(await screen.findByText(/Titel darf nicht leer sein/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves on Ctrl+Enter", async () => {
    const { onSave } = renderModal();

    const description = screen.getByLabelText(/Beschreibung/i);
    fireEvent.change(description, { target: { value: "Text" } });
    fireEvent.keyDown(description, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { description: "Text" }));
  });

  it("stays open and shows the error when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Datenbank weg"));
    const onClose = vi.fn();
    render(
      <TodoDetailModal
        todo={makeTodo()}
        categories={categories}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "Text" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    expect(await screen.findByText(/Datenbank weg/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
