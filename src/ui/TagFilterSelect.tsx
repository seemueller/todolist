// Auswahl des Tag-Filters samt Knoepfen zum Bearbeiten und Anlegen.
// Steht zweimal: in der Filterleiste der Liste und ueber dem Brett. Beide
// zeigen denselben aktiven Filter -- was gewaehlt ist, haelt App.tsx.

import type { HTMLAttributes } from "react";
import type { TagFilter } from "../tagFilter";
import { IconButton } from "./IconButton";
import { PencilIcon, PlusIcon } from "./icons";

export interface TagFilterSelectProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "children"> {
  filters: TagFilter[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  onEdit: () => void;
  onCreate: () => void;
}

export function TagFilterSelect({
  filters,
  activeId,
  onActiveChange,
  onEdit,
  onCreate,
  className,
  ...rest
}: TagFilterSelectProps) {
  const classes = ["tag-filter-select", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={classes} {...rest}>
      <select
        className="filter-select"
        aria-label="Tag-Filter"
        value={activeId ?? ""}
        onChange={(e) => onActiveChange(e.currentTarget.value || null)}
      >
        <option value="">Kein Tag-Filter</option>
        {filters.map((filter) => (
          <option key={filter.id} value={filter.id}>
            {filter.name}
          </option>
        ))}
      </select>
      <IconButton
        variant="icon"
        onClick={onEdit}
        disabled={activeId === null}
        aria-label="Tag-Filter bearbeiten"
      >
        <PencilIcon />
      </IconButton>
      <IconButton variant="icon" onClick={onCreate} aria-label="Neuer Tag-Filter">
        <PlusIcon />
      </IconButton>
    </div>
  );
}
