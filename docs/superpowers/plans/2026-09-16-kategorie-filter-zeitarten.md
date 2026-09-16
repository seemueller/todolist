# Kategorie-Filter, Offen-Voreinstellung und Zeitarten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Brett bekommt einen Kategorie-Filter, die Liste startet auf „Offen" und merkt sich die Wahl, und die Kategorie trägt eine Zeitart (`none`/`internal`/`external`), auf die Zeitansicht und CSV-Export aufsetzen.

**Architecture:** Das Feld `time_kind` wandert durch die bestehende Schichtung: Migration in `src-tauri/src/lib.rs`, Typ in `src/types.ts`, Vertrag in `src/storeTypes.ts`, zwei Implementierungen (`todoStoreSql.ts`, `todoStoreLocal.ts`), Anzeige in `App.tsx` und `TimeTrackingView.tsx`. Die Filteränderungen an Brett und Liste sind reiner React-State in `App.tsx` ohne Speicheranbindung — bis auf die Listen-Vorliebe, die in `localStorage` liegt.

**Tech Stack:** React 19, TypeScript, Tauri 2 mit `tauri-plugin-sql` (SQLite), Vitest + Testing Library, Playwright, Rust (`src-tauri`).

**Spec:** `docs/superpowers/specs/2026-09-16-kategorie-filter-zeitarten-design.md`

**Branch:** `feat/kategorie-zeitarten`

---

## Vorbemerkungen für den Umsetzenden

- **`STYLEGUIDE.md` vor jeder UI-Änderung lesen** (Tasks 7–9, 11). Keine Emoji, keine Verläufe, Farben nur als Token, neue UI aus den Bausteinen unter `src/ui/`.
- **Die Doc-Kommentare in `src/storeTypes.ts` sind der verbindliche Vertrag.** Wer eine Store-Funktion ändert, ändert sie in *beiden* Implementierungen.
- **Reihenfolge einhalten.** Tasks 1–6 legen Typ und Speicher, 7–9 die Oberfläche, 10–12 die Zeitseite. Task 13 schließt ab.
- Nach jedem Task committen. Commit-Nachrichten auf Deutsch oder Englisch, wie im Repo üblich (`feat:`, `test:`, `docs:`).
- Testlauf eines einzelnen Files: `npx vitest run src/types.test.ts`.

---

## File Structure

| Datei | Verantwortung | Änderung |
|-------|---------------|----------|
| `src/types.ts` | `TimeKind`, `Category.time_kind`, `fromCategoryRow`-Fallback | ändern |
| `src-tauri/src/lib.rs` | Migration 12 | ändern |
| `src/migrations.test.ts` | bewacht die Migrationsliste | ändern |
| `src/storeTypes.ts` | Vertrag `addCategory`/`updateCategory` | ändern |
| `src/todoStoreSql.ts` | SQLite-Umsetzung | ändern |
| `src/todoStoreLocal.ts` | localStorage-Umsetzung | ändern |
| `src/db.ts` | Dispatcher-Signaturen | ändern |
| `src-tauri/src/mcp/store.rs` | Category-Struct für `list_categories` | ändern |
| `src/ui/TimeKindSelect.tsx` | Segment-Control für die drei Zeitarten | **neu** |
| `src/ui/index.ts` | Export des neuen Bausteins | ändern |
| `src/App.tsx` | Kategorien-Modal, Brett-Chips, Listen-Voreinstellung | ändern |
| `src/App.css` | Klassen für Brett-Chipleiste und Zeitart-Control | ändern |
| `src/listPrefs.ts` | Lesen/Schreiben der Listen-Vorliebe in `localStorage` | **neu** |
| `src/timeSlots.ts` | `splitByWorkTime` | ändern |
| `src/timeCsv.ts` | Spalte „Art" | ändern |
| `src/TimeTrackingView.tsx` | Soll-Vergleich nur Arbeitszeit | ändern |
| `STYLEGUIDE.md`, `AGENTS.md`, `CHANGELOG.md` | Dokumentation | ändern |

`src/ui/TimeKindSelect.tsx` entsteht als eigener Baustein, weil das Control an zwei Stellen gebraucht wird — in der Liste je bestehender Kategorie und im Anlege-Formular darüber. `src/listPrefs.ts` ist eine eigene Datei, damit `App.tsx` nicht noch ein weiteres Thema trägt und die Vorliebe ohne React-Umgebung testbar bleibt.

---

### Task 1: `TimeKind` im Typ

**Files:**
- Modify: `src/types.ts`
- Test: `src/types.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/types.test.ts` anhängen:

```ts
describe("fromCategoryRow", () => {
  const row = { id: 1, name: "Arbeit", color: "#7cc3f7", created_at: "2026-09-16T08:00:00.000Z" };

  it("nimmt time_kind aus der Zeile", () => {
    expect(fromCategoryRow({ ...row, time_kind: "external" }).time_kind).toBe("external");
  });

  it("faellt auf internal zurueck, wenn die Spalte fehlt", () => {
    expect(fromCategoryRow(row).time_kind).toBe("internal");
  });

  it("faellt auf internal zurueck, wenn der Wert unbekannt ist", () => {
    expect(fromCategoryRow({ ...row, time_kind: "quatsch" as never }).time_kind).toBe("internal");
  });
});
```

`fromCategoryRow` muss im Import oben in der Datei stehen.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types.test.ts`
Expected: FAIL — `time_kind` existiert nicht auf `Category`, TypeScript meckert.

- [ ] **Step 3: Write minimal implementation**

In `src/types.ts`:

```ts
/**
 * Was eine Kategorie fuer die Zeiterfassung bedeutet.
 *
 * "none" ist keine Arbeitszeit (Pause, Privat) und zaehlt nie gegen das Soll;
 * "internal" und "external" sind beide Arbeitszeit und trennen nur, wie sie
 * gebucht wird. Ein Feld statt zweier Flags, damit es die Kombination
 * "keine Arbeitszeit, extern abgerechnet" gar nicht erst gibt.
 */
export type TimeKind = "none" | "internal" | "external";

export const TIME_KINDS: TimeKind[] = ["none", "internal", "external"];

export const TIME_KIND_LABELS: Record<TimeKind, string> = {
  none: "Keine",
  internal: "Intern",
  external: "Extern",
};

export function toTimeKind(value: string | null | undefined): TimeKind {
  return value === "none" || value === "external" ? value : "internal";
}
```

`Category` bekommt `time_kind: TimeKind;`, `CategoryRow` bekommt `time_kind?: string;` (optional und breit getypt, weil der localStorage-Speicher Einträge aus der Zeit vor der Spalte liefert). `fromCategoryRow` setzt `time_kind: toTimeKind(row.time_kind)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "feat: give categories a time kind"
```

---

### Task 2: Migration 12

**Files:**
- Modify: `src-tauri/src/lib.rs` (Migrationsliste, nach Version 11)
- Test: `src/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

`src/migrations.test.ts` liest `src-tauri/src/lib.rs` und prüft die Liste. Den bestehenden Erwartungswerten den neuen Eintrag anhängen — dem vorhandenen Muster folgen, also Version `12` mit Beschreibung `add_time_kind_to_categories`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/migrations.test.ts`
Expected: FAIL — Migration 12 fehlt in `lib.rs`.

- [ ] **Step 3: Write minimal implementation**

In `src-tauri/src/lib.rs` hinter Migration 11 einfügen:

```rust
// Bestehende Kategorien werden Arbeitszeit: das trifft die grosse Mehrheit,
// und wer eine Kategorie anders eingestuft haben will, stellt sie einmal im
// Kategorien-Fenster um. Bewusst kein Rateversuch anhand des Namens.
Migration {
    version: 12,
    description: "add_time_kind_to_categories",
    sql: "ALTER TABLE categories ADD COLUMN time_kind TEXT NOT NULL DEFAULT 'internal';",
    kind: MigrationKind::Up,
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/migrations.test.ts && npm run test:rust`
Expected: beide PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src/migrations.test.ts
git commit -m "feat: add the time_kind column to categories"
```

---

### Task 3: Vertrag in `storeTypes.ts` und Dispatcher

**Files:**
- Modify: `src/storeTypes.ts`, `src/db.ts`

- [ ] **Step 1: Vertrag anpassen**

In `src/storeTypes.ts` die beiden Signaturen erweitern und die Doc-Kommentare mitziehen — sie sind der verbindliche Vertrag, eine stille Signaturänderung ohne Kommentar ist hier ein Fehler:

```ts
  /**
   * Legt eine Kategorie an ... (bestehenden Text behalten)
   *
   * `timeKind` entscheidet, ob gebuchte Zeit dieser Kategorie als Arbeitszeit
   * gegen das Soll zaehlt und wie sie gebucht wird; ohne Angabe "internal".
   */
  addCategory(name: string, color: string, timeKind?: TimeKind): Promise<Category>;

  /** ... (bestehenden Text behalten) `timeKind` wie bei `addCategory`. */
  updateCategory(id: number, name: string, color: string, timeKind?: TimeKind): Promise<Category>;
```

`TimeKind` aus `./types` importieren. Der Parameter ist optional, damit bestehende Aufrufer (Tests, MCP-Pfad) unverändert übersetzen und den Vorgabewert bekommen.

- [ ] **Step 2: Dispatcher anpassen**

In `src/db.ts` die beiden weiterreichenden Funktionen um denselben Parameter erweitern.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: Fehler nur noch in den beiden Store-Implementierungen (Tasks 4 und 5) — die kommen als Nächstes.

- [ ] **Step 4: Commit**

```bash
git add src/storeTypes.ts src/db.ts
git commit -m "feat: carry the time kind through the store contract"
```

---

### Task 4: SQLite-Store

**Files:**
- Modify: `src/todoStoreSql.ts`
- Test: `src/todoStoreSql.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/todoStoreSql.test.ts`, im bestehenden Kategorien-Block und mit dem dort schon verwendeten `sqlClient`-Mock:

```ts
it("schreibt time_kind beim Anlegen", async () => {
  await addCategory("Kunde X", "#7cc3f7", "external");
  const [sql, params] = execute.mock.calls[0];
  expect(sql).toContain("time_kind");
  expect(params).toContain("external");
});

it("legt ohne Angabe als internal an", async () => {
  await addCategory("Arbeit", "#7cc3f7");
  expect(execute.mock.calls[0][1]).toContain("internal");
});

it("schreibt time_kind beim Aendern", async () => {
  await updateCategory(1, "Arbeit", "#7cc3f7", "none");
  const [sql, params] = execute.mock.calls[0];
  expect(sql).toContain("time_kind = ");
  expect(params).toContain("none");
});

it("liest time_kind aus der Zeile", async () => {
  select.mockResolvedValue([
    { id: 1, name: "Arbeit", color: "#7cc3f7", created_at: "2026-09-16", time_kind: "external" },
  ]);
  const [category] = await listCategories();
  expect(category.time_kind).toBe("external");
});
```

Die Namen `execute`/`select` an die im File bestehenden Mock-Variablen anpassen.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/todoStoreSql.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementieren**

In `src/todoStoreSql.ts`:
- `addCategory(name, color, timeKind = "internal")` — `time_kind` in Spaltenliste und Platzhalter des `INSERT`.
- `updateCategory(id, name, color, timeKind = "internal")` — `time_kind = $n` im `UPDATE`.
- `listCategories` und jedes andere `SELECT` auf `categories` liest `time_kind` mit; wo `SELECT *` steht, kommt es von allein. Steht dort eine Spaltenliste, `time_kind` ergänzen. `fromCategoryRow` erledigt die Umwandlung.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/todoStoreSql.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoStoreSql.ts src/todoStoreSql.test.ts
git commit -m "feat: store the time kind in SQLite"
```

---

### Task 5: localStorage-Store

**Files:**
- Modify: `src/todoStoreLocal.ts`
- Test: `src/todoStoreLocal.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("legt mit time_kind an", async () => {
  const cat = await addCategory("Kunde X", "#7cc3f7", "external");
  expect(cat.time_kind).toBe("external");
  expect((await listCategories())[0].time_kind).toBe("external");
});

it("legt ohne Angabe als internal an", async () => {
  expect((await addCategory("Arbeit", "#7cc3f7")).time_kind).toBe("internal");
});

it("aendert time_kind", async () => {
  const cat = await addCategory("Pause", "#7cc3f7");
  expect((await updateCategory(cat.id, "Pause", "#7cc3f7", "none")).time_kind).toBe("none");
});

it("liest Altbestand ohne time_kind als internal", async () => {
  localStorage.setItem(
    CATEGORIES_KEY,
    JSON.stringify([{ id: 1, name: "Arbeit", color: "#7cc3f7", created_at: "2026-09-16" }])
  );
  expect((await listCategories())[0].time_kind).toBe("internal");
});
```

Den Schlüsselnamen `CATEGORIES_KEY` an die im File verwendete Konstante bzw. den Literalstring anpassen.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/todoStoreLocal.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementieren**

In `src/todoStoreLocal.ts`:
- `addCategory(name, color, timeKind = "internal")` setzt `time_kind` im neuen Objekt.
- `updateCategory(id, name, color, timeKind = "internal")` schreibt es mit.
- `loadCategories` reicht jede Zeile durch `fromCategoryRow` (oder ruft `toTimeKind` auf dem gelesenen Wert), damit Altbestand ohne die Eigenschaft `internal` bekommt — genau die Rolle, die der Fallback aus Task 1 spielt.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/todoStoreLocal.test.ts && npm run typecheck`
Expected: beide PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoStoreLocal.ts src/todoStoreLocal.test.ts
git commit -m "feat: store the time kind in localStorage"
```

---

### Task 6: MCP-Schnittstelle

**Files:**
- Modify: `src-tauri/src/mcp/store.rs`

- [ ] **Step 1: Feld ergänzen**

Im Category-Struct in `src-tauri/src/mcp/store.rs` `pub time_kind: String` ergänzen und die `SELECT`-Spaltenliste von `list_categories` mitziehen. Dadurch erscheint die Zeitart in der Antwort von `list_categories`, ohne dass `tools.rs` etwas tut.

Das Anlegen über MCP bekommt **keinen** Parameter für die Zeitart — der `INSERT` dort lässt die Spalte weg und trifft damit den Vorgabewert `internal`.

- [ ] **Step 2: Rust-Seite prüfen**

Run: `npm run test:rust && npm run lint:rust`
Expected: beide PASS (Clippy behandelt Warnungen als Fehler)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/mcp/store.rs
git commit -m "feat: expose the time kind over MCP"
```

---

### Task 7: `TimeKindSelect` und das Kategorien-Fenster

**Files:**
- Create: `src/ui/TimeKindSelect.tsx`
- Modify: `src/ui/index.ts`, `src/App.tsx` (Kategorien-Modal ab ca. Zeile 1052, Anlege-Formular, `handleAddCategory` bei ca. 497, `handleUpdateCategory`), `src/App.css`
- Test: `src/App.test.tsx`

**Vorher `STYLEGUIDE.md` lesen.**

- [ ] **Step 1: Write the failing test**

In `src/App.test.tsx`:

```ts
it("legt eine Kategorie mit gewaehlter Zeitart an", async () => {
  render(<App />);
  await user.click(screen.getByLabelText("Kategorien verwalten"));
  await user.type(screen.getByPlaceholderText(/Kategorie/i), "Kunde X");
  await user.click(screen.getByRole("button", { name: "Extern" }));
  await user.click(screen.getByRole("button", { name: /Anlegen|Hinzuf/i }));
  expect(addCategory).toHaveBeenCalledWith("Kunde X", expect.any(String), "external");
});

it("stellt die Zeitart einer bestehenden Kategorie um", async () => {
  render(<App />);
  await user.click(screen.getByLabelText("Kategorien verwalten"));
  await user.click(screen.getByLabelText("Zeitart Arbeit: Keine"));
  expect(updateCategory).toHaveBeenCalledWith(1, "Arbeit", expect.any(String), "none");
});
```

Die Mocks für `addCategory`/`updateCategory` bestehen im File schon; die gemockten Kategorien brauchen jetzt ein `time_kind`. Beschriftungen und Rollen an die tatsächliche Umsetzung angleichen.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL

- [ ] **Step 3: Baustein schreiben**

`src/ui/TimeKindSelect.tsx`:

```tsx
// Dreier-Segmentleiste fuer die Zeitart einer Kategorie. Gleiches Muster wie
// der Status-Filter der Liste: FilterChip variant="segment" in einer Gruppe.

import { TIME_KINDS, TIME_KIND_LABELS, TimeKind } from "../types";
import { FilterChip } from "./FilterChip";

export interface TimeKindSelectProps {
  value: TimeKind;
  onValueChange: (kind: TimeKind) => void;
  /** Kategoriename fuer die Beschriftung der Knoepfe. */
  label: string;
}

export function TimeKindSelect({ value, onValueChange, label }: TimeKindSelectProps) {
  return (
    <div className="time-kind-select" role="group" aria-label={`Zeitart ${label}`}>
      {TIME_KINDS.map((kind) => (
        <FilterChip
          key={kind}
          variant="segment"
          active={value === kind}
          onClick={() => onValueChange(kind)}
          aria-label={`Zeitart ${label}: ${TIME_KIND_LABELS[kind]}`}
        >
          {TIME_KIND_LABELS[kind]}
        </FilterChip>
      ))}
    </div>
  );
}
```

Export in `src/ui/index.ts` ergänzen.

- [ ] **Step 4: Ins Kategorien-Fenster einbauen**

- Anlege-Formular: State `newCategoryTimeKind` mit Anfangswert `"internal"`, `TimeKindSelect` mit `label="neue Kategorie"`, `addCategory(name, newCategoryColor, newCategoryTimeKind)`, nach dem Anlegen auf `"internal"` zurücksetzen.
- Je bestehender Kategoriezeile: `TimeKindSelect` mit `label={category.name}`; Klick ruft `updateCategory(category.id, category.name, category.color, kind)` und aktualisiert den Kategorien-State optimistisch wie die vorhandene Farbänderung.
- `src/App.css`: Klasse `.time-kind-select` im Muster von `.status-filter`, Token aus dem Styleguide, `--radius-pill`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/TimeKindSelect.tsx src/ui/index.ts src/App.tsx src/App.css src/App.test.tsx
git commit -m "feat: set the time kind in the category window"
```

---

### Task 8: Kategorie-Chips im Brett

**Files:**
- Modify: `src/App.tsx` (View-State ab ca. Zeile 184, Lane-Befüllung ab ca. Zeile 432, Darstellung im `viewMode === "kanban"`-Zweig), `src/App.css`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it("filtert das Brett auf die gewaehlten Kategorien", async () => {
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Brett" }));
  expect(screen.getByText("Arbeit-Aufgabe")).toBeInTheDocument();
  expect(screen.getByText("Privat-Aufgabe")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));
  expect(screen.getByText("Arbeit-Aufgabe")).toBeInTheDocument();
  expect(screen.queryByText("Privat-Aufgabe")).not.toBeInTheDocument();
});

it("zeigt mit 'Ohne Kategorie' die Aufgaben ohne Kategorie", async () => {
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Brett" }));
  await user.click(screen.getByRole("button", { name: "Ohne Kategorie" }));
  expect(screen.getByText("Aufgabe ohne Kategorie")).toBeInTheDocument();
  expect(screen.queryByText("Arbeit-Aufgabe")).not.toBeInTheDocument();
});

it("zeigt nach 'Alle' wieder alles", async () => {
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Brett" }));
  await user.click(screen.getByRole("button", { name: "Kategorie Arbeit" }));
  await user.click(screen.getByRole("button", { name: "Alle Kategorien" }));
  expect(screen.getByText("Privat-Aufgabe")).toBeInTheDocument();
});
```

Die gemockten Todos im File brauchen dafür je eine Aufgabe mit Kategorie „Arbeit", eine mit „Privat" und eine ohne Kategorie.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implementieren**

In `src/App.tsx` neben dem übrigen View-State:

```tsx
// Leere Menge heisst "alles zeigen" — kein Sonderwert, kein null-fuer-alle.
// null als Element steht fuer Aufgaben ohne Kategorie.
const [boardCategories, setBoardCategories] = useState<Set<number | null>>(new Set());

const toggleBoardCategory = useCallback((id: number | null) => {
  setBoardCategories((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });
}, []);
```

Die Lane-Befüllung filtert vor der Statusaufteilung:

```tsx
const boardTodos = useMemo(
  () =>
    boardCategories.size === 0
      ? todos
      : todos.filter((t) => boardCategories.has(t.category_id)),
  [todos, boardCategories]
);
```

Gefiltert wird im State, nicht in der Datenbank: die Todos liegen ohnehin vollständig vor, und ein Reload je Klick wäre träger als ein `filter`.

Chipleiste über dem Brett, nur im `viewMode === "kanban"`-Zweig, gebaut aus `FilterChip`:

```tsx
<div className="board-filter" role="group" aria-label="Kategorien filtern">
  <FilterChip
    active={boardCategories.size === 0}
    onClick={() => setBoardCategories(new Set())}
    aria-label="Alle Kategorien"
  >
    Alle
  </FilterChip>
  {categories.map((category) => (
    <FilterChip
      key={category.id}
      active={boardCategories.has(category.id)}
      onClick={() => toggleBoardCategory(category.id)}
      aria-label={`Kategorie ${category.name}`}
      style={{ borderColor: category.color }}
    >
      {category.name}
    </FilterChip>
  ))}
  <FilterChip
    active={boardCategories.has(null)}
    onClick={() => toggleBoardCategory(null)}
    aria-label="Ohne Kategorie"
  >
    Ohne Kategorie
  </FilterChip>
</div>
```

Ob die Kategoriefarbe über `style` oder über eine CSS-Variable kommt, richtet sich nach dem, was `CategoryBadge` und der Styleguide vorgeben — dem dort etablierten Weg folgen statt einen zweiten zu eröffnen.

`.board-filter` in `src/App.css` ergänzen.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "feat: filter the board by category"
```

---

### Task 9: Liste startet auf „Offen" und merkt es sich

**Files:**
- Create: `src/listPrefs.ts`
- Modify: `src/App.tsx` (`statusFilter` ca. Zeile 170, `hasActiveFilter`, `clear-filters`-Handler)
- Test: `src/listPrefs.test.ts` (neu), `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/listPrefs.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/listPrefs.test.ts`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Write minimal implementation**

`src/listPrefs.ts`:

```ts
// Vorlieben der Listenansicht. Bewusst localStorage statt app_settings: das ist
// eine Oberflaechen-Vorliebe, kein Domaenendatum. Ueber app_settings muesste
// das Store-Interface in beiden Backends wachsen und das Lesen asynchron
// werden, womit die Liste beim Start kurz im falschen Filter stuende.

export type StatusFilter = "all" | "open" | "done";

export const STATUS_FILTER_KEY = "todolist.statusFilter";

const DEFAULT_STATUS_FILTER: StatusFilter = "open";

export function loadStatusFilter(): StatusFilter {
  const stored = localStorage.getItem(STATUS_FILTER_KEY);
  return stored === "all" || stored === "open" || stored === "done"
    ? stored
    : DEFAULT_STATUS_FILTER;
}

export function saveStatusFilter(value: StatusFilter): void {
  localStorage.setItem(STATUS_FILTER_KEY, value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/listPrefs.test.ts`
Expected: PASS

- [ ] **Step 5: In `App.tsx` verdrahten — Test zuerst**

In `src/App.test.tsx`:

```ts
it("startet die Liste auf 'Offen'", async () => {
  render(<App />);
  expect(await screen.findByRole("button", { name: "Offen" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText("Erledigte Aufgabe")).not.toBeInTheDocument();
});

it("merkt sich die Wahl", async () => {
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Alle" }));
  expect(localStorage.getItem("todolist.statusFilter")).toBe("all");
});

it("setzt 'Zuruecksetzen' auf 'Offen', nicht auf 'Alle'", async () => {
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Alle" }));
  await user.click(screen.getByText("Zurücksetzen"));
  expect(screen.getByRole("button", { name: "Offen" })).toHaveAttribute("aria-pressed", "true");
});
```

Prüft `FilterChip` nicht über `aria-pressed`, das gleichwertige Merkmal des Bausteins verwenden (aktive Klasse) — an die vorhandenen Filter-Tests im File angleichen. Die gemockten Todos brauchen eine erledigte Aufgabe.

- [ ] **Step 6: Implementieren**

```tsx
const [statusFilter, setStatusFilter] = useState<StatusFilter>(loadStatusFilter);
```

Ein Handler schreibt beim Umschalten mit:

```tsx
const changeStatusFilter = useCallback((value: StatusFilter) => {
  setStatusFilter(value);
  saveStatusFilter(value);
}, []);
```

Alle drei Segment-Knöpfe rufen `changeStatusFilter`. `hasActiveFilter` zählt `statusFilter !== "open"` als aktiv. Der „Zurücksetzen"-Handler ruft `changeStatusFilter("open")` statt `setStatusFilter("all")`. Die Beschriftung im `active-filters`-Band zeigt den Zusatz entsprechend erst ab einer Abweichung von „Offen".

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx src/listPrefs.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/listPrefs.ts src/listPrefs.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: start the list on open todos and remember the choice"
```

---

### Task 10: `splitByWorkTime`

**Files:**
- Modify: `src/timeSlots.ts`
- Test: `src/timeSlots.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("splitByWorkTime", () => {
  const sums = [
    { category_id: 1, slotCount: 8 },
    { category_id: 2, slotCount: 4 },
    { category_id: 3, slotCount: 2 },
  ];
  const kindOf = (id: number): TimeKind =>
    id === 1 ? "internal" : id === 2 ? "external" : "none";

  it("trennt Arbeitszeit von Nicht-Arbeitszeit", () => {
    const { work, nonWork } = splitByWorkTime(sums, kindOf);
    expect(work.map((s) => s.category_id)).toEqual([1, 2]);
    expect(nonWork.map((s) => s.category_id)).toEqual([3]);
  });

  it("behaelt die Reihenfolge der Eingabe", () => {
    expect(splitByWorkTime(sums, kindOf).work).toEqual([sums[0], sums[1]]);
  });

  it("zaehlt eine geloeschte Kategorie als Arbeitszeit", () => {
    const { work, nonWork } = splitByWorkTime(sums, () => "internal");
    expect(work).toHaveLength(3);
    expect(nonWork).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/timeSlots.test.ts`
Expected: FAIL — `splitByWorkTime` existiert nicht.

- [ ] **Step 3: Write minimal implementation**

In `src/timeSlots.ts` neben `sumByCategory`:

```ts
/**
 * Teilt Kategoriesummen in Arbeitszeit und Nicht-Arbeitszeit. Reine Funktion,
 * die Reihenfolge der Eingabe bleibt in beiden Haelften erhalten.
 *
 * Eine Kategorie, die es nicht mehr gibt, liefert `kindOf` als "internal" —
 * geloeschte Kategorien duerfen bereits gebuchte Arbeitszeit nicht aus der
 * Summe fallen lassen.
 */
export function splitByWorkTime(
  sums: CategorySum[],
  kindOf: (categoryId: number) => TimeKind
): { work: CategorySum[]; nonWork: CategorySum[] } {
  const work: CategorySum[] = [];
  const nonWork: CategorySum[] = [];
  for (const sum of sums) {
    (kindOf(sum.category_id) === "none" ? nonWork : work).push(sum);
  }
  return { work, nonWork };
}

/** Summe der Viertelstunden einer Liste von Kategoriesummen. */
export function sumSlots(sums: CategorySum[]): number {
  return sums.reduce((total, sum) => total + sum.slotCount, 0);
}
```

`TimeKind` aus `./types` importieren.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/timeSlots.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/timeSlots.ts src/timeSlots.test.ts
git commit -m "feat: split time sums into work and non-work"
```

---

### Task 11: Zeitansicht zählt nur Arbeitszeit gegen das Soll

**Files:**
- Modify: `src/TimeTrackingView.tsx` (`weekSums` ca. Zeile 210, `weekTotal`, Tagessummen ca. Zeile 453, Summenband ca. Zeile 539)
- Test: `src/TimeTrackingView.test.tsx`

**Vorher `STYLEGUIDE.md` lesen.**

- [ ] **Step 1: Write the failing test**

Die bestehende Render-Hilfe des Files wiederverwenden (das File mockt `timeDb`
und rendert die Ansicht schon an mehreren Stellen — denselben Aufbau nehmen,
keinen zweiten erfinden). Die gemockten Kategorien bekommen `time_kind`:
Kategorie 1 `internal`, Kategorie 2 `none`, je vier Slots gebucht.

```ts
it("zaehlt 'keine Arbeitszeit' nicht gegen das Soll", async () => {
  renderView();
  expect(await screen.findByText("= 1:00")).toBeInTheDocument();
  expect(screen.getByText(/1:00 keine Arbeitszeit/)).toBeInTheDocument();
});

it("weist ohne Nicht-Arbeitszeit keinen Zusatz aus", async () => {
  renderView();
  expect(await screen.findByText("= 2:00")).toBeInTheDocument();
  expect(screen.queryByText(/keine Arbeitszeit/)).not.toBeInTheDocument();
});
```

Erwartete Texte an die tatsächliche Formatierung angleichen.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TimeTrackingView.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implementieren**

```tsx
const kindOf = useCallback(
  (id: number): TimeKind => categoryById.get(id)?.time_kind ?? "internal",
  [categoryById]
);

const { work: workSums, nonWork: nonWorkSums } = useMemo(
  () => splitByWorkTime(weekSums, kindOf),
  [weekSums, kindOf]
);
const weekWorkTotal = useMemo(() => sumSlots(workSums), [workSums]);
const weekNonWorkTotal = useMemo(() => sumSlots(nonWorkSums), [nonWorkSums]);
```

- Der Soll-Vergleich (`weekTarget`, `formatSignedDuration`) rechnet mit `weekWorkTotal` statt mit der bisherigen Gesamtsumme.
- Die Summe je Tagesspalte zählt ebenso nur Arbeitszeit: pro Tag `sumByCategory` → `splitByWorkTime` → `sumSlots(work)`.
- Neben der Wochensumme steht, nur wenn `weekNonWorkTotal > 0`:

```tsx
<span className="time-non-work">
  + {formatDuration(weekNonWorkTotal)} keine Arbeitszeit
</span>
```

- Das Summenband je Kategorie (`time-sums`) bleibt flach und ungruppiert, die Pinsel bleiben ohne Kürzel — die Farbe trägt die Zuordnung schon.
- `.time-non-work` in `src/App.css` im Muster der übrigen `time-*`-Klassen.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/TimeTrackingView.test.tsx && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/TimeTrackingView.tsx src/App.css src/TimeTrackingView.test.tsx
git commit -m "feat: count only work time against the weekly target"
```

---

### Task 12: CSV-Spalte „Art"

**Files:**
- Modify: `src/timeCsv.ts`, `src/TimeTrackingView.tsx` (Aufruf von `buildCsv` ca. Zeile 307)
- Test: `src/timeCsv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("hat die Spalte Art nach der Kategorie", () => {
  expect(CSV_HEADER).toEqual([
    "Datum", "Von", "Bis", "Dauer", "Minuten", "Kategorie", "Art", "Notiz",
  ]);
});

it("schreibt die Zeitart je Buchung auf deutsch", () => {
  const csv = buildCsv(
    ["2026-09-16"],
    { "2026-09-16": slots },
    () => "Kunde X",
    () => "external"
  );
  expect(csv).toContain("Kunde X;extern;");
});

it("schreibt 'keine' fuer Nicht-Arbeitszeit", () => {
  const csv = buildCsv(["2026-09-16"], { "2026-09-16": slots }, () => "Pause", () => "none");
  expect(csv).toContain("Pause;keine;");
});
```

`slots` wie in den bestehenden Tests des Files aufbauen.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/timeCsv.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementieren**

In `src/timeCsv.ts`:

```ts
export const CSV_HEADER = [
  "Datum", "Von", "Bis", "Dauer", "Minuten", "Kategorie", "Art", "Notiz",
] as const;

// Deutsche Werte, weil die Datei fuer Excel in deutscher Einstellung gebaut
// ist — Semikolon als Trennzeichen und BOM voran.
const KIND_LABELS: Record<TimeKind, string> = {
  none: "keine",
  internal: "intern",
  external: "extern",
};
```

`blockRow` und `buildCsv` bekommen neben `categoryName` eine `kindOf: (categoryId: number) => TimeKind`; der Wert landet als `KIND_LABELS[kindOf(block.category_id)]` zwischen Kategorie und Notiz.

In `src/TimeTrackingView.tsx` bekommt der `buildCsv`-Aufruf das schon in Task 11 gebaute `kindOf` als viertes Argument; `kindOf` gehört damit in die Abhängigkeitsliste des umgebenden `useCallback`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/timeCsv.test.ts src/TimeTrackingView.test.tsx && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/timeCsv.ts src/TimeTrackingView.tsx src/timeCsv.test.ts
git commit -m "feat: add the time kind to the CSV export"
```

---

### Task 13: E2E, Dokumentation, Gesamtlauf

**Files:**
- Modify: `e2e/timetracking.spec.ts`, `e2e/todolist.spec.ts`, `STYLEGUIDE.md`, `AGENTS.md`, `CHANGELOG.md`

- [ ] **Step 1: E2E-Test Zeitansicht**

In `e2e/timetracking.spec.ts`: eine Kategorie über das Kategorien-Fenster auf **Keine** stellen, damit Zeit buchen und prüfen, dass die Wochensumme gegen das Soll sie nicht mitzählt, der Zusatz „keine Arbeitszeit" aber erscheint.

- [ ] **Step 2: E2E-Test Liste und Brett**

In `e2e/todolist.spec.ts`: prüfen, dass die Liste auf *Offen* startet, und im Brett einen Kategorie-Chip anklicken und die Sichtbarkeit der Karten prüfen. Die E2E-Suite selektiert über CSS-Klassen und `aria-label` — die in Tasks 7–9 vergebenen Beschriftungen verwenden.

- [ ] **Step 3: E2E laufen lassen**

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 4: Dokumentation**

- `STYLEGUIDE.md`: `TimeKindSelect` im Katalog der Bausteine unter `src/ui/` aufnehmen; die Chipleiste `.board-filter` bei der Beschreibung der Brett-Ansicht erwähnen.
- `AGENTS.md`: `src/listPrefs.test.ts` in die Liste der Testdateien; bei „Persistenz" den Satz ergänzen, dass Oberflächen-Vorlieben in `localStorage` liegen und nicht im Store.
- `CHANGELOG.md`: Eintrag unter „Unreleased" mit den drei Features.

- [ ] **Step 5: Gesamtlauf**

Run: `npm run typecheck && npm run lint && npm test && npm run test:rust && npm run lint:rust && npm run test:e2e`
Expected: alles grün

- [ ] **Step 6: Commit**

```bash
git add e2e STYLEGUIDE.md AGENTS.md CHANGELOG.md
git commit -m "test: cover the category filter and time kinds end to end"
```

---

## Abschluss

Nach Task 13 auf `main` mergen und ein Release bauen — der Auftraggeber hat beides vorab freigegeben, sofern der Gesamtlauf grün ist.
