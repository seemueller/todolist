# Changelog

Alle bemerkenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

## [0.19.0] - 2026-09-23

### Hinzugefügt
- Das Brett lässt sich nach **Typ** filtern: dieselbe Leiste Alle · Bug · Task · Story wie über der Liste, neben den Kategoriechips. Typ und Kategorie wirken zusammen. Die Wahl gilt nur für die Sitzung und verstellt den Typfilter der Liste nicht.

## [0.18.0] - 2026-09-23

### Hinzugefügt
- Das Brett hat ganz links eine neue Spalte **„Wartend“** für Aufgaben, die offen sind, aber auf jemand anderen warten. Wartende Aufgaben zählen als offen und stehen im Listenfilter „Offen“. Über MCP nehmen `list_todos` und `update_todo` den Status `waiting` an.

## [0.17.0] - 2026-09-22

### Entfernt
- Die **Priorität** gibt es nicht mehr. Zwei Felder, die beide eine Rangfolge behaupten, waren eines zu viel: der Typ sagt, um welche Art Arbeit es geht, die Fälligkeit sagt, wann sie dran ist. Das Auswahlfeld verschwindet aus dem Formular, aus der Zeile und aus dem Aufgaben-Fenster, und `add_todo`/`update_todo` nehmen über MCP keine Priorität mehr an.

### Geändert
- Die farbige Kante an Listenzeile und Karte zeigt jetzt den **Typ** statt der Priorität — Bug rot, Task blau, Story grün, dieselben Farben wie das Kürzel daneben.
- Im Brett entscheidet bei gleichem Platz und gleicher Fälligkeit nur noch das Alter, nicht mehr die Priorität.

## [0.16.0] - 2026-09-22

### Hinzugefügt
- Jede Aufgabe hat neben ihrer Kategorie einen **Typ**: Bug, Task oder Story. Er steht als farbiges Kürzel in der Zeile und auf der Karte — Bug rot, Task blau, Story grün — und ist beim Anlegen und im Aufgaben-Fenster wählbar. Bestehende Aufgaben werden Tasks.
- Über der Liste filtert eine zweite Leiste nach dem Typ. Die Wahl merkt sich die App bis zum nächsten Start, wie den Statusfilter daneben.
- `list_todos` liefert den Typ über MCP mit, `add_todo` und `update_todo` nehmen ihn an. Ohne Angabe gilt „task"; ein anderer Wert als `bug`, `task` oder `story` ist ein Fehler, dessen Meldung die erlaubten nennt. Leeren lässt sich der Typ nicht — eine Aufgabe ohne Typ gibt es nicht.

## [0.15.0] - 2026-09-21

### Geändert
- Das Fenster einer Aufgabe ist 60 % breiter (896 statt 560 px) — die Beschreibung ist laufender Text geworden, und der braucht Breite.
- Das Fenster lässt sich an der unteren rechten Ecke größer ziehen; die Beschreibung wächst dabei mit. Die gezogene Größe merkt sich die App und öffnet das nächste Fenster wieder so. Auf einem kleineren Bildschirm wird sie auf dessen Maße begrenzt, ohne den gemerkten Wert zu verlieren.

## [0.14.0] - 2026-09-21

### Hinzugefügt
- Die Beschreibung einer Aufgabe wird gelesen, statt im Textfeld entziffert: das Detail-Fenster öffnet sie als gesetzten Text und formt Markdown aus — Überschriften, Listen, Checklisten, Zitate, Code, Trennlinien, fett/kursiv/durchgestrichen und Links. Ein Knopf über dem Feld schaltet zum Schreiben und zurück; wo noch nichts steht, öffnet gleich das Textfeld.
- Links in einer Beschreibung öffnen im Systembrowser. Nur `http`, `https` und `mailto` werden zum Link, alles andere bleibt Text — eine Beschreibung schreibt auch ein Modell über MCP.

## [0.13.0] - 2026-09-17

### Hinzugefügt
- Die Notiz eines Zeitblocks steht jetzt im Raster, mitten in der Buchung. Sie sitzt in der breitesten Stundenzeile des Blocks und rückt von selbst mit, wenn der Block wächst, schrumpft oder verschoben wird. Die Schriftfarbe richtet sich nach dem Kontrast zur Kategoriefarbe. Eine einzelne Viertelstunde bleibt unbeschriftet — dort passt kein Text.
- Die Zeiterfassung hat eine Auswertung: ein Knopf in der Kopfzeile öffnet ein Fenster, das je Kategorie zeigt, welcher Anteil der Arbeitszeit auf sie entfällt — als Balken, Dauer und Prozentwert. Oben die angezeigte Woche, darunter ein Kalendermonat mit eigener Navigation. Gezählt wird nur Arbeitszeit; Pausen und Privates bleiben außen vor.

## [0.12.0] - 2026-09-17

### Hinzugefügt
- Karten lassen sich im Brett innerhalb einer Spalte an eine beliebige Stelle ziehen. Eine Linie zeigt beim Ziehen, wo die Karte landet, und die Reihenfolge überlebt den Neustart. Wer nichts zieht, sieht die Spalte weiterhin nach Fälligkeit sortiert.

### Behoben
- Fehlermeldungen erscheinen jetzt auch im Brett. Sie standen nur in der Listenansicht, ein fehlgeschlagener Schreibvorgang blieb im Brett also stumm, bis man die Ansicht wechselte.

## [0.11.0] - 2026-09-16

### Hinzugefügt
- Das Brett hat eine Chipleiste über den Spalten: ein Klick auf eine Kategorie zeigt nur deren Karten, mehrere lassen sich zusammenschalten, „Ohne Kategorie" sammelt die Aufgaben ohne Zuordnung, „Alle" hebt die Auswahl wieder auf. Die Auswahl ist unabhängig vom Filter der Liste.
- Eine Kategorie trägt jetzt eine Zeitart: **Keine** (Pause, Privat, Arzt), **Intern** oder **Extern**. Eingestellt wird sie im Kategorien-Fenster, beim Anlegen wie bei jeder bestehenden Kategorie. Bestehende Kategorien sind Arbeitszeit („Intern"); wer eine anders eingestuft haben will, stellt sie dort einmal um.
- Der CSV-Export der Woche hat die Spalte „Art" hinter der Kategorie und schreibt dort „intern", „extern" oder „keine".

### Geändert
- Die Liste startet auf **Offen** statt auf **Alle** und merkt sich, was zuletzt gewählt war. „Zurücksetzen" landet ebenfalls auf **Offen** — das Zurücksetzen blendet damit nicht mehr den erledigten Altbestand ein.
- Die Wochensumme der Zeiterfassung und die Summe je Tag zeigen nur noch Arbeitszeit, und nur sie zählt gegen das Soll. Gebuchte Zeit auf Kategorien der Zeitart „Keine" steht daneben als eigener Ausweis, etwa „+ 1:00 keine Arbeitszeit", und erscheint nur, wenn es solche Zeit gibt.

## [0.10.0] - 2026-09-14

### Hinzugefügt
- Gelöschte Aufgaben landen im Papierkorb statt verloren zu gehen. Direkt nach dem Löschen bietet die App „Rückgängig" an; darüber hinaus sammelt ein Papierkorb-Fenster (Knopf im Kopf) alles Gelöschte, aus dem einzeln wiederhergestellt oder endgültig gelöscht werden kann. Nach 30 Tagen räumt die App den Papierkorb beim Start selbst auf.
- Was ein KI-Assistent über MCP löscht, liegt ebenfalls im Papierkorb und lässt sich dort zurückholen.

### Behoben
- Eine gerade angelegte oder umbenannte Kategorie steht jetzt an derselben Stelle der Liste wie nach einem Neustart. Vorher sortierte die Oberfläche anders als der Speicher, was im Desktop-Build (WebKitGTK) eine sichtbar andere Reihenfolge ergab.

## [0.9.0] - 2026-09-14

### Hinzugefügt
- Eine Aufgabe kann jetzt eine Beschreibung tragen: Ein Klick auf den Stift in der Zeile — oder ein Doppelklick auf den Titel — öffnet ein Fenster, in dem Titel, Beschreibung, Priorität, Fälligkeit und Kategorie zusammen stehen. Die Beschreibung darf mehrere Absätze haben. Gesichert wird alles auf einmal; Abbrechen verwirft.
- Aufgaben mit Beschreibung sind in der Liste an einem kleinen Notiz-Symbol zu erkennen, im Brett zeigt die Karte die ersten zwei Zeilen.
- Ein KI-Assistent kann die Beschreibung über MCP mitlesen, setzen und wieder leeren.
- Wird die gerade geöffnete Aufgabe zwischenzeitlich anderswo gelöscht — etwa von einem anderen MCP-Client —, schließt sich das Bearbeitungsfenster von selbst, und eine Meldung sagt: „Die Aufgabe wurde zwischenzeitlich gelöscht. Nicht gespeicherte Änderungen sind verloren.“

### Geändert
- Der Titel wird nicht mehr direkt in der Zeile umbenannt, sondern im neuen Fenster. Priorität, Fälligkeit und Kategorie bleiben in der Zeile bedienbar.

### Behoben
- Ein KI-Assistent löscht Fälligkeit, Kategorie oder Beschreibung einer Aufgabe nur noch, wenn er es ausdrücklich verlangt (`clear_due_date`, `clear_category`, `clear_description`). Bisher genügte dafür ein mitgeschicktes `null`, und das hat beim bloßen Abhaken Kategorie und Fälligkeit gekostet.

## [0.8.1] - 2026-09-05

### Behoben
- Die App konnte mit „migration 1 was previously applied but has been modified“ abbrechen, ohne dass an der Datenbank etwas geändert worden war. Ursache waren die Zeilenenden: je nachdem, wie der Quelltext ausgecheckt wurde, entstanden aus demselben Stand unterschiedliche Prüfsummen der Datenbank-Migrationen. Sie sind jetzt festgeschrieben.

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
