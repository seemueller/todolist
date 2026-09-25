// Vorlieben der Oberflaeche. Bewusst localStorage statt app_settings: das ist
// eine Oberflaechen-Vorliebe, kein Domaenendatum. Ueber app_settings muesste das
// Store-Interface in beiden Backends wachsen und das Lesen asynchron werden,
// womit die Liste beim Start kurz im falschen Filter stuende.

import { TODO_TYPES, type TodoType } from "./types";
import { parseTagFilter, type TagFilter } from "./tagFilter";

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

/** Die Zustaende der Typleiste ueber der Liste: "alle" oder genau ein Typ.
 *  Ueber TodoType statt woertlich, damit der Filter mitwaechst, falls je ein
 *  vierter Typ dazukommt. */
export type TypeFilter = "all" | TodoType;

export const TYPE_FILTER_KEY = "todolist.typeFilter";

// "Alle" als Vorgabe: anders als beim Status gibt es keinen Typ, den man
// ueblicherweise ausblenden will.
const DEFAULT_TYPE_FILTER: TypeFilter = "all";

export function loadTypeFilter(): TypeFilter {
  const stored = localStorage.getItem(TYPE_FILTER_KEY);
  // find statt includes: es liefert den Wert schon als TodoType zurueck und
  // spart die Typzusicherung.
  return TODO_TYPES.find((type) => type === stored) ?? DEFAULT_TYPE_FILTER;
}

export function saveTypeFilter(value: TypeFilter): void {
  localStorage.setItem(TYPE_FILTER_KEY, value);
}

/** Die benannten Tag-Filter. Oberflaechen-Vorliebe wie der Statusfilter --
 *  dieselbe Begruendung wie oben, ausserdem gibt es sie nur in dieser Ansicht. */
export const TAG_FILTERS_KEY = "todolist.tagFilters";
/** Id des gewaehlten Tag-Filters; fehlt, wenn keiner gewaehlt ist. */
export const ACTIVE_TAG_FILTER_KEY = "todolist.activeTagFilter";

export function loadTagFilters(): TagFilter[] {
  const stored = localStorage.getItem(TAG_FILTERS_KEY);
  if (!stored) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  // Doppelte Id: der erste gewinnt. Sonst waehlte die aktive Id zwei Filter
  // zugleich, und Umbenennen oder Loeschen traefe beide.
  const seen = new Set<string>();
  const filters: TagFilter[] = [];
  for (const entry of parsed) {
    const filter = parseTagFilter(entry);
    if (filter === null || seen.has(filter.id)) continue;
    seen.add(filter.id);
    filters.push(filter);
  }
  return filters;
}

export function saveTagFilters(filters: TagFilter[]): void {
  localStorage.setItem(TAG_FILTERS_KEY, JSON.stringify(filters));
}

/** Die gemerkte Id, aber nur, wenn es den Filter noch gibt. */
export function loadActiveTagFilterId(filters: TagFilter[]): string | null {
  const stored = localStorage.getItem(ACTIVE_TAG_FILTER_KEY);
  return filters.some((filter) => filter.id === stored) ? stored : null;
}

export function saveActiveTagFilterId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_TAG_FILTER_KEY);
  } else {
    localStorage.setItem(ACTIVE_TAG_FILTER_KEY, id);
  }
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
