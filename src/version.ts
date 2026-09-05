export const APP_VERSION = "0.8.0";

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.8.0",
    date: "2026-09-05",
    changes: [
      "Die App spricht MCP: Solange sie läuft, kann ein KI-Assistent wie Claude Aufgaben suchen, anlegen, ändern, abhaken und löschen, Kategorien nachschlagen und Arbeitszeit in Viertelstunden buchen",
      "Der Zugang läuft nur über den eigenen Rechner und ist durch einen Token geschützt, der im MCP-Popup zum Kopieren steht",
      "Was der Assistent ändert, erscheint sofort im offenen Fenster — ohne Neustart",
      "Aufgaben, Kategorien und Zeitbuchungen liegen jetzt in einer Datenbank statt im Browserspeicher; vorhandene Daten werden beim ersten Start übernommen",
      "Ein Arbeitstag wird beim Speichern nicht mehr halb überschrieben, wenn etwas dazwischenkommt",
      "Löschen einer Kategorie nimmt die zugehörigen Zeitbuchungen nicht mehr mit; sie erscheinen als „Gelöschte Kategorie“",
      "Kategorienamen, die sich nur in Groß- und Kleinschreibung oder in der Schreibweise von Umlauten unterscheiden, lassen sich nicht mehr doppelt anlegen",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-09-03",
    changes: [
      "Neue Ansicht „Zeit“: Arbeitszeit auf 15 Minuten genau buchen, indem man Viertelstunden in einem Wochenraster anklickt oder überstreicht",
      "Wochenraster Montag bis Freitag von 6 bis 22 Uhr, Samstag und Sonntag zuschaltbar; gebucht wird auf die bestehenden Kategorien",
      "Zusammenhängende Viertelstunden werden als Block gezeigt und können eine Notiz tragen",
      "Summen je Tag, je Kategorie und für die Woche, dazu die Differenz zur Sollzeit",
      "Einstellungs-Popup mit Sollzeit je Arbeitstag, Wochenend-Schalter und CSV-Export der Woche",
      "Ansicht-Umschalter im Kopf ist jetzt eine Segmentleiste: Liste, Brett, Zeit",
    ],
  },
  {
    version: "0.6.1",
    date: "2026-08-27",
    changes: [
      "Drag-and-drop im Kanban-Brett unter Windows repariert",
      "Drag-Vorgänge erscheinen jetzt im Debug-Panel",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-08-27",
    changes: [
      "Filterleiste in feste Zeilen gegliedert: Fälligkeit und Status oben, Suche und Kategorie darunter",
      "Größeres Standardfenster mit Mindestgröße, startet mittig auf dem Bildschirm",
      "Update-Prüfung meldet jetzt Fehler und \"kein Update verfügbar\", statt wortlos nichts zu tun",
      "Projekt unter MIT-Lizenz veröffentlicht",
    ],
  },
  {
    version: "0.5.2",
    date: "2026-08-27",
    changes: [
      "Titelleiste unter Windows repariert: Fenster ziehen, minimieren, maximieren und schließen funktionieren",
      "Debug-Log-Panel (Ctrl+Shift+L) für Fehlerdiagnose",
    ],
  },
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
