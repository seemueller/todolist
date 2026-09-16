// Vorlieben der Listenansicht. Bewusst localStorage statt app_settings: das ist
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
