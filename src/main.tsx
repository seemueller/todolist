import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installDebugInterceptor } from "./debug";
import { migrateLocalStorage } from "./migrateLocalStorage";
import { purgeDeletedBefore } from "./db";
import { cutoffFor } from "./trashRetention";

// Vor allem anderen: das Debug-Panel soll auch die Ausgaben zeigen, die noch
// vor dem ersten Render anfallen -- die Migration und der asynchrone Aufbau der
// Titelleiste protokollieren genau dann, wenn etwas schiefgeht. Der Aufruf
// steht absichtlich synchron hier und nicht in einem Effekt in App: ein Effekt
// laeuft erst nach den Effekten der Kinder, ein nachgeladenes Modul noch
// spaeter, und was in dieser Luecke passiert, fehlt im Panel.
//
// `import.meta.env.DEV` ist im Produktionsbuild eine Konstante (false), der
// Aufruf faellt dort samt Modul weg: das Panel und der Interceptor gehoeren
// nicht in ein ausgeliefertes Programm.
if (import.meta.env.DEV) {
  installDebugInterceptor();
}

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
//
// The failure is turned into a value (the banner text or null) before start()
// is ever called, so start() runs exactly once, outside any catch. Chaining
// .then(() => start(null)) directly onto the migration's promise would put
// start()'s own render inside that same try, so a render failure would land
// in this .catch and get mislabeled as a migration failure -- while the real
// migration might have succeeded and set its flag.
migrateLocalStorage()
  .then(() => null)
  .catch((error) => {
    console.error("localStorage migration failed", error);
    return MIGRATION_ERROR_MESSAGE;
  })
  .then(async (migrationError) => {
    // Misslungenes Aufraeumen kostet keine Daten und bekommt darum kein
    // Banner: die Meldung landet in der Konsole, der Start laeuft weiter.
    try {
      await purgeDeletedBefore(cutoffFor(new Date()));
    } catch (error) {
      console.error("purging the trash failed", error);
    }
    return migrationError;
  })
  .then(start);
