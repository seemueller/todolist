import { describe, expect, it } from "vitest";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  addDays,
  applyPaint,
  buildBlocks,
  dayHours,
  formatDateLabel,
  formatDayLabel,
  formatDuration,
  formatSignedDuration,
  formatWeekLabel,
  isWeekend,
  setBlockNote,
  slotToLabel,
  sumByCategory,
  startOfWeek,
  timeToSlot,
  toDateKey,
  weekDays,
  totalSlots,
  type DaySlot,
} from "./timeSlots";

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
