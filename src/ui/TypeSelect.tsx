// Auswahlfeld fuer den Aufgabentyp mit den drei festen Optionen
// Bug / Task / Story. Zwilling von PrioritySelect.
// variant="form"   -> .type-select        (im Hinzufuegen-Formular)
// variant="inline" -> .type-select-inline (im Detail-Fenster)

import type { SelectHTMLAttributes } from "react";
import { TODO_TYPES, TODO_TYPE_LABELS, type TodoType } from "../types";

export type TypeSelectVariant = "form" | "inline";

const VARIANT_CLASS: Record<TypeSelectVariant, string> = {
  form: "type-select",
  inline: "type-select-inline",
};

export interface TypeSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "children"> {
  value: TodoType;
  onValueChange: (type: TodoType) => void;
  variant?: TypeSelectVariant;
}

export function TypeSelect({
  value,
  onValueChange,
  variant = "form",
  className,
  ...rest
}: TypeSelectProps) {
  const classes = [VARIANT_CLASS[variant], className ?? ""].filter(Boolean).join(" ");

  return (
    <select
      className={classes}
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value as TodoType)}
      {...rest}
    >
      {/* Anders als PrioritySelect ueber die Liste statt woertlich: die
          Reihenfolge der Typen steht schon in TODO_TYPES. */}
      {TODO_TYPES.map((type) => (
        <option key={type} value={type}>
          {TODO_TYPE_LABELS[type]}
        </option>
      ))}
    </select>
  );
}
