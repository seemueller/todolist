// Modal-Huelle: Overlay, Panel, Kopfzeile mit Titel und Schliessen-Knopf.
// Enthaelt Klick-ausserhalb-schliesst, stopPropagation im Panel und den
// Escape-Listener (bisher zwei fast identische Effekte in App.tsx).
// Die Komponente nur mounten, wenn das Modal offen sein soll -
// der Escape-Listener haengt an der Lebensdauer der Komponente.

import { useEffect, useRef } from "react";
import type { HTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

export type ModalVariant = "changelog" | "category" | "todo";

const VARIANT_CLASS: Record<ModalVariant, string> = {
  changelog: "changelog-modal",
  category: "category-modal",
  todo: "todo-modal",
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

  // Schliessen nur, wenn die Interaktion auch auf dem Overlay *begonnen* hat.
  // Ein click ist nicht dasselbe wie ein Klick: er feuert auf dem gemeinsamen
  // Vorfahren von mousedown- und mouseup-Ziel. Wer im Panel Text markiert und
  // die Maus ueber den Rand hinaus loslaesst, erzeugt so einen click auf dem
  // Overlay, ohne dass "ausserhalb klicken" gemeint war.
  const mouseDownOnOverlay = useRef(false);

  function handleOverlayMouseDown(e: MouseEvent<HTMLDivElement>) {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  }

  function handleOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (mouseDownOnOverlay.current && e.target === e.currentTarget) onClose();
    mouseDownOnOverlay.current = false;
  }

  const panelClasses = [VARIANT_CLASS[variant], className ?? ""].filter(Boolean).join(" ");

  return (
    <div className="modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
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
