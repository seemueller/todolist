import { describe, expect, it } from "vitest";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  addDays,
  addMonths,
  applyPaint,
  buildBlocks,
  clampTarget,
  dayHours,
  formatDateLabel,
  formatDayLabel,
  formatDuration,
  formatMonthLabel,
  formatPercent,
  formatSignedDuration,
  formatWeekLabel,
  endOfMonth,
  isWeekend,
  monthDays,
  noteLabels,
  setBlockNote,
  shareByCategory,
  startOfMonth,
  slotToLabel,
  sumByCategory,
  startOfWeek,
  timeToSlot,
  toDateKey,
  weekDays,
  splitByWorkTime,
  sumSlots,
  totalSlots,
  type DaySlot,
} from "./timeSlots";
import type { TimeKind } from "./types";

function slot(s: number, categoryId: number, note = ""): DaySlot {
  return { slot: s, category_id: categoryId, note };
}

describe("slotToLabel / timeToSlot", () => {
  it("rechnet Slot-Index in Uhrzeit um", () => {
    expect(slotToLabel(0)).toBe("00:00");
    expect(slotToLabel(24)).toBe("06:00");
    expect(slotToLabel(33)).toBe("08:15");
    expect(slotToLabel(91)).toBe("22:45");
  });

  it("rechnet Uhrzeit in Slot-Index um", () => {
    expect(timeToSlot(0, 0)).toBe(0);
    expect(timeToSlot(8, 15)).toBe(33);
    expect(timeToSlot(22, 45)).toBe(91);
  });

  it("ist umkehrbar", () => {
    for (let s = 0; s < 96; s++) {
      const label = slotToLabel(s);
      const [h, m] = label.split(":").map(Number);
      expect(timeToSlot(h, m)).toBe(s);
    }
  });
});

describe("dayHours", () => {
  it("liefert die Stunden des Arbeitstags einschliesslich der Endstunde", () => {
    const hours = dayHours();
    expect(hours[0]).toBe(DAY_START_HOUR);
    expect(hours[hours.length - 1]).toBe(DAY_END_HOUR);
    expect(hours).toHaveLength(17);
  });
});

describe("applyPaint", () => {
  it("fuellt leere Slots mit der Kategorie", () => {
    const result = applyPaint([], [36, 37], 7);
    expect(result).toEqual([slot(36, 7), slot(37, 7)]);
  });

  it("haelt das Ergebnis nach Slot sortiert", () => {
    const result = applyPaint([slot(40, 7)], [36], 7);
    expect(result.map((s) => s.slot)).toEqual([36, 40]);
  });

  it("ueberschreibt eine andere Kategorie", () => {
    const result = applyPaint([slot(36, 7)], [36], 9);
    expect(result).toEqual([slot(36, 9)]);
  });

  it("leert Slots bei categoryId null", () => {
    const result = applyPaint([slot(36, 7), slot(37, 7)], [37], null);
    expect(result).toEqual([slot(36, 7)]);
  });

  it("laesst unberuehrte Slots unveraendert", () => {
    const existing = [slot(36, 7, "Refactoring"), slot(80, 9, "Doku")];
    const result = applyPaint(existing, [50], 9);
    expect(result).toEqual([slot(36, 7, "Refactoring"), slot(50, 9), slot(80, 9, "Doku")]);
  });

  it("vererbt die Notiz des Blocks an einen neuen Nachbar-Slot", () => {
    const existing = [slot(36, 7, "Refactoring")];
    const result = applyPaint(existing, [37], 7);
    expect(result).toEqual([slot(36, 7, "Refactoring"), slot(37, 7, "Refactoring")]);
  });

  it("verschmilzt zwei Bloecke und behaelt die erste Notiz", () => {
    const existing = [slot(36, 7, "Vormittag"), slot(38, 7, "Nachmittag")];
    const result = applyPaint(existing, [37], 7);
    expect(result.map((s) => s.note)).toEqual(["Vormittag", "Vormittag", "Vormittag"]);
  });

  it("behaelt die Notiz in beiden Haelften, wenn ein Block geteilt wird", () => {
    const existing = [
      slot(36, 7, "Refactoring"),
      slot(37, 7, "Refactoring"),
      slot(38, 7, "Refactoring"),
    ];
    const result = applyPaint(existing, [37], null);
    expect(result).toEqual([slot(36, 7, "Refactoring"), slot(38, 7, "Refactoring")]);
  });

  it("ignoriert Slots ausserhalb des Tages", () => {
    expect(applyPaint([], [-1, 96, 200], 7)).toEqual([]);
  });
});

describe("buildBlocks", () => {
  it("liefert fuer leere Slots keine Bloecke", () => {
    expect(buildBlocks([])).toEqual([]);
  });

  it("fasst zusammenhaengende Slots gleicher Kategorie zusammen", () => {
    const blocks = buildBlocks([slot(36, 7), slot(37, 7), slot(38, 7)]);
    expect(blocks).toEqual([
      { startSlot: 36, endSlot: 39, category_id: 7, note: "", slotCount: 3 },
    ]);
  });

  it("trennt bei einer Luecke", () => {
    const blocks = buildBlocks([slot(36, 7), slot(38, 7)]);
    expect(blocks.map((b) => [b.startSlot, b.endSlot])).toEqual([
      [36, 37],
      [38, 39],
    ]);
  });

  it("trennt beim Wechsel der Kategorie", () => {
    const blocks = buildBlocks([slot(36, 7), slot(37, 9)]);
    expect(blocks.map((b) => b.category_id)).toEqual([7, 9]);
  });

  it("nimmt die erste nichtleere Notiz des Blocks", () => {
    const blocks = buildBlocks([slot(36, 7, ""), slot(37, 7, "Refactoring")]);
    expect(blocks[0].note).toBe("Refactoring");
  });
});

describe("setBlockNote", () => {
  it("schreibt die Notiz auf alle Slots des Blocks", () => {
    const existing = [slot(36, 7), slot(37, 7), slot(50, 7)];
    const result = setBlockNote(existing, 37, "Refactoring");
    expect(result).toEqual([
      slot(36, 7, "Refactoring"),
      slot(37, 7, "Refactoring"),
      slot(50, 7),
    ]);
  });

  it("laesst alles unveraendert, wenn der Slot leer ist", () => {
    const existing = [slot(36, 7)];
    expect(setBlockNote(existing, 80, "Doku")).toEqual(existing);
  });

  it("kann eine Notiz wieder entfernen", () => {
    const existing = [slot(36, 7, "Refactoring"), slot(37, 7, "Refactoring")];
    expect(setBlockNote(existing, 36, "")).toEqual([slot(36, 7), slot(37, 7)]);
  });
});

describe("Summen", () => {
  it("zaehlt Slots je Kategorie und sortiert nach Dauer", () => {
    const slots = [slot(36, 7), slot(37, 7), slot(50, 9), slot(51, 7)];
    expect(sumByCategory(slots)).toEqual([
      { category_id: 7, slotCount: 3 },
      { category_id: 9, slotCount: 1 },
    ]);
  });

  it("zaehlt die Slots des Tages", () => {
    expect(totalSlots([slot(36, 7), slot(37, 9)])).toBe(2);
  });
});

describe("splitByWorkTime", () => {
  const sums = [
    { category_id: 1, slotCount: 8 },
    { category_id: 2, slotCount: 4 },
    { category_id: 3, slotCount: 2 },
  ];
  const kindOf = (id: number): TimeKind =>
    id === 1 ? "internal" : id === 2 ? "external" : "none";

  it("trennt Arbeitszeit von Nicht-Arbeitszeit", () => {
    const { work, nonWork } = splitByWorkTime(sums, kindOf);
    expect(work.map((s) => s.category_id)).toEqual([1, 2]);
    expect(nonWork.map((s) => s.category_id)).toEqual([3]);
  });

  it("behaelt die Reihenfolge der Eingabe", () => {
    expect(splitByWorkTime(sums, kindOf).work).toEqual([sums[0], sums[1]]);
  });

  it("zaehlt eine geloeschte Kategorie als Arbeitszeit", () => {
    const { work, nonWork } = splitByWorkTime(sums, () => "internal");
    expect(work).toHaveLength(3);
    expect(nonWork).toHaveLength(0);
  });

  it("liefert zwei leere Haelften fuer eine leere Eingabe", () => {
    expect(splitByWorkTime([], kindOf)).toEqual({ work: [], nonWork: [] });
  });
});

describe("sumSlots", () => {
  it("summiert die Viertelstunden", () => {
    expect(
      sumSlots([
        { category_id: 1, slotCount: 8 },
        { category_id: 2, slotCount: 4 },
      ])
    ).toBe(12);
  });

  it("liefert 0 fuer eine leere Liste", () => {
    expect(sumSlots([])).toBe(0);
  });
});

describe("clampTarget", () => {
  it("kappt einen negativen Wert auf 0", () => {
    expect(clampTarget(-5)).toBe(0);
  });

  it("laesst 0 unveraendert", () => {
    expect(clampTarget(0)).toBe(0);
  });

  it("laesst einen normalen Wert unveraendert", () => {
    expect(clampTarget(32)).toBe(32);
  });

  it("kappt einen Wert ueber 64 auf 64", () => {
    expect(clampTarget(999)).toBe(64);
  });

  it("faellt bei einem nicht endlichen Wert auf die Vorgabe zurueck", () => {
    expect(clampTarget(NaN)).toBe(32);
    expect(clampTarget(Infinity)).toBe(32);
  });
});

describe("formatDuration", () => {
  it("formatiert Viertelstunden als Stunden und Minuten", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(1)).toBe("0:15");
    expect(formatDuration(4)).toBe("1:00");
    expect(formatDuration(6)).toBe("1:30");
    expect(formatDuration(35)).toBe("8:45");
  });
});

describe("formatSignedDuration", () => {
  it("stellt Vorzeichen vor die Differenz", () => {
    expect(formatSignedDuration(0)).toBe("0:00");
    expect(formatSignedDuration(5)).toBe("+1:15");
    expect(formatSignedDuration(-3)).toBe("-0:45");
  });
});

describe("Datumshilfen", () => {
  it("formatiert einen Datumsschluessel ohne Zeitzonen-Versatz", () => {
    expect(toDateKey(new Date(2026, 8, 3))).toBe("2026-09-03");
    expect(toDateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("verschiebt Tage vorwaerts und rueckwaerts", () => {
    expect(addDays("2026-09-03", 1)).toBe("2026-09-04");
    expect(addDays("2026-09-03", -1)).toBe("2026-09-02");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("beschriftet ein Datum mit Wochentag", () => {
    expect(formatDateLabel("2026-09-03")).toBe("Do, 03.09.2026");
  });
});

describe("Wochenhilfen", () => {
  it("findet den Montag der Woche", () => {
    expect(startOfWeek("2026-09-03")).toBe("2026-08-31"); // Donnerstag
    expect(startOfWeek("2026-08-31")).toBe("2026-08-31"); // Montag selbst
    expect(startOfWeek("2026-09-04")).toBe("2026-08-31"); // Freitag
  });

  it("zaehlt den Sonntag zur Woche, die am Montag davor begann", () => {
    expect(startOfWeek("2026-09-06")).toBe("2026-08-31");
    expect(startOfWeek("2026-09-07")).toBe("2026-09-07"); // naechster Montag
  });

  it("erkennt Samstag und Sonntag", () => {
    expect(isWeekend("2026-09-04")).toBe(false); // Freitag
    expect(isWeekend("2026-09-05")).toBe(true); // Samstag
    expect(isWeekend("2026-09-06")).toBe(true); // Sonntag
  });

  it("liefert mit Wochenende sieben Tage", () => {
    const days = weekDays("2026-08-31", true);
    expect(days).toHaveLength(7);
    expect(days[5]).toBe("2026-09-05");
    expect(days[6]).toBe("2026-09-06");
  });

  it("liefert die fuenf Arbeitstage", () => {
    expect(weekDays("2026-08-31")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("beschriftet Spaltenkopf und Woche", () => {
    expect(formatDayLabel("2026-08-31")).toBe("Mo 31.08.");
    expect(formatWeekLabel("2026-08-31")).toBe("31.08.–04.09.2026");
  });
});

describe("Monatshilfen", () => {
  it("findet Anfang und Ende des Monats", () => {
    expect(startOfMonth("2026-09-17")).toBe("2026-09-01");
    expect(endOfMonth("2026-09-17")).toBe("2026-09-30");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29"); // Schaltjahr
  });

  it("verschiebt Monate und bleibt auf dem Ersten", () => {
    expect(addMonths("2026-09-17", 1)).toBe("2026-10-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("beschriftet den Monat", () => {
    expect(formatMonthLabel("2026-09-01")).toBe("September 2026");
    expect(formatMonthLabel("2026-01-15")).toBe("Januar 2026");
  });

  it("zaehlt die Tage eines Monats auf", () => {
    const days = monthDays("2026-02-10");
    expect(days).toHaveLength(28);
    expect(days[0]).toBe("2026-02-01");
    expect(days[27]).toBe("2026-02-28");
  });
});

describe("shareByCategory", () => {
  it("rechnet Anteile in Prozent aus", () => {
    const shares = shareByCategory([
      { category_id: 1, slotCount: 30 },
      { category_id: 2, slotCount: 10 },
    ]);
    expect(shares).toEqual([
      { category_id: 1, slotCount: 30, percent: 75 },
      { category_id: 2, slotCount: 10, percent: 25 },
    ]);
  });

  it("gibt bei leerer Eingabe nichts zurueck", () => {
    expect(shareByCategory([])).toEqual([]);
  });

  it("laesst bei einer Gesamtsumme von null keinen Anteil entstehen", () => {
    expect(shareByCategory([{ category_id: 1, slotCount: 0 }])).toEqual([
      { category_id: 1, slotCount: 0, percent: 0 },
    ]);
  });

  it("behaelt die Reihenfolge der Eingabe bei", () => {
    const shares = shareByCategory([
      { category_id: 5, slotCount: 1 },
      { category_id: 3, slotCount: 3 },
    ]);
    expect(shares.map((s) => s.category_id)).toEqual([5, 3]);
  });
});

describe("formatPercent", () => {
  it("schreibt eine Nachkommastelle mit Komma", () => {
    expect(formatPercent(48.375)).toBe("48,4 %");
    expect(formatPercent(100)).toBe("100,0 %");
    expect(formatPercent(0)).toBe("0,0 %");
  });
});

describe("noteLabels", () => {
  function slots(from: number, to: number, categoryId: number, note: string): DaySlot[] {
    const result: DaySlot[] = [];
    for (let index = from; index < to; index++) {
      result.push({ slot: index, category_id: categoryId, note });
    }
    return result;
  }

  it("beschriftet einen Block innerhalb einer Stunde", () => {
    // 09:00-10:00, ganz in einer Stundenzeile.
    expect(noteLabels(slots(36, 40, 1, "Ticket 4711"))).toEqual([
      { startSlot: 36, endSlot: 40, note: "Ticket 4711" },
    ]);
  });

  it("nimmt bei mehreren Stundenzeilen die breiteste", () => {
    // 09:30-11:30: zwei Viertel, dann vier, dann zwei.
    expect(noteLabels(slots(38, 46, 1, "Workshop"))).toEqual([
      { startSlot: 40, endSlot: 44, note: "Workshop" },
    ]);
  });

  it("nimmt bei gleich breiten Stundenzeilen die mit der Blockmitte", () => {
    // 09:30-10:30: zwei Viertel in jeder Stunde, die Mitte liegt bei 10:00.
    expect(noteLabels(slots(38, 42, 1, "Jour fixe"))).toEqual([
      { startSlot: 40, endSlot: 42, note: "Jour fixe" },
    ]);
  });

  it("laesst einen Block ohne Notiz aus", () => {
    expect(noteLabels(slots(36, 40, 1, ""))).toEqual([]);
  });

  it("laesst eine einzelne Viertelstunde aus, dort passt kein Text", () => {
    expect(noteLabels(slots(36, 37, 1, "Kurz"))).toEqual([]);
  });

  it("laesst einen Block aus, dessen breitestes Stueck nur ein Viertel ist", () => {
    // 09:45-10:15 -- zwei Viertelstunden, aber je eine pro Stundenzeile.
    expect(noteLabels(slots(39, 41, 1, "Uebergang"))).toEqual([]);
  });

  it("beschriftet jeden Block eines Tages einzeln", () => {
    const day = [
      ...slots(36, 38, 1, "Erstes"),
      ...slots(40, 42, 2, "Zweites"),
    ];
    expect(noteLabels(day)).toEqual([
      { startSlot: 36, endSlot: 38, note: "Erstes" },
      { startSlot: 40, endSlot: 42, note: "Zweites" },
    ]);
  });

  it("trennt zwei gleiche Kategorien mit einer Luecke dazwischen", () => {
    const day = [...slots(36, 38, 1, "Vormittag"), ...slots(40, 42, 1, "Vormittag")];
    expect(noteLabels(day)).toEqual([
      { startSlot: 36, endSlot: 38, note: "Vormittag" },
      { startSlot: 40, endSlot: 42, note: "Vormittag" },
    ]);
  });
});
