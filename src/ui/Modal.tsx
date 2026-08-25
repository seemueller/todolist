// Modal-Huelle: Overlay, Panel, Kopfzeile mit Titel und Schliessen-Knopf.
// Enthaelt Klick-ausserhalb-schliesst, stopPropagation im Panel und den
// Escape-Listener (bisher zwei fast identische Effekte in App.tsx).
// Die Komponente nur mounten, wenn das Modal offen sein soll -
// der Escape-Listener haengt an der Lebensdauer der Komponente.

import { useEffect } from "react";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

export type ModalVariant = "changelog" | "category";

const VARIANT_CLASS: Record<ModalVariant, string> = {
  changelog: "changelog-modal",
  category: "category-modal",
};

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "onClick"> {
  variant: ModalVariant;
  /** Text der <h2> in der Kopfzeile. */
  title: string;
  /** Wird bei Klick auf Overlay, Schliessen-Knopf und Escape gerufen. */
  onClose: () => void;
  /** aria-label des Schliessen-Knopfs; ohne Angabe wird kein Attribut gesetzt. */
  closeLabel?: string;
  /** ref auf das Panel (nicht auf das Overlay). */
  panelRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

export function Modal({
  variant,
  title,
  onClose,
  closeLabel,
  panelRef,
  className,
  children,
  ...rest
}: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const panelClasses = [VARIANT_CLASS[variant], className ?? ""].filter(Boolean).join(" ");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className={panelClasses}
        onClick={(e) => e.stopPropagation()}
        {...rest}
      >
        <div className="changelog-header">
          <h2>{title}</h2>
          <IconButton variant="close" onClick={onClose} aria-label={closeLabel}>
            <CloseIcon />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
