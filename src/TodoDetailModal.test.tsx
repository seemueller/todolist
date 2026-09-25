import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TodoDetailModal } from "./TodoDetailModal";
import { Category, Todo } from "./types";
import { TODO_MODAL_SIZE_KEY } from "./listPrefs";

const categories: Category[] = [
  { id: 1, name: "Arbeit", color: "#7cc3f7", created_at: "2026-01-01T00:00:00.000Z", time_kind: "internal" },
];

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 7,
    title: "Steuererklärung",
    description: "",
    done: false,
    status: "todo",
    type: "task",
    tags: [],
    created_at: "2026-09-13T10:00:00.000Z",
    due_date: null,
    category_id: null,
    category_name: null,
    category_color: null,
    board_order: 0,
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

/**
 * Das Textfeld der Beschreibung. Das Fenster oeffnet bei einer vorhandenen
 * Beschreibung im Lesemodus, darum schaltet der Helfer vorher um, wenn noetig.
 * Die Tests, die ihn nutzen, sind damit bewusst modusblind -- welcher Modus
 * beim Oeffnen gilt, pruefen die beiden Tests darunter eigens.
 */
function descriptionInput(): HTMLElement {
  const toEdit = screen.queryByRole("button", { name: "Beschreibung bearbeiten" });
  if (toEdit) fireEvent.click(toEdit);
  return screen.getByLabelText("Beschreibung");
}

describe("TodoDetailModal — Fenstergroesse", () => {
  beforeEach(() => localStorage.clear());

  function panel(): HTMLElement {
    return screen.getByRole("heading", { name: "Aufgabe bearbeiten" }).closest(".todo-modal")!;
  }

  it("oeffnet ohne gespeicherte Groesse in der Breite aus dem CSS", () => {
    renderModal();
    expect(panel().style.width).toBe("");
    expect(panel().style.height).toBe("");
  });

  it("uebernimmt die zuletzt gezogene Groesse", () => {
    localStorage.setItem(TODO_MODAL_SIZE_KEY, JSON.stringify({ width: 900, height: 620 }));
    renderModal();

    expect(panel().style.width).toBe("900px");
    expect(panel().style.height).toBe("620px");
  });

  // Das Speichern haengt am ResizeObserver und am Anfasser des Browsers --
  // jsdom hat beides nicht. Geprueft wird es in e2e/todolist.spec.ts
  // ("zieht das Fenster groesser und merkt sich die Groesse").
  it("schreibt beim blossen Oeffnen nichts in die Vorlieben", () => {
    renderModal();
    expect(localStorage.getItem(TODO_MODAL_SIZE_KEY)).toBeNull();
  });
});

describe("TodoDetailModal", () => {
  it("shows the current values of the todo", () => {
    renderModal({ description: "Belege holen", type: "bug", due_date: "2026-09-20" });

    expect(screen.getByLabelText(/Titel/i)).toHaveValue("Steuererklärung");
    expect(descriptionInput()).toHaveValue("Belege holen");
    expect(screen.getByLabelText(/Typ/i)).toHaveValue("bug");
    expect(screen.getByLabelText(/Fällig/i)).toHaveValue("2026-09-20");
  });

  it("opens in reading mode and renders the description as markdown", () => {
    renderModal({ description: "## Kontext\n\n- **Betrag** prüfen" });

    // Die Leseflaeche traegt denselben Namen wie das Textfeld, darum ueber die
    // Rolle: ein Eingabefeld gibt es im Lesemodus nicht.
    expect(screen.queryByRole("textbox", { name: "Beschreibung" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Beschreibung" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Kontext" })).toBeInTheDocument();
    expect(screen.getByText("Betrag")).toBeInTheDocument();
  });

  it("opens in writing mode when there is no description yet", () => {
    renderModal();

    expect(screen.getByLabelText("Beschreibung")).toHaveValue("");
  });

  it("switches between writing and reading", () => {
    renderModal({ description: "Belege holen" });

    fireEvent.click(screen.getByRole("button", { name: "Beschreibung bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: "# Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "Beschreibung lesen" }));

    // Gelesen wird der Entwurf, nicht der gesicherte Stand.
    expect(screen.getByRole("heading", { level: 3, name: "Neu" })).toBeInTheDocument();
  });

  it("shows an empty state when the description was cleared", () => {
    renderModal({ description: "Belege holen" });

    fireEvent.click(screen.getByRole("button", { name: "Beschreibung bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Beschreibung lesen" }));

    expect(screen.getByText("Keine Beschreibung")).toBeInTheDocument();
  });

  it("saves only the fields that changed", async () => {
    const { onSave } = renderModal();

    fireEvent.change(descriptionInput(), {
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

    fireEvent.change(descriptionInput(), { target: { value: "verworfen" } });
    fireEvent.click(screen.getByRole("button", { name: /Abbrechen/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("treats a whitespace-only description as empty", async () => {
    const { onSave } = renderModal({ description: "Belege holen" });

    fireEvent.change(descriptionInput(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { description: "" });
    });
  });

  it("keeps leading and trailing newlines around real text", async () => {
    const { onSave } = renderModal();

    fireEvent.change(descriptionInput(), {
      target: { value: "\n\nText\n\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { description: "\n\nText\n\n" });
    });
  });

  it("puts an empty description alone in the patch when a filled one is cleared", async () => {
    const { onSave } = renderModal({ description: "Belege holen" });

    fireEvent.change(descriptionInput(), { target: { value: "" } });
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

    const description = descriptionInput();
    fireEvent.change(description, { target: { value: "Text" } });
    fireEvent.keyDown(description, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { description: "Text" }));
  });

  it("saves on Ctrl+Enter from the Abbrechen button, outside the body", async () => {
    const { onSave } = renderModal();

    fireEvent.change(descriptionInput(), { target: { value: "Text" } });
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

    fireEvent.change(descriptionInput(), { target: { value: "Text" } });
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

    fireEvent.change(descriptionInput(), { target: { value: "Belege holen" } });

    // Waehrend das Fenster offen ist, aendert sich die Aufgabe von aussen --
    // z. B. weil der MCP-Server den Titel setzt und die App neu laedt.
    // Der Entwurf im Fenster hat den Titel nie angefasst.
    rerender(
      <TodoDetailModal
        todo={{ ...original, title: "Von aussen umbenannt" }}
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

  it("puts the changed title alone in the patch", async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText(/Titel/i), { target: { value: "Steuer 2026" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(7, { title: "Steuer 2026" });
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

    const description = descriptionInput();
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

    fireEvent.change(descriptionInput(), { target: { value: "Text" } });
    fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Sichern/i })).toBeDisabled());

    await act(async () => {
      resolveSave();
    });
  });
  describe("Aufgabentyp", () => {
    it("zeigt den Typ der Aufgabe", () => {
      renderModal({ type: "bug" });

      expect(screen.getByLabelText("Typ")).toHaveValue("bug");
    });

    it("schickt den geänderten Typ im Patch", async () => {
      const { onSave } = renderModal({ type: "task" });

      fireEvent.change(screen.getByLabelText("Typ"), { target: { value: "story" } });
      fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

      await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { type: "story" }));
    });

    it("lässt den Typ aus dem Patch, wenn er sich nicht geändert hat", async () => {
      const { onSave } = renderModal({ type: "bug" });

      fireEvent.change(screen.getByLabelText(/Titel/i), { target: { value: "Neu" } });
      fireEvent.click(screen.getByRole("button", { name: /Sichern/i }));

      await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { title: "Neu" }));
    });
  });
});

describe("TodoDetailModal tags", () => {
  it("schreibt geaenderte Tags in den Patch", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailModal
        todo={makeTodo({ tags: ["alt"] })}
        categories={categories}
        tagSuggestions={["frontend"]}
        onSave={onSave}
        onClose={() => {}}
      />
    );

    const field = screen.getByLabelText("Tags");
    fireEvent.change(field, { target: { value: "Neu Tag" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("neu-tag")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { tags: ["alt", "neu-tag"] }));
  });

  it("laesst unveraenderte Tags aus dem Patch", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailModal
        todo={makeTodo({ tags: ["alt"] })}
        categories={categories}
        onSave={onSave}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Anders" } });
    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { title: "Anders" }));
  });

  it("uebernimmt einen nicht bestaetigten Tag beim Klick auf Sichern", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailModal todo={makeTodo()} categories={categories} onSave={onSave} onClose={() => {}} />
    );

    const field = screen.getByLabelText("Tags");
    fireEvent.change(field, { target: { value: "frontend" } });
    fireEvent.blur(field);
    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { tags: ["frontend"] }));
  });

  it("nimmt den getippten Tag bei Strg+Enter mit", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailModal todo={makeTodo()} categories={categories} onSave={onSave} onClose={() => {}} />
    );

    const field = screen.getByLabelText("Tags");
    fireEvent.change(field, { target: { value: "frontend" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { tags: ["frontend"] }));
  });
});
