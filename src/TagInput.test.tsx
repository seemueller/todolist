import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "./TagInput";

function setup(value: string[] = []) {
  const onValueChange = vi.fn();
  render(<TagInput id="tags" value={value} suggestions={["frontend", "backend"]} onValueChange={onValueChange} />);
  const field = screen.getByRole("combobox");
  return { onValueChange, field };
}

describe("TagInput", () => {
  it("uebernimmt mit Enter normalisiert", () => {
    const { onValueChange, field } = setup(["alt"]);
    fireEvent.change(field, { target: { value: "UX Review" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith(["alt", "ux-review"]);
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

  it("bietet nur Vorschlaege an, die noch nicht gesetzt sind", () => {
    const { container } = render(
      <TagInput value={["frontend"]} suggestions={["frontend", "backend"]} onValueChange={() => {}} />
    );
    const options = [...container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(["backend"]);
  });
});
