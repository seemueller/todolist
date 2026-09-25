import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagFilterSelect } from "./TagFilterSelect";
import type { TagFilter } from "../tagFilter";

const FILTERS: TagFilter[] = [
  { id: "f1", name: "Frontend", match: "all", rules: [] },
  { id: "f2", name: "Backend", match: "all", rules: [] },
];

function setup(activeId: string | null) {
  const props = { onActiveChange: vi.fn(), onEdit: vi.fn(), onCreate: vi.fn() };
  render(<TagFilterSelect filters={FILTERS} activeId={activeId} {...props} />);
  return props;
}

describe("TagFilterSelect", () => {
  it("bietet keinen und alle gespeicherten Filter an", () => {
    setup(null);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Kein Tag-Filter", "Frontend", "Backend"]);
  });

  it("meldet die Auswahl, leer als null", () => {
    const { onActiveChange } = setup("f1");
    const select = screen.getByLabelText("Tag-Filter");
    fireEvent.change(select, { target: { value: "f2" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(onActiveChange.mock.calls).toEqual([["f2"], [null]]);
  });

  it("sperrt Bearbeiten ohne gewaehlten Filter", () => {
    setup(null);
    expect(screen.getByRole("button", { name: "Tag-Filter bearbeiten" })).toBeDisabled();
  });

  it("ruft Bearbeiten und Neu", () => {
    const { onEdit, onCreate } = setup("f1");
    fireEvent.click(screen.getByRole("button", { name: "Tag-Filter bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Neuer Tag-Filter" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
