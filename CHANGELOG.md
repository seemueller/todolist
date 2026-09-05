# Changelog

Alle bemerkenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

## [0.8.0] - 2026-09-05

### Hinzugefügt
- Die App spricht MCP: Solange sie läuft, kann ein KI-Assistent wie Claude die Aufgabenliste lesen und pflegen — Aufgaben suchen, anlegen, ändern, abhaken und löschen, die Kategorien nachschlagen, die Zeitbuchungen einer Woche abfragen und Arbeitszeit in Viertelstunden buchen. Kategorien werden dabei nur benutzt, nicht angelegt oder verändert.
- Der Zugang läuft ausschließlich über den eigenen Rechner (`http://127.0.0.1:4319/mcp`) und ist durch einen Token geschützt, den die App beim ersten Start erzeugt. Er steht im Einstellungs-Popup zum Kopieren; ohne ihn kommt keine Anfrage durch.
- Was der Assistent ändert, erscheint sofort im offenen Fenster — in der Liste, im Brett und in der Wochenansicht, ohne Neustart.

### Geändert
- Todos, Kategorien und Zeitbuchungen liegen jetzt in SQLite statt im `localStorage` des Webviews. Vorhandene Daten werden beim ersten Start nach dem Update einmalig übernommen; die alten `localStorage`-Einträge bleiben als Sicherheitsnetz liegen. Im Browser (Vite-Dev, E2E-Tests) bleibt `localStorage` in Gebrauch.
- Ein Arbeitstag in der Zeiterfassung wird über ein Tauri-Command in einer echten Transaktion ersetzt. Bricht das Schreiben mittendrin ab, bleibt der Tag unverändert, statt halb gelöscht zurückzubleiben.
- Kategorien werden im Desktop-Build und im Browser gleich sortiert. Bisher ordnete WebKit sie anders, weil es Groß- und Kleinschreibung stärker gewichtet als Chromium.

### Behoben
- Das Löschen einer Kategorie löschte im Desktop-Build alle Zeitbuchungen mit, die sie benutzt hatten. Die Buchungen bleiben jetzt erhalten und erscheinen in der Wochenansicht als „Gelöschte Kategorie“.
- Beim Löschen einer Kategorie behielten die betroffenen Aufgaben deren Namen und Farbe. Sie verlieren die Kategorie jetzt vollständig.
- Kategorienamen, die sich nur in der Groß- und Kleinschreibung unterscheiden, lassen sich nicht mehr doppelt anlegen — Umlaute eingeschlossen. Das gilt auch für Namen, die dasselbe Zeichen unterschiedlich zusammensetzen: „Ärzte“ mit einem vorgefertigten Ä und „Ärzte“ mit nachgestelltem Umlautzeichen sehen gleich aus und gelten jetzt auch als gleich.
- Schlägt die einmalige Datenübernahme fehl, sagt die App das jetzt, statt leer zu wirken. Die Daten bleiben unverändert erhalten, der nächste Start versucht es erneut.

## [0.7.0] - 2026-09-03
- Neue Ansicht „Zeit“: Arbeitszeit auf 15 Minuten genau buchen, indem man Viertelstunden in einem Wochenraster anklickt oder überstreicht
- Wochenraster Montag bis Freitag von 6 bis 22 Uhr, Samstag und Sonntag zuschaltbar; gebucht wird auf die bestehenden Kategorien
- Zusammenhängende Viertelstunden werden als Block gezeigt und können eine Notiz tragen
- Summen je Tag, je Kategorie und für die Woche, dazu die Differenz zur Sollzeit
- Einstellungs-Popup mit Sollzeit je Arbeitstag, Wochenend-Schalter und CSV-Export der Woche
- Ansicht-Umschalter im Kopf ist jetzt eine Segmentleiste: Liste, Brett, Zeit

## [0.6.1] - 2026-08-27
- Drag-and-drop im Kanban-Brett unter Windows repariert: Tauris nativer Drag-Handler hat die Events des Bretts verschluckt
- Drag-Vorgänge erscheinen jetzt im Debug-Panel (Start, Ablegen, Statuswechsel, Fehler)

## [0.6.0] - 2026-08-27
- Filterleiste in feste Zeilen gegliedert: Fälligkeit und Status oben, Suche und Kategorie darunter — statt beliebigem Umbruch je nach Fensterbreite
- Größeres Standardfenster (1020 × 820) mit Mindestgröße, startet mittig auf dem Bildschirm
- Update-Prüfung meldet jetzt Fehler und "kein Update verfügbar", statt wortlos nichts zu tun
- Projekt unter MIT-Lizenz veröffentlicht

## [0.5.2] - 2026-08-27
- Titelleiste unter Windows repariert: Fenster ziehen, minimieren, maximieren und schließen funktionieren
- Debug-Log-Panel (Ctrl+Shift+L) für Fehlerdiagnose

## [0.5.0] - 2026-08-26
- In-App-Update-Mechanismus über GitHub Releases
- Deutsche Sprache für Windows-Installer
- Explizite 64-Bit-Targets für Windows-Bundles
- Tauri v2 Bundle-Konfiguration
- Eigene Titelleiste mit Fenstersteuerung wiederhergestellt

## [0.4.0] - 2026-08-25
- Neues helles Design mit warmem Sandton statt des dunklen Looks
- Kräftige Umrandungen, versetzte Schatten und klare Flächen für alle Bedienelemente
- Neue Schrift für Überschriften und Fließtext
- Emoji in der Oberfläche durch einheitlich gezeichnete Symbole ersetzt
- Kopfzeile zeigt jetzt die Anzahl der offenen Aufgaben
- Verständlichere Hinweise bei leerer Liste, aktivem Filter und Fehlern
- Kanban-Spalten mit farbigem Kopf, erledigte Karten sind auch dort erkennbar
- Neue Farbpalette für Kategorie-Badges und Prioritäten
- Oberfläche intern in eine gemeinsame Komponenten-Bibliothek überführt (`src/ui/`)
- Verbindlicher Styleguide unter `STYLEGUIDE.md`

## [0.3.0] - 2026-08-24
- Kategorien für Aufgaben
- Kategorien erstellen, bearbeiten und löschen
- Farbige Kategorie-Badges
- Filter nach Kategorie
- Kanban-Brett mit Drag-and-drop
- Eigene Titelleiste mit Fenstersteuerung

## [0.2.0] - 2026-08-24
- Changelog-Funktion in der Anwendung
- Versionsanzeige im Footer

## [0.1.0] - 2026-08-24
- Erste Version der TodoList-App
- Aufgaben erstellen, bearbeiten, löschen
- Aufgaben als erledigt markieren
