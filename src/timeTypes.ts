// Datentypen der Zeiterfassung, die sowohl die Speicher-Schnittstelle (storeTypes.ts)
// als auch die konkreten Backends (timeStoreLocal.ts, timeDb.ts) brauchen. Eigene
// Datei, damit keines der beiden von timeDb.ts importieren muss und so ein
// Importzyklus entsteht.

import { DaySlot } from "./timeSlots";

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
