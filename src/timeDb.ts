// Persistenz der Zeiterfassung. Gleiche Form wie db.ts: localStorage als Speicher,
// Promise-API nach aussen, damit die View spaeter ohne Aenderung auf SQL wechseln
// kann. Gespeichert wird eine flache Liste aller Tage; die Fachlogik (Bloecke,
// Notiz-Vererbung) liegt in timeSlots.ts und bleibt frei von Speicherdetails.

import { DaySlot, applyPaint, setBlockNote as setNoteOnBlock } from "./timeSlots";

const SLOTS_KEY = "todolist_timeslots";
const SETTINGS_KEY = "todolist_time_settings";

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

/** Soll je Tag zwischen 0:00 und 16:00; alles andere waere ein Tippfehler. */
const MAX_TARGET_SLOTS = 64;

function clampTarget(slots: number): number {
  if (!Number.isFinite(slots)) return DEFAULT_SETTINGS.targetSlotsPerDay;
  return Math.min(MAX_TARGET_SLOTS, Math.max(0, Math.round(slots)));
}

/** Eine gebuchte Viertelstunde, wie sie im Speicher liegt. */
export interface TimeSlotRecord extends DaySlot {
  date: string;
}

function loadAll(): TimeSlotRecord[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is TimeSlotRecord =>
        typeof entry?.date === "string" &&
        typeof entry?.slot === "number" &&
        typeof entry?.category_id === "number"
    ).map((entry) => ({ ...entry, note: typeof entry.note === "string" ? entry.note : "" }));
  } catch {
    return [];
  }
}

function saveAll(records: TimeSlotRecord[]): void {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(records));
}

function selectDay(records: TimeSlotRecord[], date: string): DaySlot[] {
  return records
    .filter((r) => r.date === date)
    .map(({ slot, category_id, note }) => ({ slot, category_id, note }))
    .sort((a, b) => a.slot - b.slot);
}

function replaceDay(date: string, slots: DaySlot[]): DaySlot[] {
  const others = loadAll().filter((r) => r.date !== date);
  const updated: TimeSlotRecord[] = slots.map((s) => ({ ...s, date }));
  saveAll([...others, ...updated]);
  return slots;
}

/** Einstellungen lesen; fehlende oder kaputte Werte fallen auf die Vorgabe zurueck. */
export function getSettings(): Promise<TimeSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return Promise.resolve(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return Promise.resolve({
      targetSlotsPerDay: clampTarget(Number(parsed?.targetSlotsPerDay)),
      showWeekend: parsed?.showWeekend === true,
    });
  } catch {
    return Promise.resolve(DEFAULT_SETTINGS);
  }
}

/** Einstellungen schreiben und die tatsaechlich gespeicherten Werte zurueckgeben. */
export function saveSettings(settings: TimeSettings): Promise<TimeSettings> {
  const stored: TimeSettings = {
    targetSlotsPerDay: clampTarget(settings.targetSlotsPerDay),
    showWeekend: settings.showWeekend === true,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
  return Promise.resolve(stored);
}

/** Alle Buchungen eines Tages, nach Slot sortiert. */
export function listSlots(date: string): Promise<DaySlot[]> {
  return Promise.resolve(selectDay(loadAll(), date));
}

/**
 * Schreibt den kompletten Tagesstand. Die View nutzt das am Ende eines Zuges:
 * waehrend gezogen wird, rechnet sie die Vorschau selbst, gespeichert wird einmal.
 */
export function saveDay(date: string, slots: DaySlot[]): Promise<DaySlot[]> {
  return Promise.resolve(replaceDay(date, slots));
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
  const current = selectDay(loadAll(), date);
  return Promise.resolve(replaceDay(date, applyPaint(current, indices, categoryId)));
}

/** Setzt die Notiz des Blocks, in dem `slot` liegt. */
export function setBlockNote(date: string, slot: number, note: string): Promise<DaySlot[]> {
  const current = selectDay(loadAll(), date);
  return Promise.resolve(replaceDay(date, setNoteOnBlock(current, slot, note)));
}

/** Loescht einen ganzen Block. */
export function clearBlock(date: string, startSlot: number, endSlot: number): Promise<DaySlot[]> {
  const indices: number[] = [];
  for (let slot = startSlot; slot < endSlot; slot++) indices.push(slot);
  return paintSlots(date, indices, null);
}
