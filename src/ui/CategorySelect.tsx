// Auswahlfeld fuer Kategorien (.category-select).
// Kapselt die dreifach identische categories.map-Schleife und die Umrechnung
// zwischen leerem Optionswert und null. Zusatzklassen wie "filter-select" oder
// "todo-select" kommen ueber className dazu - die Tests haengen an genau diesen.

import type { SelectHTMLAttributes } from "react";
import type { Category } from "../types";

export interface CategorySelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "children"> {
  categories: Category[];
  /** Ausgewaehlte Kategorie-Id oder null. */
  value: number | null;
  /** Liefert die neue Id bzw. null fuer die Platzhalter-Option. */
  onValueChange: (categoryId: number | null) => void;
  /** Beschriftung der ersten Option: "Keine Kategorie" | "Alle Kategorien" | "—". */
  placeholderLabel: string;
}

export function CategorySelect({
  categories,
  value,
  onValueChange,
  placeholderLabel,
  className,
  ...rest
}: CategorySelectProps) {
  const classes = ["category-select", className ?? ""].filter(Boolean).join(" ");

  return (
    <select
      className={classes}
      value={value ?? ""}
      onChange={(e) => onValueChange(e.target.value ? Number(e.target.value) : null)}
      {...rest}
    >
      <option value="">{placeholderLabel}</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  );
}
