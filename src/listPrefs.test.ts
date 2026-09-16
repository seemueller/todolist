import { beforeEach, describe, expect, it } from "vitest";
import { loadStatusFilter, saveStatusFilter, STATUS_FILTER_KEY } from "./listPrefs";

describe("listPrefs", () => {
  beforeEach(() => localStorage.clear());

  it("faellt ohne gespeicherten Wert auf 'open' zurueck", () => {
    expect(loadStatusFilter()).toBe("open");
  });

  it("faellt bei unbekanntem Wert auf 'open' zurueck", () => {
    localStorage.setItem(STATUS_FILTER_KEY, "quatsch");
    expect(loadStatusFilter()).toBe("open");
  });

  it("liest zurueck, was geschrieben wurde", () => {
    saveStatusFilter("done");
    expect(loadStatusFilter()).toBe("done");
  });

  it("nimmt auch 'all' zurueck", () => {
    saveStatusFilter("all");
    expect(loadStatusFilter()).toBe("all");
  });
});
