// Der Einstellungsabschnitt zum MCP-Server: laeuft er, auf welchem Port, und
// mit welchem Zugang verbindet sich ein Client.
//
// Der Token ist ein Zugangsschluessel zur gesamten Datenbank. Er wird darum
// verdeckt dargestellt, bis jemand ihn ausdruecklich aufdeckt, und er verlaesst
// diese Komponente nur in die Zwischenablage -- nie in eine Log-Zeile, eine
// Fehlermeldung oder einen console-Aufruf. Auch die Client-Zeile traegt ihn in
// sich und wird deshalb genauso verdeckt.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { isTauri } from "./sqlClient";
import { CopyIcon, EyeIcon, EyeOffIcon, IconButton } from "./ui";

/** Rueckgabe des Tauri-Commands `mcp_status`. */
export interface McpStatus {
  running: boolean;
  port: number;
  token: string;
}

/** Feste Laenge, damit der Platzhalter nichts ueber den Wert verraet. */
const MASK = "••••••••••••";

/** Die Zeile, die ein Client so uebernehmen kann. */
export function clientCommand(port: number, token: string): string {
  return (
    `claude mcp add --transport http todolist http://127.0.0.1:${port}/mcp ` +
    `--header "Authorization: Bearer ${token}"`
  );
}

type Copied = "token" | "command";

export function McpSettings() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<Copied | null>(null);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    invoke<McpStatus>("mcp_status")
      .then((next) => {
        if (active) setStatus(next);
      })
      // Der Fehler wird bewusst nicht weitergereicht: seine Meldung koennte in
      // einer kuenftigen Fassung den Token tragen.
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Die Rueckmeldung verschwindet von selbst, damit kein Zustand haengen bleibt.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback((value: string, what: Copied) => {
    setCopyError(false);
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(what))
      // Nur die Tatsache, nie der Wert.
      .catch(() => setCopyError(true));
  }, []);

  if (!isTauri()) {
    return (
      <div className="mcp-settings">
        <p className="muted">Der MCP-Server läuft nur in der App, nicht im Browser.</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mcp-settings">
        <p className="error">Der Status des MCP-Servers lässt sich nicht lesen.</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mcp-settings">
        <p className="muted">Wird geladen…</p>
      </div>
    );
  }

  if (!status.running) {
    return (
      <div className="mcp-settings">
        <div className="mcp-row">
          <span className="mcp-label">Status</span>
          <span className="mcp-state">Läuft nicht</span>
        </div>
        <p className="mcp-hint">
          Der Server auf Port {status.port} ist nicht gestartet — vermutlich hält ihn ein
          anderes Programm besetzt. Solange das so ist, kann sich kein Client verbinden.
        </p>
      </div>
    );
  }

  const command = clientCommand(status.port, revealed ? status.token : MASK);

  return (
    <div className="mcp-settings">
      <div className="mcp-row">
        <span className="mcp-label">Status</span>
        <span className="mcp-state running">Läuft auf Port {status.port}</span>
      </div>

      <div className="mcp-row">
        <span className="mcp-label">Token</span>
        <code className="mcp-secret">{revealed ? status.token : MASK}</code>
        <IconButton
          variant="icon"
          onClick={() => setRevealed((r) => !r)}
          aria-pressed={revealed}
          aria-label={revealed ? "Token verbergen" : "Token anzeigen"}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </IconButton>
        <IconButton
          variant="icon"
          onClick={() => copy(status.token, "token")}
          aria-label="Token kopieren"
        >
          <CopyIcon />
        </IconButton>
        {copied === "token" && (
          <span className="mcp-copied" role="status">
            Kopiert
          </span>
        )}
      </div>

      <div className="mcp-row mcp-row-command">
        <span className="mcp-label">Client</span>
        <IconButton
          variant="icon"
          onClick={() => copy(clientCommand(status.port, status.token), "command")}
          aria-label="Client-Befehl kopieren"
        >
          <CopyIcon />
        </IconButton>
        {copied === "command" && (
          <span className="mcp-copied" role="status">
            Kopiert
          </span>
        )}
        {/* Steht durch `flex-basis: 100%` unter Beschriftung und Knopf. */}
        <code className="mcp-command">{command}</code>
      </div>

      {copyError && <p className="error">Kopieren in die Zwischenablage ist fehlgeschlagen.</p>}

      <p className="mcp-hint">
        Der Token ist ein Zugangsschlüssel: wer ihn hat, kann alle Aufgaben, Kategorien und
        Zeitbuchungen lesen und ändern. Der kopierte Befehl trägt ihn im Klartext — gib ihn
        nicht weiter.
      </p>
    </div>
  );
}
