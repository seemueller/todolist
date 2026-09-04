import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { migrateLocalStorage } from "./migrateLocalStorage";

// Wird der Nutzerin gezeigt, wenn die Migration scheitert -- die eigentliche
// Fehlermeldung landet in der Konsole, hier steht nur, was fuer sie zaehlt:
// nichts ist verloren, der naechste Start versucht es erneut.
const MIGRATION_ERROR_MESSAGE =
  "Die Übernahme deiner bestehenden Daten ist fehlgeschlagen. Deine Aufgaben und Buchungen sind unverändert gespeichert; beim nächsten Start wird es erneut versucht.";

function start(migrationError: string | null): void {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App migrationError={migrationError} />
    </React.StrictMode>,
  );
}

// Migration first, otherwise the first render reads an empty database. A failed
// migration must not keep the app from starting: the flag stays unset, so the
// next launch retries.
migrateLocalStorage()
  .then(() => start(null))
  .catch((error) => {
    console.error("localStorage migration failed", error);
    start(MIGRATION_ERROR_MESSAGE);
  });
