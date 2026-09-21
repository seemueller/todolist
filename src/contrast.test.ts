import { readFileSync } from "node:fs";
// Wie in migrations.test.ts: jsdom ersetzt das globale URL, das relative Pfade
// gegen eine erfundene Seitenherkunft aufloest statt gegen das Dateisystem.
import { URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { CANVAS_HEX, INK_HEX, contrastRatio, luminance, readableInk } from "./contrast";
import { CATEGORY_COLORS } from "./types";

/** Den Wert eines Tokens aus dem :root-Block von App.css lesen. */
function token(name: string): string {
  const css = readFileSync(new NodeURL("./App.css", import.meta.url), "utf8");
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8});`));
  if (!match) throw new Error(`Token --${name} steht nicht in App.css`);
  return match[1];
}

describe("contrast", () => {
  it("haelt die Hexwerte mit den Token in App.css gleich", () => {
    // Laufen sie auseinander, rechnet readableInk gegen Farben, die die App
    // gar nicht mehr benutzt -- ohne dass irgendetwas sichtbar bricht.
    expect(INK_HEX).toBe(token("ink"));
    expect(CANVAS_HEX).toBe(token("canvas"));
  });

  it("rechnet die Leuchtdichte der Extreme aus", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBeCloseTo(0, 5);
  });

  it("versteht Kurzform, Grossschreibung und fehlendes Doppelkreuz", () => {
    expect(luminance("#FFF")).toBeCloseTo(1, 5);
    expect(luminance("ffffff")).toBeCloseTo(1, 5);
  });

  it("rechnet das Kontrastverhaeltnis von Schwarz auf Weiss aus", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("nimmt auf den Farben der Palette die Tinte", () => {
    expect(readableInk("#ffd43b")).toBe("var(--ink)");
    expect(readableInk("#7cc3f7")).toBe("var(--ink)");
    // Auch das dunkelste Rot der Palette traegt die Tinte noch mit 4,58:1.
    expect(readableInk("#e5401a")).toBe("var(--ink)");
  });

  it("nimmt auf einer dunklen Farbe die Grundflaeche", () => {
    expect(readableInk("#000000")).toBe("var(--canvas)");
    expect(readableInk("#4a3f8f")).toBe("var(--canvas)");
  });

  it("faellt ohne brauchbare Farbe auf die Tinte zurueck", () => {
    expect(readableInk(null)).toBe("var(--ink)");
    expect(readableInk("")).toBe("var(--ink)");
    expect(readableInk("rgb(1,2,3)")).toBe("var(--ink)");
    expect(readableInk("#12345")).toBe("var(--ink)");
  });

  it("liefert fuer jede Farbe der Palette einen lesbaren Kontrast", () => {
    for (const color of CATEGORY_COLORS) {
      const ink = readableInk(color) === "var(--ink)" ? INK_HEX : CANVAS_HEX;
      // 4.5:1 ist die Schwelle fuer Fliesstext nach WCAG AA.
      expect(contrastRatio(color, ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("traegt auf allen drei Typfarben die Tinte", () => {
    // Das Typ-Badge setzt seine Textfarbe fest auf var(--ink) statt sie zu
    // rechnen, weil die drei Flaechen feststehen. Dieser Fall belegt die
    // Annahme -- und faellt um, sobald jemand eines der Token verschiebt.
    expect(readableInk(token("accent"))).toBe("var(--ink)");
    expect(readableInk(token("info"))).toBe("var(--ink)");
    expect(readableInk(token("success"))).toBe("var(--ink)");
  });

  it("aliasiert die Typfarben auf die Akzente", () => {
    const css = readFileSync(new NodeURL("./App.css", import.meta.url), "utf8");
    expect(css).toContain("--type-bug: var(--accent);");
    expect(css).toContain("--type-task: var(--info);");
    expect(css).toContain("--type-story: var(--success);");
  });
});
