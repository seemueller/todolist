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

/** The one database connection. Concurrent callers share a single load(). */
export function getDb(): Promise<Database> {
  if (!pending) {
    pending = Database.load(DB_PATH);
  }
  return pending;
}
