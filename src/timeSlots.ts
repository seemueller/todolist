// Reine Logik der Zeiterfassung, ohne React und ohne Speicher.
//
// Eine Buchung ist eine Viertelstunde: `slot` ist der Viertelstunden-Index seit
// Mitternacht (0-95), also 33 = 08:15. Ein Block ist ein zusammenhaengender Lauf
// gleicher Kategorie und wird nie gespeichert, sondern immer aus den Slots
// berechnet. Die Notiz liegt physisch am Slot, gehoert aber dem Block: nach jeder
// Aenderung schreibt normalizeNotes je Block die erste nichtleere Notiz auf alle
// Slots des Blocks. Dadurch erbt ein neu gemalter Nachbar-Slot die Notiz seines
// Blocks, und Teilen wie Verschmelzen braucht keine Sonderbehandlung.

import type { TimeKind } from "./types";

/** Minuten je Slot. */
export const SLOT_MINUTES = 15;
/** Slots je Stunde. */
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
/** Slots eines vollen Tages. */
export const SLOTS_PER_DAY = 24 * SLOTS_PER_HOUR;
/** Regulaere Arbeitstage einer Woche; das Wochenende zaehlt nicht zum Soll. */
export const WORKDAYS_PER_WEEK = 5;
/** Soll je Tag zwischen 0:00 und 16:00; alles andere waere ein Tippfehler. */
const MAX_TARGET_SLOTS = 64;
/** Erste Stunde der Matrix. */
export const DAY_START_HOUR = 6;
/** Letzte Stunde der Matrix, einschliesslich. */
export const DAY_END_HOUR = 22;

/** Eine gebuchte Viertelstunde eines Tages. */
export interface DaySlot {
  slot: number;
  category_id: number;
  note: string;
}

/** Zusammenhaengender Lauf gleicher Kategorie; endSlot ist ausschliesslich. */
export interface TimeBlock {
  startSlot: number;
  endSlot: number;
  category_id: number;
  note: string;
  slotCount: number;
}

/** Slots je Kategorie, absteigend nach Dauer. */
export interface CategorySum {
  category_id: number;
  slotCount: number;
}

/** Eine Kategoriesumme samt ihrem Anteil an der Gesamtsumme, in Prozent (0-100). */
export interface CategoryShare extends CategorySum {
  percent: number;
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "08:15" fuer den Slot-Index 33. */
export function slotToLabel(slot: number): string {
  const hour = Math.floor(slot / SLOTS_PER_HOUR);
  const minute = (slot % SLOTS_PER_HOUR) * SLOT_MINUTES;
  return `${pad(hour)}:${pad(minute)}`;
}

/** Slot-Index fuer eine Uhrzeit. */
export function timeToSlot(hour: number, minute: number): number {
  return hour * SLOTS_PER_HOUR + Math.floor(minute / SLOT_MINUTES);
}

/** Die Stunden der Matrix, einschliesslich DAY_END_HOUR. */
export function dayHours(): number[] {
  const hours: number[] = [];
  for (let hour = DAY_START_HOUR; hour <= DAY_END_HOUR; hour++) hours.push(hour);
  return hours;
}

function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOTS_PER_DAY;
}

/**
 * Kappt ein Tagesziel auf den gueltigen Bereich; ein nicht endlicher Wert faellt
 * auf DEFAULT_SETTINGS.targetSlotsPerDay aus timeTypes.ts zurueck (hier als
 * Literal, um keinen Importzyklus mit timeTypes.ts einzugehen).
 */
export function clampTarget(slots: number): number {
  if (!Number.isFinite(slots)) return 32;
  return Math.min(MAX_TARGET_SLOTS, Math.max(0, Math.round(slots)));
}

function bySlot(a: DaySlot, b: DaySlot): number {
  return a.slot - b.slot;
}

/**
 * Setzt je Block die erste nichtleere Notiz auf alle Slots des Blocks. Erwartet
 * eine nach Slot sortierte Liste und gibt eine neue Liste zurueck.
 */
function normalizeNotes(slots: DaySlot[]): DaySlot[] {
  const result: DaySlot[] = [];
  let index = 0;
  while (index < slots.length) {
    let end = index + 1;
    while (
      end < slots.length &&
      slots[end].slot === slots[end - 1].slot + 1 &&
      slots[end].category_id === slots[index].category_id
    ) {
      end++;
    }
    const note = slots.slice(index, end).find((s) => s.note !== "")?.note ?? "";
    for (let i = index; i < end; i++) result.push({ ...slots[i], note });
    index = end;
  }
  return result;
}

/**
 * Malt oder leert Slots. `categoryId` null leert, sonst wird gefuellt oder eine
 * andere Kategorie ueberschrieben. Slots ausserhalb des Tages werden ignoriert.
 */
export function applyPaint(
  slots: DaySlot[],
  indices: number[],
  categoryId: number | null
): DaySlot[] {
  const targets = indices.filter(isValidSlot);
  if (targets.length === 0) return slots.slice().sort(bySlot);

  const targetSet = new Set(targets);
  const kept = slots.filter((s) => !targetSet.has(s.slot));

  if (categoryId === null) return normalizeNotes(kept.slice().sort(bySlot));

  const painted: DaySlot[] = targets.map((slot) => ({ slot, category_id: categoryId, note: "" }));
  return normalizeNotes([...kept, ...painted].sort(bySlot));
}

/** Fasst die Slots zu Bloecken zusammen. */
export function buildBlocks(slots: DaySlot[]): TimeBlock[] {
  const sorted = slots.slice().sort(bySlot);
  const blocks: TimeBlock[] = [];
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (
      end < sorted.length &&
      sorted[end].slot === sorted[end - 1].slot + 1 &&
      sorted[end].category_id === sorted[index].category_id
    ) {
      end++;
    }
    const run = sorted.slice(index, end);
    blocks.push({
      startSlot: run[0].slot,
      endSlot: run[run.length - 1].slot + 1,
      category_id: run[0].category_id,
      note: run.find((s) => s.note !== "")?.note ?? "",
      slotCount: run.length,
    });
    index = end;
  }
  return blocks;
}

/**
 * Schreibt die Notiz auf alle Slots des Blocks, in dem `slot` liegt. Ist der Slot
 * nicht gebucht, bleibt alles unveraendert.
 */
export function setBlockNote(slots: DaySlot[], slot: number, note: string): DaySlot[] {
  const block = buildBlocks(slots).find((b) => slot >= b.startSlot && slot < b.endSlot);
  if (!block) return slots.slice().sort(bySlot);
  return slots
    .slice()
    .sort(bySlot)
    .map((s) =>
      s.slot >= block.startSlot && s.slot < block.endSlot ? { ...s, note } : s
    );
}

/** Slots je Kategorie, absteigend nach Dauer, bei Gleichstand nach Id. */
export function sumByCategory(slots: DaySlot[]): CategorySum[] {
  const counts = new Map<number, number>();
  for (const slot of slots) {
    counts.set(slot.category_id, (counts.get(slot.category_id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category_id, slotCount]) => ({ category_id, slotCount }))
    .sort((a, b) => b.slotCount - a.slotCount || a.category_id - b.category_id);
}

/**
 * Teilt Kategoriesummen in Arbeitszeit und Nicht-Arbeitszeit. Reine Funktion,
 * die Reihenfolge der Eingabe bleibt in beiden Haelften erhalten.
 *
 * Eine Kategorie, die es nicht mehr gibt, liefert `kindOf` als "internal" —
 * geloeschte Kategorien duerfen bereits gebuchte Arbeitszeit nicht aus der
 * Summe fallen lassen.
 */
export function splitByWorkTime(
  sums: CategorySum[],
  kindOf: (categoryId: number) => TimeKind
): { work: CategorySum[]; nonWork: CategorySum[] } {
  const work: CategorySum[] = [];
  const nonWork: CategorySum[] = [];
  for (const sum of sums) {
    (kindOf(sum.category_id) === "none" ? nonWork : work).push(sum);
  }
  return { work, nonWork };
}

/** Summe der Viertelstunden einer Liste von Kategoriesummen. */
export function sumSlots(sums: CategorySum[]): number {
  return sums.reduce((total, sum) => total + sum.slotCount, 0);
}

/** Gebuchte Viertelstunden des Tages. */
export function totalSlots(slots: DaySlot[]): number {
  return slots.length;
}

/** "1:30" fuer sechs Viertelstunden. */
export function formatDuration(slotCount: number): string {
  const minutes = slotCount * SLOT_MINUTES;
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

/** "+1:15" oder "-0:45"; genau null Slots ergibt "0:00". */
export function formatSignedDuration(slotCount: number): string {
  if (slotCount === 0) return "0:00";
  return `${slotCount > 0 ? "+" : "-"}${formatDuration(Math.abs(slotCount))}`;
}

/** "2026-09-03" aus einem Date, in lokaler Zeit statt UTC. */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Verschiebt einen Datumsschluessel um Tage. */
export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** Montag der Woche, in der `key` liegt. */
export function startOfWeek(key: string): string {
  const date = fromDateKey(key);
  // getDay(): 0 = Sonntag. Der Sonntag gehoert zur Woche, die am Montag davor begann.
  const offset = date.getDay() === 0 ? -6 : 1 - date.getDay();
  return addDays(key, offset);
}

/** Arbeitstage einer Woche. Sonst Montag bis Freitag, mit Wochenende bis Sonntag. */
export function weekDays(monday: string, includeWeekend = false): string[] {
  const count = includeWeekend ? 7 : WORKDAYS_PER_WEEK;
  return Array.from({ length: count }, (_, offset) => addDays(monday, offset));
}

/** Ist der Tag ein Samstag oder Sonntag? */
export function isWeekend(key: string): boolean {
  const day = fromDateKey(key).getDay();
  return day === 0 || day === 6;
}

/** "Mo 31.08." fuer die Spaltenkoepfe. */
export function formatDayLabel(key: string): string {
  const date = fromDateKey(key);
  return `${WEEKDAYS[date.getDay()]} ${pad(date.getDate())}.${pad(date.getMonth() + 1)}.`;
}

/** "31.08.-04.09.2026" fuer die Kopfzeile der Woche. */
export function formatWeekLabel(monday: string): string {
  const from = fromDateKey(monday);
  const to = fromDateKey(addDays(monday, 4));
  const left = `${pad(from.getDate())}.${pad(from.getMonth() + 1)}.`;
  const right = `${pad(to.getDate())}.${pad(to.getMonth() + 1)}.${to.getFullYear()}`;
  return `${left}–${right}`;
}

/** "Do, 03.09.2026". */
export function formatDateLabel(key: string): string {
  const date = fromDateKey(key);
  return `${WEEKDAYS[date.getDay()]}, ${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/**
 * Anteil jeder Kategorie an der Gesamtsumme, in Prozent. Die Reihenfolge der
 * Eingabe bleibt erhalten; eine Gesamtsumme von null ergibt ueberall 0 statt
 * NaN. Es wird bewusst nicht gerundet -- das macht erst formatPercent, damit
 * die Balkenbreiten den exakten Anteil behalten.
 */
export function shareByCategory(sums: CategorySum[]): CategoryShare[] {
  const total = sumSlots(sums);
  return sums.map((sum) => ({
    ...sum,
    percent: total === 0 ? 0 : (sum.slotCount / total) * 100,
  }));
}

/** "48,4 %" fuer 48.375 -- eine Nachkommastelle, deutsches Dezimalkomma. */
export function formatPercent(percent: number): string {
  return `${percent.toFixed(1).replace(".", ",")} %`;
}

/** Erster Tag des Monats, in dem `key` liegt. */
export function startOfMonth(key: string): string {
  const date = fromDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

/** Letzter Tag des Monats, in dem `key` liegt. */
export function endOfMonth(key: string): string {
  const date = fromDateKey(key);
  // Tag 0 des Folgemonats ist der letzte Tag dieses Monats.
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/**
 * Verschiebt um Monate und landet immer auf dem Ersten. Das Kappen auf den
 * Monatsanfang ist Absicht: ein Monatswechsel vom 31. aus wuerde sonst im
 * Folgemonat ueberlaufen (31. Januar + 1 Monat = 3. Maerz).
 */
export function addMonths(key: string, months: number): string {
  const date = fromDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + months, 1));
}

/** Alle Tage des Monats, in dem `key` liegt. */
export function monthDays(key: string): string[] {
  const first = startOfMonth(key);
  const last = endOfMonth(key);
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** "September 2026" fuer die Kopfzeile der Auswertung. */
export function formatMonthLabel(key: string): string {
  const date = fromDateKey(key);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Wo im Raster die Notiz eines Blocks steht: ueber welchem Stueck, von wo bis
 * wo. `endSlot` ist wie beim Block ausschliesslich.
 */
export interface NoteLabel {
  startSlot: number;
  endSlot: number;
  note: string;
}

/** Ab so vielen Viertelstunden ist ein Stueck breit genug fuer Text. */
export const MIN_NOTE_LABEL_SLOTS = 2;

/** Zerlegt einen Block in die Stuecke, die je eine Stundenzeile des Rasters fuellen. */
function splitByHour(block: TimeBlock): { startSlot: number; endSlot: number }[] {
  const pieces: { startSlot: number; endSlot: number }[] = [];
  let start = block.startSlot;
  while (start < block.endSlot) {
    const nextHour = (Math.floor(start / SLOTS_PER_HOUR) + 1) * SLOTS_PER_HOUR;
    const end = Math.min(nextHour, block.endSlot);
    pieces.push({ startSlot: start, endSlot: end });
    start = end;
  }
  return pieces;
}

/**
 * Die Notizen eines Tages so, wie das Raster sie zeigt: je Block hoechstens
 * eine Beschriftung.
 *
 * Das Raster bricht einen Block an jeder vollen Stunde um -- ein Block von
 * 09:30 bis 11:30 liegt in drei Stundenzeilen. Die Notiz steht in der
 * breitesten davon, weil dort am meisten Text lesbar bleibt; sind zwei gleich
 * breit, gewinnt die, in der die Mitte des Blocks liegt. Ein Stueck unter
 * MIN_NOTE_LABEL_SLOTS Viertelstunden bekommt gar keine Beschriftung -- drei
 * Zeichen und Auslassungspunkte waeren nur Rauschen, die Notiz steht ohnehin
 * vollstaendig in der Blockliste.
 */
export function noteLabels(slots: DaySlot[]): NoteLabel[] {
  const labels: NoteLabel[] = [];
  for (const block of buildBlocks(slots)) {
    if (block.note === "") continue;
    const middle = (block.startSlot + block.endSlot) / 2;
    let best: { startSlot: number; endSlot: number } | null = null;
    for (const piece of splitByHour(block)) {
      const width = piece.endSlot - piece.startSlot;
      const holdsMiddle = middle >= piece.startSlot && middle < piece.endSlot;
      if (!best) {
        best = piece;
        continue;
      }
      const bestWidth = best.endSlot - best.startSlot;
      if (width > bestWidth || (width === bestWidth && holdsMiddle)) best = piece;
    }
    if (!best || best.endSlot - best.startSlot < MIN_NOTE_LABEL_SLOTS) continue;
    labels.push({ startSlot: best.startSlot, endSlot: best.endSlot, note: block.note });
  }
  return labels;
}
