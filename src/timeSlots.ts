// Reine Logik der Zeiterfassung, ohne React und ohne Speicher.
//
// Eine Buchung ist eine Viertelstunde: `slot` ist der Viertelstunden-Index seit
// Mitternacht (0-95), also 33 = 08:15. Ein Block ist ein zusammenhaengender Lauf
// gleicher Kategorie und wird nie gespeichert, sondern immer aus den Slots
// berechnet. Die Notiz liegt physisch am Slot, gehoert aber dem Block: nach jeder
// Aenderung schreibt normalizeNotes je Block die erste nichtleere Notiz auf alle
// Slots des Blocks. Dadurch erbt ein neu gemalter Nachbar-Slot die Notiz seines
// Blocks, und Teilen wie Verschmelzen braucht keine Sonderbehandlung.

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

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

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
