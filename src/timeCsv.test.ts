import { describe, expect, it } from "vitest";
import { CSV_BOM, CSV_HEADER, buildCsv, csvFileName } from "./timeCsv";
import type { DaySlot } from "./timeSlots";
import type { TimeKind } from "./types";

function slot(s: number, categoryId: number, note = ""): DaySlot {
  return { slot: s, category_id: categoryId, note };
}

const names: Record<number, string> = { 7: "Alpha", 9: "Daily" };
const categoryName = (id: number) => names[id] ?? "Unbekannt";

const kinds: Record<number, TimeKind> = { 7: "external", 9: "none" };
const kindOf = (id: number): TimeKind => kinds[id] ?? "internal";

/** Zeilen ohne BOM und ohne die abschliessende Leerzeile. */
function lines(csv: string): string[] {
  return csv.replace(CSV_BOM, "").trimEnd().split("\r\n");
}

describe("buildCsv", () => {
  it("schreibt nur die Kopfzeile, wenn nichts gebucht ist", () => {
    const csv = buildCsv(["2026-08-31"], {}, categoryName, kindOf);
    expect(lines(csv)).toEqual(["Datum;Von;Bis;Dauer;Minuten;Kategorie;Art;Notiz"]);
  });

  it("beginnt mit einer BOM und endet mit einem Umbruch", () => {
    const csv = buildCsv(["2026-08-31"], {}, categoryName, kindOf);
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
      categoryName,
      kindOf
    );

    expect(lines(csv).slice(1)).toEqual([
      "2026-08-31;09:00;09:30;0:30;30;Alpha;extern;Refactoring",
      "2026-08-31;11:00;11:15;0:15;15;Daily;keine;",
      "2026-09-01;14:00;14:15;0:15;15;Alpha;extern;",
    ]);
  });

  it("haelt die Reihenfolge der uebergebenen Tage", () => {
    const csv = buildCsv(
      ["2026-09-01", "2026-08-31"],
      { "2026-08-31": [slot(36, 7)], "2026-09-01": [slot(36, 9)] },
      categoryName,
      kindOf
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
      categoryName,
      kindOf
    );
    expect(lines(csv)).toHaveLength(2);
  });

  it("fasst Notizen mit Semikolon oder Anfuehrungszeichen ein", () => {
    const csv = buildCsv(
      ["2026-08-31"],
      { "2026-08-31": [slot(36, 7, 'Ticket 4711; Teil "A"')] },
      categoryName,
      kindOf
    );
    expect(lines(csv)[1]).toBe(
      '2026-08-31;09:00;09:15;0:15;15;Alpha;extern;"Ticket 4711; Teil ""A"""'
    );
  });

  it("benennt eine geloeschte Kategorie ueber die uebergebene Funktion", () => {
    const csv = buildCsv(["2026-08-31"], { "2026-08-31": [slot(36, 99)] }, categoryName, kindOf);
    expect(lines(csv)[1]).toContain("Unbekannt");
  });

  it("hat die Spalte Art nach der Kategorie", () => {
    expect(CSV_HEADER).toEqual([
      "Datum",
      "Von",
      "Bis",
      "Dauer",
      "Minuten",
      "Kategorie",
      "Art",
      "Notiz",
    ]);
  });

  it("schreibt die Zeitart je Buchung auf deutsch", () => {
    const csv = buildCsv(
      ["2026-09-16"],
      { "2026-09-16": [slot(36, 7)] },
      () => "Kunde X",
      () => "external"
    );
    expect(csv).toContain("Kunde X;extern;");
  });

  it("schreibt 'keine' fuer Nicht-Arbeitszeit", () => {
    const csv = buildCsv(
      ["2026-09-16"],
      { "2026-09-16": [slot(36, 7)] },
      () => "Pause",
      () => "none"
    );
    expect(csv).toContain("Pause;keine;");
  });

  it("schreibt 'intern' fuer eine geloeschte Kategorie", () => {
    const csv = buildCsv(["2026-08-31"], { "2026-08-31": [slot(36, 99)] }, categoryName, kindOf);
    expect(lines(csv)[1]).toContain("Unbekannt;intern;");
  });
});

describe("csvFileName", () => {
  it("nimmt den Montag der Woche in den Namen", () => {
    expect(csvFileName("2026-08-31")).toBe("zeiterfassung-2026-08-31.csv");
  });
});
