import { Category, Priority, TimeKind, Todo, TodoStatus } from "./types";
import { DaySlot } from "./timeSlots";
import { TimeSettings } from "./timeTypes";

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
 */
export interface TodoFieldsPatch {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string | null;
  categoryId?: number | null;
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
   */
  addTodo(
    title: string,
    priority: Priority,
    dueDate: string | null,
    categoryId?: number | null,
    description?: string
  ): Promise<Todo>;
  /** Lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoDueDate(id: number, dueDate: string | null): Promise<Todo>;
  /** Lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  updateTodoPriority(id: number, priority: Priority): Promise<Todo>;
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
  /** Haelt `status` konsistent zu `done`; lehnt mit `Todo <id> not found` ab, wenn `id` kein bestehendes Todo referenziert — als Promise-Rejection, nie als synchroner throw. */
  toggleTodoDone(id: number, done: boolean): Promise<Todo>;
  /** Legt die Aufgabe in den Papierkorb (setzt `deleted_at`); eine unbekannte oder bereits abgelegte Id bleibt folgenlos. Endgueltig entfernt erst `purgeTodo`. */
  deleteTodo(id: number): Promise<number>;
  /**
   * Was im Papierkorb liegt, zuletzt Geloeschtes zuerst. `deleteTodo` legt
   * hier ab, `restoreTodo` holt zurueck, `purgeTodo` raeumt endgueltig weg.
   */
  listDeletedTodos(): Promise<Todo[]>;
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
   * `timeKind` wie bei `addCategory`: ohne Angabe "internal". Die Zeitart wird
   * also mitgeschrieben, nicht nur bei Angabe — wer nur die Farbe aendern will,
   * reicht die bestehende Zeitart mit herein, sonst faellt sie auf "internal".
   */
  updateCategory(id: number, name: string, color: string, timeKind?: TimeKind): Promise<Category>;
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
