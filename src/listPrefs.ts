// Vorlieben der Oberflaeche. Bewusst localStorage statt app_settings: das ist
// eine Oberflaechen-Vorliebe, kein Domaenendatum. Ueber app_settings muesste das
// Store-Interface in beiden Backends wachsen und das Lesen asynchron werden,
// womit die Liste beim Start kurz im falschen Filter stuende.

/** Die drei Zustaende der Statusleiste ueber der Liste. */
export type StatusFilter = "all" | "open" | "done";

export const STATUS_FILTER_KEY = "todolist.statusFilter";

// "Offen" als Vorgabe: was erledigt ist, ist erledigt -- die Liste soll beim
// Oeffnen zeigen, was noch zu tun ist.
const DEFAULT_STATUS_FILTER: StatusFilter = "open";

export function loadStatusFilter(): StatusFilter {
  const stored = localStorage.getItem(STATUS_FILTER_KEY);
  return stored === "all" || stored === "open" || stored === "done"
    ? stored
    : DEFAULT_STATUS_FILTER;
}

export function saveStatusFilter(value: StatusFilter): void {
  localStorage.setItem(STATUS_FILTER_KEY, value);
}

/** Die vier Zustaende der Typleiste ueber der Liste. */
export type TypeFilter = "all" | "bug" | "task" | "story";

export const TYPE_FILTER_KEY = "todolist.typeFilter";

// "Alle" als Vorgabe: anders als beim Status gibt es keinen Typ, den man
// ueblicherweise ausblenden will.
const DEFAULT_TYPE_FILTER: TypeFilter = "all";

export function loadTypeFilter(): TypeFilter {
  const stored = localStorage.getItem(TYPE_FILTER_KEY);
  return stored === "bug" || stored === "task" || stored === "story"
    ? stored
    : DEFAULT_TYPE_FILTER;
}

export function saveTypeFilter(value: TypeFilter): void {
  localStorage.setItem(TYPE_FILTER_KEY, value);
}

/** Groesse eines Modal-Panels in Pixeln. */
export interface ModalSize {
  width: number;
  height: number;
}

export const TODO_MODAL_SIZE_KEY = "todolist.todoModalSize";

/** Unter diese Groesse laesst sich das Fenster nicht ziehen; dieselben Werte
 *  stehen als `min-width`/`min-height` im CSS. Ein kleinerer gespeicherter
 *  Wert -- aus einer aelteren Fassung oder von Hand gesetzt -- wird hier
 *  angehoben, statt ein unbedienbares Fenster zu oeffnen. */
const MIN_MODAL_SIZE: ModalSize = { width: 360, height: 320 };

/**
 * Die zuletzt gezogene Groesse des Aufgaben-Fensters, auf den aktuellen
 * Bildschirm begrenzt. `null`, wenn nichts gespeichert ist oder der Wert
 * unbrauchbar ist -- dann gilt die Vorgabe aus dem CSS.
 *
 * Die Begrenzung passiert beim Lesen, nicht beim Schreiben: wer an einem
 * grossen Monitor zieht und das Fenster spaeter auf dem Laptop oeffnet, soll
 * ein passendes Fenster sehen und seine Groesse am grossen Monitor behalten.
 */
export function loadTodoModalSize(): ModalSize | null {
  const stored = localStorage.getItem(TODO_MODAL_SIZE_KEY);
  if (!stored) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { width, height } = parsed as Partial<ModalSize>;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  return {
    width: clamp(width as number, MIN_MODAL_SIZE.width, window.innerWidth - 32),
    height: clamp(height as number, MIN_MODAL_SIZE.height, window.innerHeight - 32),
  };
}

export function saveTodoModalSize(size: ModalSize): void {
  localStorage.setItem(TODO_MODAL_SIZE_KEY, JSON.stringify(size));
}

function clamp(value: number, min: number, max: number): number {
  // Ein Fenster, das breiter als der Bildschirm ist, waere schlimmer als ein
  // zu kleines -- darum gewinnt die Obergrenze, wenn beide sich widersprechen.
  return Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
}
