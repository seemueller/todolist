import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TypeFilterBar } from "./TypeFilterBar";

describe("TypeFilterBar", () => {
  it("bietet Alle und die drei Typen in fester Reihenfolge an", () => {
    render(<TypeFilterBar value="all" onValueChange={() => {}} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Alle", "Bug", "Task", "Story"]);
  });

  it("markiert den gewaehlten Typ als aktiv", () => {
    render(<TypeFilterBar value="bug" onValueChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Typ Bug" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Typ Alle" })).not.toHaveClass("active");
  });

  it("meldet den angeklickten Wert zurueck", () => {
    const onValueChange = vi.fn();
    render(<TypeFilterBar value="all" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Typ Story" }));
    expect(onValueChange).toHaveBeenCalledWith("story");
  });

  it("traegt die Klasse .type-filter und die Gruppenbeschriftung", () => {
    render(<TypeFilterBar value="all" onValueChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Typ filtern" })).toHaveClass("type-filter");
  });
});
