import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// Aliased: the jsdom test environment replaces the global `URL` with its own
// implementation, which resolves relative URLs against a fake page origin
// instead of the file system. Importing Node's URL under a distinct name
// sidesteps that shadowing so the relative path below resolves to a real file.
import { URL as NodeURL } from "node:url";

const source = readFileSync(new NodeURL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

function migrationVersions(): number[] {
  return [...source.matchAll(/version:\s*(\d+)/g)].map((m) => Number(m[1]));
}

describe("sql migrations", () => {
  it("numbers migrations consecutively from 1 without duplicates", () => {
    const versions = migrationVersions();
    expect(versions).toEqual(versions.map((_, i) => i + 1));
  });

  it("creates the tables the time tracking needs", () => {
    expect(source).toContain("CREATE TABLE IF NOT EXISTS time_slots");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS time_settings");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS app_settings");
  });

  it("gives todos a status column", () => {
    expect(source).toContain("ALTER TABLE todos ADD COLUMN status");
  });
});
