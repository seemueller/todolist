// Eingabe fuer die Tags einer Aufgabe: die gesetzten als Chips, dahinter ein
// Textfeld. Enter oder Komma uebernimmt, Verlassen des Felds auch.
// Backspace im leeren Feld nimmt den letzten Chip weg. Vorschlaege kommen
// ueber ein <datalist>.
//
// Der getippte, noch nicht uebernommene Entwurf gehoert dem Aufrufer
// (`draft`/`onDraftChange`): Strg+Enter sichert das Fenster im selben
// Tastendruck, ohne dass das Feld verlassen wird -- ein Entwurf, der nur hier
// laege, ginge dabei verloren. So kann das Fenster ihn beim Sichern selbst
// ueber `draftTags` mitnehmen.
//
// Eigene Datei, kein Baustein in src/ui: es gibt sie nur im Detailfenster.

import { useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import { normalizeTag, normalizeTags } from "./types";
import { TagChip } from "./ui";

/**
 * Die Tags, die ein Entwurf ergaebe: eingefuegtes "a, b" sind zwei Tags, nicht
 * einer mit Komma. Unbrauchbare Teile (leer, zu lang) fallen weg.
 */
export function draftTags(draft: string): string[] {
  return draft
    .split(",")
    .map(normalizeTag)
    .filter((tag): tag is string => tag !== null);
}

export interface TagInputProps {
  id?: string;
  value: string[];
  suggestions: string[];
  onValueChange: (tags: string[]) => void;
  /** Der getippte, noch nicht uebernommene Text. */
  draft: string;
  onDraftChange: (text: string) => void;
}

export function TagInput({
  id,
  value,
  suggestions,
  onValueChange,
  draft,
  onDraftChange,
}: TagInputProps) {
  const listId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);

  function commit() {
    const added = draftTags(draft);
    // Ein unbrauchbarer Entwurf (zu lang) bleibt stehen, statt still zu verschwinden.
    if (added.length === 0) return;
    onValueChange(normalizeTags([...value, ...added]));
    onDraftChange("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Strg+Enter gehoert dem Fenster: es sichert und nimmt den Entwurf dabei
    // selbst mit, er muss hier nicht erst uebernommen werden.
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

  function remove(tag: string) {
    onValueChange(value.filter((t) => t !== tag));
    // Der Knopf verschwindet mit seinem Chip; ohne neues Ziel faellt der Fokus
    // auf body, und wer mit der Tastatur arbeitet, steht im Nichts.
    fieldRef.current?.focus();
  }

  const offered = suggestions.filter((tag) => !value.includes(tag));

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <TagChip key={tag} tag={tag} onRemove={() => remove(tag)} />
      ))}
      <input
        id={id}
        ref={fieldRef}
        className="tag-input-field"
        type="text"
        list={listId}
        value={draft}
        placeholder={value.length === 0 ? "Tag eintippen, Enter übernimmt" : ""}
        onChange={(e) => onDraftChange(e.currentTarget.value)}
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
