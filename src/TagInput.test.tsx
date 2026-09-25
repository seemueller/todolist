import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "./TagInput";
import { draftTags } from "./types";

// Der Entwurf liegt beim Aufrufer; der Wrapper haelt ihn wie das Detailfenster.
function Harness({
  value,
  onValueChange,
  suggestions = ["frontend", "backend"],
}: {
  value: string[];
  onValueChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  return (
    <TagInput
      id="tags"
      value={value}
      suggestions={suggestions}
      onValueChange={onValueChange}
      draft={draft}
      onDraftChange={setDraft}
    />
  );
}

function setup(value: string[] = []) {
  const onValueChange = vi.fn();
  render(<Harness value={value} onValueChange={onValueChange} />);
  const field = screen.getByRole("combobox");
  return { onValueChange, field };
}

describe("draftTags", () => {
  it("teilt am Komma, normalisiert und laesst Unbrauchbares weg", () => {
    expect(draftTags("UX Review, b,, " + "x".repeat(41))).toEqual(["ux-review", "b"]);
  });

  it("liefert fuer einen leeren Entwurf nichts", () => {
    expect(draftTags("")).toEqual([]);
  });
});

describe("TagInput", () => {
  it("uebernimmt mit Enter normalisiert", () => {
    const { onValueChange, field } = setup(["alt"]);
    fireEvent.change(field, { target: { value: "UX Review" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith(["alt", "ux-review"]);
    expect(field).toHaveValue("");
  });

  it("uebernimmt mit Komma und teilt eingefuegte Kommalisten", () => {
    const { onValueChange, field } = setup();
    fireEvent.change(field, { target: { value: "a, b" } });
    fireEvent.keyDown(field, { key: "," });
    expect(onValueChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("uebernimmt beim Verlassen des Felds", () => {
    const { onValueChange, field } = setup();
    fireEvent.change(field, { target: { value: "frontend" } });
    fireEvent.blur(field);
    expect(onValueChange).toHaveBeenCalledWith(["frontend"]);
  });

  it("laesst einen unbrauchbaren Entwurf stehen", () => {
    const { onValueChange, field } = setup();
    fireEvent.change(field, { target: { value: "x".repeat(41) } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(field).toHaveValue("x".repeat(41));
  });

  it("laesst Strg+Enter zum Sichern durch", () => {
    const { onValueChange, field } = setup();
    fireEvent.change(field, { target: { value: "frontend" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("nimmt mit Backspace im leeren Feld den letzten Chip weg", () => {
    const { onValueChange, field } = setup(["a", "b"]);
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(onValueChange).toHaveBeenCalledWith(["a"]);
  });

  it("entfernt einen Tag ueber seinen Chip", () => {
    const { onValueChange } = setup(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: "Tag a entfernen" }));
    expect(onValueChange).toHaveBeenCalledWith(["b"]);
  });

  it("setzt den Fokus nach dem Entfernen ins Textfeld", () => {
    const { field } = setup(["a", "b"]);
    const remove = screen.getByRole("button", { name: "Tag a entfernen" });
    remove.focus();
    fireEvent.click(remove);
    expect(field).toHaveFocus();
  });

  it("bietet nur Vorschlaege an, die noch nicht gesetzt sind", () => {
    const { container } = render(<Harness value={["frontend"]} onValueChange={() => {}} />);
    const options = [...container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(["backend"]);
  });
});
