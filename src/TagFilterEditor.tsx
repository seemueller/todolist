// Editor fuer einen benannten Tag-Filter: Name, Verknuepfung und eine flache
// Liste von Regeln. Arbeitet auf einem Entwurf und gibt erst beim Speichern
// einen fertigen Filter heraus -- wie das Detail-Fenster einer Aufgabe.
// Eigene Datei, weil App.tsx schon zu gross ist.

import { useId, useRef, useState } from "react";
import { MAX_TAG_CHARS, normalizeTag } from "./types";
import { newTagFilterId, type TagFilter, type TagMatch, type TagRule } from "./tagFilter";
import { FilterChip, IconButton, Modal, PlusIcon, TrashIcon } from "./ui";

type RuleKind = TagRule["kind"];

/** Eine Regel im Entwurf: der Tag ist noch Rohtext, `key` haelt React stabil. */
interface DraftRule {
  key: number;
  kind: RuleKind;
  tag: string;
}

const RULE_LABELS: Record<RuleKind, string> = {
  has: "hat",
  lacks: "hat nicht",
  untagged: "hat keine Tags",
};
const RULE_KINDS = Object.keys(RULE_LABELS) as RuleKind[];

function toDraft(rules: TagRule[]): DraftRule[] {
  return rules.map((rule, key) => ({
    key,
    kind: rule.kind,
    tag: rule.kind === "untagged" ? "" : rule.tag,
  }));
}

export interface TagFilterEditorProps {
  /** `null` legt einen neuen Filter an. */
  filter: TagFilter | null;
  /** Alle vorhandenen Tags -- Vorschlaege und Grundlage fuer "unbekannt". */
  knownTags: string[];
  onSave: (filter: TagFilter) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function TagFilterEditor({ filter, knownTags, onSave, onDelete, onClose }: TagFilterEditorProps) {
  const listId = useId();
  const [name, setName] = useState(filter?.name ?? "");
  const [match, setMatch] = useState<TagMatch>(filter?.match ?? "all");
  // Ein neuer Filter beginnt mit einer leeren "hat"-Regel: ohne Regel gaebe
  // es nichts, das man ausfuellen koennte.
  const [rules, setRules] = useState<DraftRule[]>(() =>
    toDraft(filter?.rules ?? [{ kind: "has", tag: "" }])
  );
  const nextKey = useRef(rules.length);
  const [error, setError] = useState<string | null>(null);

  // Jede Aenderung am Entwurf raeumt die Fehlermeldung weg -- sie beschreibt
  // den Stand beim letzten Speichern, und der ist dann nicht mehr der aktuelle.
  function changeName(value: string) {
    setName(value);
    setError(null);
  }

  function updateRule(key: number, change: Partial<DraftRule>) {
    setRules((prev) => prev.map((rule) => (rule.key === key ? { ...rule, ...change } : rule)));
    setError(null);
  }

  function addRule() {
    const key = nextKey.current++;
    setRules((prev) => [...prev, { key, kind: "has", tag: "" }]);
    setError(null);
  }

  function removeRule(key: number) {
    setRules((prev) => prev.filter((rule) => rule.key !== key));
    setError(null);
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Der Filter braucht einen Namen.");
      return;
    }
    const built: TagRule[] = [];
    for (const [index, rule] of rules.entries()) {
      if (rule.kind === "untagged") {
        built.push({ kind: "untagged" });
        continue;
      }
      const tag = normalizeTag(rule.tag);
      if (tag === null) {
        // normalizeTag sagt nur "kein Tag" -- ob nichts da war oder zu viel,
        // entscheidet hier der Rohtext. Leerraum wie in normalizeTag, also mit
        // U+0085 und U+FEFF, die trim() anders behandelt.
        setError(
          rule.tag.replace(/[\s\u0085\uFEFF]/g, "") === ""
            ? `Regel ${index + 1}: Tag fehlt.`
            : `Regel ${index + 1}: Tag ist länger als ${MAX_TAG_CHARS} Zeichen.`
        );
        return;
      }
      built.push({ kind: rule.kind, tag });
    }
    onSave({ id: filter?.id ?? newTagFilterId(), name: trimmed, match, rules: built });
  }

  return (
    <Modal
      variant="tagFilter"
      title={filter ? "Tag-Filter bearbeiten" : "Neuer Tag-Filter"}
      onClose={onClose}
      closeLabel="Schließen"
    >
      <div className="tag-filter-editor">
        <div className="todo-modal-field">
          <label htmlFor="tag-filter-name">Name</label>
          <input
            id="tag-filter-name"
            className="edit-input"
            type="text"
            value={name}
            autoFocus
            onChange={(e) => changeName(e.currentTarget.value)}
          />
        </div>

        <div className="status-filter" role="group" aria-label="Verknüpfung der Regeln">
          <FilterChip variant="segment" active={match === "all"} onClick={() => setMatch("all")}>
            Alle Regeln
          </FilterChip>
          <FilterChip variant="segment" active={match === "any"} onClick={() => setMatch("any")}>
            Mindestens eine
          </FilterChip>
        </div>

        <ul className="tag-rule-list">
          {rules.map((rule, index) => {
            const tag = normalizeTag(rule.tag);
            const unknown = rule.kind !== "untagged" && tag !== null && !knownTags.includes(tag);
            return (
              <li key={rule.key} className="tag-rule">
                <select
                  className="filter-select"
                  aria-label={`Regel ${index + 1} Art`}
                  value={rule.kind}
                  onChange={(e) => updateRule(rule.key, { kind: e.currentTarget.value as RuleKind })}
                >
                  {RULE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {RULE_LABELS[kind]}
                    </option>
                  ))}
                </select>
                {rule.kind !== "untagged" && (
                  <input
                    className="edit-input tag-rule-tag"
                    type="text"
                    list={listId}
                    aria-label={`Regel ${index + 1} Tag`}
                    value={rule.tag}
                    onChange={(e) => updateRule(rule.key, { tag: e.currentTarget.value })}
                  />
                )}
                {unknown && <span className="tag-rule-unknown">unbekannt</span>}
                <IconButton
                  variant="icon"
                  danger
                  onClick={() => removeRule(rule.key)}
                  aria-label={`Regel ${index + 1} entfernen`}
                >
                  <TrashIcon />
                </IconButton>
              </li>
            );
          })}
        </ul>
        <datalist id={listId}>
          {knownTags.map((known) => (
            <option key={known} value={known} />
          ))}
        </datalist>

        <IconButton variant="icon" onClick={addRule} aria-label="Regel hinzufügen">
          <PlusIcon />
          Regel
        </IconButton>

        {error && <p className="todo-modal-error">{error}</p>}
      </div>

      <div className="todo-modal-actions">
        {filter && (
          <button
            type="button"
            className="todo-modal-cancel tag-filter-delete"
            onClick={() => onDelete(filter.id)}
          >
            Löschen
          </button>
        )}
        <button type="button" className="todo-modal-cancel" onClick={onClose}>
          Abbrechen
        </button>
        <button type="button" className="todo-modal-save" onClick={handleSave}>
          Speichern
        </button>
      </div>
    </Modal>
  );
}
