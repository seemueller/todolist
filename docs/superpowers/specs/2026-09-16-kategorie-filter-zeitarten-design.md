# Kategorie-Filter im Brett, Offen-Voreinstellung in der Liste, Zeitarten an der Kategorie

Stand: 2026-09-16. Anlass: drei kleine Wünsche aus der täglichen Nutzung, die
alle drei Ansichten betreffen und sich ein gemeinsames Thema teilen — die
Kategorie trägt mehr Bedeutung, als die Oberfläche heute nutzt.

## Problem

**Brett.** Die Kanban-Ansicht zeigt immer alle Aufgaben. Der Kategorie-Filter
sitzt in der Filterleiste, und die ist an `viewMode === "list"` gebunden
(`src/App.tsx:619`). Wer im Brett nur einen Kunden sehen will, hat kein Mittel
dazu.

**Liste.** `statusFilter` startet auf `"all"` (`src/App.tsx:170`). Nach jedem
App-Start steht der erledigte Altbestand wieder zwischen den offenen Aufgaben,
und der erste Griff ist jedes Mal derselbe Klick auf *Offen*.

**Zeit.** Die Zeiterfassung summiert jede gebuchte Viertelstunde gegen das Soll
(`src/TimeTrackingView.tsx:210`, `weekTotal`). Für die Kategorie gibt es nur
Name und Farbe (`src/types.ts`, `Category`). Damit ist eine Mittagspause so viel
Arbeitszeit wie ein Kundentermin, und ob eine Buchung intern oder extern
abzurechnen ist, steht nirgends — weder in der Ansicht noch im CSV-Export.

## Lösung

Die Kategorie bekommt ein Feld `time_kind` mit drei Werten. Darauf setzen die
Zeitansicht und der Export auf. Brett und Liste bekommen je eine kleine,
eigenständige Änderung an ihrem Filterverhalten.

### Datenmodell: `time_kind`

```sql
-- Migration 12
ALTER TABLE categories ADD COLUMN time_kind TEXT NOT NULL DEFAULT 'internal';
```

Ein Feld, drei Werte — nicht zwei Felder (`is_work_time` + `billing`), weil ein
zweites Feld die Kombination „keine Arbeitszeit, extern abgerechnet" zulässt,
die nichts bedeutet. Drei Werte kennen diesen Zustand gar nicht:

| Wert | Bedeutung |
|------|-----------|
| `none` | keine Arbeitszeit (Pause, Privat, Arzt) |
| `internal` | Arbeitszeit, intern gebucht |
| `external` | Arbeitszeit, extern gebucht (Kunde) |

`internal` ist der Vorgabewert der Migration: die weitaus meisten bestehenden
Kategorien sind Arbeitszeit, und wer eine Kategorie falsch eingestuft findet,
korrigiert sie einmal im Kategorien-Fenster. Bewusst kein Rateversuch anhand des
Namens — eine Migration, die „Pause" erkennt und „Mittag" nicht, ist
unzuverlässiger als eine, die nichts verspricht.

Betroffene Stellen:

- `src/types.ts` — `export type TimeKind = "none" | "internal" | "external"`,
  Feld `time_kind: TimeKind` in `Category`, `time_kind?: TimeKind` in
  `CategoryRow` (optional, weil der localStorage-Speicher Einträge aus der Zeit
  davor liefert). `fromCategoryRow` setzt den Fallback `"internal"` — dieselbe
  Rolle, die `description` und `status` in `fromRow` schon spielen.
- `src/storeTypes.ts` — `addCategory(name, color, timeKind)` und
  `updateCategory(id, name, color, timeKind)`.
- `src/todoStoreSql.ts`, `src/todoStoreLocal.ts` — beide Signaturen umgesetzt,
  `listCategories` liest die Spalte mit.
- `src-tauri/src/mcp/store.rs` — Feld im Category-Struct; dadurch erscheint es
  in `list_categories` der MCP-Schnittstelle, ohne dass `tools.rs` etwas tut.
  Das MCP-Anlegen einer Kategorie setzt weiterhin den Vorgabewert; es gibt
  keinen MCP-Parameter dafür.
- `src-tauri/src/lib.rs` — Migration 12. `src/migrations.test.ts` bewacht die
  Liste und bekommt den Eintrag mit.

### Kategorien-Fenster

Im Modal (`src/App.tsx:1052`) bekommt jede Zeile ein Segment-Control mit drei
Schaltern **Keine · Intern · Extern**, gebaut aus dem vorhandenen
`FilterChip variant="segment"` — dasselbe Muster wie der Status-Filter der
Liste. Das Anlege-Formular bekommt dasselbe Control mit `internal` vorbelegt.

### Brett: Kategorie-Chips

Neuer State in `App.tsx`:

```ts
const [boardCategories, setBoardCategories] = useState<Set<number | null>>(new Set());
```

Leere Menge heißt „alles zeigen" — kein Sonderwert, kein `null`-für-alle.

Über dem Brett, nur bei `viewMode === "kanban"`, eine Chip-Reihe: *Alle*
(aktiv, solange die Menge leer ist; Klick leert sie), dann eine je Kategorie in
ihrer Farbe, dann *Ohne Kategorie* für `category_id === null`. Klick schaltet
den einzelnen Eintrag um. Wiederverwendet wird `FilterChip`; die Farbe kommt wie
in `CategoryBadge`.

Gefiltert wird beim Befüllen der Lanes (`src/App.tsx:432`), nicht in der
Datenbank: die Todos liegen ohnehin vollständig im State, und ein Reload je
Chip-Klick wäre spürbar träger als ein `filter` über ein paar hundert Einträge.

Der State ist vom Listen-Filter getrennt. Ein Wechsel der Ansicht soll nicht
stillschweigend die Sicht der anderen verstellen, und die beiden Filter haben
unterschiedliche Form (Menge gegen Einzelwert).

### Liste: Voreinstellung „Offen", gemerkt

`statusFilter` startet auf `"open"` und wird bei jeder Änderung nach
`localStorage` geschrieben (Schlüssel `todolist.statusFilter`), beim Start von
dort gelesen. Unbekannte oder fehlende Werte fallen auf `"open"` zurück.

Bewusst `localStorage` und nicht die Tabelle `app_settings`: es ist eine
Oberflächen-Vorliebe, kein Domänendatum. Über `app_settings` müsste das
Store-Interface in beiden Backends wachsen und das Lesen asynchron werden,
womit die Liste beim Start kurz im falschen Filter stünde. `localStorage` ist in
beiden Umgebungen da — Browser wie Tauri-Build — und synchron.

„Zurücksetzen" (`src/App.tsx`, `clear-filters`) setzt `statusFilter` auf
`"open"`, nicht auf `"all"`. Sonst wäre das Zurücksetzen ein Aufblenden, also
das Gegenteil dessen, was der Knopf verspricht. `hasActiveFilter` zählt
`statusFilter` entsprechend erst ab einer Abweichung von `"open"` als aktiv.

### Zeitansicht und Export

In `src/timeSlots.ts` neu:

```ts
export function splitByWorkTime(
  sums: CategorySum[],
  kindOf: (categoryId: number) => TimeKind
): { work: CategorySum[]; nonWork: CategorySum[] };
```

Eine reine Funktion neben `sumByCategory`, ohne Zugriff auf Speicher oder DOM —
wie der Rest der Datei. Kategorien, die es nicht mehr gibt, liefert `kindOf` als
`"internal"`; eine gelöschte Kategorie verliert so keine bereits gebuchte
Arbeitszeit aus der Summe.

In `src/TimeTrackingView.tsx`:

- Die Wochensumme und die Summe je Tagesspalte zählen nur `internal` und
  `external`, weisen also Arbeitszeit aus. Die Soll-Rechnung (`weekTarget`,
  `formatSignedDuration`) bleibt unverändert, bekommt aber die
  Arbeitszeit-Summe statt `totalSlots`.
- Nicht-Arbeitszeit steht daneben als eigener Ausweis, etwa
  `+ 2:00 keine Arbeitszeit`, und fließt nie in den Soll-Vergleich.
- Die Summenliste je Kategorie (`time-sums`) bleibt flach und ungruppiert, die
  Pinsel bleiben ohne Kürzel. Beides bewusst: die Farbe trägt die Zuordnung
  schon, und drei Zwischenüberschriften für meist zwei bis vier Kategorien
  kosten mehr Platz, als sie erklären.

In `src/timeCsv.ts`:

- `CSV_HEADER` bekommt **Art** nach *Kategorie*.
- `blockRow` und `buildCsv` bekommen neben `categoryName` eine
  `kindOf(categoryId)`-Funktion; geschrieben wird `intern`, `extern` oder
  `keine` — deutsche Werte, weil die Datei für Excel in deutscher Einstellung
  gebaut ist (Semikolon, BOM).

## Was nicht dazugehört

- Keine Zeitart je Buchung. Sie hängt an der Kategorie, sonst nirgends.
- Kein MCP-Parameter für `time_kind` beim Anlegen einer Kategorie.
- Keine Auswertung über Wochen hinweg, keine Monatssumme intern/extern.
- Kein Umbau der Filterleiste in eine für alle Ansichten gemeinsame.

## Tests

- `src/types.test.ts` — `fromCategoryRow` setzt `"internal"`, wenn `time_kind`
  fehlt; übernimmt es sonst.
- `src/timeSlots.test.ts` — `splitByWorkTime` trennt richtig; unbekannte
  Kategorie zählt als Arbeitszeit.
- `src/timeCsv.test.ts` — Kopfzeile und Spaltenwert je Zeitart.
- `src/todoStoreSql.test.ts`, `src/todoStoreLocal.test.ts` — `addCategory` und
  `updateCategory` schreiben und lesen `time_kind`.
- `src/migrations.test.ts` — Migration 12 in der Liste.
- `src/App.test.tsx` — Brett-Chips filtern die Lanes, *Ohne Kategorie*
  eingeschlossen; Liste startet auf *Offen*; „Zurücksetzen" landet auf *Offen*;
  gespeicherter Wert wird beim Start gelesen.
- `src/TimeTrackingView.test.tsx` — Soll-Vergleich ignoriert `none`, weist die
  Nicht-Arbeitszeit separat aus.
- `e2e/timetracking.spec.ts` — eine Kategorie auf *Keine* stellen, buchen, den
  Soll-Vergleich prüfen.
