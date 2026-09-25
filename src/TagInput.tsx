// Eingabe fuer die Tags einer Aufgabe: die gesetzten als Chips, dahinter ein
// Textfeld. Enter oder Komma uebernimmt, Verlassen des Felds auch -- sonst
// ginge ein getippter, nicht bestaetigter Tag beim Sichern verloren.
// Backspace im leeren Feld nimmt den letzten Chip weg. Vorschlaege kommen
// ueber ein <datalist>.
//
// Eigene Datei, kein Baustein in src/ui: es gibt sie nur im Detailfenster.

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { normalizeTag, normalizeTags } from "./types";
import { TagChip } from "./ui";

export interface TagInputProps {
  id?: string;
  value: string[];
  suggestions: string[];
  onValueChange: (tags: string[]) => void;
}

export function TagInput({ id, value, suggestions, onValueChange }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commit() {
    // Eingefuegtes "a, b" sind zwei Tags, nicht einer mit Komma.
    const added = draft
      .split(",")
      .map(normalizeTag)
      .filter((tag): tag is string => tag !== null);
    // Ein unbrauchbarer Entwurf (zu lang) bleibt stehen, statt still zu verschwinden.
    if (added.length === 0) return;
    onValueChange(normalizeTags([...value, ...added]));
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Strg+Enter gehoert dem Fenster: es sichert, der Tag wird vorher beim
    // Verlassen des Felds uebernommen.
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      onValueChange(value.slice(0, -1));
    }
  }

  const offered = suggestions.filter((tag) => !value.includes(tag));

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <TagChip
          key={tag}
          tag={tag}
          onRemove={() => onValueChange(value.filter((t) => t !== tag))}
        />
      ))}
      <input
        id={id}
        className="tag-input-field"
        type="text"
        list={listId}
        value={draft}
        placeholder={value.length === 0 ? "Tag eintippen, Enter übernimmt" : ""}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
      <datalist id={listId}>
        {offered.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
}
