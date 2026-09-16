// Dreier-Segmentleiste fuer die Zeitart einer Kategorie.
// Gleiches Muster wie der Status-Filter der Liste: FilterChip variant="segment"
// in einer Gruppe. Gebraucht an zwei Stellen im Kategorien-Fenster -- im
// Anlege-Formular und je bestehender Kategoriezeile --, darum ein Baustein.

import { TIME_KINDS, TIME_KIND_LABELS, type TimeKind } from "../types";
import { FilterChip } from "./FilterChip";

export interface TimeKindSelectProps {
  value: TimeKind;
  onValueChange: (kind: TimeKind) => void;
  /** Kategoriename fuer die Beschriftung der Knoepfe; die Tests greifen sie. */
  label: string;
}

export function TimeKindSelect({ value, onValueChange, label }: TimeKindSelectProps) {
  return (
    <div className="time-kind-select" role="group" aria-label={`Zeitart ${label}`}>
      {TIME_KINDS.map((kind) => (
        <FilterChip
          key={kind}
          variant="segment"
          active={value === kind}
          onClick={() => onValueChange(kind)}
          aria-label={`Zeitart ${label}: ${TIME_KIND_LABELS[kind]}`}
        >
          {TIME_KIND_LABELS[kind]}
        </FilterChip>
      ))}
    </div>
  );
}
