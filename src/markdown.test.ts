import { describe, it, expect } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";
import type { Block, Inline } from "./markdown";

/** Text aller Textstuecke, ohne Struktur -- fuer Zusicherungen, bei denen nur
 *  zaehlt, dass nichts verschwunden ist. */
function flatten(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return node.text;
        case "code":
          return node.text;
        case "break":
          return "\n";
        default:
          return flatten(node.children);
      }
    })
    .join("");
}

describe("parseMarkdown — Bloecke", () => {
  it("macht aus Leerzeilen getrennte Absaetze", () => {
    const blocks = parseMarkdown("Erster Absatz\n\nZweiter Absatz");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph"]);
    expect(flatten((blocks[0] as Extract<Block, { kind: "paragraph" }>).children)).toBe(
      "Erster Absatz",
    );
  });

  it("haelt den Zeilenumbruch innerhalb eines Absatzes fest", () => {
    const [block] = parseMarkdown("Zeile eins\nZeile zwei");
    expect(block).toEqual({
      kind: "paragraph",
      children: [
        { kind: "text", text: "Zeile eins" },
        { kind: "break" },
        { kind: "text", text: "Zeile zwei" },
      ],
    });
  });

  it("erkennt Ueberschriften und deckelt sie bei Ebene drei", () => {
    const blocks = parseMarkdown("# Eins\n## Zwei\n##### Fuenf");
    expect(blocks.map((b) => (b as Extract<Block, { kind: "heading" }>).level)).toEqual([1, 2, 3]);
  });

  it("liest Aufzaehlung und nummerierte Liste getrennt", () => {
    const blocks = parseMarkdown("- a\n- b\n\n1. x\n2. y");
    expect(blocks.map((b) => (b as Extract<Block, { kind: "list" }>).ordered)).toEqual([
      false,
      true,
    ]);
    expect((blocks[0] as Extract<Block, { kind: "list" }>).items).toHaveLength(2);
  });

  it("behaelt die Startnummer einer nummerierten Liste", () => {
    const [list] = parseMarkdown("3. drei\n4) vier");
    const block = list as Extract<Block, { kind: "list" }>;
    expect(block.ordered).toBe(true);
    expect(block.start).toBe(3);
    expect(block.items).toHaveLength(2);
  });

  it("beginnt bei einem Wechsel der Aufzaehlungsart eine neue Liste", () => {
    const blocks = parseMarkdown("- a\n1. x");
    expect(blocks.map((b) => (b as Extract<Block, { kind: "list" }>).ordered)).toEqual([
      false,
      true,
    ]);
  });

  it("liest Checklisten samt Zustand", () => {
    const [list] = parseMarkdown("- [ ] offen\n- [x] erledigt");
    const items = (list as Extract<Block, { kind: "list" }>).items;
    expect(items.map((i) => i.checked)).toEqual([false, true]);
    expect(flatten(items[1].children)).toBe("erledigt");
  });

  it("haengt die Folgezeile an den laufenden Listenpunkt", () => {
    const [list] = parseMarkdown("- erste Zeile\n  zweite Zeile\n- zweiter Punkt");
    const items = (list as Extract<Block, { kind: "list" }>).items;
    expect(items).toHaveLength(2);
    expect(flatten(items[0].children)).toBe("erste Zeile\nzweite Zeile");
  });

  it("nimmt einen Codeblock woertlich", () => {
    const [block] = parseMarkdown("```\n- kein Listenpunkt\n**kein Fett**\n```");
    expect(block).toEqual({ kind: "code", text: "- kein Listenpunkt\n**kein Fett**" });
  });

  it("beendet einen Codeblock ohne schliessenden Zaun am Textende", () => {
    const [block] = parseMarkdown("```\nabc");
    expect(block).toEqual({ kind: "code", text: "abc" });
  });

  it("liest ein Zitat als eigene Bloecke", () => {
    const [block] = parseMarkdown("> ## Titel\n> Text");
    const quote = block as Extract<Block, { kind: "quote" }>;
    expect(quote.kind).toBe("quote");
    expect(quote.blocks.map((b) => b.kind)).toEqual(["heading", "paragraph"]);
  });

  it("kommt mit leerem Text aus", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n   \n")).toEqual([]);
  });

  it("haengt die Folgezeile eines Zitats ans Zitat", () => {
    const [block] = parseMarkdown("> Zitat\nnoch Zitat");
    const quote = block as Extract<Block, { kind: "quote" }>;
    expect(quote.blocks).toHaveLength(1);
    expect(flatten((quote.blocks[0] as Extract<Block, { kind: "paragraph" }>).children)).toBe(
      "Zitat\nnoch Zitat",
    );
  });

  it("erkennt alle Schreibweisen der Trennlinie", () => {
    for (const line of ["---", "***", "___", "- - -"]) {
      expect(parseMarkdown(line)).toEqual([{ kind: "rule" }]);
    }
  });

  // Der Deckel verwirft die Schachtelung, nicht den Text -- das Modul
  // verspricht im Kopfkommentar, dass nichts verschwindet.
  it("verschluckt sich nicht an tief geschachtelten Zitaten und behaelt den Text", () => {
    const blocks = parseMarkdown("> ".repeat(50) + "tief");
    expect(blocks[0].kind).toBe("quote");
    const text = JSON.stringify(blocks);
    expect(text).toContain("tief");
  });
});

describe("parseInline", () => {
  it("liest fett, kursiv und gestrichen", () => {
    expect(parseInline("**a** *b* ~~c~~")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "a" }] },
      { kind: "text", text: " " },
      { kind: "em", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " " },
      { kind: "del", children: [{ kind: "text", text: "c" }] },
    ]);
  });

  it("laesst Unterstriche im Wort in Ruhe", () => {
    expect(parseInline("snake_case_name")).toEqual([{ kind: "text", text: "snake_case_name" }]);
  });

  it("deutet in Code nichts weiter", () => {
    expect(parseInline("`**roh**`")).toEqual([{ kind: "code", text: "**roh**" }]);
  });

  it("macht aus einem Link ein Linkstueck", () => {
    expect(parseInline("[Doku](https://example.org/a)")).toEqual([
      {
        kind: "link",
        href: "https://example.org/a",
        children: [{ kind: "text", text: "Doku" }],
      },
    ]);
  });

  it("verlinkt eine nackte Adresse und laesst das Satzzeichen stehen", () => {
    expect(parseInline("siehe https://example.org.")).toEqual([
      { kind: "text", text: "siehe " },
      {
        kind: "link",
        href: "https://example.org",
        children: [{ kind: "text", text: "https://example.org" }],
      },
      { kind: "text", text: "." },
    ]);
  });

  // Der Parser ist die einzige Stelle, die entscheidet, was ein Link wird --
  // und Beschreibungen schreibt auch ein Modell ueber MCP.
  it("macht aus javascript: keinen Link", () => {
    const nodes = parseInline("[klick](javascript:alert(1))");
    expect(nodes.every((n) => n.kind !== "link")).toBe(true);
    expect(flatten(nodes)).toContain("klick");
  });

  it("setzt ***Text*** fett und kursiv", () => {
    expect(parseInline("***beides***")).toEqual([
      {
        kind: "strong",
        children: [{ kind: "em", children: [{ kind: "text", text: "beides" }] }],
      },
    ]);
  });

  it("liest __fett__ als fett", () => {
    expect(parseInline("__fett__")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "fett" }] },
    ]);
  });

  it("erlaubt mailto und Grossschreibung im Schema", () => {
    expect(parseInline("[Mail](mailto:a@b.de)")).toEqual([
      { kind: "link", href: "mailto:a@b.de", children: [{ kind: "text", text: "Mail" }] },
    ]);
    expect(parseInline("[X](HTTPS://example.org)")[0].kind).toBe("link");
  });

  it("behaelt gepaarte Klammern in der Adresse", () => {
    expect(parseInline("[a](https://example.org/x(y))")).toEqual([
      {
        kind: "link",
        href: "https://example.org/x(y)",
        children: [{ kind: "text", text: "a" }],
      },
    ]);
  });

  // Ein Link ohne Kindknoten rendert nichts und waere spurlos verschwunden.
  it("nimmt die Adresse als Beschriftung, wenn die Beschriftung leer ist", () => {
    expect(parseInline("[](https://example.org)")).toEqual([
      {
        kind: "link",
        href: "https://example.org",
        children: [{ kind: "text", text: "https://example.org" }],
      },
    ]);
  });

  it("behaelt den Weissraum in Code, bis auf das trennende Leerzeichen", () => {
    expect(parseInline("` a `")).toEqual([{ kind: "code", text: "a" }]);
    expect(parseInline("`  a  `")).toEqual([{ kind: "code", text: " a " }]);
  });

  it("laesst unvollstaendige Konstrukte als Text stehen", () => {
    expect(flatten(parseInline("a `b"))).toBe("a `b");
    expect(flatten(parseInline("[nur Text]"))).toBe("[nur Text]");
    expect(flatten(parseInline("[a](https://example.org"))).toBe("[a](https://example.org");
  });

  it("liest die Beschriftung eines Links selbst als Markdown", () => {
    const [link] = parseInline("[**fett**](https://example.org)");
    expect(link).toEqual({
      kind: "link",
      href: "https://example.org",
      children: [{ kind: "strong", children: [{ kind: "text", text: "fett" }] }],
    });
  });

  // Reproduziert den Befund aus dem Review: ohne Deckel wirft das den Stack.
  it("verschluckt sich nicht an tief geschachtelten Links", () => {
    let text = "tief";
    for (let i = 0; i < 4000; i += 1) text = `[${text}](https://example.org)`;
    expect(() => parseInline(text)).not.toThrow();
  });

  it("bleibt bei vielen offenen Klammern schnell", () => {
    const started = Date.now();
    parseInline("[".repeat(100_000));
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("gibt maskierte Zeichen als Text zurueck", () => {
    expect(parseInline("2 \\* 3 \\*\\* 4")).toEqual([{ kind: "text", text: "2 * 3 ** 4" }]);
  });

  it("laesst eine unvollstaendige Betonung als Text stehen", () => {
    expect(flatten(parseInline("ein * einzelner Stern"))).toBe("ein * einzelner Stern");
    expect(flatten(parseInline("**ohne Ende"))).toBe("**ohne Ende");
  });

  it("deutet rohes HTML nicht, sondern gibt es als Text zurueck", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([
      { kind: "text", text: "<img src=x onerror=alert(1)>" },
    ]);
  });
});
