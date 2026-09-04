import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { migrateLocalStorage } from "./migrateLocalStorage";

function start(): void {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Migration first, otherwise the first render reads an empty database. A failed
// migration must not keep the app from starting: the flag stays unset, so the
// next launch retries.
migrateLocalStorage()
  .catch((error) => console.error("localStorage migration failed", error))
  .finally(start);
