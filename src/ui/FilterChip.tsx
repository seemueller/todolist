// Filter-Knopf mit active-Zustand.
// "chip"    -> freistehende Pille .filter-btn (Faelligkeitsfilter)
// "segment" -> Knopf innerhalb der Gruppe .status-filter; dort stylt App.css
//              ueber .status-filter button, der Knopf selbst traegt nur "active".
// Nimm ihn fuer jede Filterauswahl, die als Knopfreihe dargestellt wird.

import type { ButtonHTMLAttributes } from "react";

export type FilterChipVariant = "chip" | "segment";

const VARIANT_CLASS: Record<FilterChipVariant, string> = {
  chip: "filter-btn",
  segment: "",
};

export interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** true haengt die Klasse "active" an. */
  active?: boolean;
  variant?: FilterChipVariant;
}

export function FilterChip({
  active = false,
  variant = "chip",
  className,
  type = "button",
  children,
  ...rest
}: FilterChipProps) {
  const classes = [VARIANT_CLASS[variant], active ? "active" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
