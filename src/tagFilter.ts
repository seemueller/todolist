// Benannte Tag-Filter: eine flache Liste von Regeln, verknuepft mit "alle"
// oder "mindestens eine". Rein -- kein React, kein Store, kein localStorage;
// gespeichert wird ueber listPrefs.ts.

import { normalizeTag } from "./types";

export type TagRule =
  | { kind: "has"; tag: string }
  | { kind: "lacks"; tag: string }
  | { kind: "untagged" };

export type TagMatch = "all" | "any";

export interface TagFilter {
  id: string;
  name: string;
  match: TagMatch;
  rules: TagRule[];
}

function matchesRule(tags: readonly string[], rule: TagRule): boolean {
  switch (rule.kind) {
    case "has":
      return tags.includes(rule.tag);
    case "lacks":
      return !tags.includes(rule.tag);
    case "untagged":
      return tags.length === 0;
  }
}

/**
 * Ob eine Aufgabe mit diesen Tags durch den Filter kommt. Eine leere
 * Regelliste laesst alles durch -- auch bei "any", wo `some` auf einer leeren
 * Liste sonst nichts durchliesse.
 */
export function matchesTagFilter(tags: readonly string[], filter: TagFilter): boolean {
  if (filter.rules.length === 0) return true;
  return filter.match === "all"
    ? filter.rules.every((rule) => matchesRule(tags, rule))
    : filter.rules.some((rule) => matchesRule(tags, rule));
}

/** Tags, auf die eine Regel zeigt, die aber keine Aufgabe traegt. Der Editor
 *  markiert sie; geloescht werden sie nicht, der Tag kann wiederkommen. */
export function unknownTags(filter: TagFilter, known: readonly string[]): string[] {
  const unknown: string[] = [];
  for (const rule of filter.rules) {
    if (rule.kind !== "untagged" && !known.includes(rule.tag)) unknown.push(rule.tag);
  }
  return unknown;
}

/**
 * Eine Id fuer einen neuen Filter. Kein `crypto.randomUUID`: das verlangt
 * einen sicheren Kontext, und darauf soll sich die Webview nicht verlassen
 * muessen. Eindeutig genug fuer eine Handvoll Filter eines Menschen.
 */
export function newTagFilterId(): string {
  return `tf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseTagRule(value: unknown): TagRule | null {
  if (typeof value !== "object" || value === null) return null;
  const { kind, tag } = value as Record<string, unknown>;
  if (kind === "untagged") return { kind: "untagged" };
  if (kind !== "has" && kind !== "lacks") return null;
  if (typeof tag !== "string") return null;
  const normalized = normalizeTag(tag);
  return normalized === null ? null : { kind, tag: normalized };
}

/**
 * Liest einen Filter aus einer unzuverlaessigen Quelle (localStorage).
 * `null`, wenn Id, Name, Verknuepfung oder Regelliste fehlen; einzelne
 * kaputte Regeln fallen weg, der Rest des Filters bleibt.
 *
 * Fallen dabei *alle* Regeln weg, ist der Filter ebenfalls `null`: er hat
 * einmal eingeschraenkt, und als leere Liste liesse er still alles durch.
 * Eine schon leer gespeicherte Regelliste bleibt gueltig.
 */
export function parseTagFilter(value: unknown): TagFilter | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, name, match, rules } = value as Record<string, unknown>;
  if (typeof id !== "string" || id === "") return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (match !== "all" && match !== "any") return null;
  if (!Array.isArray(rules)) return null;
  const parsed = rules.map(parseTagRule).filter((rule): rule is TagRule => rule !== null);
  if (rules.length > 0 && parsed.length === 0) return null;
  return { id, name: name.trim(), match, rules: parsed };
}
