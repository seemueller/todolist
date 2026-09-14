// Der Papierkorb: was geloescht wurde, bis es endgueltig weg ist. Eigene Datei
// und eigener State -- App.tsx haelt den Papierkorb nicht mit, er wird selten
// gebraucht und laedt sich beim Oeffnen selbst.

import { useCallback, useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { listDeletedTodos, purgeTodo, restoreTodo } from "./db";
import { DATA_CHANGED_EVENT } from "./events";
import { isTauri } from "./sqlClient";
import { Todo } from "./types";
import { IconButton, Modal, TrashIcon, UndoIcon } from "./ui";

export interface TrashModalProps {
  onClose: () => void;
  /** Gerufen, wenn sich am Bestand der lebenden Aufgaben etwas geaendert hat
   *  (bisher nur beim Wiederherstellen) -- die Liste dahinter muss neu laden.
   *  Ein Purge betrifft nur den Papierkorb selbst, dort stand die Aufgabe
   *  nie in der lebenden Liste, also bleibt onChanged dabei aus. */
  onChanged: () => void;
}

export function TrashModal({ onClose, onChanged }: TrashModalProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const load = useCallback(async () => {
    try {
      setTodos(await listDeletedTodos());
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Ein Agent kann per MCP nebenher loeschen oder wiederherstellen; ohne
  // dieses Ereignis zeigte das offene Fenster einen veralteten Stand.
  //
  // `listen` gibt sein Abmelden erst spaeter zurueck. Faellt die Komponente
  // vorher weg -- unter React.StrictMode passiert genau das bei jedem Mount --,
  // muss das eintreffende Abmelden sofort gerufen werden, sonst bleibt ein
  // Zuhoerer haengen und jedes Ereignis laedt doppelt nach.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: UnlistenFn | null = null;
    let dropped = false;
    listen(DATA_CHANGED_EVENT, () => {
      void load();
    }).then((stop) => {
      if (dropped) stop();
      else unlisten = stop;
    });
    return () => {
      dropped = true;
      unlisten?.();
    };
  }, [load]);

  async function handleRestore(id: number) {
    try {
      await restoreTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setError(null);
      onChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handlePurge(id: number) {
    try {
      await purgeTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleEmpty() {
    try {
      for (const todo of todos) await purgeTodo(todo.id);
      setTodos([]);
      setConfirmEmpty(false);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal variant="trash" title="Papierkorb" onClose={onClose} closeLabel="Schließen">
      {error && <p className="error">Fehler: {error}</p>}

      {todos.length === 0 && <p className="muted">Der Papierkorb ist leer.</p>}

      <ul className="trash-list">
        {todos.map((todo) => (
          <li key={todo.id} className="trash-item">
            <span className="trash-title">{todo.title}</span>
            <div className="trash-actions">
              <IconButton
                variant="icon"
                onClick={() => handleRestore(todo.id)}
                aria-label="Wiederherstellen"
              >
                <UndoIcon />
              </IconButton>
              <IconButton
                variant="icon"
                danger
                onClick={() => handlePurge(todo.id)}
                aria-label="Endgültig löschen"
              >
                <TrashIcon />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      {todos.length > 0 && !confirmEmpty && (
        <button type="button" className="trash-empty" onClick={() => setConfirmEmpty(true)}>
          Papierkorb leeren
        </button>
      )}

      {confirmEmpty && (
        <div className="trash-confirm">
          <p>Alle {todos.length} Aufgaben endgültig löschen? Das lässt sich nicht rückgängig machen.</p>
          <button type="button" onClick={handleEmpty}>
            Ja, endgültig löschen
          </button>
          <button type="button" onClick={() => setConfirmEmpty(false)}>
            Abbrechen
          </button>
        </div>
      )}
    </Modal>
  );
}
