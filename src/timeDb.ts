// Persistenz der Zeiterfassung. Die Fachlogik (Bloecke, Notiz-Vererbung) liegt in
// timeSlots.ts; hier wird nur an den passenden Speicher weitergereicht.

import { DaySlot } from "./timeSlots";
import { localTimeStore } from "./timeStoreLocal";
import { TimeStore } from "./storeTypes";

/** Einstellungen der Zeiterfassung. */
export interface TimeSettings {
  /** Sollzeit je regulaerem Arbeitstag, in Viertelstunden. 32 = 8:00. */
  targetSlotsPerDay: number;
  /** Samstag und Sonntag mit anzeigen. */
  showWeekend: boolean;
}

/** Acht Stunden am Tag, Wochenende aus. */
export const DEFAULT_SETTINGS: TimeSettings = {
  targetSlotsPerDay: 32,
  showWeekend: false,
};

/** Eine gebuchte Viertelstunde, wie sie im Speicher liegt. */
export interface TimeSlotRecord extends DaySlot {
  date: string;
}

function store(): TimeStore {
  return localTimeStore;
}

/** Einstellungen lesen; fehlende oder kaputte Werte fallen auf die Vorgabe zurueck. */
export function getSettings(): Promise<TimeSettings> {
  return store().getSettings();
}

/** Einstellungen schreiben und die tatsaechlich gespeicherten Werte zurueckgeben. */
export function saveSettings(settings: TimeSettings): Promise<TimeSettings> {
  return store().saveSettings(settings);
}

/** Alle Buchungen eines Tages, nach Slot sortiert. */
export function listSlots(date: string): Promise<DaySlot[]> {
  return store().listSlots(date);
}

/**
 * Schreibt den kompletten Tagesstand. Die View nutzt das am Ende eines Zuges:
 * waehrend gezogen wird, rechnet sie die Vorschau selbst, gespeichert wird einmal.
 */
export function saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]> {
  return store().saveDay(date, slots);
}

/**
 * Malt oder leert Slots eines Tages und gibt den neuen Tagesstand zurueck.
 * `categoryId` null leert die Slots.
 */
export function paintSlots(
  date: string,
  indices: number[],
  categoryId: number | null
): Promise<DaySlot[]> {
  return store().paintSlots(date, indices, categoryId);
}

/** Setzt die Notiz des Blocks, in dem `slot` liegt. */
export function setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]> {
  return store().setBlockNote(date, slot, note);
}

/** Loescht einen ganzen Block. */
export function clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]> {
  return store().clearBlock(date, startSlot, endSlot);
}
