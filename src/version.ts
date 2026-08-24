export const APP_VERSION = "0.3.0";

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.3.0",
    date: "2026-08-24",
    changes: [
      "Komplettes Look & Feel Redesign",
      "Custom Title Leiste mit Fenstersteuerung",
      "Modernes dunkles Design mit Glassmorphismus",
      "Custom App-Icon und SVG-Grafiken",
      "Verbesserte Animationen und Übergänge",
      "Neue Typografie mit Inter Font",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-08-24",
    changes: [
      "Changelog-Funktion in der Anwendung",
      "Versionsanzeige im Footer",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-08-24",
    changes: [
      "Erste Version der TodoList-App",
      "Aufgaben erstellen, bearbeiten, löschen",
      "Aufgaben als erledigt markieren",
    ],
  },
];
