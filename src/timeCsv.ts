// CSV-Export der Zeiterfassung. Reine Funktionen, kein Zugriff auf DOM oder
// Speicher — die View haengt nur den Download daran.
//
// Trennzeichen ist das Semikolon und die Datei beginnt mit einer BOM, damit Excel
// in deutscher Einstellung die Spalten trennt und Umlaute richtig liest.

import { DaySlot, TimeBlock, buildBlocks, formatDuration, slotToLabel } from "./timeSlots";

/** Spaltenkoepfe in der Reihenfolge der Zeilen. */
export const CSV_HEADER = [
  "Datum",
  "Von",
  "Bis",
  "Dauer",
  "Minuten",
  "Kategorie",
  "Notiz",
] as const;

const SEPARATOR = ";";
const NEWLINE = "\r\n";
/** Byte Order Mark, damit Excel die Datei als UTF-8 liest. */
export const CSV_BOM = "﻿";

/** Ein Feld wird nur eingefasst, wenn es Trennzeichen, Anfuehrungszeichen oder Umbruch enthaelt. */
function escapeField(value: string): string {
  if (!/[";\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function blockRow(
  date: string,
  block: TimeBlock,
  categoryName: (id: number) => string
): string[] {
  return [
    date,
    slotToLabel(block.startSlot),
    slotToLabel(block.endSlot),
    formatDuration(block.slotCount),
    String(block.slotCount * 15),
    categoryName(block.category_id),
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
  categoryName: (id: number) => string
): string {
  const rows: string[][] = [[...CSV_HEADER]];
  for (const day of days) {
    for (const block of buildBlocks(slotsByDay[day] ?? [])) {
      rows.push(blockRow(day, block, categoryName));
    }
  }
  return CSV_BOM + rows.map((row) => row.map(escapeField).join(SEPARATOR)).join(NEWLINE) + NEWLINE;
}

/** "zeiterfassung-2026-08-31.csv" fuer die Woche ab diesem Montag. */
export function csvFileName(monday: string): string {
  return `zeiterfassung-${monday}.csv`;
}
