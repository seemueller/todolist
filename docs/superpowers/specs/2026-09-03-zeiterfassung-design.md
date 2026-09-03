# Zeiterfassung — Viertelstunden-Matrix

Stand: 2026-09-03. Eigene View neben Liste und Kanban-Brett, ohne Verflechtung mit
den Todos.

## Ziel

Arbeitszeit auf 15 Minuten genau buchen, ohne eine Zahl zu tippen. Die Eingabe ist
eine Matrix: Zeilen sind Stunden, Spalten sind die fünf Arbeitstage mit je vier
Viertelstunden. Oben steht eine Palette der bestehenden Kategorien als Pinsel;
Zellen werden angeklickt oder überstrichen. Die ganze Woche passt ohne Scrollen auf
den Schirm — die Tagesansicht wäre für ihre Breite zu leer.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Eingabeform | Viertelstunden-Matrix mit Pinsel, kein Kalenderraster |
| Buchungsziel | bestehende `Category` (Name und Farbe existieren schon) |
| Umfang Schritt 1 | Wochenansicht mit Tages- und Wochensumme, Sollzeit, CSV-Export |
| Stundenbereich | fest 6–22 Uhr, 17 Zeilen, kein Scrollen |
| Korrektur | Klick schaltet um, Ziehen bucht den Bereich Anker–Zelle |
| Datenfelder | Kategorie plus optionale Notiz je Block |
| Navigation | Segment-Leiste im Header: Liste \| Brett \| Zeit |
| Wochenlauf | Montag bis Freitag, Samstag und Sonntag zuschaltbar |
| Sollzeit | je regulärem Arbeitstag, in 15-Minuten-Schritten, Vorgabe 8:00 |
| Export | CSV der angezeigten Woche, eine Zeile je Block |
| Einstellungen | Sollzeit, Wochenend-Schalter und Export liegen in einem Popup |
| Zug über Spalten | ein Zug bleibt im Tag, in dem er begann |

## Datenmodell

Ein Datensatz pro Viertelstunde:

```ts
interface TimeSlotRecord {
  date: string;        // "2026-09-03"
  slot: number;        // Viertelstunden-Index seit Mitternacht, 0–95
  category_id: number;
  note: string;
}
```

`slot = hour * 4 + minute / 15`, also `33` = 08:15. Das Raster zeigt je Tag die
Slots 24 (06:00) bis 91 (22:45), also 68 Zellen pro Tag und 340 in der Woche.
Der Speicher bleibt tagweise; die View lädt die fünf Tage der Woche parallel.

Ein **Block** ist ein zusammenhängender Lauf gleicher `category_id` und wird nie
gespeichert, sondern immer aus den Slots berechnet. Die Notiz liegt physisch am
Slot, gehört aber dem Block: nach jeder Änderung läuft `normalizeNotes`, das je
Block die erste nichtleere Notiz auf alle Slots des Blocks schreibt. Damit erbt
ein neu gemalter Nachbar-Slot die Notiz seines Blocks, und Teilen wie Verschmelzen
von Blöcken braucht keine Sonderbehandlung.

Persistenz wie in `db.ts`: localStorage, Key `todolist_timeslots`, Promise-API.

Die Einstellungen liegen getrennt davon unter `todolist_time_settings`:

```ts
interface TimeSettings {
  targetSlotsPerDay: number; // Sollzeit je Arbeitstag in Viertelstunden, 32 = 8:00
  showWeekend: boolean;      // Samstag und Sonntag mitanzeigen
}
```

Das Soll wird beim Schreiben auf 0 bis 64 Viertelstunden (0:00 bis 16:00) begrenzt;
kaputte oder fehlende Werte fallen auf die Vorgabe zurück.

## Interaktion

Palette: pro Kategorie ein Chip mit der Kategoriefarbe als Fläche. Der aktive
Pinsel trägt `active`.

Malen: `pointerdown` setzt den Anker und legt die Aktion einmalig fest — leere Zelle
oder andere Farbe wird gefüllt, gleiche Farbe wird geleert. Jedes `pointerenter`
rechnet den **Bereich** zwischen Anker und aktueller Zelle neu gegen den Stand bei
Zugbeginn; darum überspringt eine schnelle Maus keine Viertelstunde und
Zurückziehen nimmt die Buchung wieder weg. Gespeichert wird einmal beim Loslassen.
Ein Zug bleibt in der Spalte, in der er begann. Die Zellen tragen
`draggable={false}`, damit der native Drag-and-drop nicht dazwischenfunkt.

Eine Ladezusage, die später als ein Schreiben ankommt, wird über einen
Schreibzähler verworfen — sonst überschreibt der initiale Ladevorgang eine
Buchung, die unmittelbar nach dem Öffnen gemalt wurde.

Jede Zelle ist ein `<button>` mit `aria-label` `"Mo 31.08. 08:15, Projekt Alpha"`
oder `"Mo 31.08. 08:15, frei"`. Tastatur und E2E-Tests greifen dieselbe
Oberfläche.

Notizen werden ausschließlich in der Blockliste unter dem Raster bearbeitet, nie
im Raster. Beim Malen öffnet sich kein Dialog.

## Sollzeit

Das Soll gilt je **regulärem** Arbeitstag. Das Wochensoll ist darum immer
`Soll je Tag × 5`, unabhängig davon, ob Samstag und Sonntag angezeigt werden —
Wochenendarbeit zählt als Plus, nicht als neues Soll. Die Differenz steht als
`+1:15` bzw. `-4:45` in der Leiste: fehlt Zeit, liegt sie auf `--accent`, ist das
Soll erreicht, auf `--success`.

Verstellt wird sie über zwei Knöpfe in 15-Minuten-Schritten, nicht über ein
Zahlenfeld — dasselbe Prinzip wie beim Raster. Die Knöpfe stehen im
Einstellungs-Popup; in der Kopfzeile bleibt nur die Differenz stehen, weil sie
Ergebnis ist und keine Einstellung.

## Export

Ein Knopf im Einstellungs-Popup lädt die **angezeigte** Woche als CSV
(`zeiterfassung-<montag>.csv`). Eine Zeile je Block, Semikolon als Trennzeichen und
eine BOM am Anfang, damit Excel in deutscher Einstellung Spalten und Umlaute
richtig liest. Spalten: `Datum;Von;Bis;Dauer;Minuten;Kategorie;Notiz`. Felder mit
Semikolon oder Anführungszeichen werden eingefasst. Tage ohne Buchung erzeugen
keine Zeile.

Der Download läuft über einen Blob und ein `<a download>`. Im Browser und im
Tauri-Fenster funktioniert das; ein Speicherdialog über die Tauri-Plugins ist
bewusst nicht eingebaut.

## Einstellungs-Popup

Alles, was selten angefasst wird, liegt hinter dem Schieberegler-Knopf in der
Kopfzeile: Soll je Arbeitstag, Wochenende anzeigen, Woche als CSV exportieren.
Es nutzt den `Modal`-Baustein mit `variant="category"`; `onClose` ist mit
`useCallback` stabilisiert, das Popup wird nur gemountet, wenn es offen ist.

So bleibt die Kopfzeile bei Navigation, Wochensumme und Differenz — die drei
Dinge, die man beim Buchen tatsächlich im Blick hat.

## Layout

```
 [ Liste | Brett | Zeit ]

 [◀] 31.08.–04.09.2026 [▶] [Diese Woche] [⚙]      Woche 35:15   -4:45

 Pinsel:  ( Alpha )  ( Daily )  ( Support )

         MO 31.08.   DI 01.09.   MI 02.09.   DO 03.09.   FR 04.09.
       00 15 30 45  00 15 30 45  00 15 30 45  00 15 30 45  00 15 30 45
   06  │  │  │  │  │  │  │  │  │ …
   09  ███████████  ███████████  ██████░░░░░ …
   ...
   22  │  │  │  │  │ …
        7:30         8:15         8:30         6:00         5:00

 BLÖCKE DER WOCHE
   MO 31.08.  7:30
     09:00–09:15  Daily  0:15  [Notiz …]  [⌫]
     09:15–12:30  Alpha  3:15  [Notiz …]  [⌫]
   DI 01.09.  8:15
     …

 Alpha 20:00   Support 9:15   Daily 1:00              = 35:15

 ── Popup „Zeiterfassung" ───────────────────
   Soll je Arbeitstag        [−] 8:00 [+]
   Soll der Woche 40:00 — fünf Arbeitstage.
   Wochenende anzeigen             ( Aus )
   Woche exportieren               [⤓ CSV]
```

Das Raster trägt einen Rahmen und `--shadow-md`. Innerhalb tragen die Zellen nur
`1px solid var(--ink-line)` als Rasterlinie, die erste Zelle eines Tages
`--border-thin` als kräftige Tagesgrenze. Die Kategoriefarbe kommt als Inline-Style
aus den Daten (wie `category_color`). Leere Zelle `--surface`, Hover `--highlight`.
Kein Schatten pro Zelle — 340 Offset-Schatten wären Rauschen.

Der Kopf des heutigen Tages liegt auf `--highlight`. Die Fußzeile zeigt je Tag die
Summe, die Kopfzeile die Wochensumme.

Die Spaltenzahl folgt den angezeigten Tagen: `.time-grid` trägt `days-5` oder
`days-7`, dazu passen zwei feste `grid-template-columns` (20 bzw. 28 Spalten).
`repeat()` nimmt kein `calc()`, darum zwei Varianten statt einer Variable — ohne
das brechen die Zellen des Wochenendes in eigene Rasterzeilen um.

Wochenendspalten liegen auf `--surface-muted` und ihr Kopf auf `--ink-soft`: sie
sind bebuchbar, zählen aber nicht zum Soll.

Die Blockliste unter dem Raster ist nach Tag gruppiert und zeigt nur Tage mit
Buchungen. Notizen werden ausschließlich dort bearbeitet, nie im Raster.

Leerzustand ohne Kategorien: Hinweisfläche mit `--border-muted` und ein Knopf, der
den bestehenden Kategorien-Dialog öffnet. Ohne Kategorie lässt sich nicht malen.

## Dateien

`App.tsx` hat 34 KB, die View kommt nicht dazu.

- `src/timeSlots.ts` — reine Logik ohne React: `slotToLabel`, `applyPaint`,
  `buildBlocks`, `setBlockNote`, `sumByCategory`, `formatDuration`, Datums- und
  Wochenhilfen (`startOfWeek`, `weekDays`, `formatDayLabel`, `formatWeekLabel`).
- `src/timeDb.ts` — Persistenz in der API-Form von `db.ts`; `saveDay` schreibt den
  Tagesstand am Ende eines Zuges in einem Stück, `getSettings`/`saveSettings`
  halten Sollzeit und Wochenend-Schalter.
- `src/timeCsv.ts` — reiner CSV-Bau: `buildCsv`, `csvFileName`.
- `src/TimeTrackingView.tsx` — die View, Props `{ categories, onManageCategories }`.
- `src/App.tsx` — `viewMode` auf `"list" | "kanban" | "time"` erweitern,
  Segment-Leiste statt Umschalter; in der Zeit-View rendert das
  „Was steht an?"-Formular nicht.
- `src/ui/icons.tsx` — neu `ClockViewIcon`, `ChevronRightIcon`, `MinusIcon`,
  `DownloadIcon` und `SlidersIcon` (Schieberegler statt Zahnrad: bei 14 px liest
  ein Zahnrad wie eine Sonne).
- `src/App.css` — neuer thematischer Abschnitt, nur Token.

## Tests

- `src/timeSlots.test.ts` — Slot zu Zeit, Blockbildung inklusive Teilen und
  Verschmelzen, Notiz-Vererbung, Summen, Dauerformat, Wochenhilfen.
- `src/TimeTrackingView.test.tsx` — Malen, Umschalten, Bereichszug samt
  Zurückziehen und Tagesgrenze, Notiz, Wochenwechsel, Summen; `timeDb` gemockt.
- `src/timeCsv.test.ts` — Kopfzeile, Zeile je Block, Feld-Einfassung, BOM.
- `e2e/timetracking.spec.ts` — Durchlauf über `aria-label` und die neuen Klassen,
  inklusive Sollzeit über einen Neuladevorgang, Wochenend-Schalter samt Prüfung
  gegen einen Grid-Umbruch und dem echten CSV-Download.

## Ausdrücklich nicht in Schritt 1

Monatsblick, Stoppuhr, Buchung auf einzelne Todos, Übertrag der Differenz von Woche
zu Woche, Feiertage und Urlaub im Soll, abweichendes Soll je Wochentag.
