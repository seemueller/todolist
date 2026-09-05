import { describe, it, expect, beforeEach } from "vitest";
import { localTimeStore } from "./timeStoreLocal";
import { DEFAULT_SETTINGS } from "./timeTypes";

describe("localTimeStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("liefert die Vorgabe, wenn noch keine Einstellungen gespeichert sind", async () => {
    const settings = await localTimeStore.getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("kappt ein absurdes Ziel beim Speichern der Einstellungen", async () => {
    const saved = await localTimeStore.saveSettings({
      targetSlotsPerDay: 999,
      showWeekend: true,
    });
    expect(saved.targetSlotsPerDay).toBe(64);
    expect(saved.showWeekend).toBe(true);

    const reloaded = await localTimeStore.getSettings();
    expect(reloaded.targetSlotsPerDay).toBe(64);
  });

  it("faellt bei einem nicht endlichen Ziel auf die Vorgabe zurueck", async () => {
    const saved = await localTimeStore.saveSettings({
      targetSlotsPerDay: NaN,
      showWeekend: false,
    });
    expect(saved.targetSlotsPerDay).toBe(DEFAULT_SETTINGS.targetSlotsPerDay);
  });

  it("schreibt einen Tag und liest ihn sortiert nach Slot zurueck", async () => {
    await localTimeStore.saveDay("2026-09-03", [
      { slot: 40, category_id: 1, note: "" },
      { slot: 33, category_id: 1, note: "" },
      { slot: 36, category_id: 2, note: "" },
    ]);

    const slots = await localTimeStore.listSlots("2026-09-03");
    expect(slots.map((s) => s.slot)).toEqual([33, 36, 40]);
  });

  it("ersetzt den Tagesstand statt anzuhaengen", async () => {
    await localTimeStore.saveDay("2026-09-03", [{ slot: 33, category_id: 1, note: "" }]);
    await localTimeStore.saveDay("2026-09-03", [{ slot: 40, category_id: 2, note: "" }]);

    const slots = await localTimeStore.listSlots("2026-09-03");
    expect(slots).toEqual([{ slot: 40, category_id: 2, note: "" }]);
  });

  it("laesst Buchungen anderer Tage beim Ersetzen unangetastet", async () => {
    await localTimeStore.saveDay("2026-09-02", [{ slot: 10, category_id: 1, note: "" }]);
    await localTimeStore.saveDay("2026-09-03", [{ slot: 20, category_id: 2, note: "" }]);

    const day1 = await localTimeStore.listSlots("2026-09-02");
    expect(day1).toEqual([{ slot: 10, category_id: 1, note: "" }]);
  });

  it("leert einen ganzen Block mit clearBlock", async () => {
    await localTimeStore.saveDay("2026-09-03", [
      { slot: 32, category_id: 1, note: "" },
      { slot: 33, category_id: 1, note: "" },
      { slot: 34, category_id: 1, note: "" },
      { slot: 40, category_id: 1, note: "" },
    ]);

    await localTimeStore.clearBlock("2026-09-03", 32, 35);

    const slots = await localTimeStore.listSlots("2026-09-03");
    expect(slots.map((s) => s.slot)).toEqual([40]);
  });
});
