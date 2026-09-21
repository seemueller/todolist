import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("rendert Ueberschrift, Liste und Betonung", () => {
    const { container } = render(
      <Markdown text={"## Kontext\n\nRechnung kam am 3.9.\n\n- **Betrag** prüfen\n- Freigabe"} />,
    );

    expect(screen.getByRole("heading", { level: 4, name: "Kontext" })).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("strong")).toHaveTextContent("Betrag");
  });

  it("rendert eine Checkliste mit vorlesbarem Zustand", () => {
    render(<Markdown text={"- [x] erledigt\n- [ ] offen"} />);

    expect(screen.getByRole("img", { name: "erledigt" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "offen" })).toBeInTheDocument();
  });

  it("verlinkt nur erlaubte Schemata", () => {
    const { container } = render(
      <Markdown text={"[gut](https://example.org) [boese](javascript:alert(1))"} />,
    );

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.org");
    expect(container.textContent).toContain("boese");
  });

  // Der Baustein baut Elemente, keinen HTML-String -- rohes Markup bleibt Text.
  it("rendert rohes HTML als Text", () => {
    const { container } = render(<Markdown text={"<b>fett</b> <script>böse()</script>"} />);

    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<b>fett</b>");
  });

  it("rendert nichts, wenn der Text leer ist", () => {
    const { container } = render(<Markdown text="   " />);
    expect(container).toBeEmptyDOMElement();
  });
});
