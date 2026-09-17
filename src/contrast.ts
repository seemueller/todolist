// Welche Textfarbe auf einer Kategoriefarbe lesbar ist.
//
// Kategoriefarben kommen aus den Daten und koennen jeder Hexwert sein, auch ein
// selbst gewaehlter. Auf der hellen Palette der App liest sich die Tinte fast
// immer gut, auf einem dunklen Rot wie --accent aber nicht mehr. Statt einer
// Faustregel ("ab hier weiss") wird das Kontrastverhaeltnis nach WCAG gegen
// beide Kandidaten gerechnet und der bessere genommen.
//
// Die beiden Hexwerte unten sind die Werte der Token --ink und --canvas. Ein
// Token laesst sich hier nicht einsetzen, weil gerechnet und nicht nur gefaerbt
// wird; timeContrast.test.ts vergleicht sie darum mit dem :root-Block in
// App.css, damit sie nicht auseinanderlaufen.

/** Wert des Tokens --ink. */
export const INK_HEX = "#14100c";
/** Wert des Tokens --canvas. */
export const CANVAS_HEX = "#fbeed2";

/** Ein Kanal (0-255) als linearer Anteil nach WCAG. */
function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/**
 * Zerlegt "#rgb" oder "#rrggbb" in seine drei Kanaele; alles andere ergibt
 * null. Grossschreibung und fehlendes Doppelkreuz sind erlaubt.
 */
function parseHex(color: string | null | undefined): [number, number, number] | null {
  if (!color) return null;
  const hex = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 3) {
    return [0, 1, 2].map((index) => parseInt(hex[index].repeat(2), 16)) as [number, number, number];
  }
  if (hex.length === 6) {
    return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  return null;
}

/** Relative Leuchtdichte (0-1) nach WCAG. */
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  const [red, green, blue] = rgb.map(channel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Kontrastverhaeltnis zweier Farben, 1 (gleich) bis 21 (schwarz auf weiss). */
export function contrastRatio(one: string, other: string): number {
  const first = luminance(one);
  const second = luminance(other);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Die Textfarbe, die auf `background` besser lesbar ist, als CSS-Token: die
 * Tinte der App oder ihre Grundflaeche. Eine fehlende oder unlesbare Farbe
 * ergibt die Tinte -- der Hintergrund ist dann eine helle Flaeche der Palette.
 */
export function readableInk(background: string | null | undefined): string {
  const rgb = parseHex(background);
  if (!rgb) return "var(--ink)";
  return contrastRatio(background as string, INK_HEX) >= contrastRatio(background as string, CANVAS_HEX)
    ? "var(--ink)"
    : "var(--canvas)";
}
