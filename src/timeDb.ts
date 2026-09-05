// Persistenz der Zeiterfassung. Die Fachlogik (Bloecke, Notiz-Vererbung) liegt in
// timeSlots.ts; hier wird nur an den passenden Speicher weitergereicht. Die
// Vertraege der einzelnen Operationen stehen an der TimeStore-Schnittstelle in
// storeTypes.ts, nicht hier.

import { DaySlot } from "./timeSlots";
import { localTimeStore } from "./timeStoreLocal";
import { sqlTimeStore } from "./timeStoreSql";
import { isTauri } from "./sqlClient";
import { TimeStore } from "./storeTypes";
import { TimeSettings, DEFAULT_SETTINGS } from "./timeTypes";

export type { TimeSettings };
export { DEFAULT_SETTINGS };

function store(): TimeStore {
  return isTauri() ? sqlTimeStore : localTimeStore;
}

export function getSettings(): Promise<TimeSettings> {
  return store().getSettings();
}

export function saveSettings(settings: TimeSettings): Promise<TimeSettings> {
  return store().saveSettings(settings);
}

export function listSlots(date: string): Promise<DaySlot[]> {
  return store().listSlots(date);
}

export function saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]> {
  return store().saveDay(date, slots);
}

export function paintSlots(
  date: string,
  indices: number[],
  categoryId: number | null
): Promise<DaySlot[]> {
  return store().paintSlots(date, indices, categoryId);
}

export function setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]> {
  return store().setBlockNote(date, slot, note);
}

export function clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]> {
  return store().clearBlock(date, startSlot, endSlot);
}
