import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimeTrackingView } from "./TimeTrackingView";
import type { Category } from "./types";
import {
  applyPaint,
  formatDayLabel,
  setBlockNote,
  startOfWeek,
  toDateKey,
  weekDays,
  type DaySlot,
} from "./timeSlots";

// timeDb wird gegen einen In-Memory-Stand ersetzt, damit die View ohne
// localStorage geprueft wird. Die Fachlogik bleibt echt (timeSlots), nur der
// Speicher ist ausgetauscht.
const store = new Map<string, DaySlot[]>();
let settings = { targetSlotsPerDay: 32, showWeekend: false };

vi.mock("./timeDb", () => ({
  DEFAULT_SETTINGS: { targetSlotsPerDay: 32, showWeekend: false },
  getSettings: () => Promise.resolve(settings),
  saveSettings: (next: typeof settings) => {
    settings = { ...next };
    return Promise.resolve(settings);
  },
  listSlots: (date: string) => Promise.resolve(store.get(date) ?? []),
  saveDay: (date: string, slots: DaySlot[]) => {
    store.set(date, slots);
    return Promise.resolve(slots);
  },
  paintSlots: (date: string, indices: number[], categoryId: number | null) => {
    const next = applyPaint(store.get(date) ?? [], indices, categoryId);
    store.set(date, next);
    return Promise.resolve(next);
  },
  setBlockNote: (date: string, slot: number, note: string) => {
    const next = setBlockNote(store.get(date) ?? [], slot, note);
    store.set(date, next);
    return Promise.resolve(next);
  },
  clearBlock: (date: string, startSlot: number, endSlot: number) => {
    const indices: number[] = [];
    for (let s = startSlot; s < endSlot; s++) indices.push(s);
    const next = applyPaint(store.get(date) ?? [], indices, null);
    store.set(date, next);
    return Promise.resolve(next);
  },
}));

// Pro Test umschaltbar: ausserhalb von Tauri darf sich die Ansicht gar nicht
// erst auf Ereignisse anmelden -- darauf baut die Playwright-Suite im Browser.
let insideTauri = true;
vi.mock("./sqlClient", () => ({
  isTauri: () => insideTauri,
  getDb: () => Promise.reject(new Error("in Tests nicht verfuegbar")),
}));

type EventHandler = (event: { payload: unknown }) => void;
const handlers = new Map<string, EventHandler[]>();
const unlistenMock = vi.fn();
const listenMock = vi.fn((name: string, handler: EventHandler) => {
  handlers.set(name, [...(handlers.get(name) ?? []), handler]);
  return Promise.resolve(unlistenMock);
});
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: EventHandler) => listenMock(name, handler),
}));

/** Feuert ein Backend-Ereignis auf allen angemeldeten Zuhoerern. */
function emit(name: string) {
  for (const handler of handlers.get(name) ?? []) handler({ payload: null });
}

const categories: Category[] = [
  { id: 7, name: "Alpha", color: "#7cc3f7", created_at: "2026-09-01T08:00:00.000Z" },
  { id: 9, name: "Daily", color: "#ffd43b", created_at: "2026-09-01T08:00:00.000Z" },
];

// Die View zeigt immer die laufende Woche. Die erwarteten Beschriftungen werden
// darum aus denselben Hilfen abgeleitet, die auch die View nutzt.
const monday = startOfWeek(toDateKey(new Date()));
const days = weekDays(monday);
const [MO, DI] = days;
const SA = weekDays(monday, true)[5];

/** Zell- und Blockbeschriftung eines Tages, z. B. "Mo 31.08. 09:00, frei". */
function at(day: string, rest: string): string {
  return `${formatDayLabel(day)} ${rest}`;
}

function renderView(props: Partial<Parameters<typeof TimeTrackingView>[0]> = {}) {
  return render(
    <TimeTrackingView
      categories={categories}
      onManageCategories={props.onManageCategories ?? (() => {})}
      {...props}
    />
  );
}

/** Dauern der Blockliste, in Reihenfolge. */
function blockDurations(): string[] {
  return [...document.querySelectorAll(".time-block-duration")].map((el) => el.textContent ?? "");
}

/** Die Tagessummen unter dem Raster, Montag bis Freitag. */
function daySums(): string[] {
  return [...document.querySelectorAll(".time-day-sum")].map((el) => el.textContent ?? "");
}

/** Die Wochensumme aus der Kopfzeile. */
function weekTotal(): string {
  return document.querySelector(".time-total strong")?.textContent ?? "";
}

/** Soll je Tag und Soll der Woche stehen im Popup, die Differenz in der Kopfzeile. */
function target(): { perDay: string; week: string; difference: string } {
  return {
    perDay: document.querySelector(".time-target-value")?.textContent ?? "",
    week: document.querySelector(".time-setting-hint strong")?.textContent ?? "",
    difference: document.querySelector(".time-difference")?.textContent ?? "",
  };
}

/** Oeffnet das Einstellungs-Popup. */
function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Einstellungen der Zeiterfassung" }));
}

/** Malt eine Zelle so, wie es ein Zeiger tut: pointerdown, dann loslassen. */
function paintCell(label: string) {
  const cell = screen.getByRole("button", { name: label });
  fireEvent.pointerDown(cell);
  fireEvent.pointerUp(window);
  return cell;
}

describe("TimeTrackingView", () => {
  beforeEach(() => {
    store.clear();
    settings = { targetSlotsPerDay: 32, showWeekend: false };
    vi.clearAllMocks();
    handlers.clear();
    insideTauri = true;
  });

  it("zeigt fuenf Arbeitstage von 6 bis 22 Uhr", async () => {
    renderView();
    await screen.findByRole("button", { name: at(MO, "06:00, frei") });

    for (const day of days) {
      expect(screen.getByRole("button", { name: at(day, "06:00, frei") })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: at(day, "22:45, frei") })).toBeInTheDocument();
    }
    expect(document.querySelectorAll(".time-cell")).toHaveLength(17 * 4 * 5);
    expect(screen.queryByRole("button", { name: at(MO, "05:45, frei") })).not.toBeInTheDocument();
  });

  it("bucht eine Viertelstunde mit dem aktiven Pinsel", async () => {
    renderView();
    paintCell(at(MO, "09:00, frei"));

    expect(await screen.findByRole("button", { name: at(MO, "09:00, Alpha") })).toBeInTheDocument();
    expect(screen.getByText("09:00–09:15")).toBeInTheDocument();
    expect(blockDurations()).toEqual(["0:15"]);
    expect(weekTotal()).toBe("0:15");
  });

  it("bucht mit dem gewechselten Pinsel", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Pinsel Daily" }));
    paintCell(at(MO, "09:00, frei"));

    expect(await screen.findByRole("button", { name: at(MO, "09:00, Daily") })).toBeInTheDocument();
  });

  it("leert eine Zelle beim zweiten Klick mit demselben Pinsel", async () => {
    renderView();
    paintCell(at(MO, "09:00, frei"));
    await screen.findByRole("button", { name: at(MO, "09:00, Alpha") });

    paintCell(at(MO, "09:00, Alpha"));
    expect(await screen.findByRole("button", { name: at(MO, "09:00, frei") })).toBeInTheDocument();
  });

  it("bucht den ganzen Bereich, auch wenn Zellen uebersprungen werden", async () => {
    renderView();
    fireEvent.pointerDown(screen.getByRole("button", { name: at(MO, "09:00, frei") }));
    // Schnelle Maus: nur die Zielzelle meldet pointerenter.
    fireEvent.pointerEnter(screen.getByRole("button", { name: at(MO, "10:00, frei") }));
    fireEvent.pointerUp(window);

    expect(await screen.findByText("09:00–10:15")).toBeInTheDocument();
    expect(blockDurations()).toEqual(["1:15"]);
  });

  it("bucht auch rueckwaerts gezogen den Bereich", async () => {
    renderView();
    fireEvent.pointerDown(screen.getByRole("button", { name: at(MO, "10:00, frei") }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: at(MO, "09:30, frei") }));
    fireEvent.pointerUp(window);

    expect(await screen.findByText("09:30–10:15")).toBeInTheDocument();
  });

  it("nimmt Buchungen wieder weg, wenn der Zug zurueckgezogen wird", async () => {
    renderView();
    fireEvent.pointerDown(screen.getByRole("button", { name: at(MO, "09:00, frei") }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: at(MO, "10:00, frei") }));
    await screen.findByRole("button", { name: at(MO, "10:00, Alpha") });

    fireEvent.pointerEnter(screen.getByRole("button", { name: at(MO, "09:15, Alpha") }));
    fireEvent.pointerUp(window);

    expect(await screen.findByText("09:00–09:30")).toBeInTheDocument();
    expect(blockDurations()).toEqual(["0:30"]);
    expect(screen.getByRole("button", { name: at(MO, "10:00, frei") })).toBeInTheDocument();
  });

  it("malt nicht ueber die Tagesgrenze hinweg", async () => {
    renderView();
    fireEvent.pointerDown(screen.getByRole("button", { name: at(MO, "09:00, frei") }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: at(DI, "09:00, frei") }));
    fireEvent.pointerUp(window);

    expect(await screen.findByRole("button", { name: at(MO, "09:00, Alpha") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: at(DI, "09:00, frei") })).toBeInTheDocument();
    expect(blockDurations()).toEqual(["0:15"]);
  });

  it("malt nach dem Loslassen nicht weiter", async () => {
    renderView();
    paintCell(at(MO, "09:00, frei"));
    await screen.findByRole("button", { name: at(MO, "09:00, Alpha") });

    fireEvent.pointerEnter(screen.getByRole("button", { name: at(MO, "09:15, frei") }));
    expect(screen.getByRole("button", { name: at(MO, "09:15, frei") })).toBeInTheDocument();
  });

  it("summiert je Tag, je Kategorie und fuer die Woche", async () => {
    renderView();
    paintCell(at(MO, "09:00, frei"));
    await screen.findByRole("button", { name: at(MO, "09:00, Alpha") });
    fireEvent.click(screen.getByRole("button", { name: "Pinsel Daily" }));
    paintCell(at(DI, "11:00, frei"));
    await screen.findByRole("button", { name: at(DI, "11:00, Daily") });

    expect(weekTotal()).toBe("0:30");
    expect(daySums()).toEqual(["0:15", "0:15", "0:00", "0:00", "0:00"]);
    expect(screen.getByText("= 0:30")).toBeInTheDocument();
  });

  it("gruppiert die Blockliste nach Tag", async () => {
    renderView();
    paintCell(at(MO, "09:00, frei"));
    await screen.findByRole("button", { name: at(MO, "09:00, Alpha") });
    paintCell(at(DI, "14:00, frei"));
    await screen.findByRole("button", { name: at(DI, "14:00, Alpha") });

    const groups = [...document.querySelectorAll(".time-block-day")].map(
      (el) => el.textContent ?? ""
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]).toContain(formatDayLabel(MO));
    expect(groups[1]).toContain(formatDayLabel(DI));
  });

  it("speichert eine Notiz am Block", async () => {
    renderView();
    paintCell(at(MO, "09:00, frei"));
    const note = await screen.findByRole("textbox", { name: `Notiz für ${at(MO, "09:00")}` });

    fireEvent.change(note, { target: { value: "Refactoring" } });
    fireEvent.blur(note);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: `Notiz für ${at(MO, "09:00")}` })
      ).toHaveValue("Refactoring");
    });
  });

  it("loescht einen ganzen Block", async () => {
    renderView();
    fireEvent.pointerDown(screen.getByRole("button", { name: at(MO, "09:00, frei") }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: at(MO, "09:15, frei") }));
    fireEvent.pointerUp(window);
    await screen.findByRole("button", { name: at(MO, "09:15, Alpha") });

    fireEvent.click(screen.getByRole("button", { name: `Block ${at(MO, "09:00")} löschen` }));

    expect(await screen.findByRole("button", { name: at(MO, "09:00, frei") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: at(MO, "09:15, frei") })).toBeInTheDocument();
  });

  it("blaettert Wochen und laedt die Buchungen der jeweiligen Woche", async () => {
    renderView();
    paintCell(at(MO, "09:00, frei"));
    await screen.findByRole("button", { name: at(MO, "09:00, Alpha") });

    fireEvent.click(screen.getByRole("button", { name: "Nächste Woche" }));
    await waitFor(() => expect(weekTotal()).toBe("0:00"));
    expect(screen.queryByRole("button", { name: at(MO, "09:00, Alpha") })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vorherige Woche" }));
    expect(await screen.findByRole("button", { name: at(MO, "09:00, Alpha") })).toBeInTheDocument();
  });

  it("zeigt die Differenz in der Kopfzeile und das Soll im Popup", async () => {
    renderView();
    await waitFor(() => expect(target().difference).toBe("-40:00"));
    expect(document.querySelector(".time-difference")?.className).toContain("behind");

    // Ohne Popup ist von den Einstellungen nichts zu sehen.
    expect(document.querySelector(".time-target-value")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Woche als CSV exportieren" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wochenende anzeigen" })).not.toBeInTheDocument();

    openSettings();

    expect(target().perDay).toBe("8:00");
    expect(target().week).toBe("40:00");
    expect(screen.getByRole("button", { name: "Woche als CSV exportieren" })).toBeInTheDocument();
  });

  it("schliesst das Popup ueber den Schliessen-Knopf", async () => {
    renderView();
    await waitFor(() => expect(target().difference).toBe("-40:00"));
    openSettings();
    expect(document.querySelector(".time-target-value")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    expect(document.querySelector(".time-target-value")).toBeNull();
  });

  it("verstellt die Sollzeit in Viertelstunden-Schritten und rechnet neu", async () => {
    renderView();
    await waitFor(() => expect(target().difference).toBe("-40:00"));
    openSettings();

    fireEvent.click(
      screen.getByRole("button", { name: "Sollzeit je Tag um 15 Minuten verringern" })
    );
    await waitFor(() => expect(target().perDay).toBe("7:45"));
    expect(target().week).toBe("38:45");

    fireEvent.click(screen.getByRole("button", { name: "Sollzeit je Tag um 15 Minuten erhöhen" }));
    await waitFor(() => expect(target().perDay).toBe("8:00"));
  });

  it("zeigt eine positive Differenz, sobald das Soll erreicht ist", async () => {
    // Das Soll kommt aus den Einstellungen, statt es mit 32 Klicks auf null zu
    // drehen: jeder Klick war ein eigener Speicher-Umlauf, und die Summe davon
    // hat den Test regelmaessig in seine Zeitgrenze laufen lassen -- zuletzt in
    // der CI. Den Verringern-Knopf deckt "verstellt die Sollzeit in
    // Viertelstunden-Schritten" ab; hier geht es allein um die Anzeige der
    // positiven Differenz.
    settings = { targetSlotsPerDay: 0, showWeekend: false };
    renderView();
    await waitFor(() => expect(target().difference).toBe("0:00"));

    paintCell(at(MO, "09:00, frei"));

    await waitFor(() => expect(target().difference).toBe("+0:15"));
    expect(document.querySelector(".time-difference")?.className).toContain("ahead");
  });

  it("kann die Sollzeit nicht unter null drehen", async () => {
    settings = { targetSlotsPerDay: 0, showWeekend: false };
    renderView();
    await waitFor(() => expect(target().difference).toBe("0:00"));
    openSettings();
    expect(target().perDay).toBe("0:00");

    expect(
      screen.getByRole("button", { name: "Sollzeit je Tag um 15 Minuten verringern" })
    ).toBeDisabled();
  });

  it("schaltet das Wochenende zu und wieder ab", async () => {
    renderView();
    await screen.findByRole("button", { name: at(MO, "09:00, frei") });
    expect(document.querySelectorAll(".time-day-label")).toHaveLength(5);

    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Wochenende anzeigen" }));

    expect(await screen.findByRole("button", { name: at(SA, "09:00, frei") })).toBeInTheDocument();
    expect(document.querySelectorAll(".time-day-label")).toHaveLength(7);
    expect(document.querySelectorAll(".time-cell.weekend")).toHaveLength(17 * 4 * 2);

    fireEvent.click(screen.getByRole("button", { name: "Wochenende anzeigen" }));
    await waitFor(() => expect(document.querySelectorAll(".time-day-label")).toHaveLength(5));
  });

  it("laesst das Soll unveraendert, wenn das Wochenende sichtbar ist", async () => {
    settings = { targetSlotsPerDay: 32, showWeekend: true };
    renderView();
    await waitFor(() => expect(document.querySelectorAll(".time-day-label")).toHaveLength(7));

    openSettings();
    expect(target().week).toBe("40:00");
  });

  it("bucht auch am Wochenende, wenn es sichtbar ist", async () => {
    settings = { targetSlotsPerDay: 32, showWeekend: true };
    renderView();
    await screen.findByRole("button", { name: at(SA, "09:00, frei") });

    paintCell(at(SA, "09:00, frei"));

    expect(await screen.findByRole("button", { name: at(SA, "09:00, Alpha") })).toBeInTheDocument();
    await waitFor(() => expect(weekTotal()).toBe("0:15"));
  });

  it("exportiert die Woche als CSV", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:zeit");
    const revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    renderView();
    paintCell(at(MO, "09:00, frei"));
    await screen.findByRole("button", { name: at(MO, "09:00, Alpha") });

    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Woche als CSV exportieren" }));

    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:zeit");
    // jsdom liefert Blob ohne text(); der FileReader ist der Weg an den Inhalt.
    const blob = createObjectURL.mock.calls[0][0];
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toContain("Datum;Von;Bis;Dauer;Minuten;Kategorie;Notiz");
    expect(text).toContain(`${MO};09:00;09:15;0:15;15;Alpha;`);
    click.mockRestore();
  });

  it("zeigt ohne Kategorien den Leerzustand statt des Rasters", () => {
    const onManageCategories = vi.fn();
    renderView({ categories: [], onManageCategories });

    expect(document.querySelectorAll(".time-cell")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Kategorien verwalten" }));
    expect(onManageCategories).toHaveBeenCalled();
  });

  describe("Nachladen, wenn der MCP-Server schreibt", () => {
    it("meldet sich beim Mount auf todolist:data-changed an", async () => {
      renderView();
      await screen.findByRole("button", { name: at(MO, "06:00, frei") });

      expect(listenMock).toHaveBeenCalledWith("todolist:data-changed", expect.any(Function));
    });

    it("laedt die Woche neu, sobald das Ereignis feuert", async () => {
      renderView();
      await screen.findByRole("button", { name: at(MO, "09:00, frei") });

      // Was der MCP-Server geschrieben haette: eine Viertelstunde, die die
      // Ansicht beim Mount noch nicht gesehen hat.
      store.set(MO, [{ slot: 36, category_id: 7, note: "" }]);
      await act(async () => {
        emit("todolist:data-changed");
      });

      expect(await screen.findByRole("button", { name: at(MO, "09:00, Alpha") })).toBeInTheDocument();
      expect(weekTotal()).toBe("0:15");
    });

    it("meldet sich beim Unmount wieder ab", async () => {
      const { unmount } = renderView();
      await screen.findByRole("button", { name: at(MO, "06:00, frei") });

      unmount();

      await waitFor(() => expect(unlistenMock).toHaveBeenCalled());
    });

    it("meldet sich ausserhalb von Tauri gar nicht erst an", async () => {
      insideTauri = false;
      renderView();
      await screen.findByRole("button", { name: at(MO, "06:00, frei") });

      expect(listenMock).not.toHaveBeenCalled();
    });
  });
});
