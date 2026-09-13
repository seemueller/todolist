import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

  it("treats a whitespace-only description as empty", async () => {
    const { onSave } = renderModal({ description: "Belege holen" });

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { description: "" });
    });
  });

  it("keeps leading and trailing newlines around real text", async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), {
      target: { value: "\n\nText\n\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { description: "\n\nText\n\n" });
    });
  });

  it("puts an empty description alone in the patch when a filled one is cleared", async () => {
    const { onSave } = renderModal({ description: "Belege holen" });

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { description: "" });
    });
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

  it("saves on Ctrl+Enter from the Abbrechen button, outside the body", async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "Text" } });
    fireEvent.keyDown(screen.getByRole("button", { name: /Abbrechen/i }), {
      key: "Enter",
      ctrlKey: true,
    });

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

  it("diffs against the todo as it was opened, not against a later prop update", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const original = makeTodo();
    const { rerender } = render(
      <TodoDetailModal todo={original} categories={categories} onSave={onSave} onClose={onClose} />,
    );

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "Belege holen" } });

    // Waehrend das Fenster offen ist, aendert sich die Aufgabe von aussen --
    // z. B. weil der MCP-Server die Prioritaet setzt und die App neu laedt.
    // Der Entwurf im Fenster hat die Prioritaet nie angefasst.
    rerender(
      <TodoDetailModal
        todo={{ ...original, priority: "high" }}
        categories={categories}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { description: "Belege holen" });
    });
  });

  it("puts the changed priority alone in the patch", async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText(/Priorität/i), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { priority: "high" });
    });
  });

  it("sets dueDate to null in the patch when a due date is cleared", async () => {
    const { onSave } = renderModal({ due_date: "2026-09-20" });

    fireEvent.change(screen.getByLabelText(/Fällig/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { dueDate: null });
    });
  });

  it("sets categoryId to null in the patch when the category is reset to none", async () => {
    const { onSave } = renderModal({ category_id: 1, category_name: "Arbeit", category_color: "#7cc3f7" });

    fireEvent.change(screen.getByLabelText(/Kategorie/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { categoryId: null });
    });
  });

  it("does not close when a drag started in the textarea ends on the overlay", () => {
    const { onClose } = renderModal();

    const description = screen.getByLabelText(/Beschreibung/i);
    fireEvent.mouseDown(description);
    fireEvent.click(document.querySelector(".modal-overlay")!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when mouseDown and click both land on the overlay", () => {
    const { onClose } = renderModal();

    const overlay = document.querySelector(".modal-overlay")!;
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalled();
  });

  it("disables Sichern while the save is in flight", async () => {
    let resolveSave: () => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <TodoDetailModal todo={makeTodo()} categories={categories} onSave={onSave} onClose={onClose} />,
    );

    fireEvent.change(screen.getByLabelText(/Beschreibung/i), { target: { value: "Text" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Sichern/i })).toBeDisabled());

    await act(async () => {
      resolveSave();
    });
  });
});
