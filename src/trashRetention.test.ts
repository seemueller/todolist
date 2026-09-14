import { describe, it, expect } from "vitest";
import { cutoffFor, TRASH_RETENTION_DAYS } from "./trashRetention";

describe("trashRetention", () => {
  it("hält 30 Tage", () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it("rechnet den Stichtag von einem gegebenen Jetzt zurück", () => {
    const cutoff = cutoffFor(new Date("2026-03-31T12:00:00.000Z"));

    expect(cutoff).toBe("2026-03-01T12:00:00.000Z");
  });
});
