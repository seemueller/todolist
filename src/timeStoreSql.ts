// SQLite-Variante der Zeit-Persistenz. Gleiche Semantik wie timeStoreLocal.ts:
// ein Tag wird immer komplett ersetzt, die Fachlogik bleibt in timeSlots.ts.

import { invoke } from "@tauri-apps/api/core";
import { DaySlot, applyPaint, clampTarget, setBlockNote as setNoteOnBlock } from "./timeSlots";
import { TimeSettings, DEFAULT_SETTINGS } from "./timeTypes";
import { TimeStore } from "./storeTypes";
import { getDb } from "./sqlClient";

interface SettingsRow {
  target_slots_per_day: number;
  show_weekend: number;
}

interface SlotRow {
  slot: number;
  category_id: number;
  note: string;
}

async function getSettings(): Promise<TimeSettings> {
  const db = await getDb();
  const rows = await db.select<SettingsRow[]>(
    "SELECT target_slots_per_day, show_weekend FROM time_settings WHERE id = 1"
  );
  if (rows.length === 0) return DEFAULT_SETTINGS;
  return {
    targetSlotsPerDay: clampTarget(Number(rows[0].target_slots_per_day)),
    showWeekend: rows[0].show_weekend === 1,
  };
}

async function saveSettings(settings: TimeSettings): Promise<TimeSettings> {
  const stored: TimeSettings = {
    targetSlotsPerDay: clampTarget(settings.targetSlotsPerDay),
    showWeekend: settings.showWeekend === true,
  };
  const db = await getDb();
  await db.execute(
    `INSERT INTO time_settings (id, target_slots_per_day, show_weekend)
     VALUES (1, $1, $2)
     ON CONFLICT(id) DO UPDATE SET target_slots_per_day = $1, show_weekend = $2`,
    [stored.targetSlotsPerDay, stored.showWeekend ? 1 : 0]
  );
  return stored;
}

async function listSlots(date: string): Promise<DaySlot[]> {
  const db = await getDb();
  const rows = await db.select<SlotRow[]>(
    "SELECT slot, category_id, note FROM time_slots WHERE date = $1 ORDER BY slot ASC",
    [date]
  );
  return rows.map((row) => ({ slot: row.slot, category_id: row.category_id, note: row.note }));
}

// Ersetzt den Tag ueber den Rust-Command replace_time_day statt ueber db.execute():
// db.execute() zieht je Aufruf eine beliebige Verbindung aus dem Pool des SQL-
// Plugins, darum haelt ein BEGIN/COMMIT ueber mehrere execute()-Aufrufe hinweg
// keine echte Transaktion zusammen. Der Rust-Command haelt eine Verbindung fest
// und fuehrt DELETE + INSERTs in einer einzigen sqlx-Transaktion aus.
async function saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]> {
  await invoke("replace_time_day", {
    date,
    slots: slots.map((s) => ({ slot: s.slot, category_id: s.category_id, note: s.note ?? "" })),
  });
  return slots;
}

async function paintSlots(
  date: string,
  indices: number[],
  categoryId: number | null
): Promise<DaySlot[]> {
  const current = await listSlots(date);
  return saveDay(date, applyPaint(current, indices, categoryId));
}

async function setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]> {
  const current = await listSlots(date);
  return saveDay(date, setNoteOnBlock(current, slot, note));
}

function clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]> {
  const indices: number[] = [];
  for (let slot = startSlot; slot < endSlot; slot++) indices.push(slot);
  return paintSlots(date, indices, null);
}

export const sqlTimeStore: TimeStore = {
  getSettings,
  saveSettings,
  listSlots,
  saveDay,
  paintSlots,
  setBlockNote,
  clearBlock,
};
