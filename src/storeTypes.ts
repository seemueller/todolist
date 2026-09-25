import { Category, TimeKind, Todo, TodoStatus, TodoType } from "./types";
import { DaySlot } from "./timeSlots";
import { TimeSettings, TimeSlotRecord } from "./timeTypes";

/**
 * Was `updateTodoFields` aendern soll. Ein fehlendes Feld bleibt unveraendert;
 * `dueDate: null` und `categoryId: null` leeren ausdruecklich. Die MCP-Grenze
 * macht das seit Issue #35 anders: dort leert `null` nichts mehr, dafuer gibt
 * es die Flags `clear_due_date`, `clear_category` und `clear_description`.
 * Diese Patch-API bleibt, wie sie ist -- sie ist intern, kein Modell fuellt
 * sie aus.
 */
/**
 * `description` kennt hier keine Längen- oder Zeichenbeschränkung — die
 * 4000-Zeichen-Grenze samt Verbot von `\r`, Tabulator und Nullbyte gilt nur an
 * der MCP-Werkzeuggrenze (`src-tauri/src/mcp/tools.rs`), nicht am Store.
 *
 * `type` fehlt hier aus demselben Grund wie jedes andere Feld: fehlend heisst
 * unveraendert. Ein Vorgabewert darf in dieser Struktur nicht auftauchen --
 * `updateCategory(id, name, color, timeKind = "internal")` hat genau so still
 * Werte zurueckgestuft (siehe AGENTS.md). Hier gibt es keine
 * Positionsparameter, also auch keine Vorgabe.
 */
export interface TodoFieldsPatch {
  title?: string;
  description?: string;
  type?: TodoType;
  dueDate?: string | null;
  categoryId?: number | null;
  /**
   * Ersetzt die Tags vollstaendig; `[]` leert, fehlend laesst sie stehen. Die
   * Stores bereinigen mit `normalizeTags` aus types.ts.
   *
   * Begruendete Abweichung vom "alles oder nichts" dieses Aufrufs: im
   * SQL-Store schreibt ein UPDATE ueber das Plugin die Spalten, danach der
   * Tauri-Command `set_todo_tags` die Tags -- tauri-plugin-sql kennt keine
   * Transaktion ueber mehrere Aufrufe (siehe AGENTS.md). Scheitert der zweite
   * Schritt, stehen die Spalten schon und der Fehler erreicht den Aufrufer;
   * das Detail-Fenster bleibt dann offen, und ein zweites Sichern schreibt
   * dieselben Werte noch einmal -- beide Schritte sind idempotent.
   */
  tags?: string[];
}

/**
 * Everything db.ts needs from a storage backend. Every implementation must keep
 * these contracts, since the views rely on them regardless of which backend is
 * active.
 */
export interface TodoStore {
  /** Alle Todos, neueste zuerst (nach created_at, bei Gleichstand nach id); optional auf eine Kategorie gefiltert. */
  listTodos(categoryId?: number | null): Promise<Todo[]>;
  /**
   * Legt ein neues Todo im Status "todo" an; category_name/category_color
   * werden aus der Kategorie denormalisiert. `description` ist frei
   * formulierter Text; ohne Angabe bleibt sie leer (`""`, nie null).
   * Ohne Angabe ist der Typ "task" -- wie bei `addCategory` und der Zeitart
   * ist die Vorgabe hier unkritisch, und der MCP-Pfad verlaesst sich darauf.
   */
  addTodo(
    title: string,
    dueDate: string | null,
    categoryId?: number | null,
    description?: string,
    type?: TodoType
  ): Promise<Todo>;
  /** Lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo>;
  /** Aktualisiert category_id und denormalisiert category_name/category_color neu; lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoCategory(id: number, categoryId: number | null): Promise<Todo>;
  /**
   * Aendert mehrere Felder in einem Schreibvorgang -- der Gegenpart zum
   * Sichern-Knopf des Detail-Fensters: entweder steht der ganze Stand in der
   * Datenbank oder nichts davon.
   *
   * Ein leerer Patch schreibt nicht und gibt die Aufgabe unveraendert zurueck.
   * Wird `categoryId` gesetzt, werden category_name/category_color neu
   * denormalisiert. Lehnt mit `Todo <id> not found` ab, wenn `id` kein
   * bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner
   * throw.
   */
  updateTodoFields(id: number, patch: TodoFieldsPatch): Promise<Todo>;
  /** Haelt `done` konsistent zu `status` ("done" <=> done === true); lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoStatus(id: number, status: TodoStatus): Promise<Todo>;
  /**
   * Setzt nur den Platz der Karte in ihrer Brett-Spalte. Kleiner Wert heisst
   * weiter oben; den Wert selbst rechnet `computeBoardOrder` in types.ts aus.
   * Lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo
   * referenziert — als Promise-Rejection, nie als synchroner throw.
   */
  updateTodoBoardOrder(id: number, order: number): Promise<Todo>;
  /**
   * Setzt Status und Platz in einem Schreibvorgang -- was ein Zug in eine
   * andere Spalte des Bretts ist. Kein Wrapper um `updateTodoStatus`: zwei
   * getrennte Schreibvorgaenge liessen die Karte sichtbar an der falschen
   * Stelle aufblitzen, und ein Fehler dazwischen liesse sie halb verschoben
   * zurueck. Haelt `done` konsistent zu `status` ("done" <=> done === true);
   * lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo
   * referenziert — als Promise-Rejection, nie als synchroner throw.
   */
  updateTodoStatusAndOrder(id: number, status: TodoStatus, order: number): Promise<Todo>;
  /** Haelt `status` konsistent zu `done`; lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  toggleTodoDone(id: number, done: boolean): Promise<Todo>;
  /** Legt die Aufgabe in den Papierkorb (setzt `deleted_at`); eine unbekannte oder bereits abgelegte Id bleibt folgenlos. Endgueltig entfernt erst `purgeTodo`. */
  deleteTodo(id: number): Promise<number>;
  /**
   * Was im Papierkorb liegt, zuletzt Geloeschtes zuerst. `deleteTodo` legt
   * hier ab, `restoreTodo` holt zurueck, `purgeTodo` raeumt endgueltig weg.
   */
  listDeletedTodos(): Promise<Todo[]>;
  /**
   * Alle Tags, die irgendeine Aufgabe traegt -- auch eine im Papierkorb, damit
   * ein Tag nicht aus den Vorschlaegen faellt, nur weil seine letzte Aufgabe
   * gerade dort liegt. Ohne Dubletten, sortiert wie Kategorien. Endgueltig
   * geloeschte Aufgaben tragen nichts mehr bei.
   */
  listTags(): Promise<string[]>;
  /** Holt eine Aufgabe aus dem Papierkorb zurueck; lehnt mit `Todo <id> not found` ab, wenn `id` nicht im Papierkorb liegt — als Promise-Rejection, nie als synchroner throw. */
  restoreTodo(id: number): Promise<Todo>;
  /**
   * Entfernt eine Aufgabe unwiederbringlich, aber nur, wenn sie im Papierkorb
   * liegt; gibt die Id zurueck. Eine lebende oder unbekannte Id bleibt wie bei
   * `deleteTodo` folgenlos -- anders als `restoreTodo` lehnt das hier nicht ab,
   * weil das Fehlen eines zu entfernenden Datensatzes harmlos ist, waehrend ein
   * Wiederherstellen-Aufruf ins Leere auf eine verwirrte Aufruferin hindeutet.
   */
  purgeTodo(id: number): Promise<number>;
  /**
   * Entfernt unwiederbringlich alles, was vor `cutoff` (ISO-Zeitstempel) in den
   * Papierkorb gelegt wurde, und gibt die Anzahl zurueck. Der Stichtag kommt
   * vom Aufrufer -- der Store kennt keine Uhr, damit seine Tests keine brauchen.
   *
   * Der Vergleich ist ein reiner Textvergleich (`deleted_at < cutoff`); er
   * traegt nur, weil jedes Backend `deleted_at` in derselben ISO-Form
   * schreibt (`YYYY-MM-DDTHH:MM:SS.sssZ`) -- der localStorage-Store ueber
   * `toISOString()`, die SQL-Stores ueber `strftime('%Y-%m-%dT%H:%M:%fZ','now')`.
   * Weicht ein Backend davon ab, rechnet die Frist falsch, ohne dass ein
   * Compiler oder Test das meldet.
   */
  purgeDeletedBefore(cutoff: string): Promise<number>;
  /**
   * Alle Kategorien, sortiert mit `compareCategoryNames` aus `types.ts` (nicht
   * nach einer DB-Kollation) — das ist der Vertrag, jedes Backend muss
   * dieselbe Reihenfolge liefern. Ein blosses `name.localeCompare(...)`
   * reicht dafuer nicht: WebKitGTK (Desktop/Tauri) gewichtet Gross-/
   * Kleinschreibung auf der primaeren Kollationsstufe und sortiert deshalb
   * jeden grossgeschriebenen Namen vor jedem kleingeschriebenen, waehrend
   * Node/Chromium das erst auf der tertiaeren Stufe tun — `compareCategoryNames`
   * vergleicht zuerst die kleingeschriebenen Namen, um diese Engine-Differenz
   * zu vermeiden.
   */
  listCategories(): Promise<Category[]>;
  /**
   * Legt eine neue Kategorie an; `name` wird getrimmt. Lehnt ab, wenn bereits
   * eine Kategorie mit demselben `categoryNameKey` (getrimmt, `de`-lowercase,
   * Unicode-aware — dieselbe Normalisierung wie beim Sortieren) existiert, mit
   * der Meldung `Es gibt bereits eine Kategorie "<vorhandener Name>".` — als
   * Promise-Rejection, nie als synchroner throw. Das ist bewusst strenger als
   * SQLites `UNIQUE COLLATE NOCASE`, das nur ASCII case-faltet.
   *
   * `timeKind` entscheidet, ob gebuchte Zeit dieser Kategorie als Arbeitszeit
   * gegen das Soll zaehlt und wie sie gebucht wird; ohne Angabe "internal".
   * Der Parameter ist optional, damit Aufrufer, die die Zeitart nichts angeht
   * (der MCP-Pfad legt bewusst keine mit an), unveraendert bleiben und den
   * Vorgabewert bekommen -- denselben, den auch die Spalte in SQLite setzt.
   */
  addCategory(name: string, color: string, timeKind?: TimeKind): Promise<Category>;
  /**
   * Aktualisiert Name (getrimmt) und Farbe und denormalisiert beides auf alle
   * referenzierenden Todos; lehnt mit `Category <id> not found` ab, wenn `id`
   * keine bestehende Kategorie referenziert. Lehnt ausserdem wie `addCategory`
   * ab, wenn der neue Name mit einer *anderen* Kategorie kollidiert (dieselbe
   * Kategorie darf ihren eigenen Namen in anderer Gross-/Kleinschreibung
   * behalten) — beides als Promise-Rejection, nie als synchroner throw.
   *
   * `timeKind` ist hier **Pflicht**, anders als bei `addCategory`: die Zeitart
   * wird immer mitgeschrieben, ein Vorgabewert wuerde also beim blossen
   * Umbenennen die bestehende Einstufung still auf "internal" zuruecksetzen.
   * Wer nur Name oder Farbe aendert, reicht die vorhandene Zeitart mit herein;
   * der Compiler erinnert daran.
   */
  updateCategory(id: number, name: string, color: string, timeKind: TimeKind): Promise<Category>;
  /**
   * Loescht die Kategorie; Todos, die sie referenzierten, verlieren sie
   * (category_id/category_name/category_color werden null), werden aber nicht
   * geloescht. Zeitbuchungen bleiben unangetastet: sie behalten ihre jetzt ins
   * Leere zeigende `category_id` und werden weder geloescht noch geleert. Die
   * Wochenansicht rechnet damit und beschriftet sie mit "Geloeschte Kategorie";
   * eine Buchung ohne Kategorie ist im Datenmodell gar nicht darstellbar, weil
   * `applyPaint` in timeSlots.ts `category_id === null` als "Slot leeren" liest.
   */
  deleteCategory(id: number): Promise<number>;
}

/** Everything timeDb.ts needs from a storage backend. */
export interface TimeStore {
  /** Einstellungen lesen; fehlende oder kaputte Werte fallen auf die Vorgabe zurueck. */
  getSettings(): Promise<TimeSettings>;
  /** Einstellungen schreiben und die tatsaechlich gespeicherten Werte zurueckgeben. */
  saveSettings(settings: TimeSettings): Promise<TimeSettings>;
  /** Alle Buchungen eines Tages, nach Slot sortiert. */
  listSlots(date: string): Promise<DaySlot[]>;
  /**
   * Alle Buchungen eines Zeitraums, nach Datum und darin nach Slot sortiert.
   * Beide Grenztage zaehlen mit (`from <= date <= to`), ein `from` hinter `to`
   * liefert nichts. Anders als `listSlots` traegt jeder Datensatz sein Datum
   * mit -- die Auswertung summiert ueber Tage hinweg und muss sie auseinander
   * halten koennen. Gedacht fuer Wochen- und Monatsauswertungen, damit ein
   * Monat eine Abfrage kostet und nicht einunddreissig.
   */
  listRange(from: string, to: string): Promise<TimeSlotRecord[]>;
  /**
   * Schreibt den kompletten Tagesstand. Die View nutzt das am Ende eines Zuges:
   * waehrend gezogen wird, rechnet sie die Vorschau selbst, gespeichert wird einmal.
   */
  saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]>;
  /**
   * Malt oder leert Slots eines Tages und gibt den neuen Tagesstand zurueck.
   * `categoryId` null leert die Slots.
   */
  paintSlots(date: string, indices: number[], categoryId: number | null): Promise<DaySlot[]>;
  /** Setzt die Notiz des Blocks, in dem `slot` liegt. */
  setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]>;
  /** Loescht einen ganzen Block. */
  clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]>;
}
