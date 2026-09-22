# Wegfall der Priorität — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Priorität verschwindet vollständig aus Code, Oberfläche und MCP-Grenze; die farbige Kante an Listenzeile und Kanban-Karte zeigt stattdessen den Aufgabentyp.

**Architecture:** Ein Entfernen, kein Umbau. `Priority` fällt aus `src/types.ts`, danach zieht der Compiler die Spur durch Stores, Dispatcher, Oberfläche und Rust-Seite. Die farbige Kante wechselt nur ihre Farbquelle: dieselben zwei CSS-Eigenschaften, statt `--prio-*` künftig die bereits vorhandenen `--type-*`. Die Datenbankspalte bleibt unangetastet stehen.

**Tech Stack:** TypeScript, React 18, Vitest + Testing Library, Playwright, Tauri 2, `tauri-plugin-sql`, sqlx/SQLite, rmcp.

**Spec:** `docs/superpowers/specs/2026-09-22-prioritaet-entfernen-design.md`

**Reihenfolge:** Task 1 schneidet die Wurzel und bricht damit absichtlich den Typecheck an vielen Stellen; Tasks 2–5 heilen die Persistenz, 6–9 die Oberfläche, 10–11 die MCP-Grenze, 12–13 E2E und Dokumentation. Erst nach Task 9 ist `npm run typecheck` wieder grün.

**Ein Hinweis, der jeden Task betrifft:** die Spalte `priority` in der Tabelle `todos` **bleibt bestehen**. Sie ist `NOT NULL DEFAULT 'medium'`, deshalb dürfen `INSERT`-Anweisungen sie weglassen. Es gibt in diesem Plan **keine Migration**, weder in `src-tauri/src/lib.rs` noch sonstwo. Wer eine schreibt, hat den Plan missverstanden.

---

### Task 1: `Priority` aus `types.ts` entfernen

**Files:**
- Modify: `src/types.ts`
- Test: `src/types.test.ts`

- [ ] **Step 1: Die Tests anpassen, die die Priorität prüfen**

In `src/types.test.ts` entfallen alle Fälle, die `Priority` oder die Prioritätsstufe der Sortierung prüfen. Suche sie mit:

```bash
grep -n "priority\|Priority" src/types.test.ts
```

Konkret zu tun:
- Jeder Fixture (Objekte vom Typ `Todo` und `TodoRow`, die von Hand gebaut werden) verliert das Feld `priority`.
- Der Fall in `describe("sortBoardTodos")`, der zwei Karten mit gleichem `board_order` und gleicher Fälligkeit über die Priorität trennt, entfällt ersatzlos.
- Bleibt danach ein Fall übrig, der nur noch prüft, dass bei Gleichstand das Alter entscheidet, ist das richtig so.

Ergänze in `describe("sortBoardTodos")` einen Fall, der die neue Regel festhält:

```ts
  it("sortiert bei gleichem Platz und gleicher Faelligkeit nach dem Alter", () => {
    // Nach dem Wegfall der Prioritaet ist das Alter der letzte Tie-Breaker.
    const alt = card({ id: 1, created_at: "2026-01-01T00:00:00.000Z" });
    const neu = card({ id: 2, created_at: "2026-02-01T00:00:00.000Z" });
    expect(sortBoardTodos([alt, neu]).map((t) => t.id)).toEqual([2, 1]);
  });
```

`card` ist der Fixture-Helfer, der in dieser `describe`-Gruppe bereits existiert; nimm ihn so, wie er dort heißt und aussieht. Prüfe an der bestehenden Sortierregel, ob das jüngere oder das ältere Todo zuerst steht — `sortBoardTodos` vergleicht `b.created_at.localeCompare(a.created_at)`, also steht das **jüngere** vorn. Passe die Erwartung an, falls du das Gegenteil misst.

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

Run: `npm test -- src/types.test.ts`
Expected: FAIL — der neue Fall kann noch grün sein, aber TypeScript meldet, dass `priority` in den Fixtures fehlt, solange `Todo` es verlangt.

- [ ] **Step 3: Die Implementierung entfernen**

In `src/types.ts`:

Zeile 1, `export type Priority = "low" | "medium" | "high";` — löschen.

In `interface Todo` die Zeile `priority: Priority;` löschen, in `interface TodoRow` ebenso, und in `fromRow` die Zeile `priority: row.priority,`.

In `sortBoardTodos` den Prioritätsblock entfernen. Vorher:

```ts
export function sortBoardTodos(todos: Todo[]): Todo[] {
  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return todos.slice().sort((a, b) => {
    if (a.board_order !== b.board_order) return a.board_order - b.board_order;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.created_at.localeCompare(a.created_at);
  });
}
```

Nachher:

```ts
export function sortBoardTodos(todos: Todo[]): Todo[] {
  return todos.slice().sort((a, b) => {
    if (a.board_order !== b.board_order) return a.board_order - b.board_order;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}
```

Der Doc-Kommentar über der Funktion nennt die Priorität ausdrücklich („erst der gezogene Platz, dann -- bei Gleichstand -- die Faelligkeit, die Prioritaet und zuletzt das Alter"). Zieh ihn mit:

```
 * Die Reihenfolge einer Brett-Spalte: erst der gezogene Platz, dann -- bei
 * Gleichstand -- die Faelligkeit und zuletzt das Alter.
```

Prüfe zum Schluss, ob `sortTodos` (die Listensortierung) die Priorität benutzt — nach heutigem Stand tut sie es nicht. Falls doch, entferne sie dort nach demselben Muster und sag es im Bericht.

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/types.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: FAIL — und zwar breit: Stores, `db.ts`, `App.tsx`, `TodoDetailModal.tsx` und mehrere Testdateien kennen `Priority` noch. Das ist der Auftrag der folgenden Tasks. Notiere im Bericht, welche Dateien betroffen sind.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "refactor: Prioritaet aus types.ts entfernen"
```

---

### Task 2: Vertrag und Dispatcher

**Files:**
- Modify: `src/storeTypes.ts`
- Modify: `src/db.ts`

Kein eigener Test — beides sind Schnittstelle und Fassade; die Store-Tests der Tasks 3 und 4 decken sie ab.

- [ ] **Step 1: `src/storeTypes.ts` schneiden**

- Im Import in Zeile 1 `Priority` streichen.
- In `interface TodoFieldsPatch` die Zeile `priority?: Priority;` löschen.
- In `interface TodoStore` den Parameter `priority: Priority,` aus `addTodo` löschen. Die Signatur lautet danach:

```ts
  addTodo(
    title: string,
    dueDate: string | null,
    categoryId?: number | null,
    description?: string,
    type?: TodoType
  ): Promise<Todo>;
```

- Die Methode `updateTodoPriority(id: number, priority: Priority): Promise<Todo>;` samt ihrem Doc-Kommentar löschen.
- Im Doc-Kommentar über `addTodo` die Erwähnung der Priorität streichen, falls dort eine steht.

- [ ] **Step 2: `src/db.ts` schneiden**

- Im Import `Priority` streichen.
- Die Fassade `addTodo` verliert den Parameter:

```ts
export function addTodo(
  title: string,
  dueDate: string | null,
  categoryId?: number | null,
  description?: string,
  type?: TodoType
): Promise<Todo> {
  return store().addTodo(title, dueDate, categoryId, description, type);
}
```

- Die Fassade `updateTodoPriority` samt Doc-Kommentar löschen.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: FAIL in `src/todoStoreLocal.ts`, `src/todoStoreSql.ts` und in den Oberflächen-Dateien — der Auftrag der folgenden Tasks. **Wichtig:** ein Store mit einem Parameter zu viel bleibt TypeScript gegenüber *nicht* zuweisbar, im Gegensatz zu einem mit zu wenigen. Der Fehler muss also erscheinen. Tut er es nicht, ist der Vertrag nicht richtig geschnitten.

- [ ] **Step 4: Commit**

```bash
git add src/storeTypes.ts src/db.ts
git commit -m "refactor: Prioritaet aus Store-Vertrag und Dispatcher entfernen"
```

---

### Task 3: Der localStorage-Speicher

**Files:**
- Modify: `src/todoStoreLocal.ts`
- Test: `src/todoStoreLocal.test.ts`

- [ ] **Step 1: Tests anpassen**

In `src/todoStoreLocal.test.ts`:

- Die `describe`-Gruppe bzw. die Fälle zu `updateTodoPriority` entfallen ersatzlos. Finde sie mit `grep -n "Priority\|priority" src/todoStoreLocal.test.ts`.
- Jeder `addTodo`-Aufruf verliert sein zweites Argument. Aus `localTodoStore.addTodo("Titel", "medium", null)` wird `localTodoStore.addTodo("Titel", null)`; aus `localTodoStore.addTodo("Login kaputt", "high", null, null, "", "bug")` wird `localTodoStore.addTodo("Login kaputt", null, null, "", "bug")`.
- Von Hand geschriebene `localStorage`-Einträge dürfen `priority` behalten — sie sind Altbestand und genau der Fall, den der Speicher ignorieren soll. Ergänze dazu einen Fall:

```ts
  it("ignoriert eine gespeicherte Prioritaet aus der Zeit davor", () => {
    // Altbestand traegt das Feld noch; es darf weder stoeren noch
    // durchgereicht werden.
    localStorage.setItem(
      "todolist_todos",
      JSON.stringify([
        {
          id: 9,
          title: "Alt",
          description: "",
          done: false,
          status: "todo",
          type: "task",
          priority: "high",
          created_at: "2026-01-01T00:00:00.000Z",
          due_date: null,
          category_id: null,
          category_name: null,
          category_color: null,
          board_order: 0,
        },
      ])
    );
    return localTodoStore.listTodos().then(([listed]) => {
      expect(listed).not.toHaveProperty("priority");
      expect(listed.title).toBe("Alt");
    });
  });
```

Prüfe den Schlüsselnamen des Speichers in `src/todoStoreLocal.ts` — der Plan nimmt `todolist_todos` an; nimm den echten.

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

Run: `npm test -- src/todoStoreLocal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementierung schneiden**

In `src/todoStoreLocal.ts`:

- Import: `Priority` streichen.
- `addTodo` verliert den Parameter und die Zeile `priority,` im erzeugten Objekt:

```ts
function addTodo(
  title: string,
  dueDate: string | null,
  categoryId?: number | null,
  description = "",
  type: TodoType = "task"
): Promise<Todo> {
```

- Die Funktion `updateTodoPriority` löschen und ihren Eintrag aus dem exportierten Objekt am Dateiende.
- In `updateTodoFields` die Zeile `if (patch.priority !== undefined) next.priority = patch.priority;` löschen.
- Prüfe `migrateTodos` bzw. `toTodo`: falls dort `priority` aufgeholt oder kopiert wird, entferne es. Ein gespeichertes Feld, das niemand liest, darf liegen bleiben — es darf nur nicht mehr in das `Todo` wandern. Der `StoredTodo`-Typ verliert `priority`, falls er es nennt.

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/todoStoreLocal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/todoStoreLocal.ts src/todoStoreLocal.test.ts
git commit -m "refactor: Prioritaet aus dem localStorage-Speicher entfernen"
```

---

### Task 4: Der SQLite-Speicher

**Files:**
- Modify: `src/todoStoreSql.ts`
- Test: `src/todoStoreSql.test.ts`

- [ ] **Step 1: Tests anpassen**

In `src/todoStoreSql.test.ts`:

- Fälle zu `updateTodoPriority` entfallen.
- `addTodo`-Aufrufe verlieren das zweite Argument (siehe Task 3).
- Die Tests, die die vollständige Parameterliste des `INSERT` prüfen (`expect(insert?.params).toEqual([...])`), verlieren den Prioritätswert an seiner Stelle. **Achte auf die Reihenfolge** — die übrigen Werte rücken auf.
- Ergänze einen Fall, der festhält, dass die Spalte nicht mehr geschrieben wird:

```ts
  it("schreibt die Prioritaetsspalte nicht mehr mit", () => {
    // Die Spalte bleibt in der Tabelle stehen und traegt ihren Vorgabewert;
    // geschrieben wird sie von dieser App nicht mehr.
    return sqlTodoStore.addTodo("Ohne Prio", null).then(() => {
      const insert = executed.find((call) => call.sql.includes("INSERT INTO todos"));
      expect(insert?.sql).not.toContain("priority");
    });
  });
```

`executed` ist der Aufzeichnungs-Helfer der Datei; nimm den echten Namen.

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

Run: `npm test -- src/todoStoreSql.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementierung schneiden**

In `src/todoStoreSql.ts`:

- Import: `Priority` streichen.
- `TODO_COLUMNS` verliert `t.priority,`. Nimm die vorhandene Liste und entferne **nur** diesen einen Eintrag; sie enthält mehr Spalten, als hier abgedruckt sind, und darf keine verlieren.
- `addTodo` verliert Parameter, Spalte und Bindung. Nachher:

```ts
async function addTodo(
  title: string,
  dueDate: string | null,
  categoryId?: number | null,
  description = "",
  type: TodoType = "task"
): Promise<Todo> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO todos (title, description, done, status, type, created_at, due_date, category_id)
     VALUES ($1, $2, 0, 'todo', $3, $4, $5, $6)`,
    [title, description, type, new Date().toISOString(), dueDate, categoryId ?? null]
  );
  return selectTodo(result.lastInsertId as number);
}
```

**Zähle die Platzhalter nach**: sechs Werte, `$1` bis `$6`, `done` und `status` sind literal. Eine verschobene Nummer schreibt die Fälligkeit in die Typspalte.

- Die Funktion `updateTodoPriority` löschen und ihren Eintrag im exportierten Objekt.
- In `updateTodoFields` die Zeile `if (patch.priority !== undefined) set("priority", patch.priority);` löschen.

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/todoStoreSql.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/todoStoreSql.ts src/todoStoreSql.test.ts
git commit -m "refactor: Prioritaet aus dem SQLite-Speicher entfernen"
```

---

### Task 5: Die localStorage-Übertragung

**Files:**
- Modify: `src/migrateLocalStorage.ts`
- Test: `src/migrateLocalStorage.test.ts`

- [ ] **Step 1: Tests anpassen**

In `src/migrateLocalStorage.test.ts` verlieren die erwarteten `INSERT`-Parameterlisten den Prioritätswert; die folgenden Werte rücken auf, also verschieben sich die Indizes in jeder Assertion, die mit `params[n]` arbeitet. Geh sie einzeln durch.

Ergänze einen Fall:

```ts
it("uebertraegt die Prioritaet nicht mehr", () => {
  // Der Browser-Bestand traegt sie noch; die Spalte in SQLite bekommt ihren
  // Vorgabewert, statt einen Wert aus einer abgeschafften Achse.
  seedTodos([
    {
      id: 1,
      title: "Alt",
      description: "",
      done: false,
      status: "todo",
      type: "task",
      priority: "high",
      created_at: "2026-01-01T00:00:00.000Z",
      due_date: null,
      category_id: null,
      board_order: 0,
    },
  ]);
  return migrateLocalStorage().then(() => {
    const insert = executed.find((call) => call.sql.includes("INSERT OR IGNORE INTO todos"));
    expect(insert?.sql).not.toContain("priority");
    expect(insert?.params).not.toContain("high");
  });
});
```

`seedTodos`, `executed` und `migrateLocalStorage` heißen so, wie die Datei sie bereitstellt — prüfe das.

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

Run: `npm test -- src/migrateLocalStorage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementierung schneiden**

In `src/migrateLocalStorage.ts`, in der Todo-Schleife:

- Die Zeile `const priority = typeof todo.priority === "string" ? todo.priority : "medium";` löschen.
- Der `INSERT` verliert Spalte, Platzhalter und Wert:

```ts
    await db.execute(
      `INSERT OR IGNORE INTO todos (id, title, description, done, status, type, created_at, due_date, category_id, board_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        todo.id,
        todo.title,
        description,
        status === "done" ? 1 : 0,
        status,
        type,
        createdAt,
        dueDate,
        categoryId,
        boardOrder,
      ]
    );
```

**Zähle nach**: zehn Spalten, `$1` bis `$10`, zehn Werte in dieser Reihenfolge.

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/migrateLocalStorage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/migrateLocalStorage.ts src/migrateLocalStorage.test.ts
git commit -m "refactor: Prioritaet aus der localStorage-Uebertragung entfernen"
```

---

### Task 6: Die Kante zeigt den Typ

**Files:**
- Modify: `src/App.css`

Kein eigener Test — die Klassen prüfen Task 8 (Vitest) und Task 12 (E2E).

- [ ] **Step 1: Die Token austauschen**

Im `:root`-Block von `src/App.css` die drei Prioritätstoken löschen:

```css
  --prio-high: var(--accent);
  --prio-medium: var(--highlight);
  --prio-low: var(--ink-line);
```

Die Token `--type-bug`, `--type-task`, `--type-story` stehen bereits darunter und bleiben. Der Kommentar bei `--edge` nennt die Priorität — zieh ihn auf den Typ.

- [ ] **Step 2: Die Listenzeile**

Die Regeln um Zeile 598 lauten heute sinngemäß:

```css
  border-left-width: var(--edge);
  border-left-color: var(--prio-low);
```

und darunter:

```css
.todo-list li.priority-high { border-left-color: var(--prio-high); }
.todo-list li.priority-medium { border-left-color: var(--prio-medium); }
.todo-list li.priority-low { border-left-color: var(--prio-low); }
```

Ersetze sie durch:

```css
.todo-list li.type-bug {
  border-left-color: var(--type-bug);
}

.todo-list li.type-task {
  border-left-color: var(--type-task);
}

.todo-list li.type-story {
  border-left-color: var(--type-story);
}
```

Die Grundregel mit `border-left-width: var(--edge)` bleibt; ihr Vorgabewert `var(--prio-low)` wird `var(--type-task)` — das ist der Typ, den jede Aufgabe ohne andere Angabe trägt.

- [ ] **Step 3: Die Kanban-Karte**

Dieselbe Ersetzung für `border-top-color` (heute um Zeile 1709 und 1730):

```css
.kanban-card.type-bug {
  border-top-color: var(--type-bug);
}

.kanban-card.type-task {
  border-top-color: var(--type-task);
}

.kanban-card.type-story {
  border-top-color: var(--type-story);
}
```

Auch hier wird der Vorgabewert der Grundregel `var(--type-task)`.

- [ ] **Step 4: Die Auswahlfeld-Regeln**

Alle Regeln zu `.priority-select` und `.priority-select-inline` löschen. Achtung: `.type-select` teilt sich Selektorlisten mit `.priority-select` — dort darf nur der Prioritätsteil verschwinden, `.type-select` bleibt stehen. `.priority-select-inline` steht in einer Liste mit `.todo-select`; auch dort nur den einen Eintrag entfernen. Geh alle Vorkommen durch:

```bash
grep -n "priority-select\|prio-" src/App.css
```

- [ ] **Step 5: Prüfen**

Run: `grep -rn "prio-\|priority-select\|priority-high\|priority-medium\|priority-low" src/App.css`
Expected: keine Treffer.

- [ ] **Step 6: Commit**

```bash
git add src/App.css
git commit -m "feat: die farbige Kante zeigt den Typ statt der Prioritaet"
```

---

### Task 7: Den Baustein `PrioritySelect` löschen

**Files:**
- Delete: `src/ui/PrioritySelect.tsx`
- Modify: `src/ui/index.ts`

- [ ] **Step 1: Datei löschen**

```bash
git rm src/ui/PrioritySelect.tsx
```

- [ ] **Step 2: Exporte entfernen**

In `src/ui/index.ts` die beiden Zeilen löschen:

```ts
export { PrioritySelect } from "./PrioritySelect";
export type { PrioritySelectProps, PrioritySelectVariant } from "./PrioritySelect";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: FAIL in `src/App.tsx` und `src/TodoDetailModal.tsx` — beide benutzen den Baustein noch. Das erledigen Task 8 und 9.

- [ ] **Step 4: Commit**

```bash
git add src/ui/index.ts src/ui/PrioritySelect.tsx
git commit -m "refactor: Baustein PrioritySelect entfernen"
```

---

### Task 8: Die Oberfläche in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`
- Test: `src/TrashModal.test.tsx` (nur Fixtures)

- [ ] **Step 1: Tests anpassen**

In `src/App.test.tsx`:

- Fixtures verlieren das Feld `priority`.
- Fälle zum Prioritätsfeld im Formular und zum Ändern der Priorität in der Zeile entfallen ersatzlos (`grep -n "Priorität\|priority" src/App.test.tsx`).
- Jede Erwartung an `db.addTodo` verliert das Prioritätsargument. Aus

```tsx
expect(db.addTodo).toHaveBeenCalledWith("Login kaputt", "medium", null, null, undefined, "bug");
```

wird

```tsx
expect(db.addTodo).toHaveBeenCalledWith("Login kaputt", null, null, undefined, "bug");
```

- Der Fall, der bisher `priority-high` an der Zeile prüfte, prüft künftig die Typklasse. Ergänze, falls es ihn nicht mehr gibt:

```tsx
  it("traegt die Typklasse an der Zeile", async () => {
    // Die farbige Kante haengt an dieser Klasse; ohne sie ist die Zeile grau.
    renderApp();
    const zeile = (await screen.findByText("Login kaputt")).closest("li");
    expect(zeile).toHaveClass("type-bug");
  });
```

Der Titel „Login kaputt" ist der Fixture-Eintrag vom Typ `bug`; nimm den, den die Datei wirklich hat.

In `src/TrashModal.test.tsx` verlieren die Fixtures das Feld `priority` — mehr nicht.

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementierung schneiden**

In `src/App.tsx`:

- Import aus `./db`: `updateTodoPriority` streichen.
- Import aus `./types`: `Priority` streichen.
- Import aus `./ui`: `PrioritySelect` streichen.
- Den Zustand `const [newPriority, setNewPriority] = useState<Priority>("medium");` löschen.
- In `handleAdd` das Argument und das Zurücksetzen entfernen:

```tsx
      const todo = await addTodo(title, dueDate, newCategoryId, undefined, newType);
```
und die Zeile `setNewPriority("medium");` löschen.
- Die Funktion `handlePriorityChange` vollständig löschen.
- Im Formular die Zeile mit `<PrioritySelect ... aria-label="Priorität" />` löschen.
- In der Listenzeile den Block `<PrioritySelect variant="inline" ... />` löschen.
- Die Klassenliste des `li` tauscht die Prioritätsklasse gegen die Typklasse. Aus

```tsx
                  `priority-${todo.priority}`,
```
wird
```tsx
                  `type-${todo.type}`,
```

- Dasselbe an der Kanban-Karte:

```tsx
                          className={`kanban-card type-${todo.type} ${todo.done ? "done" : ""} ...
```

Der Rest der Klassenliste (`done`, `overdue`, `due-today` und was dort sonst steht) bleibt unverändert.

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/App.test.tsx src/TrashModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/TrashModal.test.tsx
git commit -m "refactor: Prioritaet aus Formular, Zeile und Karte entfernen"
```

---

### Task 9: Das Detailfenster

**Files:**
- Modify: `src/TodoDetailModal.tsx`
- Test: `src/TodoDetailModal.test.tsx`

- [ ] **Step 1: Tests anpassen**

In `src/TodoDetailModal.test.tsx`: Fixtures verlieren `priority`, der Fall zum Prioritätsfeld entfällt ersatzlos. Ein Fall, der prüft, dass nur geänderte Felder in den Patch wandern, bleibt — er darf nur nicht mehr über die Priorität laufen; nimm dort ein anderes Feld, etwa den Titel.

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

Run: `npm test -- src/TodoDetailModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementierung schneiden**

In `src/TodoDetailModal.tsx`:

- Import aus `./types`: `Priority` streichen; Import aus `./ui`: `PrioritySelect` streichen.
- Den Zustand `const [priority, setPriority] = useState<Priority>(todo.priority);` löschen.
- In `buildPatch` die Zeile `if (priority !== original.priority) patch.priority = priority;` löschen.
- Im `todo-modal-row` das gesamte Feld mit `<label htmlFor="todo-detail-priority">Priorität</label>` und dem `PrioritySelect` löschen.
- Der Kopfkommentar der Datei zählt die Felder auf („Titel, Beschreibung, Prioritaet, Faelligkeit und Kategorie") — zieh ihn mit.

Nach dem Entfernen stehen in der Reihe noch Typ, Fälligkeit und Kategorie. Prüfe, ob die Reihe dadurch unpassend wirkt, und sag es im Bericht, statt eigenmächtig umzubauen.

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/TodoDetailModal.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint && npm test`
Expected: Typecheck **grün** — ab hier ist die TypeScript-Seite vollständig. Lint ohne neue Warnungen, alle Tests grün. Ist der Typecheck nicht grün, nenne im Bericht jede verbliebene Datei.

- [ ] **Step 5: Commit**

```bash
git add src/TodoDetailModal.tsx src/TodoDetailModal.test.tsx
git commit -m "refactor: Prioritaet aus dem Detailfenster entfernen"
```

---

### Task 10: Der MCP-Store

**Files:**
- Modify: `src-tauri/src/mcp/store.rs`

- [ ] **Step 1: Tests anpassen**

Im Testmodul der Datei:

- `add_todo_stores_the_given_priority_due_date_and_category` verliert den Prioritätsteil; behalte den Test für Fälligkeit und Kategorie und benenne ihn passend um (`add_todo_stores_the_given_due_date_and_category`).
- Fälle, die eine unbekannte Priorität als Fehler prüfen, entfallen ersatzlos — ebenso der Fall um Zeile 2008, der `check_priority` mit einer sehr langen Zeichenkette aufruft.
- Jede Assertion `assert_eq!(todo.priority, ...)` und `assert_eq!(updated.priority, ...)` entfällt.
- **Alle** `add_todo(...)`-Aufrufe verlieren ihr Prioritätsargument. Es sind rund dreißig; geh sie vollständig durch, sonst kompiliert das Modul nicht.
- `TodoUpdate`-Literale verlieren das Feld `priority`, sofern sie es nennen.
- Der Test, der die Bind-Reihenfolge sichert (`update_todo_changes_the_type_next_to_its_neighbours`), setzt heute `priority`, `r#type` und `due_date` zusammen. Er muss erhalten bleiben und weiterhin **mindestens zwei** Felder zugleich setzen, sonst prüft er die Reihenfolge nicht mehr. Ersetze die Priorität durch den Status:

```rust
        let update = TodoUpdate {
            status: Some("in_progress".to_string()),
            r#type: Some("story".to_string()),
            due_date: Some(Some("2026-10-01".to_string())),
            ..TodoUpdate::default()
        };
        let updated = update_todo(&pool, todo.id, update).await.expect("update");
        assert_eq!(updated.status, "in_progress");
        assert_eq!(updated.r#type, "story");
        assert_eq!(updated.due_date.as_deref(), Some("2026-10-01"));
```

Der zugehörige Kommentar nennt den Grund („zwei getrennt aufgebaute Listen, kein CHECK-Constraint auf der Spalte … Nicht zu einem Einfeld-Test vereinfachen.") — er bleibt sinngemäß stehen.

- **Das Test-`SCHEMA` behält die Spalte** `priority TEXT NOT NULL DEFAULT 'medium'`. Sie bleibt in der echten Tabelle stehen, also muss der Testpool sie ebenfalls haben — und der Vorgabewert ist es, der den `INSERT` ohne die Spalte überhaupt erst erlaubt.

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

Run: `npm run test:rust`
Expected: FAIL (Kompilierfehler, solange Tests und Implementierung nicht zusammenpassen).

- [ ] **Step 3: Implementierung schneiden**

- `const PRIORITIES: [&str; 3] = ["low", "medium", "high"];` löschen.
- `fn check_priority(...)` löschen.
- Das Feld `pub priority: String,` auf `struct Todo`, `priority: String,` auf `struct TodoRow` und die Zuweisung `priority: row.priority,` in `impl From<TodoRow> for Todo` löschen.
- Auf `struct TodoUpdate` das Feld `pub priority: Option<String>,` löschen und in `is_empty` den Teilausdruck `&& self.priority.is_none()`.
- `TODO_COLUMNS` verliert `t.priority,` — nur diesen einen Eintrag.
- `add_todo` verliert den Parameter `priority: Option<&str>`, die beiden Zeilen

```rust
    let priority = priority.unwrap_or("medium");
    check_priority(priority)?;
```

sowie Spalte, Platzhalter und `.bind(priority)` im `INSERT`. Danach lautet er:

```rust
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO todos (title, description, done, status, type, created_at, due_date, category_id)
         VALUES (?, ?, 0, 'todo', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?)
         RETURNING id",
    )
    .bind(title)
    .bind(description)
    .bind(todo_type)
    .bind(due_date)
    .bind(category_id)
    .fetch_one(pool)
    .await?;
```

**Zähle nach:** fünf `?`, fünf `bind`, in genau dieser Reihenfolge.

- In `update_todo` den Prüfblock

```rust
    if let Some(priority) = &update.priority {
        check_priority(priority)?;
    }
```

löschen, ebenso `assignments.push("priority = ?")` und die zugehörige Bindung. **Die Reihenfolge der verbleibenden Zuweisungen und Bindungen muss weiterhin übereinstimmen** — entfernst du den Push, musst du genau die dazugehörige Bindung entfernen, keine andere.

- [ ] **Step 4: Test laufen lassen**

Run: `npm run test:rust && npm run lint:rust`
Expected: beides PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mcp/store.rs
git commit -m "refactor: Prioritaet aus dem MCP-Store entfernen"
```

---

### Task 11: Die MCP-Werkzeuggrenze

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs`

- [ ] **Step 1: Tests anpassen**

- Jedes `super::AddTodo { ... }`- und `super::UpdateTodo { ... }`-Literal verliert das Feld `priority`. Es sind über zwanzig Stellen; geh sie vollständig durch.
- Assertions wie `assert_eq!(json["priority"], "high");` entfallen.
- Der Test um Zeile 753, der über ein direktes `INSERT INTO todos (title, created_at, priority, due_date)` prüft, dass `update_todo` fremde Spalten nicht anfasst (`"priority must be untouched"`), verliert seine Grundlage: die App schreibt die Spalte nicht mehr, und geprüft werden soll weiterhin, dass ein Patch nur die genannten Felder ändert. Stelle ihn auf eine Spalte um, die die App noch führt — etwa `description`:

```rust
        sqlx::query("INSERT INTO todos (title, created_at, description, due_date)
                     VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?)")
            .bind("Unberuehrt")
            .bind("bleibt stehen")
            .bind("2026-10-01")
            .execute(&pool)
            .await
            .expect("insert");
```

und prüfe danach `assert_eq!(json["description"], "bleibt stehen", "description must be untouched");`. Passe die Bindungen an das an, was der Test tatsächlich tut — lies ihn ganz, bevor du ihn umbaust.

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

Run: `npm run test:rust`
Expected: FAIL.

- [ ] **Step 3: Implementierung schneiden**

- Auf `pub struct AddTodo` das Feld samt Doc-Kommentar löschen:

```rust
    /// Prioritaet: "low", "medium" oder "high". Vorgabe ist "medium".
    pub priority: Option<String>,
```

- Dasselbe auf `pub struct UpdateTodo`.
- Im `add_todo`-Handler das Argument `non_empty(&params.priority),` aus dem Store-Aufruf löschen.
- Im `update_todo`-Handler die Zeile `priority: non_empty(&params.priority).map(str::to_string),` löschen.
- Die Tool-Beschreibung von `add_todo` nennt die Vorgabe — aus

```
Ohne weitere Angaben bekommt sie die Prioritaet "medium", den Status "todo", den Typ "task", keine Faelligkeit und keine Kategorie.
```

wird

```
Ohne weitere Angaben bekommt sie den Status "todo", den Typ "task", keine Faelligkeit und keine Kategorie.
```

- Prüfe die Beschreibung von `update_todo` auf eine Erwähnung der Priorität und entferne sie, falls vorhanden.

- [ ] **Step 4: Test laufen lassen**

Run: `npm run test:rust && npm run lint:rust`
Expected: beides PASS.

Run: `grep -rn "priority\|Prioritaet" src-tauri/src/`
Expected: Treffer nur noch dort, wo die Spalte als Altbestand erwähnt wird — im Test-`SCHEMA` und in der Migration in `src-tauri/src/lib.rs`. Beide bleiben. Nenne im Bericht jeden weiteren Treffer.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mcp/tools.rs
git commit -m "refactor: Prioritaet aus der MCP-Werkzeuggrenze entfernen"
```

---

### Task 12: End-to-End

**Files:**
- Modify: `e2e/todolist.spec.ts`

- [ ] **Step 1: Die Suite anpassen**

- Der Test „can set priority when adding a todo" entfällt ersatzlos.
- Jeder Selektor auf `.priority-high`, `.priority-medium`, `.priority-low` zieht auf die Typklasse (`.type-bug`, `.type-task`, `.type-story`). Finde sie mit `grep -n "priority\|Priorität" e2e/todolist.spec.ts`.
- Ein Test, der das Prioritätsfeld beim Anlegen bedient, verliert diesen Schritt; der Rest des Tests bleibt.
- Ergänze im vorhandenen `test.describe("Aufgabentyp")` einen Fall, der die Kante festhält:

```ts
test("faerbt die Kante der Zeile nach dem Typ", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder(/Was steht an/i).fill("Login kaputt");
  await page.locator(".add-form .type-select").selectOption("bug");
  await page.getByLabel("Aufgabe hinzufügen").click();

  // Die Klasse traegt die Farbe; ohne sie faellt die Zeile auf den
  // Vorgabewert zurueck.
  await expect(page.locator(".todo-list li.type-bug")).toHaveCount(1);
});
```

Der Platzhaltertext und die Selektoren stammen aus der bestehenden Suite; nimm die echten. Playwright matcht Namen als Teilstring — halte die Selektoren eindeutig, wie es die Datei bereits tut.

- [ ] **Step 2: Suite laufen lassen**

Run: `npm run test:e2e`
Expected: PASS, die ganze Suite. Schlägt etwas fehl, liegt es an einem Selektor — repariere ihn, ohne die Zusage abzuschwächen.

- [ ] **Step 3: Commit**

```bash
git add e2e/todolist.spec.ts
git commit -m "test: E2E auf die Typkante umstellen"
```

---

### Task 13: Dokumentation und Gesamtlauf

**Files:**
- Modify: `AGENTS.md`
- Modify: `STYLEGUIDE.md`

- [ ] **Step 1: `STYLEGUIDE.md`**

- Die Token-Tabelle „Prioritäten" mit `--prio-high`, `--prio-medium`, `--prio-low` entfällt vollständig.
- Beim Token `--edge` steht heute „Breite der farbigen Prioritätskante an der Listenzeile" — daraus wird „Breite der farbigen Typkante an der Listenzeile".
- Im Baustein-Katalog entfällt der Eintrag `PrioritySelect`.
- Der Abschnitt „Aufgabentyp" bekommt einen Satz, dass diese Token nicht nur das Badge, sondern auch die Kante an Zeile und Karte färben.

- [ ] **Step 2: `AGENTS.md`**

- Im Abschnitt „MCP-Server": Erwähnungen der Priorität in der Tool-Beschreibung streichen.
- In der Liste der Testdateien prüfen, ob eine Datei mit Prioritätsbezug beschrieben wird, und den Text nachziehen.
- Prüfe, ob die vier „Fallen" im Persistenz-Abschnitt noch stimmen. Sie betreffen `localeCompare`, `COLLATE NOCASE`, Transaktionen und den Vorgabewert bei `updateCategory` — keine davon hängt an der Priorität, aber lies sie, bevor du das behauptest.

- [ ] **Step 3: Der vollständige Durchlauf**

```bash
npm run typecheck && npm run lint && npm test
npm run test:rust && npm run lint:rust
npm run test:e2e
```

Alles muss grün sein. Paste die echten Zahlen in den Bericht.

- [ ] **Step 4: Die letzte Suche**

```bash
grep -rn "priority\|Priority\|Prioritaet\|Priorität\|prio-" src/ src-tauri/src/ e2e/ AGENTS.md STYLEGUIDE.md
```

Erlaubt sind danach nur noch:
- die Migration in `src-tauri/src/lib.rs`, die die Spalte einst angelegt hat (Historie, wird nie geändert),
- das Test-`SCHEMA` in `src-tauri/src/mcp/store.rs`,
- Einträge in `CHANGELOG.md` und `src/version.ts`, die vergangene Versionen beschreiben.

Jeder andere Treffer gehört entfernt oder im Bericht begründet.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md STYLEGUIDE.md
git commit -m "docs: Prioritaet aus AGENTS.md und STYLEGUIDE.md entfernen"
```

---

## Was dieser Plan bewusst auslässt

- **Keine Migration.** Die Spalte `priority` bleibt in `todos` stehen, mit ihrem Vorgabewert `'medium'`. Ein `DROP COLUMN` wäre unwiderruflich.
- Kein Ersatzfeld für Dringlichkeit — die Fälligkeit trägt das allein.
- Kein Tie-Breaker über den Typ im Brett.
- Keine Änderung am `TypeBadge`, an der Typleiste oder an den Filtern.
- Kein Release. Version und Changelog sind eine eigene Entscheidung, nachdem dieser Plan durch ist.
