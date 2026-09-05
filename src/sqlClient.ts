import Database from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:todolist.db";

let pending: Promise<Database> | null = null;

/**
 * True inside the Tauri webview, false in a plain browser. Vite dev and the
 * Playwright suite run in a plain browser, so they keep the localStorage stores.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * The one database connection. Concurrent callers share a single load().
 *
 * Bewusst wird auch ein abgelehntes Promise behalten, nicht nur ein
 * erfolgreiches: schlaegt `Database.load` fehl, bleibt die Datenbank fuer die
 * ganze Sitzung unbenutzbar, statt dass jeder Aufruf einen neuen Versuch
 * startet. Das passt zu dem, was die App der Nutzerin sagt -- der naechste
 * Start versucht es erneut -- und verhindert, dass ein kaputter Zustand als
 * Flut von Einzelfehlern durch die Oberflaeche laeuft.
 */
export function getDb(): Promise<Database> {
  if (!pending) {
    pending = Database.load(DB_PATH);
  }
  return pending;
}
