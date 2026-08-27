export const APP_VERSION = "0.5.0";

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.5.0",
    date: "2026-08-27",
    changes: [
      "Drag & Drop in der Kanban-Ansicht funktioniert nun auch in der Windows-Version",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-08-25",
    changes: [
      "Neues helles Design mit warmem Sandton statt des dunklen Looks",
      "Kräftige Umrandungen, versetzte Schatten und klare Flächen für alle Bedienelemente",
      "Neue Schrift für Überschriften und Fließtext",
      "Emoji in der Oberfläche durch einheitlich gezeichnete Symbole ersetzt",
      "Kopfzeile zeigt jetzt die Anzahl der offenen Aufgaben",
      "Verständlichere Hinweise bei leerer Liste, aktivem Filter und Fehlern",
      "Kanban-Spalten mit farbigem Kopf, erledigte Karten sind auch dort erkennbar",
      "Neue Farbpalette für Kategorie-Badges und Prioritäten",
      "Oberfläche intern in eine gemeinsame Komponenten-Bibliothek überführt",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-08-24",
    changes: [
      "Kategorien für Aufgaben",
      "Kategorien erstellen, bearbeiten und löschen",
      "Farbige Kategorie-Badges",
      "Filter nach Kategorie",
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
