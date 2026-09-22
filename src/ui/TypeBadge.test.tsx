import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypeBadge } from "./TypeBadge";

describe("TypeBadge", () => {
  it("beschriftet die drei Typen", () => {
    render(<TypeBadge type="bug" />);
    expect(screen.getByText("Bug")).toBeInTheDocument();
  });

  it("traegt die Farbklasse des Typs", () => {
    const { container } = render(<TypeBadge type="story" />);
    const badge = container.firstElementChild;
    expect(badge).toHaveClass("type-badge");
    expect(badge).toHaveClass("type-badge--story");
  });

  it("nimmt in der Kanban-Variante die Kanban-Klasse", () => {
    const { container } = render(<TypeBadge variant="kanban" type="task" />);
    const badge = container.firstElementChild;
    expect(badge).toHaveClass("kanban-type-badge");
    expect(badge).toHaveClass("type-badge--task");
  });

  it("setzt keine Farbe inline", () => {
    // Die Flaeche gehoert der Klasse; ein Inline-Style waere der Weg, auf dem
    // ein Hexwert aus App.css nach TypeScript wandert.
    const { container } = render(<TypeBadge type="bug" />);
    expect(container.firstElementChild?.getAttribute("style")).toBeNull();
  });
});
