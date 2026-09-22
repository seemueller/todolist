// Auswahlfeld fuer den Aufgabentyp mit den drei festen Optionen
// Bug / Task / Story. Zwilling von PrioritySelect, aber ohne dessen
// Varianten: der Typ wird nur im Hinzufuegen-Formular und im Detail-Fenster
// gewaehlt, und beide tragen dieselbe Klasse .type-select. In der Listenzeile
// steht der Typ als Badge, nicht als Auswahlfeld.

import type { SelectHTMLAttributes } from "react";
import { TODO_TYPES, TODO_TYPE_LABELS, type TodoType } from "../types";

export interface TypeSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "children"> {
  value: TodoType;
  onValueChange: (type: TodoType) => void;
}

export function TypeSelect({ value, onValueChange, className, ...rest }: TypeSelectProps) {
  const classes = ["type-select", className ?? ""].filter(Boolean).join(" ");

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
