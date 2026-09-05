// Einmaliger Umzug der Altdaten aus localStorage nach SQLite. Laeuft beim ersten
// Start nach dem Update, danach sperrt das Flag. Die alten Keys bleiben liegen:
// sie kosten nichts und sind das Netz, falls hier etwas schiefgeht.
//
// Kein echter Transaktionsrahmen: tauri-plugin-sql fuehrt jedes execute() gegen
// einen Connection-Pool aus (siehe wrapper.rs, pool.execute pro Aufruf), ein
// separates BEGIN/COMMIT laeuft also nicht garantiert auf derselben Verbindung
// und bindet nichts. Stattdessen sind alle Inserts idempotent (INSERT OR
// IGNORE): bricht der Umzug mittendrin ab, bleibt das Flag ungesetzt, und der
// naechste Start wiederholt die Arbeit gefahrlos -- bereits vorhandene Zeilen
// werden uebersprungen statt einen Constraint-Fehler zu werfen oder eine
// inzwischen neuere Zeile mit dem alten localStorage-Stand zu ueberschreiben.

import { getDb, isTauri } from "./sqlClient";
import { clampTarget } from "./timeSlots";
import { categoryNameKey } from "./types";

export const MIGRATED_FLAG = "todolist_migrated_to_sqlite";

const TODOS_KEY = "todolist_todos";
const CATEGORIES_KEY = "todolist_categories";
const SLOTS_KEY = "todolist_timeslots";
const SETTINGS_KEY = "todolist_time_settings";

/** Liest einen Key; kaputtes JSON wird zu null, nicht zu einem Absturz. */
function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readArray(key: string): Record<string, unknown>[] {
  const value = readKey(key);
  return Array.isArray(value) ? value : [];
}

export async function migrateLocalStorage(): Promise<void> {
  if (!isTauri()) return;
  if (localStorage.getItem(MIGRATED_FLAG) === "1") return;

  const categories = readArray(CATEGORIES_KEY);
  const todos = readArray(TODOS_KEY);
  const slots = readArray(SLOTS_KEY);
  const settings = readKey(SETTINGS_KEY) as
    | { targetSlotsPerDay?: unknown; showWeekend?: unknown }
    | null;

  // Frische Installation ohne Altdaten: kein getDb() und kein SELECT noetig.
  // Ohne diesen Ausstieg wuerde ein Fehler beim Verbindungsaufbau -- z.B. weil
  // die DB in diesem Moment noch nicht bereit ist -- als Migrationsfehler
  // gemeldet, obwohl es nichts zu migrieren gab, und das bei jedem einzelnen
  // Start neu, weil ohne Erfolg auch das Flag nie gesetzt wird.
  if (categories.length === 0 && todos.length === 0 && slots.length === 0 && settings === null) {
    localStorage.setItem(MIGRATED_FLAG, "1");
    return;
  }

  const db = await getDb();

  // ── Kategorien zuerst: Todos und Slots verweisen auf sie ────────────────
  //
  // localStorage kannte die UNIQUE COLLATE NOCASE-Regel aus Migration 2 nicht,
  // zwei Kategorien, die sich nur in Gross-/Kleinschreibung unterscheiden,
  // waeren also ein Constraint-Fehler. Dedupliziert wird deshalb zuerst lokal
  // (spaete Duplikate zeigen auf die erste ID), danach wird OR IGNORE benutzt,
  // damit ein zweiter Insert nicht abbricht -- weder bei einem Duplikat aus
  // localStorage noch bei einer Kategorie, die schon vor dem Umzug ganz normal
  // ueber die App angelegt wurde.
  const seenByNameKey = new Map<string, any>();
  for (const category of categories) {
    if (typeof category?.id !== "number" || typeof category?.name !== "string") continue;
    const key = categoryNameKey(category.name);
    if (!seenByNameKey.has(key)) seenByNameKey.set(key, category);
  }

  for (const category of seenByNameKey.values()) {
    await db.execute(
      "INSERT OR IGNORE INTO categories (id, name, color, created_at) VALUES ($1, $2, $3, $4)",
      [
        category.id,
        category.name,
        typeof category.color === "string" ? category.color : "#a78bfa",
        typeof category.created_at === "string" ? category.created_at : new Date().toISOString(),
      ]
    );
  }

  // Die eigentliche ID-Aufloesung geschieht erst jetzt, gegen die Datenbank,
  // nicht gegen die lokale Dedup-Map: eine Kategorie kann schon vor dem Umzug
  // existiert haben (mit einer ganz anderen ID als der localStorage-Zeitstempel),
  // dann hat der Insert oben nichts geschrieben. Nur ein Blick in die DB liefert
  // die ID, auf die Todos und Slots tatsaechlich zeigen duerfen.
  const dbCategories = await db.select<{ id: number; name: string }[]>(
    "SELECT id, name FROM categories"
  );
  const dbIds = new Set<number>();
  const dbIdByNameKey = new Map<string, number>();
  for (const row of dbCategories) {
    dbIds.add(row.id);
    dbIdByNameKey.set(categoryNameKey(row.name), row.id);
  }

  // Erst ueber die ID, dann ueber den Namen. Die ID zuerst, weil ein
  // abgebrochener erster Versuch die Kategorien schon geschrieben haben kann:
  // benennt die Nutzerin eine davon danach um, findet die Namenssuche beim
  // Retry nichts mehr, und jeder Slot dieser Kategorie fiele stillschweigend
  // unter den Tisch -- endgueltig, denn danach steht das Flag. Die
  // localStorage-IDs sind Zeitstempel, eine Verwechslung mit einer fremden
  // Zeile ist ausgeschlossen. Die Namenssuche bleibt fuer den anderen Fall:
  // die Kategorie existierte schon vor dem Umzug, unter einer eigenen ID.
  const remappedId = new Map<number, number>();
  for (const category of categories) {
    if (typeof category?.id !== "number" || typeof category?.name !== "string") continue;
    if (dbIds.has(category.id)) {
      remappedId.set(category.id, category.id);
      continue;
    }
    const resolved = dbIdByNameKey.get(categoryNameKey(category.name));
    if (resolved !== undefined) remappedId.set(category.id, resolved);
  }

  function resolveCategory(id: unknown): number | null {
    if (typeof id !== "number") return null;
    return remappedId.get(id) ?? null;
  }

  // ── Todos ────────────────────────────────────────────────────────────────
  for (const todo of todos) {
    if (typeof todo?.id !== "number" || typeof todo?.title !== "string") continue;
    const status =
      typeof todo.status === "string" ? todo.status : todo.done ? "done" : "todo";
    const priority = typeof todo.priority === "string" ? todo.priority : "medium";
    const createdAt = typeof todo.created_at === "string" ? todo.created_at : new Date().toISOString();
    const dueDate = typeof todo.due_date === "string" ? todo.due_date : null;
    const categoryId = todo.category_id == null ? null : resolveCategory(todo.category_id);

    await db.execute(
      `INSERT OR IGNORE INTO todos (id, title, done, status, priority, created_at, due_date, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [todo.id, todo.title, status === "done" ? 1 : 0, status, priority, createdAt, dueDate, categoryId]
    );
  }

  // ── Zeitslots und Einstellungen ─────────────────────────────────────────
  for (const slot of slots) {
    if (typeof slot?.date !== "string" || typeof slot?.slot !== "number") continue;
    const categoryId = resolveCategory(slot.category_id);
    if (categoryId === null) continue; // Kategorie existiert nicht (mehr) -> Slot ueberspringen.
    const note = typeof slot.note === "string" ? slot.note : "";

    await db.execute(
      "INSERT OR IGNORE INTO time_slots (date, slot, category_id, note) VALUES ($1, $2, $3, $4)",
      [slot.date, slot.slot, categoryId, note]
    );
  }

  // Nur schreiben, wenn der Key ueberhaupt existierte -- eine ganz leere
  // localStorage (frische Installation ohne Altdaten) soll keine Datenbank-
  // Aufrufe ausloesen.
  //
  // OR IGNORE statt Upsert: das Anlegen der Zeile ist einmalig, kein
  // fortlaufender Abgleich. Bricht die Migration nach diesem Schritt ab, und
  // aendert die Nutzerin vor dem naechsten Start ihr Tagesziel in der App,
  // ist die DB-Zeile neuer als die localStorage-Kopie -- ein Retry darf sie
  // dann nicht mit dem alten Stand ueberschreiben.
  if (settings !== null) {
    // Number(null) ist 0, nicht NaN -- ohne die explizite Pruefung wuerde ein
    // gespeichertes { targetSlotsPerDay: null } als Ziel 0 statt als der
    // Default aus clampTarget (32) migriert.
    const rawTarget = settings?.targetSlotsPerDay;
    const targetSlotsPerDay = clampTarget(rawTarget == null ? NaN : Number(rawTarget));
    const showWeekend = settings?.showWeekend === true;
    await db.execute(
      "INSERT OR IGNORE INTO time_settings (id, target_slots_per_day, show_weekend) VALUES (1, $1, $2)",
      // show_weekend als 0/1 gebunden, wie timeStoreSql.ts es beim regulaeren
      // Speichern tut -- zwei Schreibpfade fuer dieselbe Spalte sollen densel-
      // ben Werttyp binden, nicht nur einen, den sqlx zufaellig auch akzeptiert.
      [targetSlotsPerDay, showWeekend ? 1 : 0]
    );
  }

  localStorage.setItem(MIGRATED_FLAG, "1");
}
