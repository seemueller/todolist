// SQLite-Variante der Zeit-Persistenz. Gleiche Semantik wie timeStoreLocal.ts:
// ein Tag wird immer komplett ersetzt, die Fachlogik bleibt in timeSlots.ts.

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

async function saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM time_slots WHERE date = $1", [date]);
    for (const slot of slots) {
      await db.execute(
        "INSERT INTO time_slots (date, slot, category_id, note) VALUES ($1, $2, $3, $4)",
        [date, slot.slot, slot.category_id, slot.note ?? ""]
      );
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
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
