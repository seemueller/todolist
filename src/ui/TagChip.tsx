// Ein Tag als kleines Etikett.
// variant="list"   -> .tag-chip                  (Listenzeile, Detailfenster)
// variant="kanban" -> .tag-chip .tag-chip--kanban (Karte im Brett)
//
// Mit onRemove traegt der Chip einen Entfernen-Knopf -- nur dort, wo Tags
// bearbeitet werden. Keine Farbe aus den Daten wie beim CategoryBadge: Tags
// haben keine, die Flaeche steht fest in .tag-chip.

import type { HTMLAttributes } from "react";
import { CloseIcon } from "./icons";

export type TagChipVariant = "list" | "kanban";

export interface TagChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tag: string;
  variant?: TagChipVariant;
  onRemove?: () => void;
}

export function TagChip({ tag, variant = "list", onRemove, className, ...rest }: TagChipProps) {
  const classes = ["tag-chip", variant === "kanban" ? "tag-chip--kanban" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {tag}
      {onRemove && (
        <button
          type="button"
          className="tag-chip-remove"
          onClick={onRemove}
          aria-label={`Tag ${tag} entfernen`}
        >
          <CloseIcon size={10} />
        </button>
      )}
    </span>
  );
}
