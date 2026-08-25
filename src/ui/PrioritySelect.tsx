// Auswahlfeld fuer die Prioritaet mit den drei festen Optionen
// Niedrig / Mittel / Hoch (bisher zweimal woertlich im JSX).
// variant="form"   -> .priority-select        (im Hinzufuegen-Formular)
// variant="inline" -> .priority-select-inline (in der Todo-Zeile)

import type { SelectHTMLAttributes } from "react";
import type { Priority } from "../types";

export type PrioritySelectVariant = "form" | "inline";

const VARIANT_CLASS: Record<PrioritySelectVariant, string> = {
  form: "priority-select",
  inline: "priority-select-inline",
};

export interface PrioritySelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "children"> {
  value: Priority;
  onValueChange: (priority: Priority) => void;
  variant?: PrioritySelectVariant;
}

export function PrioritySelect({
  value,
  onValueChange,
  variant = "form",
  className,
  ...rest
}: PrioritySelectProps) {
  const classes = [VARIANT_CLASS[variant], className ?? ""].filter(Boolean).join(" ");

  return (
    <select
      className={classes}
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value as Priority)}
      {...rest}
    >
      <option value="low">Niedrig</option>
      <option value="medium">Mittel</option>
      <option value="high">Hoch</option>
    </select>
  );
}
