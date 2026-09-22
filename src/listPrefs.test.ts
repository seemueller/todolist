import { beforeEach, describe, expect, it } from "vitest";
import {
  loadStatusFilter,
  loadTodoModalSize,
  loadTypeFilter,
  saveStatusFilter,
  saveTodoModalSize,
  saveTypeFilter,
  STATUS_FILTER_KEY,
  TODO_MODAL_SIZE_KEY,
  TYPE_FILTER_KEY,
} from "./listPrefs";

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

describe("listPrefs — Fenstergroesse", () => {
  beforeEach(() => localStorage.clear());

  it("liefert ohne gespeicherten Wert null", () => {
    expect(loadTodoModalSize()).toBeNull();
  });

  it("liest zurueck, was geschrieben wurde", () => {
    saveTodoModalSize({ width: 900, height: 600 });
    expect(loadTodoModalSize()).toEqual({ width: 900, height: 600 });
  });

  it("liefert bei kaputtem Inhalt null, statt zu werfen", () => {
    for (const broken of ["{kein json", "null", '"text"', "{}", '{"width":"breit","height":1}']) {
      localStorage.setItem(TODO_MODAL_SIZE_KEY, broken);
      expect(loadTodoModalSize()).toBeNull();
    }
  });

  // Am grossen Monitor gezogen, am Laptop geoeffnet: das Fenster muss auf den
  // Schirm passen, der gespeicherte Wert bleibt aber unangetastet.
  it("begrenzt eine zu grosse Groesse auf den Bildschirm, ohne sie zu ueberschreiben", () => {
    saveTodoModalSize({ width: 4000, height: 3000 });

    const size = loadTodoModalSize();
    expect(size!.width).toBe(window.innerWidth - 32);
    expect(size!.height).toBe(window.innerHeight - 32);
    expect(localStorage.getItem(TODO_MODAL_SIZE_KEY)).toBe('{"width":4000,"height":3000}');
  });

  it("hebt eine unbedienbar kleine Groesse auf das Mindestmass", () => {
    saveTodoModalSize({ width: 40, height: 20 });
    expect(loadTodoModalSize()).toEqual({ width: 360, height: 320 });
  });
});

describe("typeFilter", () => {
  beforeEach(() => localStorage.clear());

  it("faellt ohne gespeicherten Wert auf 'all' zurueck", () => {
    expect(loadTypeFilter()).toBe("all");
  });

  it("liest einen gespeicherten Wert", () => {
    localStorage.setItem(TYPE_FILTER_KEY, "bug");
    expect(loadTypeFilter()).toBe("bug");
  });

  it("faellt bei unbekanntem Wert auf 'all' zurueck", () => {
    localStorage.setItem(TYPE_FILTER_KEY, "epic");
    expect(loadTypeFilter()).toBe("all");
  });

  it("liest zurueck, was geschrieben wurde", () => {
    saveTypeFilter("story");
    expect(localStorage.getItem(TYPE_FILTER_KEY)).toBe("story");
    expect(loadTypeFilter()).toBe("story");
  });
});
