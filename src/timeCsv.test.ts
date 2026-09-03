import { describe, expect, it } from "vitest";
import { CSV_BOM, buildCsv, csvFileName } from "./timeCsv";
import type { DaySlot } from "./timeSlots";

function slot(s: number, categoryId: number, note = ""): DaySlot {
  return { slot: s, category_id: categoryId, note };
}

const names: Record<number, string> = { 7: "Alpha", 9: "Daily" };
const categoryName = (id: number) => names[id] ?? "Unbekannt";

/** Zeilen ohne BOM und ohne die abschliessende Leerzeile. */
function lines(csv: string): string[] {
  return csv.replace(CSV_BOM, "").trimEnd().split("\r\n");
}

describe("buildCsv", () => {
  it("schreibt nur die Kopfzeile, wenn nichts gebucht ist", () => {
    const csv = buildCsv(["2026-08-31"], {}, categoryName);
    expect(lines(csv)).toEqual(["Datum;Von;Bis;Dauer;Minuten;Kategorie;Notiz"]);
  });

  it("beginnt mit einer BOM und endet mit einem Umbruch", () => {
    const csv = buildCsv(["2026-08-31"], {}, categoryName);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("schreibt eine Zeile je Block", () => {
    const csv = buildCsv(
      ["2026-08-31", "2026-09-01"],
      {
        "2026-08-31": [slot(36, 7, "Refactoring"), slot(37, 7, "Refactoring"), slot(44, 9)],
        "2026-09-01": [slot(56, 7)],
      },
      categoryName
    );

    expect(lines(csv).slice(1)).toEqual([
      "2026-08-31;09:00;09:30;0:30;30;Alpha;Refactoring",
      "2026-08-31;11:00;11:15;0:15;15;Daily;",
      "2026-09-01;14:00;14:15;0:15;15;Alpha;",
    ]);
  });

  it("haelt die Reihenfolge der uebergebenen Tage", () => {
    const csv = buildCsv(
      ["2026-09-01", "2026-08-31"],
      { "2026-08-31": [slot(36, 7)], "2026-09-01": [slot(36, 9)] },
      categoryName
    );
    expect(lines(csv).slice(1).map((row) => row.split(";")[0])).toEqual([
      "2026-09-01",
      "2026-08-31",
    ]);
  });

  it("laesst Tage ohne Buchung aus", () => {
    const csv = buildCsv(
      ["2026-08-31", "2026-09-01", "2026-09-02"],
      { "2026-09-01": [slot(36, 7)] },
      categoryName
    );
    expect(lines(csv)).toHaveLength(2);
  });

  it("fasst Notizen mit Semikolon oder Anfuehrungszeichen ein", () => {
    const csv = buildCsv(
      ["2026-08-31"],
      { "2026-08-31": [slot(36, 7, 'Ticket 4711; Teil "A"')] },
      categoryName
    );
    expect(lines(csv)[1]).toBe('2026-08-31;09:00;09:15;0:15;15;Alpha;"Ticket 4711; Teil ""A"""');
  });

  it("benennt eine geloeschte Kategorie ueber die uebergebene Funktion", () => {
    const csv = buildCsv(["2026-08-31"], { "2026-08-31": [slot(36, 99)] }, categoryName);
    expect(lines(csv)[1]).toContain("Unbekannt");
  });
});

describe("csvFileName", () => {
  it("nimmt den Montag der Woche in den Namen", () => {
    expect(csvFileName("2026-08-31")).toBe("zeiterfassung-2026-08-31.csv");
  });
});
