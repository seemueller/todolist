import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagFilterEditor } from "./TagFilterEditor";
import type { TagFilter } from "./tagFilter";
import { MAX_TAG_CHARS } from "./types";

function setup(filter: TagFilter | null, knownTags = ["frontend", "blocked"]) {
  const props = { onSave: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
  render(<TagFilterEditor filter={filter} knownTags={knownTags} {...props} />);
  return props;
}

describe("TagFilterEditor", () => {
  it("baut einen neuen Filter aus hat und hat nicht", () => {
    const { onSave } = setup(null);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Frontend offen " } });
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "Frontend" } });
    fireEvent.click(screen.getByRole("button", { name: "Regel hinzufügen" }));
    fireEvent.change(screen.getByLabelText("Regel 2 Art"), { target: { value: "lacks" } });
    fireEvent.change(screen.getByLabelText("Regel 2 Tag"), { target: { value: "blocked" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as TagFilter;
    expect(saved).toMatchObject({
      name: "Frontend offen",
      match: "all",
      rules: [
        { kind: "has", tag: "frontend" },
        { kind: "lacks", tag: "blocked" },
      ],
    });
    expect(saved.id).not.toBe("");
  });

  it("stellt auf mindestens eine um", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "N" } });
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Mindestens eine" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ match: "any" });
  });

  it("hat keine Tags braucht kein Tag-Feld", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ungetaggt" } });
    fireEvent.change(screen.getByLabelText("Regel 1 Art"), { target: { value: "untagged" } });
    expect(screen.queryByLabelText("Regel 1 Tag")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ rules: [{ kind: "untagged" }] });
  });

  it("verlangt einen Namen", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Der Filter braucht einen Namen.")).toBeInTheDocument();
  });

  it("verlangt einen Tag in jeder hat-Regel", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "N" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Regel 1: Tag fehlt.")).toBeInTheDocument();
  });

  it("meldet nur Leerraum als fehlenden Tag", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "N" } });
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Regel 1: Tag fehlt.")).toBeInTheDocument();
  });

  it("meldet einen zu langen Tag als zu lang, nicht als fehlend", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "N" } });
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), {
      target: { value: "x".repeat(MAX_TAG_CHARS + 1) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(`Regel 1: Tag ist länger als ${MAX_TAG_CHARS} Zeichen.`)
    ).toBeInTheDocument();
    expect(screen.queryByText("Regel 1: Tag fehlt.")).toBeNull();
  });

  it("raeumt die Fehlermeldung weg, sobald der Name geaendert wird", () => {
    setup(null);
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Der Filter braucht einen Namen.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "N" } });
    expect(screen.queryByText("Der Filter braucht einen Namen.")).toBeNull();
  });

  it("raeumt die Fehlermeldung weg, sobald eine Regel geaendert wird", () => {
    setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "N" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Regel 1: Tag fehlt.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "a" } });
    expect(screen.queryByText("Regel 1: Tag fehlt.")).toBeNull();

    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Regel 1: Tag fehlt.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Regel 1 Art"), { target: { value: "untagged" } });
    expect(screen.queryByText("Regel 1: Tag fehlt.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Regel hinzufügen" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Regel 2: Tag fehlt.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Regel 2 entfernen" }));
    expect(screen.queryByText("Regel 2: Tag fehlt.")).toBeNull();
  });

  it("markiert einen Tag, den keine Aufgabe traegt", () => {
    setup({ id: "f1", name: "Alt", match: "all", rules: [{ kind: "has", tag: "weg" }] }, []);
    expect(screen.getByText("unbekannt")).toBeInTheDocument();
  });

  it("behaelt beim Bearbeiten die Id und kann loeschen", () => {
    const filter: TagFilter = { id: "f1", name: "Alt", match: "any", rules: [{ kind: "has", tag: "frontend" }] };
    const { onSave, onDelete } = setup(filter);

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave.mock.calls[0][0]).toEqual(filter);

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(onDelete).toHaveBeenCalledWith("f1");
  });

  it("entfernt eine Regel", () => {
    const { onSave } = setup({
      id: "f1", name: "N", match: "all",
      rules: [{ kind: "has", tag: "frontend" }, { kind: "lacks", tag: "blocked" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Regel 1 entfernen" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ rules: [{ kind: "lacks", tag: "blocked" }] });
  });
});
