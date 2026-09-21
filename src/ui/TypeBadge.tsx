// Badge fuer den Aufgabentyp: Bug, Task oder Story.
// variant="list"   -> .type-badge        (Listenzeile)
// variant="kanban" -> .kanban-type-badge (Karte im Brett)
//
// Anders als CategoryBadge traegt es kein Inline-Style: die Kategoriefarbe
// kommt aus den Daten, die drei Typfarben stehen fest und gehoeren darum in
// die Klassen .type-badge--bug/--task/--story in App.css. Die Textfarbe ist
// dort fest var(--ink); contrast.test.ts belegt, dass sie auf allen drei
// Flaechen lesbar bleibt.

import type { HTMLAttributes } from "react";
import { TODO_TYPE_LABELS, type TodoType } from "../types";

export type TypeBadgeVariant = "list" | "kanban";

const VARIANT_CLASS: Record<TypeBadgeVariant, string> = {
  list: "type-badge",
  kanban: "kanban-type-badge",
};

export interface TypeBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "type"> {
  variant?: TypeBadgeVariant;
  type: TodoType;
}

export function TypeBadge({ variant = "list", type, className, ...rest }: TypeBadgeProps) {
  const classes = [VARIANT_CLASS[variant], `type-badge--${type}`, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {TODO_TYPE_LABELS[type]}
    </span>
  );
}
