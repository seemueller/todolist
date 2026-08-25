// Kategorie-Badge mit eingefaerbtem Hintergrund.
// Kapselt den bisher zweimal ausgeschriebenen Fallback-Farbwert und die zwei
// Groessenvarianten. Nimm es ueberall, wo der Kategoriename einer Aufgabe
// angezeigt wird.

import type { HTMLAttributes } from "react";

export type CategoryBadgeVariant = "list" | "kanban";

/** Ersatzfarbe, wenn eine Kategorie (noch) keine Farbe hat. */
export const CATEGORY_BADGE_FALLBACK = "rgba(167,139,250,0.4)";

const VARIANT_CLASS: Record<CategoryBadgeVariant, string> = {
  list: "category-badge",
  kanban: "kanban-category-badge",
};

export interface CategoryBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  variant?: CategoryBadgeVariant;
  color: string | null;
}

export function CategoryBadge({
  variant = "list",
  color,
  className,
  style,
  children,
  ...rest
}: CategoryBadgeProps) {
  const classes = [VARIANT_CLASS[variant], className ?? ""].filter(Boolean).join(" ");

  return (
    <span
      className={classes}
      style={{ backgroundColor: color || CATEGORY_BADGE_FALLBACK, ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}
