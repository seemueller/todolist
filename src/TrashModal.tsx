// Der Papierkorb: was geloescht wurde, bis es endgueltig weg ist. Eigene Datei
// und eigener State -- App.tsx haelt den Papierkorb nicht mit, er wird selten
// gebraucht und laedt sich beim Oeffnen selbst.

import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { listDeletedTodos, purgeTodo, restoreTodo } from "./db";
import { DATA_CHANGED_EVENT } from "./events";
import { isTauri } from "./sqlClient";
import { Todo } from "./types";
import { IconButton, Modal, TrashIcon, UndoIcon } from "./ui";

export interface TrashModalProps {
  onClose: () => void;
  /** Gerufen, wenn sich am Papierkorb etwas geaendert hat: beim
   *  Wiederherstellen muss die Liste dahinter neu laden, beim endgueltigen
   *  Loeschen muss die Oberflaeche eine Rueckgaengig-Anzeige zurueckziehen,
   *  die auf die entfernte Aufgabe zeigt. */
  onChanged: () => void;
}

export function TrashModal({ onClose, onChanged }: TrashModalProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  // Zaehlt Ladeauftraege durch, damit eine spaeter gestartete, aber frueher
  // beantwortete Anfrage nicht eine noch laufende ueberschreibt -- sonst
  // gewinnt bei einem waehrend des Ladens eintreffenden data_changed-Ereignis
  // moeglicherweise der aeltere Stand.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const fresh = await listDeletedTodos();
      if (id !== requestId.current) return;
      setTodos(fresh);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
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
      onChanged();
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
      onChanged();
    } catch (err) {
      // Ein Teil der Schleife kann schon durch sein, bevor ein purgeTodo
      // ablehnt -- statt zu raten, welche Zeilen noch da sind, wird der
      // tatsaechliche Stand aus der Datenbank neu geladen. Reihenfolge
      // wichtig: load() setzt bei Erfolg den Fehler zurueck, die eigentliche
      // Fehlermeldung muss deshalb danach gesetzt werden.
      await load();
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

      {confirmEmpty && todos.length > 0 && (
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
