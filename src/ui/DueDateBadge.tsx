// Faelligkeits-Badge fuer Listenzeile und Kanban-Karte.
// Die Varianten unterscheiden sich nur in Padding/Schriftgroesse, die
// Zustandsklassen overdue/today sind identisch. Der bereits formatierte Text
// kommt als children herein (formatDate bleibt in App.tsx).

import type { HTMLAttributes } from "react";

export type BadgeVariant = "list" | "kanban";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  list: "due-date-badge",
  kanban: "kanban-due-badge",
};

export interface DueDateBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Termin liegt in der Vergangenheit und die Aufgabe ist offen. */
  overdue?: boolean;
  /** Termin ist heute und die Aufgabe ist offen. */
  today?: boolean;
}

export function DueDateBadge({
  variant = "list",
  overdue = false,
  today = false,
  className,
  children,
  ...rest
}: DueDateBadgeProps) {
  const classes = [
    VARIANT_CLASS[variant],
    overdue ? "overdue" : "",
    today ? "today" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
