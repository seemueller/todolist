// Segmentleiste "Alle / Bug / Task / Story" zum Filtern nach Aufgabentyp.
// Steht zweimal: ueber der Liste und ueber dem Brett. Beide tragen dieselbe
// Klasse .type-filter; was gewaehlt ist, haelt der Aufrufer -- die Liste merkt
// es sich in localStorage, das Brett nur fuer die Sitzung.

import type { HTMLAttributes } from "react";
import { TODO_TYPES, TODO_TYPE_LABELS, type TodoType } from "../types";
import { FilterChip } from "./FilterChip";

/** "all" oder genau ein Typ. */
export type TypeFilterValue = "all" | TodoType;

export interface TypeFilterBarProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "children"> {
  value: TypeFilterValue;
  onValueChange: (value: TypeFilterValue) => void;
}

export function TypeFilterBar({ value, onValueChange, className, ...rest }: TypeFilterBarProps) {
  const classes = ["type-filter", className ?? ""].filter(Boolean).join(" ");

  // Die Beschriftungen tragen "Typ" im aria-label, weil "Alle" sonst mehrfach
  // auf der Seite steht -- neben Faelligkeit, Status oder Kategorie.
  return (
    <div className={classes} role="group" aria-label="Typ filtern" {...rest}>
      <FilterChip
        variant="segment"
        active={value === "all"}
        onClick={() => onValueChange("all")}
        aria-label="Typ Alle"
      >
        Alle
      </FilterChip>
      {TODO_TYPES.map((type) => (
        <FilterChip
          key={type}
          variant="segment"
          active={value === type}
          onClick={() => onValueChange(type)}
          aria-label={`Typ ${TODO_TYPE_LABELS[type]}`}
        >
          {TODO_TYPE_LABELS[type]}
        </FilterChip>
      ))}
    </div>
  );
}
