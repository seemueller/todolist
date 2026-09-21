// Detail-Fenster einer Aufgabe: Titel, Beschreibung, Typ, Prioritaet,
// Faelligkeit und Kategorie an einer Stelle. Die Beschreibung hat zwei Zustaende: gelesen
// wird sie als gesetztes Markdown (`src/ui/Markdown.tsx`), geschrieben im
// Textfeld daneben -- der Knopf ueber dem Feld schaltet um. Eigene Datei, weil
// App.tsx schon zu gross ist, um noch ein Formular mit eigenem Entwurfszustand
// aufzunehmen.
//
// Das Fenster arbeitet auf einem Entwurf und schreibt erst beim Sichern --
// deshalb gibt es hier ein Abbrechen, anders als bei der Bedienung direkt in
// der Zeile. Gesichert wird ueber `onSave` mit genau den Feldern, die sich
// geaendert haben; ein unveraendertes Fenster schliesst ohne Schreibvorgang.

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Category, Priority, Todo, type TodoType } from "./types";
import type { TodoFieldsPatch } from "./storeTypes";
import { loadTodoModalSize, saveTodoModalSize } from "./listPrefs";
import {
  CategorySelect,
  IconButton,
  Markdown,
  Modal,
  PencilIcon,
  PrioritySelect,
  TypeSelect,
  EyeIcon,
} from "./ui";

export interface TodoDetailModalProps {
  todo: Todo;
  categories: Category[];
  /** Schreibt den Patch. Wirft, wenn das Schreiben scheitert. */
  onSave: (id: number, patch: TodoFieldsPatch) => Promise<void>;
  /** Abbrechen, Escape, Schliessen-Knopf und der geglueckte Sichern-Lauf. */
  onClose: () => void;
}

export function TodoDetailModal({ todo, categories, onSave, onClose }: TodoDetailModalProps) {
  // Der Stand beim Oeffnen, ein einziges Mal eingefroren. Waehrend das Fenster
  // offen ist, kann `todo` von aussen neue Werte bekommen -- etwa weil der
  // MCP-Server dieselbe Aufgabe aendert und die App ihre Liste neu laedt.
  // `buildPatch` vergleicht gegen diesen eingefrorenen Stand, nicht gegen die
  // lebende Prop: gegen die Prop zu vergleichen sieht nach Aktualitaet aus,
  // wuerde aber jedes Feld, das der Nutzer nie angefasst hat, als "geaendert"
  // ansehen, sobald es sich von aussen bewegt -- und die fremde Aenderung mit
  // dem alten Entwurfswert stillschweigend ueberschreiben.
  const [original] = useState(todo);
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description);
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [type, setType] = useState<TodoType>(todo.type);
  const [dueDate, setDueDate] = useState(todo.due_date ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(todo.category_id);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Das Fenster oeffnet im Lesemodus: laengere Beschreibungen sind als
  // gesetzter Text zu lesen, nicht als Quelltext in einem Textfeld. Nur wenn
  // noch nichts dasteht, waere die leere Lesefläche sinnlos -- dann beginnt
  // das Fenster gleich beim Schreiben.
  // Die zuletzt gezogene Fenstergroesse, einmal beim Oeffnen gelesen. Sie liegt
  // in localStorage, nicht im Store: eine Oberflaechen-Vorliebe, kein
  // Domaenendatum -- dieselbe Begruendung wie beim Statusfilter der Liste.
  const [size] = useState(loadTodoModalSize);
  const [openedEmpty] = useState(todo.description.trim() === "");
  const [editingDescription, setEditingDescription] = useState(openedEmpty);

  /**
   * Das Textfeld entsteht erst beim Umschalten -- dann gehoert der Cursor
   * hinein, und zwar ans Ende des vorhandenen Textes, nicht davor. Oeffnet das
   * Fenster ohnehin im Schreibmodus, bleibt der Fokus beim Titel: sonst haette
   * der Nutzer ihn nie gesehen.
   */
  function focusEndOnSwitch(el: HTMLTextAreaElement | null) {
    if (!el || openedEmpty) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  /** Nur die Felder, die sich gegenueber dem Ausgangsstand beim Oeffnen unterscheiden. */
  function buildPatch(trimmedTitle: string): TodoFieldsPatch {
    const patch: TodoFieldsPatch = {};
    if (trimmedTitle !== original.title) patch.title = trimmedTitle;
    // Leer heisst leer -- der leere String. Nur Weissraum bringt die Ambiguitaet
    // sonst durch die Hintertuer zurueck; echter Text behaelt seinen Weissraum,
    // auch fuehrende/abschliessende Umbrueche gehoeren zum Text.
    const nextDescription = description.trim() === "" ? "" : description;
    if (nextDescription !== original.description) patch.description = nextDescription;
    if (priority !== original.priority) patch.priority = priority;
    if (type !== original.type) patch.type = type;
    const nextDueDate = dueDate || null;
    if (nextDueDate !== original.due_date) patch.dueDate = nextDueDate;
    if (categoryId !== original.category_id) patch.categoryId = categoryId;
    return patch;
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Der Titel darf nicht leer sein.");
      return;
    }

    const patch = buildPatch(trimmedTitle);
    // Nichts geaendert: schliessen, ohne zu schreiben.
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await onSave(todo.id, patch);
      onClose();
    } catch (err) {
      // Offen lassen: der Entwurf ist sonst verloren.
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  // Enter gehoert im Textfeld dem Zeilenumbruch, Strg+Enter sichert.
  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSave();
    }
  }

  return (
    <Modal
      variant="todo"
      title="Aufgabe bearbeiten"
      onClose={onClose}
      closeLabel="Schließen"
      onKeyDown={handleKeyDown}
      resizable
      size={size}
      onSizeChange={saveTodoModalSize}
    >
      <div className="todo-modal-body">
        <div className="todo-modal-field">
          <label htmlFor="todo-detail-title">Titel</label>
          <input
            id="todo-detail-title"
            className="edit-input"
            type="text"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
        </div>

        <div className="todo-modal-field todo-modal-field-grow">
          <div className="todo-modal-field-head">
            <label
              id="todo-detail-description-label"
              htmlFor={editingDescription ? "todo-detail-description" : undefined}
            >
              Beschreibung
            </label>
            <IconButton
              variant="icon"
              className="todo-modal-mode"
              aria-label={editingDescription ? "Beschreibung lesen" : "Beschreibung bearbeiten"}
              onClick={() => setEditingDescription((on) => !on)}
            >
              {editingDescription ? <EyeIcon /> : <PencilIcon />}
              {editingDescription ? "Lesen" : "Bearbeiten"}
            </IconButton>
          </div>
          {editingDescription ? (
            <textarea
              id="todo-detail-description"
              className="todo-modal-description"
              value={description}
              ref={focusEndOnSwitch}
              placeholder="Was zur Aufgabe noch zu sagen ist — Markdown ist erlaubt"
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
          ) : (
            // Scrollbar, also auch mit der Tastatur erreichbar, und benannt --
            // sonst steht hier eine Flaeche ohne Namen, die niemand scrollen kann.
            <div
              className="todo-modal-description-view"
              role="group"
              aria-labelledby="todo-detail-description-label"
              tabIndex={0}
            >
              {description.trim() === "" ? (
                <p className="muted">Keine Beschreibung</p>
              ) : (
                <Markdown text={description} />
              )}
            </div>
          )}
        </div>

        <div className="todo-modal-row">
          <div className="todo-modal-field">
            <label htmlFor="todo-detail-type">Typ</label>
            {/* .type-select hat wie .priority-select ausserhalb von .add-form
                keine eigene Regel: beide Felder stehen hier nackt und gleich
                breit nebeneinander. */}
            <TypeSelect id="todo-detail-type" value={type} onValueChange={setType} />
          </div>

          <div className="todo-modal-field">
            <label htmlFor="todo-detail-priority">Priorität</label>
            <PrioritySelect
              id="todo-detail-priority"
              value={priority}
              onValueChange={setPriority}
            />
          </div>

          <div className="todo-modal-field">
            <label htmlFor="todo-detail-due">Fällig</label>
            <input
              id="todo-detail-due"
              className="edit-date-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.currentTarget.value)}
            />
          </div>

          <div className="todo-modal-field">
            <label htmlFor="todo-detail-category">Kategorie</label>
            <CategorySelect
              id="todo-detail-category"
              categories={categories}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholderLabel="Keine Kategorie"
            />
          </div>
        </div>

        {error && <p className="todo-modal-error">{error}</p>}
      </div>

      <div className="todo-modal-actions">
        <button type="button" className="todo-modal-cancel" onClick={onClose}>
          Abbrechen
        </button>
        <button type="button" className="todo-modal-save" onClick={handleSave} disabled={saving}>
          Sichern
        </button>
      </div>
    </Modal>
  );
}
