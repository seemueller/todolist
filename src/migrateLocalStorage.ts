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

function readArray(key: string): any[] {
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
  const seenByLowerName = new Map<string, any>();
  for (const category of categories) {
    if (typeof category?.id !== "number" || typeof category?.name !== "string") continue;
    const key = category.name.trim().toLowerCase();
    if (!seenByLowerName.has(key)) seenByLowerName.set(key, category);
  }

  for (const category of seenByLowerName.values()) {
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
  const dbIdByLowerName = new Map<string, number>();
  for (const row of dbCategories) {
    dbIdByLowerName.set(row.name.trim().toLowerCase(), row.id);
  }

  const remappedId = new Map<number, number>();
  for (const category of categories) {
    if (typeof category?.id !== "number" || typeof category?.name !== "string") continue;
    const resolved = dbIdByLowerName.get(category.name.trim().toLowerCase());
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
    const targetSlotsPerDay = clampTarget(Number(settings?.targetSlotsPerDay));
    const showWeekend = settings?.showWeekend === true;
    await db.execute(
      "INSERT OR IGNORE INTO time_settings (id, target_slots_per_day, show_weekend) VALUES (1, $1, $2)",
      [targetSlotsPerDay, showWeekend]
    );
  }

  localStorage.setItem(MIGRATED_FLAG, "1");
}
