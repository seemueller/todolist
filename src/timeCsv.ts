// CSV-Export der Zeiterfassung. Reine Funktionen, kein Zugriff auf DOM oder
// Speicher — die View haengt nur den Download daran.
//
// Trennzeichen ist das Semikolon und die Datei beginnt mit einer BOM, damit Excel
// in deutscher Einstellung die Spalten trennt und Umlaute richtig liest.

import { DaySlot, TimeBlock, buildBlocks, formatDuration, slotToLabel } from "./timeSlots";
import type { TimeKind } from "./types";

/** Spaltenkoepfe in der Reihenfolge der Zeilen. */
export const CSV_HEADER = [
  "Datum",
  "Von",
  "Bis",
  "Dauer",
  "Minuten",
  "Kategorie",
  "Art",
  "Notiz",
] as const;

// Deutsche Werte, weil die Datei fuer Excel in deutscher Einstellung gebaut ist
// -- Semikolon als Trennzeichen und BOM voran.
const KIND_LABELS: Record<TimeKind, string> = {
  none: "keine",
  internal: "intern",
  external: "extern",
};

const SEPARATOR = ";";
const NEWLINE = "\r\n";
/** Byte Order Mark, damit Excel die Datei als UTF-8 liest. */
export const CSV_BOM = "﻿";

// Excel und LibreOffice werten eine Zelle als Formel, wenn sie mit = + - @ oder
// einem Tabulator/Wagenruecklauf beginnt -- auch in einer eingefassten Zelle. Da
// Notiz und Kategoriename frei formuliert sind (die Notiz auch ueber MCP von einem
// fremden Prozess), wird ein solcher Anfang mit einem vorangestellten Apostroph
// neutralisiert. Der Apostroph zwingt die Tabellenkalkulation zu Text.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Ein Feld wird eingefasst, wenn es Trennzeichen, Anfuehrungszeichen oder Umbruch
 * enthaelt, und mit einem Apostroph entschaerft, wenn es wie eine Formel beginnt.
 */
function escapeField(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  if (!/[";\r\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

function blockRow(
  date: string,
  block: TimeBlock,
  categoryName: (id: number) => string,
  kindOf: (id: number) => TimeKind
): string[] {
  return [
    date,
    slotToLabel(block.startSlot),
    slotToLabel(block.endSlot),
    formatDuration(block.slotCount),
    String(block.slotCount * 15),
    categoryName(block.category_id),
    KIND_LABELS[kindOf(block.category_id)],
    block.note,
  ];
}

/**
 * Baut den CSV-Text einer Woche: eine Zeile je Block, Tage in der uebergebenen
 * Reihenfolge, Bloecke chronologisch. Tage ohne Buchung erzeugen keine Zeile.
 */
export function buildCsv(
  days: string[],
  slotsByDay: Record<string, DaySlot[]>,
  categoryName: (id: number) => string,
  kindOf: (id: number) => TimeKind
): string {
  const rows: string[][] = [[...CSV_HEADER]];
  for (const day of days) {
    for (const block of buildBlocks(slotsByDay[day] ?? [])) {
      rows.push(blockRow(day, block, categoryName, kindOf));
    }
  }
  return CSV_BOM + rows.map((row) => row.map(escapeField).join(SEPARATOR)).join(NEWLINE) + NEWLINE;
}

/** "zeiterfassung-2026-08-31.csv" fuer die Woche ab diesem Montag. */
export function csvFileName(monday: string): string {
  return `zeiterfassung-${monday}.csv`;
}
