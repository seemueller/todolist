// Farbwaehler aus quadratischen Swatches (.color-picker / .color-swatch).
// Zweimal im Kategorien-Modal: gross beim Anlegen, inline (20x20) beim
// Bearbeiten. Nimm ihn, wenn genau eine Farbe aus einer festen Liste
// gewaehlt werden soll.

import type { HTMLAttributes } from "react";
import { CATEGORY_COLORS } from "../types";

export interface ColorPickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect" | "children"> {
  /** Aktuell gewaehlte Farbe (Vergleich per Stringgleichheit). */
  value: string;
  onSelect: (color: string) => void;
  /** Auswahlliste, Default CATEGORY_COLORS. */
  colors?: readonly string[];
  /** true = kleine 20x20-Swatches (.color-picker.inline). */
  inline?: boolean;
  /** Liefert das aria-label je Swatch; ohne Angabe wird keins gesetzt. */
  swatchLabel?: (color: string) => string;
}

export function ColorPicker({
  value,
  onSelect,
  colors = CATEGORY_COLORS,
  inline = false,
  swatchLabel,
  className,
  ...rest
}: ColorPickerProps) {
  const classes = ["color-picker", inline ? "inline" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={["color-swatch", value === color ? "active" : ""].filter(Boolean).join(" ")}
          style={{ backgroundColor: color }}
          onClick={() => onSelect(color)}
          aria-label={swatchLabel ? swatchLabel(color) : undefined}
        />
      ))}
    </div>
  );
}
