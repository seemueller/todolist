import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimeStatsModal } from "./TimeStatsModal";
import type { Category } from "./types";
import type { TimeSlotRecord } from "./timeTypes";

// Nur der Speicher ist ausgetauscht; die Fachlogik (timeSlots) bleibt echt.
const records: TimeSlotRecord[] = [];

vi.mock("./timeDb", () => ({
  listRange: (from: string, to: string) =>
    Promise.resolve(records.filter((r) => r.date >= from && r.date <= to)),
}));

const categories: Category[] = [
  { id: 1, name: "Projekt A", color: "#ff0000", created_at: "", time_kind: "external" },
  { id: 2, name: "Meetings", color: "#00ff00", created_at: "", time_kind: "internal" },
  { id: 3, name: "Pause", color: "#0000ff", created_at: "", time_kind: "none" },
];

/** `count` Viertelstunden der Kategorie an einem Tag. */
function seed(date: string, categoryId: number, count: number, startSlot = 32) {
  for (let index = 0; index < count; index++) {
    records.push({ date, slot: startSlot + index, category_id: categoryId, note: "" });
  }
}

function renderModal(monday = "2026-08-31") {
  return render(<TimeStatsModal categories={categories} monday={monday} onClose={() => {}} />);
}

/** Die Zeilen eines Abschnitts als "Kategorie Dauer Prozent". */
function rowsOf(title: RegExp): string[] {
  const section = screen.getByRole("heading", { name: title }).closest(".time-stats-section");
  return [...(section?.querySelectorAll(".time-share") ?? [])].map((row) =>
    [...row.querySelectorAll("span, .category-badge")]
      .filter((el) => !el.classList.contains("time-share-bar") && !el.classList.contains("time-share-fill"))
      .map((el) => el.textContent?.trim())
      .join(" ")
  );
}

function totalOf(title: RegExp): string {
  const section = screen.getByRole("heading", { name: title }).closest(".time-stats-section");
  return section?.querySelector(".time-stats-total")?.textContent?.trim() ?? "";
}

describe("TimeStatsModal", () => {
  beforeEach(() => {
    records.length = 0;
  });

  it("rechnet den Anteil jeder Kategorie an der Arbeitszeit der Woche aus", async () => {
    seed("2026-08-31", 1, 24); // 6:00
    seed("2026-09-01", 2, 8); // 2:00

    renderModal();

    await waitFor(() => expect(rowsOf(/^Woche/)).toHaveLength(2));
    expect(rowsOf(/^Woche/)).toEqual(["Projekt A 6:00 75,0 %", "Meetings 2:00 25,0 %"]);
    expect(totalOf(/^Woche/)).toBe("8:00");
  });

  it("laesst Kategorien ohne Arbeitszeit aus der Rechnung heraus", async () => {
    seed("2026-08-31", 1, 24); // 6:00 Arbeitszeit
    seed("2026-08-31", 3, 24, 60); // 6:00 Pause

    renderModal();

    await waitFor(() => expect(rowsOf(/^Woche/)).toHaveLength(1));
    // Waere die Pause mitgezaehlt, stuende hier 50 %.
    expect(rowsOf(/^Woche/)).toEqual(["Projekt A 6:00 100,0 %"]);
    expect(totalOf(/^Woche/)).toBe("6:00");
  });

  it("zaehlt auch das Wochenende mit, egal wie die Matrix es anzeigt", async () => {
    seed("2026-09-05", 1, 4); // Samstag, 1:00

    renderModal();

    await waitFor(() => expect(rowsOf(/^Woche/)).toHaveLength(1));
    expect(totalOf(/^Woche/)).toBe("1:00");
  });

  it("nimmt fuer den Monat den Monat der angezeigten Woche", async () => {
    seed("2026-08-31", 1, 4); // Montag, noch August
    seed("2026-09-01", 1, 8); // Dienstag, schon September

    renderModal("2026-08-31");

    // Der Montag liegt im August, also startet die Monatsauswertung dort.
    await waitFor(() => expect(totalOf(/August 2026/)).toBe("1:00"));
    expect(totalOf(/^Woche/)).toBe("3:00");
  });

  it("blaettert den Monat unabhaengig von der Woche", async () => {
    seed("2026-08-31", 1, 4); // August
    seed("2026-09-10", 2, 8); // September

    renderModal("2026-08-31");

    await waitFor(() => expect(totalOf(/August 2026/)).toBe("1:00"));

    fireEvent.click(screen.getByRole("button", { name: "Nächster Monat" }));

    await waitFor(() => expect(totalOf(/September 2026/)).toBe("2:00"));
    expect(rowsOf(/September 2026/)).toEqual(["Meetings 2:00 100,0 %"]);
    // Die Woche bleibt, wo sie war.
    expect(totalOf(/^Woche/)).toBe("1:00");
  });

  it("blaettert ueber die Jahresgrenze zurueck", async () => {
    renderModal("2026-01-05");

    await waitFor(() => expect(screen.getByRole("heading", { name: /Januar 2026/ })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Vorheriger Monat" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Dezember 2025/ })).toBeTruthy()
    );
  });

  it("sagt es, wenn nichts gebucht ist", async () => {
    renderModal();

    await waitFor(() => expect(screen.getByText(/Keine Arbeitszeit in dieser Woche/)).toBeTruthy());
    expect(screen.getByText(/Keine Arbeitszeit in diesem Monat/)).toBeTruthy();
  });

  it("beschriftet eine geloeschte Kategorie, statt ihre Zeit fallen zu lassen", async () => {
    seed("2026-08-31", 99, 4);

    renderModal();

    await waitFor(() => expect(rowsOf(/^Woche/)).toHaveLength(1));
    expect(rowsOf(/^Woche/)).toEqual(["Gelöschte Kategorie 1:00 100,0 %"]);
  });

  it("zeichnet den Balken so breit wie der Anteil", async () => {
    seed("2026-08-31", 1, 24); // 75 %
    seed("2026-09-01", 2, 8); // 25 %

    renderModal();

    await waitFor(() => expect(rowsOf(/^Woche/)).toHaveLength(2));
    const section = screen
      .getByRole("heading", { name: /^Woche/ })
      .closest(".time-stats-section") as HTMLElement;
    const widths = [...section.querySelectorAll(".time-share-fill")].map(
      (fill) => (fill as HTMLElement).style.width
    );
    expect(widths).toEqual(["75%", "25%"]);
  });

  it("meldet einen Ladefehler", async () => {
    const timeDb = await import("./timeDb");
    vi.spyOn(timeDb, "listRange").mockRejectedValue(new Error("kaputt"));

    renderModal();

    await waitFor(() =>
      expect(screen.getByText("Auswertung konnte nicht geladen werden.")).toBeTruthy()
    );
    vi.restoreAllMocks();
  });

  it("schliesst ueber den Schliessen-Knopf", async () => {
    const onClose = vi.fn();
    render(<TimeStatsModal categories={categories} monday="2026-08-31" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("zeigt die Kategoriefarbe am Balken", async () => {
    seed("2026-08-31", 1, 4);

    renderModal();

    await waitFor(() => expect(rowsOf(/^Woche/)).toHaveLength(1));
    const section = screen
      .getByRole("heading", { name: /^Woche/ })
      .closest(".time-stats-section") as HTMLElement;
    const fill = section.querySelector(".time-share-fill") as HTMLElement;
    expect(fill.style.backgroundColor).toBe("rgb(255, 0, 0)");
    expect(within(section).getByText("Projekt A")).toBeTruthy();
  });
});
