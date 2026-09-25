import { describe, it, expect } from "vitest";
import {
  matchesTagFilter,
  newTagFilterId,
  parseTagFilter,
  unknownTags,
  type TagFilter,
} from "./tagFilter";

function filter(overrides: Partial<TagFilter> = {}): TagFilter {
  return { id: "f1", name: "Test", match: "all", rules: [], ...overrides };
}

describe("matchesTagFilter", () => {
  it("laesst mit leerer Regelliste alles durch", () => {
    expect(matchesTagFilter([], filter())).toBe(true);
    expect(matchesTagFilter(["a"], filter({ match: "any" }))).toBe(true);
  });

  it("has, lacks und untagged", () => {
    expect(matchesTagFilter(["a"], filter({ rules: [{ kind: "has", tag: "a" }] }))).toBe(true);
    expect(matchesTagFilter(["b"], filter({ rules: [{ kind: "has", tag: "a" }] }))).toBe(false);
    expect(matchesTagFilter(["b"], filter({ rules: [{ kind: "lacks", tag: "a" }] }))).toBe(true);
    expect(matchesTagFilter(["a"], filter({ rules: [{ kind: "lacks", tag: "a" }] }))).toBe(false);
    expect(matchesTagFilter([], filter({ rules: [{ kind: "untagged" }] }))).toBe(true);
    expect(matchesTagFilter(["a"], filter({ rules: [{ kind: "untagged" }] }))).toBe(false);
  });

  it("all verlangt jede Regel, any mindestens eine", () => {
    const rules = [
      { kind: "has", tag: "frontend" },
      { kind: "lacks", tag: "blocked" },
    ] as const;
    const all = filter({ match: "all", rules: [...rules] });
    const any = filter({ match: "any", rules: [...rules] });

    expect(matchesTagFilter(["frontend"], all)).toBe(true);
    expect(matchesTagFilter(["frontend", "blocked"], all)).toBe(false);
    expect(matchesTagFilter(["frontend", "blocked"], any)).toBe(true);
    expect(matchesTagFilter(["blocked"], any)).toBe(false);
  });

  it("ein unbekannter Tag: has trifft nichts, lacks alles", () => {
    expect(matchesTagFilter(["a"], filter({ rules: [{ kind: "has", tag: "weg" }] }))).toBe(false);
    expect(matchesTagFilter(["a"], filter({ rules: [{ kind: "lacks", tag: "weg" }] }))).toBe(true);
  });
});

describe("unknownTags", () => {
  it("nennt die Tags der Regeln, die niemand traegt", () => {
    const f = filter({
      rules: [
        { kind: "has", tag: "da" },
        { kind: "lacks", tag: "weg" },
        { kind: "untagged" },
      ],
    });
    expect(unknownTags(f, ["da"])).toEqual(["weg"]);
  });
});

describe("parseTagFilter", () => {
  it("liest einen gueltigen Filter und normalisiert die Tags", () => {
    expect(
      parseTagFilter({
        id: "x",
        name: " Frontend ",
        match: "any",
        rules: [{ kind: "has", tag: "Front End" }, { kind: "untagged" }],
      })
    ).toEqual({
      id: "x",
      name: "Frontend",
      match: "any",
      rules: [{ kind: "has", tag: "front-end" }, { kind: "untagged" }],
    });
  });

  it("verwirft kaputte Regeln einzeln, den Filter nicht", () => {
    const parsed = parseTagFilter({
      id: "x",
      name: "N",
      match: "all",
      rules: [{ kind: "has", tag: "" }, { kind: "sonstwas" }, null, { kind: "lacks", tag: "b" }],
    });
    expect(parsed?.rules).toEqual([{ kind: "lacks", tag: "b" }]);
  });

  it("verwirft einen Filter, dessen Regeln alle kaputt waren", () => {
    // Er hat einmal eingeschraenkt; als leere Liste liesse er still alles durch.
    expect(
      parseTagFilter({
        id: "x",
        name: "N",
        match: "all",
        rules: [{ kind: "has", tag: "" }, { kind: "sonstwas" }],
      })
    ).toBeNull();
  });

  it("behaelt einen Filter, der schon ohne Regeln gespeichert war", () => {
    expect(parseTagFilter({ id: "x", name: "N", match: "any", rules: [] })?.rules).toEqual([]);
  });

  it("verwirft einen Filter ohne Id, Name oder gueltige Verknuepfung", () => {
    expect(parseTagFilter(null)).toBeNull();
    expect(parseTagFilter({ name: "N", match: "all", rules: [] })).toBeNull();
    expect(parseTagFilter({ id: "x", name: " ", match: "all", rules: [] })).toBeNull();
    expect(parseTagFilter({ id: "x", name: "N", match: "oder", rules: [] })).toBeNull();
    expect(parseTagFilter({ id: "x", name: "N", match: "all" })).toBeNull();
  });
});

describe("newTagFilterId", () => {
  it("liefert verschiedene, nicht leere Ids", () => {
    const a = newTagFilterId();
    const b = newTagFilterId();
    expect(a).not.toBe("");
    expect(a).not.toBe(b);
  });
});
