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

  it("gives todos a description column", () => {
    expect(source).toContain("ALTER TABLE todos ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  });

  it("adds the deleted_at column the trash needs", () => {
    expect(source).toContain("add_deleted_at_to_todos");
    expect(source).toContain("ALTER TABLE todos ADD COLUMN deleted_at TEXT DEFAULT NULL;");
  });

  it("gives categories a time_kind column defaulting to internal", () => {
    expect(source).toContain("add_time_kind_to_categories");
    expect(source).toContain(
      "ALTER TABLE categories ADD COLUMN time_kind TEXT NOT NULL DEFAULT 'internal';"
    );
  });

  it("gives todos a board_order column defaulting to zero", () => {
    expect(source).toContain("add_board_order_to_todos");
    expect(source).toContain(
      "ALTER TABLE todos ADD COLUMN board_order REAL NOT NULL DEFAULT 0;"
    );
  });

  it("gives todos a type column defaulting to task", () => {
    expect(source).toContain("add_type_to_todos");
    expect(source).toContain("ALTER TABLE todos ADD COLUMN type TEXT NOT NULL DEFAULT 'task';");
  });

  it("gives categories a name_key column with a unique index (dedup backstop)", () => {
    expect(source).toContain("add_name_key_to_categories");
    expect(source).toContain("ALTER TABLE categories ADD COLUMN name_key TEXT;");
    expect(source).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_key ON categories(name_key);"
    );
  });

  it("adds the todo_tags table with a cascading foreign key", () => {
    expect(source).toContain("add_todo_tags");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS todo_tags");
    expect(source).toContain("REFERENCES todos(id) ON DELETE CASCADE");
  });
});
