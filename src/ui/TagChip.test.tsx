import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagChip } from "./TagChip";

describe("TagChip", () => {
  it("zeigt den Tag", () => {
    render(<TagChip tag="frontend" />);
    expect(screen.getByText("frontend")).toHaveClass("tag-chip");
  });

  it("hat ohne onRemove keinen Knopf", () => {
    render(<TagChip tag="frontend" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ruft onRemove ueber den benannten Knopf", () => {
    const onRemove = vi.fn();
    render(<TagChip tag="frontend" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Tag frontend entfernen" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("nimmt in der Kanban-Variante die Kanban-Klasse", () => {
    const { container } = render(<TagChip tag="a" variant="kanban" />);
    expect(container.firstElementChild).toHaveClass("tag-chip", "tag-chip--kanban");
  });

  it("setzt keine Farbe inline", () => {
    const { container } = render(<TagChip tag="a" />);
    expect(container.firstElementChild?.getAttribute("style")).toBeNull();
  });
});
