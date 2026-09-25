// Modal-Huelle: Overlay, Panel, Kopfzeile mit Titel und Schliessen-Knopf.
// Enthaelt Klick-ausserhalb-schliesst, stopPropagation im Panel und den
// Escape-Listener (bisher zwei fast identische Effekte in App.tsx).
// Die Komponente nur mounten, wenn das Modal offen sein soll -
// der Escape-Listener haengt an der Lebensdauer der Komponente.

import { useEffect, useRef } from "react";
import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import type { ModalSize } from "../listPrefs";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

export type ModalVariant = "changelog" | "category" | "todo" | "trash" | "stats" | "tagFilter";

const VARIANT_CLASS: Record<ModalVariant, string> = {
  changelog: "changelog-modal",
  category: "category-modal",
  todo: "todo-modal",
  trash: "trash-modal",
  stats: "stats-modal",
  tagFilter: "tag-filter-modal",
};

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "onClick"> {
  variant: ModalVariant;
  /** Text der <h2> in der Kopfzeile. */
  title: string;
  /** Wird bei Klick auf Overlay, Schliessen-Knopf und Escape gerufen. */
  onClose: () => void;
  /** aria-label des Schliessen-Knopfs; ohne Angabe wird kein Attribut gesetzt. */
  closeLabel?: string;
  /** Panel per Ziehen groessenverstellbar (Anfasser unten rechts). */
  resizable?: boolean;
  /** Startgroesse; ohne Angabe gilt die Breite aus dem CSS. */
  size?: ModalSize | null;
  /** Nach dem Ziehen: die neue Groesse in Pixeln. Wird nur gerufen, wenn sie
   *  sich von der zuletzt gemeldeten unterscheidet. */
  onSizeChange?: (size: ModalSize) => void;
  children: ReactNode;
}

export function Modal({
  variant,
  title,
  onClose,
  closeLabel,
  resizable = false,
  size,
  onSizeChange,
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

  // Die zuletzt gemeldete Groesse, damit dieselbe Groesse nicht zweimal
  // geschrieben wird.
  const lastSize = useRef<ModalSize | null>(size ?? null);
  const panel = useRef<HTMLDivElement | null>(null);

  // Der Anfasser ist der des Browsers: er schreibt beim Ziehen inline
  // width/height auf das Panel und feuert dabei *kein* Pointer-Ereignis an das
  // Element -- der Zug gehoert der Oberflaeche des Browsers. Beobachtet wird
  // darum die Groesse selbst.
  //
  // Gemeldet wird nur, was der Nutzer gezogen hat: ein inline gesetztes
  // width/height gibt es ausschliesslich vom Anfasser oder aus `size`. Aendert
  // sich die Hoehe, weil der Inhalt wechselt -- Umschalten zwischen Lesen und
  // Schreiben --, steht dort nichts, und es wird nichts gespeichert.
  useEffect(() => {
    const el = panel.current;
    if (!resizable || !onSizeChange || !el) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (el.style.width === "" || el.style.height === "") return;
      const next = { width: Math.round(el.offsetWidth), height: Math.round(el.offsetHeight) };
      if (lastSize.current?.width === next.width && lastSize.current?.height === next.height) {
        return;
      }
      lastSize.current = next;
      onSizeChange(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [resizable, onSizeChange]);

  const panelClasses = [
    VARIANT_CLASS[variant],
    resizable ? "modal-resizable" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
      <div
        ref={panel}
        className={panelClasses}
        style={size ? { width: size.width, height: size.height } : undefined}
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
