export const APP_VERSION = "0.19.0";

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.19.0",
    date: "2026-09-23",
    changes: [
      "Das Brett lässt sich nach Typ filtern, zusammen mit den Kategorien und getrennt von der Liste",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-09-23",
    changes: [
      "Neue Brett-Spalte \"Wartend\" ganz links für Aufgaben, die auf jemand anderen warten",
    ],
  },
  {
    version: "0.17.0",
    date: "2026-09-22",
    changes: [
      "Die Priorität gibt es nicht mehr — der Typ sagt, um welche Art Arbeit es geht, die Fälligkeit, wann sie dran ist",
      "Die farbige Kante an Zeile und Karte zeigt jetzt den Typ: Bug rot, Task blau, Story grün",
      "Im Brett entscheidet bei gleichem Platz und gleicher Fälligkeit nur noch das Alter",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-09-22",
    changes: [
      "Jede Aufgabe hat neben ihrer Kategorie einen Typ: Bug, Task oder Story — als farbiges Kürzel in der Zeile und auf der Karte, wählbar beim Anlegen und im Aufgaben-Fenster",
      "Über der Liste filtert eine zweite Leiste nach dem Typ; die Wahl gilt beim nächsten Start wieder",
      "Über MCP liefert list_todos den Typ mit, add_todo und update_todo nehmen ihn an — ohne Angabe gilt „task\"",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-09-21",
    changes: [
      "Das Fenster einer Aufgabe ist 60 % breiter — die Beschreibung ist laufender Text geworden, und der braucht Breite",
      "Das Fenster lässt sich an der unteren rechten Ecke größer ziehen; die Beschreibung wächst mit, und die gezogene Größe gilt beim nächsten Öffnen wieder",
      "Auf einem kleineren Bildschirm wird die gemerkte Größe auf dessen Maße begrenzt, ohne verloren zu gehen",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-09-21",
    changes: [
      "Die Beschreibung einer Aufgabe wird gelesen statt entziffert: das Detail-Fenster zeigt sie als gesetzten Text und formt Markdown aus — Überschriften, Listen, Checklisten, Zitate, Code, Trennlinien, fett, kursiv und Links",
      "Ein Knopf über dem Feld schaltet zwischen Lesen und Schreiben; wo noch keine Beschreibung steht, öffnet gleich das Textfeld",
      "Links in einer Beschreibung öffnen im Systembrowser — zum Link werden nur http, https und mailto, alles andere bleibt Text",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-09-17",
    changes: [
      "Die Zeiterfassung hat eine Auswertung: ein Knopf in der Kopfzeile zeigt je Kategorie, welcher Anteil der Arbeitszeit auf sie entfällt — als Balken, Dauer und Prozentwert",
      "Die Auswertung zeigt oben die angezeigte Woche und darunter einen Kalendermonat mit eigener Navigation; gezählt wird nur Arbeitszeit, Pausen und Privates bleiben außen vor",
      "Die Notiz eines Zeitblocks steht jetzt mitten in der Buchung im Raster und rückt mit, wenn der Block wächst, schrumpft oder verschoben wird",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-09-17",
    changes: [
      "Karten lassen sich im Brett innerhalb einer Spalte an jede Stelle ziehen: eine Linie zeigt beim Ziehen, wo die Karte landet, und die Reihenfolge bleibt über den Neustart hinweg erhalten",
      "Wer nichts zieht, sieht die Spalte weiterhin nach Fälligkeit sortiert — die gezogene Reihenfolge hat nur dort Vorrang, wo jemand sie gesetzt hat",
      "Fehlermeldungen erscheinen jetzt auch im Brett; bisher standen sie nur in der Liste, ein fehlgeschlagener Schreibvorgang blieb im Brett also stumm",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-09-16",
    changes: [
      "Das Brett filtert nach Kategorien: Die Chipleiste über den Spalten blendet ein, was gerade zählt — mehrere Kategorien zusammenschaltbar, „Ohne Kategorie“ für alles Unsortierte",
      "Eine Kategorie trägt jetzt eine Zeitart: „Keine“ für Pause oder Privates, sonst „Intern“ oder „Extern“; eingestellt wird sie im Kategorien-Fenster",
      "Die Wochensumme der Zeiterfassung zählt nur noch Arbeitszeit gegen das Soll; gebuchte Zeit auf einer Kategorie ohne Arbeitszeit steht daneben als eigener Ausweis",
      "Der CSV-Export der Woche nennt in der neuen Spalte „Art“, ob eine Buchung intern, extern oder keine Arbeitszeit ist",
      "Die Liste startet auf „Offen“ und merkt sich, was zuletzt gewählt war — der erledigte Altbestand steht nicht mehr bei jedem Start zwischen den offenen Aufgaben",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-09-14",
    changes: [
      "Gelöschte Aufgaben landen im Papierkorb statt verloren zu gehen: Direkt nach dem Löschen steht „Rückgängig“ bereit",
      "Ein Papierkorb-Fenster — der Knopf steht neben „Kategorien“ — sammelt alles Gelöschte: einzeln wiederherstellen oder endgültig entfernen",
      "Nach 30 Tagen räumt die App den Papierkorb beim Start selbst auf",
      "Was ein KI-Assistent über MCP löscht, liegt ebenfalls im Papierkorb und lässt sich dort zurückholen",
      "Eine gerade angelegte oder umbenannte Kategorie steht jetzt an derselben Stelle der Liste wie nach einem Neustart",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-09-14",
    changes: [
      "Eine Aufgabe kann eine Beschreibung tragen: Der Stift in der Zeile — oder ein Doppelklick auf den Titel — öffnet ein Fenster mit Titel, Beschreibung, Priorität, Fälligkeit und Kategorie",
      "Aufgaben mit Beschreibung sind in der Liste an einem Notiz-Symbol zu erkennen, im Brett zeigt die Karte die ersten zwei Zeilen",
      "Ein KI-Assistent kann die Beschreibung über MCP mitlesen, setzen und wieder leeren",
      "Wird die geöffnete Aufgabe zwischenzeitlich anderswo gelöscht, schließt sich das Bearbeitungsfenster von selbst und sagt Bescheid",
      "Ein KI-Assistent löscht Fälligkeit, Kategorie oder Beschreibung nur noch auf ausdrückliche Anweisung — bisher konnte das bloße Abhaken einer Aufgabe Kategorie und Fälligkeit kosten",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-09-05",
    changes: [
      "Startabbruch mit „migration 1 was previously applied but has been modified“ behoben — die Zeilenenden des Quelltexts konnten die Prüfsummen der Datenbank-Migrationen verändern",
    ],
  },
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
