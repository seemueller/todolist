// Einheitlicher Icon-Knopf. Nimm ihn, sobald ein Button im Wesentlichen aus
// einem Icon besteht (Bearbeiten, Loeschen, Schliessen, Status umschalten,
// Erledigt-Schalter). Die variant-Prop waehlt ausschliesslich zwischen den
// bereits in App.css vorhandenen Klassen - neue Klassennamen gibt es hier nicht.

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "action" | "kanban" | "icon" | "close" | "checkbox";

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  action: "action-btn", // 30x30, Aktionen in der Todo-Zeile
  kanban: "kanban-action-btn", // 24x24, Aktionen auf der Kanban-Karte
  icon: "icon-button", // Filterleiste und Kategorien-Modal (dort 30x30)
  close: "close-btn", // Modal-Kopfzeile, invers auf dunklem Grund
  checkbox: "checkbox", // 24x24 Erledigt-Schalter der Todo-Zeile
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Waehlt die vorhandene CSS-Klasse. */
  variant: IconButtonVariant;
  /** Haengt die Klasse "danger" an (in App.css nur fuer action | kanban | icon definiert). */
  danger?: boolean;
  /** Icon und optional ein Textlabel daneben (z.B. <TagIcon />Kategorien). */
  children?: ReactNode;
}

export function IconButton({
  variant,
  danger = false,
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  const classes = [VARIANT_CLASS[variant], danger ? "danger" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
