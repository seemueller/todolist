import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TypeSelect } from "./TypeSelect";

describe("TypeSelect", () => {
  it("bietet die drei Typen in fester Reihenfolge an", () => {
    render(<TypeSelect value="task" onValueChange={() => {}} aria-label="Typ" />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Bug", "Task", "Story"]);
  });

  it("meldet die Auswahl als Typ zurueck", () => {
    const onValueChange = vi.fn();
    render(<TypeSelect value="task" onValueChange={onValueChange} aria-label="Typ" />);
    fireEvent.change(screen.getByLabelText("Typ"), { target: { value: "bug" } });
    expect(onValueChange).toHaveBeenCalledWith("bug");
  });

  it("traegt die Klasse .type-select", () => {
    render(<TypeSelect value="story" onValueChange={() => {}} aria-label="Typ" />);
    expect(screen.getByLabelText("Typ")).toHaveClass("type-select");
  });
});
