# Tags und Tag-Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aufgaben bekommen freie Tags; benannte Tag-Filter (Regeln „hat", „hat nicht", „hat keine Tags", verknüpft mit „alle" oder „mindestens eine") filtern Liste und Brett; MCP liest und setzt Tags.

**Architecture:** Tags liegen in einer Join-Tabelle `todo_tags(todo_id, name)` (SQLite) bzw. als `tags: string[]` am localStorage-Eintrag. Eine Normalisierungsregel existiert zweimal (TS `normalizeTag`, Rust `tags::normalize_tag`) und wird von beiden Seiten gegen dieselbe JSON-Beispieltabelle getestet. Filter sind reine Daten (`src/tagFilter.ts`) und liegen als Oberflächen-Vorliebe in `localStorage` (`src/listPrefs.ts`).

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, Playwright, Tauri 2, Rust + sqlx (SQLite), rmcp.

**Spec:** `docs/superpowers/specs/2026-09-25-tags-und-tagfilter-design.md`

**Vor jeder UI-Arbeit** `STYLEGUIDE.md` lesen (keine Emoji, keine Verläufe, Farben nur als Token).

**Kommentarstil:** Kommentare im Code auf Deutsch, Umlaute als ae/oe/ue/ss (wie im Bestand). Commit-Messages enden mit
`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

## Dateiübersicht

| Datei | Neu/Ändern | Verantwortung |
|---|---|---|
| `src-tauri/src/tag_cases.json` | neu | Beispieltabelle, gegen die TS und Rust normalisieren |
| `src/types.ts` | ändern | `Todo.tags`, `normalizeTag`, `normalizeTags`, `parseTags` |
| `src-tauri/src/tags.rs` | neu | `normalize_tag(s)`, `replace_tags`, `parse_tag_column` |
| `src-tauri/src/lib.rs` | ändern | `mod tags`, Migration 16, Command `set_todo_tags` |
| `src/storeTypes.ts`, `src/db.ts` | ändern | `TodoFieldsPatch.tags`, `listTags()` |
| `src/todoStoreLocal.ts` | ändern | Tags im Patch, `listTags` |
| `src/todoStoreSql.ts` | ändern | Tags lesen (json_group_array), schreiben (Command), `listTags` |
| `src/migrateLocalStorage.ts` | ändern | Tags mit übernehmen |
| `src-tauri/src/mcp/store.rs` | ändern | Tags lesen, `add_todo_tagged`, `update_todo` mit Tags in Transaktion |
| `src-tauri/src/mcp/tools.rs` | ändern | `tags`/`clear_tags`-Parameter, `check_tags` |
| `src/tagFilter.ts` | neu | Filtermodell, `matchesTagFilter`, `parseTagFilter`, `newTagFilterId` |
| `src/listPrefs.ts` | ändern | Filter und aktiver Filter in `localStorage` |
| `src/ui/TagChip.tsx` | neu | Baustein: Tag-Etikett |
| `src/ui/TagFilterSelect.tsx` | neu | Baustein: Filterauswahl + Bearbeiten/Neu (Liste und Brett) |
| `src/TagInput.tsx` | neu | Tag-Eingabe im Detailfenster |
| `src/TagFilterEditor.tsx` | neu | Editor-Modal |
| `src/ui/Modal.tsx`, `src/ui/index.ts` | ändern | Variante `tagFilter`, Exporte |
| `src/TodoDetailModal.tsx` | ändern | Feld „Tags" |
| `src/App.tsx`, `src/App.css` | ändern | Verdrahtung, Chips, Styles |
| `e2e/todolist.spec.ts` | ändern | End-to-End-Fall |
| `AGENTS.md`, `STYLEGUIDE.md` | ändern | Doku |

---

### Task 1: Tag-Regel in TypeScript und `Todo.tags`

**Files:**
- Create: `src-tauri/src/tag_cases.json`
- Modify: `src/types.ts`
- Modify: `src/todoStoreLocal.ts` (nur, damit es kompiliert)
- Modify (Fixtures): `src/App.test.tsx`, `src/TodoDetailModal.test.tsx`, `src/TrashModal.test.tsx`, `src/types.test.ts` und jede weitere Stelle, die `npm run typecheck` meldet
- Test: `src/types.test.ts`

- [ ] **Step 1: Beispieltabelle anlegen**

`src-tauri/src/tag_cases.json`:

```json
[
  { "input": "frontend", "output": "frontend" },
  { "input": "  Frontend  ", "output": "frontend" },
  { "input": "UX  Review", "output": "ux-review" },
  { "input": "tab\tgetrennt", "output": "tab-getrennt" },
  { "input": "ÄRZTE", "output": "ärzte" },
  { "input": "Ärger", "output": "ärger" },
  { "input": "Straße", "output": "straße" },
  { "input": "", "output": null },
  { "input": "   ", "output": null },
  { "input": "abcdefghijabcdefghijabcdefghijabcdefghij", "output": "abcdefghijabcdefghijabcdefghijabcdefghij" },
  { "input": "abcdefghijabcdefghijabcdefghijabcdefghijk", "output": null }
]
```

(Zeile 10 hat genau 40 Zeichen, Zeile 11 hat 41.)

- [ ] **Step 2: Failing tests schreiben**

Am Ende von `src/types.test.ts` anfügen. Imports oben ergänzen: `normalizeTag, normalizeTags, parseTags` aus `./types`, dazu

```ts
import { readFileSync } from "node:fs";
// Aliased wie in migrations.test.ts: jsdom ersetzt das globale URL.
import { URL as NodeURL } from "node:url";
```

```ts
// Dieselbe Tabelle prueft src-tauri/src/tags.rs. Laeuft eine Seite weg,
// faellt ihr Test -- sonst normalisierten Oberflaeche und MCP verschieden.
const TAG_CASES = JSON.parse(
  readFileSync(new NodeURL("../src-tauri/src/tag_cases.json", import.meta.url), "utf8")
) as { input: string; output: string | null }[];

describe("normalizeTag", () => {
  it.each(TAG_CASES)("normalisiert $input", ({ input, output }) => {
    expect(normalizeTag(input)).toBe(output);
  });
});

describe("normalizeTags", () => {
  it("normalisiert, entfernt Dubletten und Leeres, sortiert", () => {
    expect(normalizeTags(["Zebra", "  alpha", "ALPHA", " ", "ärger"])).toEqual([
      "alpha",
      "ärger",
      "zebra",
    ]);
  });
});

describe("parseTags", () => {
  it("liest die JSON-Spalte des SQL-Stores", () => {
    expect(parseTags('["b","a"]')).toEqual(["a", "b"]);
  });

  it("liest ein Array aus dem localStorage-Store", () => {
    expect(parseTags(["B", "a"])).toEqual(["a", "b"]);
  });

  it("liefert fuer Fehlendes und Kaputtes ein leeres Array", () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags("kein json")).toEqual([]);
    expect(parseTags('{"a":1}')).toEqual([]);
    expect(parseTags([1, "ok", null])).toEqual(["ok"]);
  });
});

describe("fromRow tags", () => {
  it("setzt ohne Spalte ein leeres Array", () => {
    const todo = fromRow({
      id: 1, title: "Alt", done: 0, created_at: "2026-01-01T00:00:00.000Z",
      due_date: null, category_id: null, category_name: null, category_color: null,
    });
    expect(todo.tags).toEqual([]);
  });

  it("liest die Spalte", () => {
    const todo = fromRow({
      id: 1, title: "Neu", done: 0, created_at: "2026-01-01T00:00:00.000Z",
      due_date: null, category_id: null, category_name: null, category_color: null,
      tags: '["frontend"]',
    });
    expect(todo.tags).toEqual(["frontend"]);
  });
});
```

(`fromRow` ist in `types.test.ts` vermutlich schon importiert; sonst ergänzen.)

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run src/types.test.ts`
Expected: FAIL — `normalizeTag` ist kein Export.

- [ ] **Step 4: Implementieren**

In `src/types.ts`:

1. In `interface Todo` nach `type: TodoType;`:

```ts
  /** Freie Schlagworte, immer normalisiert (`normalizeTag`) und sortiert.
   *  Leeres Array heisst "keine Tags". */
  tags: string[];
```

2. In `interface TodoRow` nach `type?: string;`:

```ts
  /** Der SQL-Store liefert die Tags als JSON-Text (json_group_array), der
   *  localStorage-Store als Array; Eintraege aus der Zeit davor gar nicht.
   *  `parseTags` nimmt alle drei. */
  tags?: string | string[];
```

3. In `fromRow` nach `type: toTodoType(row.type),`:

```ts
    tags: parseTags(row.tags),
```

4. Direkt nach `compareCategoryNames` einfügen:

```ts
/** Laenger darf ein Tag nach der Normalisierung nicht sein. Dieselbe Grenze
 *  steht als MAX_TAG_CHARS in src-tauri/src/tags.rs. */
export const MAX_TAG_CHARS = 40;

/**
 * Die eine Regel, was ein Tag ist: NFC, getrimmt, kleingeschrieben, jede
 * Folge von Leerraum im Inneren ein "-". Leer oder laenger als
 * MAX_TAG_CHARS heisst: kein Tag (`null`).
 *
 * `toLowerCase` statt SQLites `NOCASE`, das nur ASCII faltet -- sonst waeren
 * "Ärzte" und "ärzte" zwei Tags. Die Rust-Seite (`tags::normalize_tag`) prueft
 * sich gegen dieselbe Tabelle `src-tauri/src/tag_cases.json`.
 */
export function normalizeTag(raw: string): string | null {
  const tag = raw.normalize("NFC").trim().toLowerCase().split(/\s+/).join("-");
  if (tag === "" || [...tag].length > MAX_TAG_CHARS) return null;
  return tag;
}

/** Normalisiert eine Menge Tags: Unbrauchbares faellt weg, Dubletten auch,
 *  sortiert wird wie bei Kategorien. */
export function normalizeTags(raw: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const value of raw) {
    const tag = normalizeTag(value);
    if (tag !== null) tags.add(tag);
  }
  return [...tags].sort(compareCategoryNames);
}

/** Liest Tags aus einer Speicherquelle: JSON-Text, Array oder nichts. */
export function parseTags(value: unknown): string[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return normalizeTags(list.filter((item): item is string => typeof item === "string"));
}
```

5. `src/todoStoreLocal.ts`, damit es kompiliert:
   - Import `parseTags` aus `./types` ergänzen.
   - Im Typ `StoredTodo` `"tags"` in beide Listen aufnehmen (`Omit<…, "status" | "description" | "board_order" | "type" | "tags">` und `Partial<Pick<…, … | "tags">>`).
   - In `migrateTodos` nach `const type = …`: `const tags = parseTags(todo.tags);` und `tags` in beide `return { … }`-Objekte aufnehmen. Kommentar über `migrateTodos` um „`tags` mit den Tags" ergänzen.
   - In `addTodo` im Objektliteral nach `type,`: `tags: [],`.

6. Fixtures: `npm run typecheck` laufen lassen und jeder gemeldeten `Todo`-Konstruktion `tags: []` geben. Bekannt: `todoBase` in `src/App.test.tsx:77`, `makeTodo` in `src/TodoDetailModal.test.tsx`, `makeTodo` in `src/TrashModal.test.tsx`, Todo-Literale in `src/types.test.ts`.

- [ ] **Step 5: Tests und Typecheck**

Run: `npm run typecheck && npx vitest run src/types.test.ts src/todoStoreLocal.test.ts`
Expected: PASS. Wenn ein `toEqual` in `todoStoreLocal.test.ts` jetzt über `tags` stolpert, dort `tags: []` in die Erwartung aufnehmen.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/tag_cases.json src/types.ts src/types.test.ts src/todoStoreLocal.ts src/*.test.tsx src/*.test.ts
git commit -m "feat: Tag-Regel und Todo.tags"
```

---

### Task 2: Tag-Regel in Rust (`tags.rs`)

**Files:**
- Create: `src-tauri/src/tags.rs`
- Modify: `src-tauri/src/lib.rs:1-2` (`mod tags;`)
- Modify: `src-tauri/src/mcp/store.rs` (`SCHEMA`, Zeile ~911)

- [ ] **Step 1: Testschema erweitern**

In `src-tauri/src/mcp/store.rs` im Array `SCHEMA` direkt nach dem `CREATE TABLE todos (...)`-Eintrag:

```rust
    "CREATE TABLE todo_tags (
        todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        PRIMARY KEY (todo_id, name)
    );",
```

Den Doc-Kommentar über `SCHEMA` von „nach Migration 12" auf „nach Migration 16" ändern.

- [ ] **Step 2: Modul mit Tests schreiben**

`src-tauri/src/tags.rs`:

```rust
//! Was ein Tag ist, und das Ersetzen der Tag-Menge einer Aufgabe.
//!
//! `normalize_tag` spiegelt `normalizeTag` in src/types.ts. Beide Seiten
//! pruefen sich gegen dieselbe Tabelle `tag_cases.json` -- laeuft eine weg,
//! faellt ihr Test, statt dass Oberflaeche und MCP still verschieden
//! normalisieren.

use sqlx::SqliteConnection;
use unicode_normalization::UnicodeNormalization;

use crate::mcp::store::compare_category_names;

/// Dieselbe Grenze wie `MAX_TAG_CHARS` in src/types.ts.
pub const MAX_TAG_CHARS: usize = 40;

/// NFC, getrimmt, kleingeschrieben, Leerraum im Inneren zu "-". `None`, wenn
/// danach nichts uebrig ist oder es laenger als `MAX_TAG_CHARS` Zeichen ist.
pub fn normalize_tag(raw: &str) -> Option<String> {
    let composed: String = raw.nfc().collect();
    let lowered = composed.trim().to_lowercase();
    let tag = lowered.split_whitespace().collect::<Vec<_>>().join("-");
    if tag.is_empty() || tag.chars().count() > MAX_TAG_CHARS {
        return None;
    }
    Some(tag)
}

/// Normalisiert, wirft Unbrauchbares und Dubletten weg, sortiert wie Kategorien.
pub fn normalize_tags(raw: &[String]) -> Vec<String> {
    let mut tags: Vec<String> = raw.iter().filter_map(|tag| normalize_tag(tag)).collect();
    tags.sort_by(|a, b| compare_category_names(a, b));
    tags.dedup();
    tags
}

/// Die Tags aus der Spalte `json_group_array(...)` der Leseabfragen. Kaputtes
/// JSON wird zu "keine Tags" -- das hier laeuft in Tool-Ruempfen, und die
/// duerfen nicht panicken.
pub fn parse_tag_column(json: &str) -> Vec<String> {
    let raw: Vec<String> = serde_json::from_str(json).unwrap_or_default();
    normalize_tags(&raw)
}

/// Ersetzt die Tags einer Aufgabe vollstaendig.
///
/// Laeuft auf der Verbindung des Aufrufers, damit er es in seine Transaktion
/// stellen kann -- allein aufgerufen waeren DELETE und INSERTs keine Einheit.
/// `tags` muss bereits durch `normalize_tags` gegangen sein.
pub async fn replace_tags(
    conn: &mut SqliteConnection,
    todo_id: i64,
    tags: &[String],
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM todo_tags WHERE todo_id = ?")
        .bind(todo_id)
        .execute(&mut *conn)
        .await?;
    for tag in tags {
        sqlx::query("INSERT INTO todo_tags (todo_id, name) VALUES (?, ?)")
            .bind(todo_id)
            .bind(tag)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::store::SCHEMA;
    use sqlx::{Pool, Sqlite, SqlitePool};

    #[derive(serde::Deserialize)]
    struct Case {
        input: String,
        output: Option<String>,
    }

    #[test]
    fn normalizes_exactly_like_the_frontend() {
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("tag_cases.json")).expect("tag_cases.json");
        for case in cases {
            assert_eq!(
                normalize_tag(&case.input),
                case.output,
                "input {:?}",
                case.input
            );
        }
    }

    #[test]
    fn normalize_tags_dedups_and_sorts() {
        let tags = normalize_tags(&[
            "Zebra".to_string(),
            "  alpha".to_string(),
            "ALPHA".to_string(),
            " ".to_string(),
        ]);
        assert_eq!(tags, vec!["alpha".to_string(), "zebra".to_string()]);
    }

    #[test]
    fn parse_tag_column_survives_garbage() {
        assert!(parse_tag_column("kein json").is_empty());
        assert_eq!(parse_tag_column(r#"["b","a"]"#), vec!["a", "b"]);
    }

    async fn pool_with_todo() -> (Pool<Sqlite>, i64) {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("enable foreign keys");
        for statement in SCHEMA {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("create schema");
        }
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at) VALUES ('A', '2026-01-01T00:00:00.000Z') RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert todo");
        (pool, id)
    }

    async fn tags_of(pool: &Pool<Sqlite>, id: i64) -> Vec<String> {
        sqlx::query_scalar("SELECT name FROM todo_tags WHERE todo_id = ? ORDER BY name")
            .bind(id)
            .fetch_all(pool)
            .await
            .expect("select tags")
    }

    #[tokio::test]
    async fn replace_tags_replaces_the_whole_set() {
        let (pool, id) = pool_with_todo().await;
        let mut conn = pool.acquire().await.expect("connection");
        replace_tags(&mut conn, id, &["alt".to_string()])
            .await
            .expect("first");
        replace_tags(&mut conn, id, &["a".to_string(), "b".to_string()])
            .await
            .expect("second");
        drop(conn);
        assert_eq!(tags_of(&pool, id).await, vec!["a", "b"]);
    }

    #[tokio::test]
    async fn purging_a_todo_takes_its_tags_along() {
        let (pool, id) = pool_with_todo().await;
        let mut conn = pool.acquire().await.expect("connection");
        replace_tags(&mut conn, id, &["a".to_string()])
            .await
            .expect("tags");
        drop(conn);
        sqlx::query("DELETE FROM todos WHERE id = ?")
            .bind(id)
            .execute(&pool)
            .await
            .expect("purge");
        assert!(tags_of(&pool, id).await.is_empty());
    }
}
```

In `src-tauri/src/lib.rs` nach `mod mcp;`: `mod tags;`

- [ ] **Step 3: Rust-Tests laufen lassen**

Run: `npm run test:rust -- tags`
Expected: PASS (5 Tests in `tags::tests`). Falls `compare_category_names` nicht erreichbar ist: es ist `pub fn` in `pub mod store` von `mod mcp` — innerhalb des Crates sichtbar; bei einem Fehler die genaue Meldung lesen, nicht raten.

- [ ] **Step 4: Clippy**

Run: `npm run lint:rust`
Expected: höchstens `dead_code` für `replace_tags` und `parse_tag_column` — sie bekommen ihre Aufrufer erst in Task 3 bzw. Task 6. Nicht mit `#[allow]` zudecken; jede **andere** Warnung jetzt beheben. Ab Task 6 muss `lint:rust` ganz sauber sein.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tags.rs src-tauri/src/lib.rs src-tauri/src/mcp/store.rs
git commit -m "feat: Tag-Regel in Rust, gleiche Tabelle wie das Frontend"
```

---

### Task 3: Migration 16 und Command `set_todo_tags`

**Files:**
- Modify: `src-tauri/src/lib.rs` (Command bei `replace_time_day`, Migrationsliste, `generate_handler!`, Tests)
- Test: `src/migrations.test.ts`

- [ ] **Step 1: Failing Migrationstest**

In `src/migrations.test.ts` im `describe` anfügen:

```ts
  it("adds the todo_tags table with a cascading foreign key", () => {
    expect(source).toContain("add_todo_tags");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS todo_tags");
    expect(source).toContain("REFERENCES todos(id) ON DELETE CASCADE");
  });
```

Run: `npx vitest run src/migrations.test.ts` → FAIL.

- [ ] **Step 2: Migration eintragen**

In `src-tauri/src/lib.rs` nach Migration 15 (vor `];`):

```rust
        // Tags haengen an der Aufgabe; eine Tabelle `tags` gibt es nicht, weil
        // es ohne Farbe und ohne Umbenennen dort nichts zu speichern gaebe. Ein
        // Tag existiert, solange eine Zeile ihn traegt -- auch die einer Aufgabe
        // im Papierkorb. Endgueltiges Loeschen nimmt die Zeilen per CASCADE mit.
        // Die Namen kommen normalisiert an (`normalizeTag` in src/types.ts,
        // `tags::normalize_tag` hier), der Primaerschluessel verhindert darum
        // auch Gross-/Kleinschreibungs-Dubletten.
        Migration {
            version: 16,
            description: "add_todo_tags",
            sql: "CREATE TABLE IF NOT EXISTS todo_tags (
                todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                PRIMARY KEY (todo_id, name)
            );
            CREATE INDEX IF NOT EXISTS idx_todo_tags_name ON todo_tags(name);",
            kind: MigrationKind::Up,
        },
```

Run: `npx vitest run src/migrations.test.ts` → PASS.

- [ ] **Step 3: Failing Rust-Tests für den Command**

Im `#[cfg(test)] mod tests` von `lib.rs` anfügen (dort gibt es schon `use super::*;` und tokio-Tests):

```rust
    async fn tag_pool() -> Pool<Sqlite> {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("enable foreign keys");
        for statement in crate::mcp::store::SCHEMA {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("create schema");
        }
        pool
    }

    async fn insert_todo(pool: &Pool<Sqlite>, deleted: bool) -> i64 {
        sqlx::query_scalar(
            "INSERT INTO todos (title, created_at, deleted_at) VALUES ('A', '2026-01-01T00:00:00.000Z', ?) RETURNING id",
        )
        .bind(if deleted { Some("2026-01-02T00:00:00.000Z") } else { None })
        .fetch_one(pool)
        .await
        .expect("insert todo")
    }

    async fn tag_names(pool: &Pool<Sqlite>, id: i64) -> Vec<String> {
        sqlx::query_scalar("SELECT name FROM todo_tags WHERE todo_id = ? ORDER BY name")
            .bind(id)
            .fetch_all(pool)
            .await
            .expect("select tags")
    }

    #[tokio::test]
    async fn set_todo_tags_replaces_and_normalizes() {
        let pool = tag_pool().await;
        let id = insert_todo(&pool, false).await;
        set_todo_tags_tx(&pool, id, &["alt".to_string()]).await.expect("first");
        set_todo_tags_tx(&pool, id, &["Zebra".to_string(), " alpha ".to_string()])
            .await
            .expect("second");
        assert_eq!(tag_names(&pool, id).await, vec!["alpha", "zebra"]);
    }

    #[tokio::test]
    async fn set_todo_tags_refuses_a_todo_in_the_trash() {
        let pool = tag_pool().await;
        let id = insert_todo(&pool, true).await;
        let error = set_todo_tags_tx(&pool, id, &["a".to_string()])
            .await
            .expect_err("trash is not writable");
        assert_eq!(error, format!("Todo {id} not found"));
        assert!(tag_names(&pool, id).await.is_empty());
    }

    #[tokio::test]
    async fn a_failure_mid_write_leaves_the_tags_unchanged() {
        let pool = tag_pool().await;
        let id = insert_todo(&pool, false).await;
        set_todo_tags_tx(&pool, id, &["alt".to_string()]).await.expect("first");
        sqlx::query(
            "CREATE TRIGGER fail_on_kaputt BEFORE INSERT ON todo_tags
             WHEN NEW.name = 'kaputt' BEGIN SELECT RAISE(ABORT, 'kaputt'); END;",
        )
        .execute(&pool)
        .await
        .expect("trigger");

        let result =
            set_todo_tags_tx(&pool, id, &["alpha".to_string(), "kaputt".to_string()]).await;

        assert!(result.is_err());
        assert_eq!(tag_names(&pool, id).await, vec!["alt"]);
    }
```

Run: `npm run test:rust -- set_todo_tags a_failure_mid_write` → FAIL (Funktion fehlt).

- [ ] **Step 4: Command implementieren**

In `lib.rs` den Pool-Abgriff aus `replace_time_day` in eine Hilfsfunktion ziehen und darunter den neuen Command setzen:

```rust
/// Der Pool, den das JS-Plugin mit `Database.load` geoeffnet hat.
async fn loaded_pool(app: &tauri::AppHandle) -> Result<Pool<Sqlite>, String> {
    let instances = app.state::<DbInstances>();
    let map = instances.0.read().await;
    let db_pool = map
        .get(DB_URL)
        .ok_or_else(|| format!("database {DB_URL} not loaded"))?;
    match db_pool {
        DbPool::Sqlite(pool) => Ok(pool.clone()),
    }
}

#[tauri::command]
async fn replace_time_day(
    app: tauri::AppHandle,
    date: String,
    slots: Vec<TimeSlotInput>,
) -> Result<(), String> {
    let pool = loaded_pool(&app).await?;
    replace_time_day_tx(&pool, &date, &slots)
        .await
        .map_err(|e| e.to_string())
}

/// Ersetzt die Tags einer Aufgabe in einer Transaktion auf einer gehaltenen
/// Verbindung -- aus demselben Grund wie `replace_time_day_tx`. Eine
/// unbekannte oder im Papierkorb liegende Id lehnt mit `Todo <id> not found`
/// ab, derselben Meldung wie die Stores in src/.
async fn set_todo_tags_tx(pool: &Pool<Sqlite>, id: i64, tags: &[String]) -> Result<(), String> {
    let tags = tags::normalize_tags(tags);
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let live: Option<i64> =
        sqlx::query_scalar("SELECT id FROM todos WHERE id = ? AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    if live.is_none() {
        return Err(format!("Todo {id} not found"));
    }
    tags::replace_tags(&mut tx, id, &tags)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_todo_tags(app: tauri::AppHandle, id: i64, tags: Vec<String>) -> Result<(), String> {
    let pool = loaded_pool(&app).await?;
    set_todo_tags_tx(&pool, id, &tags).await
}
```

(`&mut tx` auf `Transaction<Sqlite>` dereferenziert zu `&mut SqliteConnection`; meldet der Compiler einen Typfehler, `&mut *tx` schreiben.)

In `generate_handler![...]` `set_todo_tags` nach `replace_time_day` ergänzen.

- [ ] **Step 5: Tests und Clippy**

Run: `npm run test:rust && npm run lint:rust`
Expected: Tests PASS; Clippy höchstens noch `dead_code` für `parse_tag_column` (Aufrufer kommt in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src/migrations.test.ts
git commit -m "feat: Tabelle todo_tags und Command set_todo_tags"
```

---

### Task 4: Store-Vertrag und localStorage-Store

**Files:**
- Modify: `src/storeTypes.ts`, `src/db.ts`, `src/todoStoreLocal.ts`
- Test: `src/todoStoreLocal.test.ts`, `src/db.test.ts` (nur falls er die Funktionsliste prüft)

- [ ] **Step 1: Failing tests**

Am Ende von `src/todoStoreLocal.test.ts`:

```ts
describe("localTodoStore tags", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts a new todo without tags", async () => {
    const todo = await localTodoStore.addTodo("A", null);
    expect(todo.tags).toEqual([]);
  });

  it("replaces the tags through updateTodoFields, normalized and sorted", async () => {
    const todo = await localTodoStore.addTodo("A", null);
    const updated = await localTodoStore.updateTodoFields(todo.id, {
      tags: ["Zebra", " alpha ", "ALPHA"],
    });
    expect(updated.tags).toEqual(["alpha", "zebra"]);
    const [listed] = await localTodoStore.listTodos();
    expect(listed.tags).toEqual(["alpha", "zebra"]);
  });

  it("leaves the tags alone when the patch does not name them", async () => {
    const todo = await localTodoStore.addTodo("A", null);
    await localTodoStore.updateTodoFields(todo.id, { tags: ["frontend"] });
    const updated = await localTodoStore.updateTodoFields(todo.id, { title: "B" });
    expect(updated.tags).toEqual(["frontend"]);
  });

  it("clears the tags with an empty list", async () => {
    const todo = await localTodoStore.addTodo("A", null);
    await localTodoStore.updateTodoFields(todo.id, { tags: ["frontend"] });
    const updated = await localTodoStore.updateTodoFields(todo.id, { tags: [] });
    expect(updated.tags).toEqual([]);
  });

  it("keeps the tags through trash and restore", async () => {
    const todo = await localTodoStore.addTodo("A", null);
    await localTodoStore.updateTodoFields(todo.id, { tags: ["frontend"] });
    await localTodoStore.deleteTodo(todo.id);
    const restored = await localTodoStore.restoreTodo(todo.id);
    expect(restored.tags).toEqual(["frontend"]);
  });

  it("lists tags of todos in the trash, but not of purged ones", async () => {
    const a = await localTodoStore.addTodo("A", null);
    await localTodoStore.updateTodoFields(a.id, { tags: ["frontend"] });
    const b = await localTodoStore.addTodo("B", null);
    await localTodoStore.updateTodoFields(b.id, { tags: ["alt", "frontend"] });
    await localTodoStore.deleteTodo(b.id);

    expect(await localTodoStore.listTags()).toEqual(["alt", "frontend"]);

    await localTodoStore.purgeTodo(b.id);
    expect(await localTodoStore.listTags()).toEqual(["frontend"]);
  });

  it("reads an entry written before tags existed as untagged", async () => {
    localStorage.setItem(
      "todolist_todos",
      JSON.stringify([
        {
          id: 1, title: "Alt", done: false, created_at: "2026-01-01T00:00:00.000Z",
          due_date: null, category_id: null, category_name: null, category_color: null,
        },
      ])
    );
    const [todo] = await localTodoStore.listTodos();
    expect(todo.tags).toEqual([]);
  });
});
```

Run: `npx vitest run src/todoStoreLocal.test.ts` → FAIL (`tags` nicht im Patch-Typ, `listTags` fehlt).

- [ ] **Step 2: Vertrag erweitern**

In `src/storeTypes.ts` in `TodoFieldsPatch` nach `categoryId?`:

```ts
  /**
   * Ersetzt die Tags vollstaendig; `[]` leert, fehlend laesst sie stehen. Die
   * Stores bereinigen mit `normalizeTags` aus types.ts.
   *
   * Begruendete Abweichung vom "alles oder nichts" dieses Aufrufs: im
   * SQL-Store schreibt ein UPDATE ueber das Plugin die Spalten, danach der
   * Tauri-Command `set_todo_tags` die Tags -- tauri-plugin-sql kennt keine
   * Transaktion ueber mehrere Aufrufe (siehe AGENTS.md). Scheitert der zweite
   * Schritt, stehen die Spalten schon und der Fehler erreicht den Aufrufer;
   * das Detail-Fenster bleibt dann offen, und ein zweites Sichern schreibt
   * dieselben Werte noch einmal -- beide Schritte sind idempotent.
   */
  tags?: string[];
```

In `interface TodoStore` nach `listDeletedTodos`:

```ts
  /**
   * Alle Tags, die irgendeine Aufgabe traegt -- auch eine im Papierkorb, damit
   * ein Tag nicht aus den Vorschlaegen faellt, nur weil seine letzte Aufgabe
   * gerade dort liegt. Ohne Dubletten, sortiert wie Kategorien. Endgueltig
   * geloeschte Aufgaben tragen nichts mehr bei.
   */
  listTags(): Promise<string[]>;
```

In `src/db.ts` nach `listDeletedTodos`:

```ts
export function listTags(): Promise<string[]> {
  return store().listTags();
}
```

- [ ] **Step 3: localStorage-Store**

In `src/todoStoreLocal.ts`:
- Import `normalizeTags` ergänzen.
- In `updateTodoFields` nach der `patch.categoryId`-Behandlung:

```ts
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
```

- Nach `listDeletedTodos`:

```ts
// Ueber alle Eintraege, auch die im Papierkorb -- siehe Vertrag in storeTypes.ts.
function listTags(): Promise<string[]> {
  return Promise.resolve(normalizeTags(loadTodos().flatMap((t) => t.tags)));
}
```

- `listTags` in `localTodoStore` nach `listDeletedTodos` aufnehmen.

`sqlTodoStore` muss das Interface ebenfalls erfüllen, sonst bricht der Typecheck. Darum schon hier in `src/todoStoreSql.ts` (Import `normalizeTags` aus `./types` ergänzen), nach `listDeletedTodos`:

```ts
// Ohne Papierkorb-Bedingung, mit Absicht: todo_tags haengt auch an abgelegten
// Aufgaben, endgueltig geloeschte hat das CASCADE schon mitgenommen.
async function listTags(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ name: string }[]>("SELECT DISTINCT name FROM todo_tags");
  return normalizeTags(rows.map((r) => r.name));
}
```

und `listTags` in `sqlTodoStore` nach `listDeletedTodos` aufnehmen. Der Test dazu kommt in Task 5.

- [ ] **Step 4: Tests**

Run: `npx vitest run src/todoStoreLocal.test.ts src/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storeTypes.ts src/db.ts src/todoStoreLocal.ts src/todoStoreLocal.test.ts src/todoStoreSql.ts
git commit -m "feat: Tags im Store-Vertrag und im localStorage-Store"
```

---

### Task 5: SQL-Store und localStorage-Migration

**Files:**
- Modify: `src/todoStoreSql.ts`, `src/migrateLocalStorage.ts`
- Test: `src/todoStoreSql.test.ts`, `src/migrateLocalStorage.test.ts`

- [ ] **Step 1: Failing tests SQL-Store**

In `src/todoStoreSql.test.ts` oben nach den `vi.mock("./sqlClient", …)`:

```ts
const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
```

Am Ende:

```ts
describe("sqlTodoStore tags", () => {
  beforeEach(() => {
    select.mockReset();
    execute.mockReset();
    invoke.mockReset();
    execute.mockResolvedValue({ rowsAffected: 1 });
    invoke.mockResolvedValue(undefined);
  });

  it("reads the tags from the json column", async () => {
    select.mockResolvedValue([{ ...ROW, tags: '["zebra","alpha"]' }]);
    const [todo] = await sqlTodoStore.listTodos();

    expect(select.mock.calls[0][0] as string).toContain("todo_tags");
    expect(todo.tags).toEqual(["alpha", "zebra"]);
  });

  it("writes the columns first, then the tags through set_todo_tags", async () => {
    select.mockResolvedValue([ROW]);
    await sqlTodoStore.updateTodoFields(7, { title: "Neu", tags: ["B", "a"] });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("set_todo_tags", { id: 7, tags: ["a", "b"] });
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
  });

  it("skips the UPDATE for a tags-only patch", async () => {
    select.mockResolvedValue([ROW]);
    await sqlTodoStore.updateTodoFields(7, { tags: [] });

    expect(execute).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("set_todo_tags", { id: 7, tags: [] });
  });

  it("does not touch the tags when the patch does not name them", async () => {
    select.mockResolvedValue([ROW]);
    await sqlTodoStore.updateTodoFields(7, { title: "Neu" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("lists tags straight from todo_tags, trash included", async () => {
    select.mockResolvedValue([{ name: "b" }, { name: "a" }]);
    expect(await sqlTodoStore.listTags()).toEqual(["a", "b"]);

    const sql = select.mock.calls[0][0] as string;
    expect(sql).toContain("FROM todo_tags");
    expect(sql).not.toContain("deleted_at");
  });
});
```

Run: `npx vitest run src/todoStoreSql.test.ts` → FAIL.

- [ ] **Step 2: Lesen**

In `src/todoStoreSql.ts` `TODO_COLUMNS` ersetzen:

```ts
// Die Tags kommen als JSON-Text einer Unterabfrage, nicht ueber einen JOIN:
// ein JOIN auf todo_tags vervielfachte die Zeilen je Tag. json_group_array
// liefert fuer eine Aufgabe ohne Tags "[]"; fromRow parst und sortiert.
const TODO_COLUMNS = `
  t.id, t.title, t.description, t.done, t.status, t.type, t.created_at,
  t.due_date, t.category_id, t.board_order,
  c.name AS category_name, c.color AS category_color,
  (SELECT json_group_array(tt.name) FROM todo_tags tt WHERE tt.todo_id = t.id) AS tags
`;
```

- [ ] **Step 3: Schreiben**

Import ergänzen: `import { invoke } from "@tauri-apps/api/core";` (`normalizeTags` und `listTags` sind seit Task 4 da).

Das Ende von `updateTodoFields` (ab `// Ein leerer Patch …`) ersetzen durch:

```ts
  const db = await getDb();
  // Kein UPDATE ohne SET-Liste, das waere ein Syntaxfehler -- ein Patch nur
  // mit Tags oder ganz ohne Felder springt darueber.
  if (assignments.length > 0) {
    // Selber Guard wie in updateColumn -- dieser Pfad geht nicht ueber sie.
    await db.execute(
      `UPDATE todos SET ${assignments.join(", ")} WHERE id = $${params.length + 1} AND ${NOT_DELETED_HERE}`,
      [...params, id]
    );
  }
  // Zweiter, fuer sich atomarer Schritt -- die Abweichung steht im Vertrag
  // von TodoFieldsPatch.tags in storeTypes.ts. Der Command lehnt eine
  // unbekannte oder abgelegte Id selbst mit "Todo <id> not found" ab.
  if (patch.tags !== undefined) {
    await invoke("set_todo_tags", { id, tags: normalizeTags(patch.tags) });
  }
  // selectTodo prueft auch beim leeren Patch, ob es die Aufgabe gibt.
  return selectTodo(id);
```

Run: `npx vitest run src/todoStoreSql.test.ts` → PASS.

- [ ] **Step 4: Failing test Migration**

In `src/migrateLocalStorage.test.ts` nach dem Test „carries the board position over from localStorage":

```ts
  it("carries the tags over, normalized", async () => {
    set(TODOS_KEY, [
      {
        id: 12,
        title: "Getaggt",
        done: false,
        created_at: "2026-01-02",
        due_date: null,
        category_id: null,
        tags: ["Frontend", "frontend", "UX Review"],
      },
    ]);

    await migrateLocalStorage();

    const tagCalls = execute.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT OR IGNORE INTO todo_tags")
    );
    expect(tagCalls.map((c) => c[1])).toEqual([
      [12, "frontend"],
      [12, "ux-review"],
    ]);
  });
```

Run: `npx vitest run src/migrateLocalStorage.test.ts` → FAIL.

- [ ] **Step 5: Migration implementieren**

In `src/migrateLocalStorage.ts` Import `parseTags` aus `./types` ergänzen. Direkt nach dem `await db.execute(\`INSERT OR IGNORE INTO todos …\`)` in der Todo-Schleife:

```ts
    // Die Tags hinterher, mit derselben Id: der Eintrag behaelt sie oben per
    // INSERT OR IGNORE. OR IGNORE auch hier -- ein zweiter Lauf nach einem
    // abgebrochenen ersten darf nicht an schon geschriebenen Zeilen scheitern.
    for (const tag of parseTags(todo.tags)) {
      await db.execute("INSERT OR IGNORE INTO todo_tags (todo_id, name) VALUES ($1, $2)", [
        todo.id,
        tag,
      ]);
    }
```

Run: `npx vitest run src/migrateLocalStorage.test.ts` → PASS.

- [ ] **Step 6: Alles TS**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/todoStoreSql.ts src/todoStoreSql.test.ts src/migrateLocalStorage.ts src/migrateLocalStorage.test.ts
git commit -m "feat: Tags im SQL-Store und in der localStorage-Migration"
```

---

### Task 6: MCP-Store liest und schreibt Tags

**Files:**
- Modify: `src-tauri/src/mcp/store.rs`

- [ ] **Step 1: Failing tests**

Im `mod tests` von `store.rs` anfügen:

```rust
    async fn tag_rows(pool: &Pool<Sqlite>, id: i64) -> Vec<String> {
        sqlx::query_scalar("SELECT name FROM todo_tags WHERE todo_id = ? ORDER BY name")
            .bind(id)
            .fetch_all(pool)
            .await
            .expect("select tags")
    }

    #[tokio::test]
    async fn add_todo_tagged_stores_normalized_tags() {
        let pool = setup().await;
        let todo = add_todo_tagged(
            &pool,
            "Mit Tags",
            None,
            None,
            None,
            None,
            &["Zebra".to_string(), "alpha".to_string(), "ALPHA".to_string()],
        )
        .await
        .expect("add");
        assert_eq!(todo.tags, vec!["alpha", "zebra"]);

        let listed = list_todos(&pool, None, None, None).await.expect("list");
        assert_eq!(listed[0].tags, vec!["alpha", "zebra"]);
    }

    #[tokio::test]
    async fn a_todo_without_tags_lists_an_empty_list() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Ohne", None, None, None, None)
            .await
            .expect("add");
        assert!(todo.tags.is_empty());
    }

    #[tokio::test]
    async fn update_todo_replaces_clears_and_keeps_tags() {
        let pool = setup().await;
        let todo = add_todo_tagged(&pool, "T", None, None, None, None, &["alt".to_string()])
            .await
            .expect("add");

        let kept = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                title: Some("Neu".into()),
                ..TodoUpdate::default()
            },
        )
        .await
        .expect("title only");
        assert_eq!(kept.tags, vec!["alt"]);

        let replaced = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                tags: Some(vec!["b".into(), "a".into()]),
                ..TodoUpdate::default()
            },
        )
        .await
        .expect("tags only is not an empty update");
        assert_eq!(replaced.tags, vec!["a", "b"]);

        let cleared = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                tags: Some(Vec::new()),
                ..TodoUpdate::default()
            },
        )
        .await
        .expect("clear");
        assert!(cleared.tags.is_empty());
    }

    #[tokio::test]
    async fn tags_stay_with_a_todo_in_the_trash() {
        let pool = setup().await;
        let todo = add_todo_tagged(&pool, "Weg", None, None, None, None, &["a".to_string()])
            .await
            .expect("add");
        delete_todo(&pool, todo.id).await.expect("trash");
        assert_eq!(tag_rows(&pool, todo.id).await, vec!["a"]);
    }
```

Run: `npm run test:rust -- mcp::store` → FAIL (Kompilierfehler: `add_todo_tagged`, `tags`).

- [ ] **Step 2: Lesen**

In `store.rs`:
- `use crate::tags;` zu den Imports.
- `struct Todo` nach `pub r#type: String,`:

```rust
    /// Normalisiert und sortiert; leer heisst "keine Tags".
    pub tags: Vec<String>,
```

- `struct TodoRow` nach `r#type: String,`: `tags: String,`
- `impl From<TodoRow> for Todo`: `tags: tags::parse_tag_column(&row.tags),`
- `TODO_COLUMNS` ersetzen:

```rust
const TODO_COLUMNS: &str = "t.id, t.title, t.description, t.done, t.status, t.type,
     t.created_at, t.due_date, t.category_id, c.name AS category_name, c.color AS category_color,
     (SELECT json_group_array(tt.name) FROM todo_tags tt WHERE tt.todo_id = t.id) AS tags";
```

(Dieselbe Unterabfrage wie `TODO_COLUMNS` in src/todoStoreSql.ts — im Kommentar darüber vermerken.)

- [ ] **Step 3: `TodoUpdate`**

```rust
    /// `None` unveraendert, `Some(leer)` leert, sonst ersetzt die Menge.
    pub tags: Option<Vec<String>>,
```

und in `is_empty` `&& self.tags.is_none()` anhängen.

- [ ] **Step 4: `add_todo_tagged`**

Die bestehende `add_todo` umbenennen in `add_todo_tagged` mit zusätzlichem letzten Parameter `tags: &[String]`, darüber eine dünne `add_todo` behalten (die Tests rufen sie mit sechs Argumenten):

```rust
/// `add_todo_tagged` ohne Tags.
pub async fn add_todo(
    pool: &Pool<Sqlite>,
    title: &str,
    due_date: Option<&str>,
    category: Option<&str>,
    description: Option<&str>,
    todo_type: Option<&str>,
) -> Result<Todo, StoreError> {
    add_todo_tagged(pool, title, due_date, category, description, todo_type, &[]).await
}
```

Im Rumpf von `add_todo_tagged` das INSERT und das Anhängen der Tags in eine Transaktion stellen (ab `let insert = …`):

```rust
    let new_tags = tags::normalize_tags(tags);

    // INSERT und Tags in einer Transaktion: eine Aufgabe, deren Tags nicht
    // geschrieben werden konnten, soll es gar nicht erst geben.
    let mut tx = pool.begin().await?;
    let insert = sqlx::query_scalar(
        "INSERT INTO todos (title, description, done, status, type, created_at, due_date, category_id)
         VALUES (?, ?, 0, 'todo', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?)
         RETURNING id",
    )
    .bind(title)
    .bind(description)
    .bind(todo_type)
    .bind(due_date)
    .bind(category_id)
    .fetch_one(&mut *tx)
    .await;
    let id: i64 = match insert {
        Ok(id) => id,
        // Erst die Transaktion aufgeben, dann nachschlagen: sie haelt eine
        // Verbindung, und map_category_fk_error fragt den Pool.
        Err(error) if category_id.is_some() => {
            drop(tx);
            return Err(map_category_fk_error(pool, error).await);
        }
        Err(error) => return Err(error.into()),
    };
    tags::replace_tags(&mut tx, id, &new_tags).await?;
    tx.commit().await?;

    select_todo(pool, id).await
```

(Der Kommentar zu `strftime` bleibt über dem INSERT stehen.)

- [ ] **Step 5: `update_todo`**

Nach `let existing = select_todo(pool, id).await?;` und dem Aufbau von `assignments` den Schreibteil (ab `let sql = format!(`) so umbauen:

```rust
    let new_tags = update.tags.as_deref().map(tags::normalize_tags);

    // Spalten und Tags in einer Transaktion: ein Aufruf mit beidem soll
    // entweder ganz oder gar nicht wirken.
    let mut tx = pool.begin().await?;
    if !assignments.is_empty() {
        let sql = format!(
            "UPDATE todos SET {} WHERE id = ? AND {NOT_DELETED_HERE}",
            assignments.join(", ")
        );
        let mut query = sqlx::query(&sql);
        // … die bestehenden `if let Some(...) { query = query.bind(...) }`-Bloecke unveraendert …
        if let Err(error) = query.bind(existing.id).execute(&mut *tx).await {
            drop(tx);
            if category_id.is_some() {
                return Err(map_category_fk_error(pool, error).await);
            }
            return Err(error.into());
        }
    }
    if let Some(new_tags) = &new_tags {
        tags::replace_tags(&mut tx, existing.id, new_tags).await?;
    }
    tx.commit().await?;

    select_todo(pool, id).await
```

Den bestehenden Kommentar zum Fremdschlüssel-Fehler im `if let Err`-Block behalten.

- [ ] **Step 6: Tests und Clippy**

Run: `npm run test:rust && npm run lint:rust`
Expected: PASS. Kompilierfehler in `tools.rs` (Tests, die `Todo { … }` oder `TodoUpdate { … }` ohne `..Default` bauen) mit `tags: Vec::new()` bzw. `tags: None` beheben.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/mcp/store.rs src-tauri/src/mcp/tools.rs
git commit -m "feat: MCP-Store liest und schreibt Tags in einer Transaktion"
```

---

### Task 7: MCP-Tools `tags` und `clear_tags`

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs`

- [ ] **Step 1: Failing tests**

Im `mod tests` von `tools.rs` anfügen:

```rust
    // --- Tags ---------------------------------------------------------------

    #[tokio::test]
    async fn add_todo_stores_normalized_tags() {
        let (server, _pool) = server().await;
        let result = server
            .add_todo(Parameters(super::AddTodo {
                tags: Some(vec!["Frontend".into(), "UX Review".into(), "frontend".into()]),
                ..add_todo_params("Mit Tags")
            }))
            .await
            .expect("no protocol error");
        assert_eq!(ok_json(&result)["tags"], serde_json::json!(["frontend", "ux-review"]));
    }

    #[tokio::test]
    async fn add_todo_refuses_an_over_long_tag_and_writes_nothing() {
        let (server, pool) = server().await;
        let result = server
            .add_todo(Parameters(super::AddTodo {
                tags: Some(vec!["x".repeat(41)]),
                ..add_todo_params("Zu lang")
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "40");
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM todos")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn add_todo_refuses_a_tag_with_control_characters() {
        let (server, _pool) = server().await;
        let result = server
            .add_todo(Parameters(super::AddTodo {
                tags: Some(vec!["a\tb".into()]),
                ..add_todo_params("Tab")
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "Steuerzeichen");
    }

    #[tokio::test]
    async fn add_todo_refuses_more_than_twenty_tags() {
        let (server, _pool) = server().await;
        let many: Vec<String> = (0..21).map(|i| format!("tag{i}")).collect();
        let result = server
            .add_todo(Parameters(super::AddTodo {
                tags: Some(many),
                ..add_todo_params("Viele")
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "20");
    }

    #[tokio::test]
    async fn update_todo_replaces_the_tags() {
        let (server, pool) = server().await;
        let todo = store::add_todo_tagged(&pool, "T", None, None, None, None, &["alt".into()])
            .await
            .expect("add");
        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id: todo.id,
                tags: Some(vec!["neu".into()]),
                ..Default::default()
            }))
            .await
            .expect("no protocol error");
        assert_eq!(ok_json(&result)["tags"], serde_json::json!(["neu"]));
    }

    /// Issue #35 auch fuer Tags: ein leeres Array ist "nicht angegeben".
    #[tokio::test]
    async fn update_todo_keeps_the_tags_on_an_empty_list() {
        let (server, pool) = server().await;
        let todo = store::add_todo_tagged(&pool, "T", None, None, None, None, &["alt".into()])
            .await
            .expect("add");
        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id: todo.id,
                title: Some("Neu".into()),
                tags: Some(Vec::new()),
                ..Default::default()
            }))
            .await
            .expect("no protocol error");
        assert_eq!(ok_json(&result)["tags"], serde_json::json!(["alt"]));
    }

    #[tokio::test]
    async fn update_todo_clears_the_tags_with_the_flag() {
        let (server, pool) = server().await;
        let todo = store::add_todo_tagged(&pool, "T", None, None, None, None, &["alt".into()])
            .await
            .expect("add");
        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id: todo.id,
                clear_tags: Some(true),
                ..Default::default()
            }))
            .await
            .expect("no protocol error");
        assert_eq!(ok_json(&result)["tags"], serde_json::json!([]));
    }

    #[tokio::test]
    async fn update_todo_refuses_to_set_and_clear_the_tags() {
        let (server, pool) = server().await;
        let todo = store::add_todo(&pool, "T", None, None, None, None)
            .await
            .expect("add");
        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id: todo.id,
                tags: Some(vec!["a".into()]),
                clear_tags: Some(true),
                ..Default::default()
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "clear_tags");
    }
```

Run: `npm run test:rust -- mcp::tools` → FAIL (Felder fehlen).

- [ ] **Step 2: Parameter**

In `struct AddTodo` nach `category`:

```rust
    /// Tags der Aufgabe, z.B. ["frontend", "ux review"]. Sie werden
    /// kleingeschrieben, Leerraum im Inneren wird zu "-" (also "ux-review"),
    /// doppelte fallen weg. Hoechstens 20 Tags, je hoechstens 40 Zeichen,
    /// keine Steuerzeichen. Ohne Angabe hat die Aufgabe keine Tags.
    pub tags: Option<Vec<String>>,
```

In `struct UpdateTodo` nach `category`:

```rust
    /// Neue Tags. Sie ERSETZEN die bisherigen vollstaendig -- wer einen Tag
    /// hinzufuegen will, schickt die bisherigen mit ("list_todos" nennt sie).
    /// Dieselben Regeln wie bei "add_todo". Weglassen, null und [] lassen die
    /// Tags unveraendert; geleert werden sie ausschliesslich ueber "clear_tags".
    pub tags: Option<Vec<String>>,
```

und nach `clear_category`:

```rust
    /// true entfernt alle Tags; false und Weglassen lassen sie stehen. Nicht
    /// zusammen mit "tags" zu verwenden -- beides zugleich ist ein Fehler.
    pub clear_tags: Option<bool>,
```

Alle `super::AddTodo { … }`-Literale in den Tests (inklusive `add_todo_params`) bekommen `tags: None,` — der Compiler nennt jede Stelle.

- [ ] **Step 3: Prüfung**

Imports: `use super::echo::quoted;` und `use crate::tags;`. Bei den Konstanten:

```rust
/// Mehr Tags an einer Aufgabe sind kein Ordnungssystem mehr, sondern Unsinn.
const MAX_TAGS: usize = 20;
```

Nach `set_or_clear`:

```rust
/// Prueft die Tags eines Aufrufs und gibt sie normalisiert zurueck.
///
/// Anders als die Oberflaeche verwirft das hier nichts still: ein Tag, das nach
/// der Normalisierung leer oder zu lang waere, ist ein Fehler -- der Aufrufer
/// bekaeme sonst weniger zurueck, als er geschickt hat. Steuerzeichen werden
/// abgelehnt statt zu "-" gemacht, dieselbe Entscheidung wie in `check_text`.
fn check_tags(raw: &[String]) -> Result<Vec<String>, String> {
    let mut checked = Vec::new();
    for tag in raw {
        if tag.chars().any(char::is_control) {
            return Err(format!(
                "Das Tag {} enthaelt Steuerzeichen; erlaubt sind Woerter, durch Leerzeichen getrennt.",
                quoted(tag)
            ));
        }
        match tags::normalize_tag(tag) {
            Some(normalized) => checked.push(normalized),
            None => {
                return Err(format!(
                    "{} ist kein Tag: ein Tag darf nicht leer sein und hoechstens {} Zeichen haben.",
                    quoted(tag),
                    tags::MAX_TAG_CHARS
                ));
            }
        }
    }
    let checked = tags::normalize_tags(&checked);
    if checked.len() > MAX_TAGS {
        return Err(format!(
            "Eine Aufgabe traegt hoechstens {MAX_TAGS} Tags; angegeben waren {}.",
            checked.len()
        ));
    }
    Ok(checked)
}
```

- [ ] **Step 4: Tools**

`add_todo`: vor `self.respond_write(`:

```rust
        let tags = match check_tags(params.tags.as_deref().unwrap_or_default()) {
            Ok(tags) => tags,
            Err(message) => return Ok(tool_error(message)),
        };
```

und `store::add_todo(` → `store::add_todo_tagged(` mit `&tags` als letztem Argument.

`update_todo`: nach `let category = non_empty(&params.category);`:

```rust
        // Ein leeres Array heisst "nicht angegeben", wie "" bei den Textfeldern.
        let tags = params.tags.as_deref().filter(|tags| !tags.is_empty());
        if tags.is_some() && params.clear_tags == Some(true) {
            return Ok(tool_error(
                "Die Tags koennen nicht zugleich gesetzt und geleert werden: \
                 entweder \"tags\" angeben oder \"clear_tags\" setzen.",
            ));
        }
        let checked_tags = match tags.map(check_tags).transpose() {
            Ok(tags) => tags,
            Err(message) => return Ok(tool_error(message)),
        };
```

In `TodoUpdate { … }`:

```rust
            tags: if params.clear_tags == Some(true) {
                Some(Vec::new())
            } else {
                checked_tags
            },
```

Tool-Beschreibungen ergänzen:
- `add_todo`: „… Eine Beschreibung ist optional und darf mehrere Zeilen haben. Tags sind optional."
- `update_todo`: „Geleert wird ausschliesslich ueber \"clear_description\", \"clear_due_date\", \"clear_category\" und \"clear_tags\". \"tags\" ersetzt die bisherigen Tags vollstaendig."
- `list_todos`: „… Jede Aufgabe enthaelt ihre Id, mit der \"update_todo\" und \"delete_todo\" arbeiten, und ihre Tags."

- [ ] **Step 5: Tests und Clippy**

Run: `npm run test:rust && npm run lint:rust`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/mcp/tools.rs
git commit -m "feat: MCP-Tools nehmen tags und clear_tags"
```

---

### Task 8: Filtermodell `tagFilter.ts`

**Files:**
- Create: `src/tagFilter.ts`, `src/tagFilter.test.ts`

- [ ] **Step 1: Failing tests**

`src/tagFilter.test.ts`:

```ts
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
```

Run: `npx vitest run src/tagFilter.test.ts` → FAIL.

- [ ] **Step 2: Implementieren**

`src/tagFilter.ts`:

```ts
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
 */
export function parseTagFilter(value: unknown): TagFilter | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, name, match, rules } = value as Record<string, unknown>;
  if (typeof id !== "string" || id === "") return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (match !== "all" && match !== "any") return null;
  if (!Array.isArray(rules)) return null;
  return {
    id,
    name: name.trim(),
    match,
    rules: rules.map(parseTagRule).filter((rule): rule is TagRule => rule !== null),
  };
}
```

- [ ] **Step 3: Tests**

Run: `npx vitest run src/tagFilter.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tagFilter.ts src/tagFilter.test.ts
git commit -m "feat: Filtermodell fuer Tag-Filter"
```

---

### Task 9: Gespeicherte Filter in `listPrefs.ts`

**Files:**
- Modify: `src/listPrefs.ts`
- Test: `src/listPrefs.test.ts`

- [ ] **Step 1: Failing tests**

In `src/listPrefs.test.ts` Imports ergänzen (`loadTagFilters, saveTagFilters, loadActiveTagFilterId, saveActiveTagFilterId, TAG_FILTERS_KEY, ACTIVE_TAG_FILTER_KEY` aus `./listPrefs`, `type TagFilter` aus `./tagFilter`) und anfügen:

```ts
describe("tag filters", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const FILTER: TagFilter = {
    id: "f1",
    name: "Frontend",
    match: "all",
    rules: [{ kind: "has", tag: "frontend" }],
  };

  it("liefert ohne Eintrag eine leere Liste", () => {
    expect(loadTagFilters()).toEqual([]);
  });

  it("liest zurueck, was gespeichert wurde", () => {
    saveTagFilters([FILTER]);
    expect(loadTagFilters()).toEqual([FILTER]);
  });

  it("uebersteht kaputtes JSON und kaputte Eintraege", () => {
    localStorage.setItem(TAG_FILTERS_KEY, "{kaputt");
    expect(loadTagFilters()).toEqual([]);

    localStorage.setItem(TAG_FILTERS_KEY, JSON.stringify([FILTER, { id: 3 }, "x"]));
    expect(loadTagFilters()).toEqual([FILTER]);
  });

  it("merkt sich den aktiven Filter und vergisst ihn", () => {
    saveActiveTagFilterId("f1");
    expect(loadActiveTagFilterId([FILTER])).toBe("f1");

    saveActiveTagFilterId(null);
    expect(localStorage.getItem(ACTIVE_TAG_FILTER_KEY)).toBeNull();
    expect(loadActiveTagFilterId([FILTER])).toBeNull();
  });

  it("vergisst eine aktive Id, zu der es keinen Filter mehr gibt", () => {
    saveActiveTagFilterId("weg");
    expect(loadActiveTagFilterId([FILTER])).toBeNull();
  });
});
```

(`beforeEach` ggf. zum vitest-Import hinzufügen.)

Run: `npx vitest run src/listPrefs.test.ts` → FAIL.

- [ ] **Step 2: Implementieren**

In `src/listPrefs.ts` Import `import { parseTagFilter, type TagFilter } from "./tagFilter";` und nach dem Typfilter-Block:

```ts
/** Die benannten Tag-Filter. Oberflaechen-Vorliebe wie der Statusfilter --
 *  dieselbe Begruendung wie oben, ausserdem gibt es sie nur in dieser Ansicht. */
export const TAG_FILTERS_KEY = "todolist.tagFilters";
/** Id des gewaehlten Tag-Filters; fehlt, wenn keiner gewaehlt ist. */
export const ACTIVE_TAG_FILTER_KEY = "todolist.activeTagFilter";

export function loadTagFilters(): TagFilter[] {
  const stored = localStorage.getItem(TAG_FILTERS_KEY);
  if (!stored) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(parseTagFilter).filter((filter): filter is TagFilter => filter !== null);
}

export function saveTagFilters(filters: TagFilter[]): void {
  localStorage.setItem(TAG_FILTERS_KEY, JSON.stringify(filters));
}

/** Die gemerkte Id, aber nur, wenn es den Filter noch gibt. */
export function loadActiveTagFilterId(filters: TagFilter[]): string | null {
  const stored = localStorage.getItem(ACTIVE_TAG_FILTER_KEY);
  return filters.some((filter) => filter.id === stored) ? stored : null;
}

export function saveActiveTagFilterId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_TAG_FILTER_KEY);
  } else {
    localStorage.setItem(ACTIVE_TAG_FILTER_KEY, id);
  }
}
```

- [ ] **Step 3: Tests**

Run: `npx vitest run src/listPrefs.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/listPrefs.ts src/listPrefs.test.ts
git commit -m "feat: Tag-Filter in localStorage merken"
```

---

### Task 10: Baustein `TagChip`

**Files:**
- Create: `src/ui/TagChip.tsx`, `src/ui/TagChip.test.tsx`
- Modify: `src/ui/index.ts`, `src/App.css`

- [ ] **Step 1: Failing test**

`src/ui/TagChip.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagChip } from "./TagChip";

describe("TagChip", () => {
  it("zeigt den Tag", () => {
    render(<TagChip tag="frontend" />);
    expect(screen.getByText("frontend")).toHaveClass("tag-chip");
  });

  it("hat ohne onRemove keinen Knopf", () => {
    render(<TagChip tag="frontend" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ruft onRemove ueber den benannten Knopf", () => {
    const onRemove = vi.fn();
    render(<TagChip tag="frontend" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Tag frontend entfernen" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("nimmt in der Kanban-Variante die Kanban-Klasse", () => {
    const { container } = render(<TagChip tag="a" variant="kanban" />);
    expect(container.firstElementChild).toHaveClass("tag-chip", "tag-chip--kanban");
  });

  it("setzt keine Farbe inline", () => {
    const { container } = render(<TagChip tag="a" />);
    expect(container.firstElementChild?.getAttribute("style")).toBeNull();
  });
});
```

Run: `npx vitest run src/ui/TagChip.test.tsx` → FAIL.

- [ ] **Step 2: Implementieren**

`src/ui/TagChip.tsx`:

```tsx
// Ein Tag als kleines Etikett.
// variant="list"   -> .tag-chip                  (Listenzeile, Detailfenster)
// variant="kanban" -> .tag-chip .tag-chip--kanban (Karte im Brett)
//
// Mit onRemove traegt der Chip einen Entfernen-Knopf -- nur dort, wo Tags
// bearbeitet werden. Keine Farbe aus den Daten wie beim CategoryBadge: Tags
// haben keine, die Flaeche steht fest in .tag-chip.

import type { HTMLAttributes } from "react";
import { CloseIcon } from "./icons";

export type TagChipVariant = "list" | "kanban";

export interface TagChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tag: string;
  variant?: TagChipVariant;
  onRemove?: () => void;
}

export function TagChip({ tag, variant = "list", onRemove, className, ...rest }: TagChipProps) {
  const classes = ["tag-chip", variant === "kanban" ? "tag-chip--kanban" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {tag}
      {onRemove && (
        <button
          type="button"
          className="tag-chip-remove"
          onClick={onRemove}
          aria-label={`Tag ${tag} entfernen`}
        >
          <CloseIcon size={10} />
        </button>
      )}
    </span>
  );
}
```

Achtung: der erste Test sucht `getByText("frontend")` und erwartet die Klasse am Element — der Text steht direkt im `span`, das passt.

In `src/ui/index.ts` nach dem `TypeBadge`-Export:

```ts
export { TagChip } from "./TagChip";
export type { TagChipProps, TagChipVariant } from "./TagChip";
```

In `src/App.css` nach dem `.done .type-badge`-Block:

```css
/* Tag-Etikett. Keine Datenfarbe wie beim Kategorie-Badge: Tags haben keine,
   darum fest --surface-muted. Pille statt Rechteck und keine Versalien, damit
   es neben Typ- und Kategorie-Badge als nachrangig liest. */
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 3px 9px;
  border: var(--border-thin);
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 600;
}

.tag-chip--kanban {
  padding: 2px 7px;
  font-size: 10.5px;
}

.done .tag-chip {
  border-color: var(--ink-ghost);
  background: transparent;
  color: var(--ink-faint);
}

.tag-chip-remove {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}

/* Mehrere Chips nebeneinander, in Zeile und Karte. */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
```

- [ ] **Step 3: Tests**

Run: `npx vitest run src/ui/TagChip.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/TagChip.tsx src/ui/TagChip.test.tsx src/ui/index.ts src/App.css
git commit -m "feat: Baustein TagChip"
```

---

### Task 11: Tag-Eingabe im Detailfenster

**Files:**
- Create: `src/TagInput.tsx`, `src/TagInput.test.tsx`
- Modify: `src/TodoDetailModal.tsx`, `src/App.css`
- Test: `src/TodoDetailModal.test.tsx`

- [ ] **Step 1: Failing tests TagInput**

`src/TagInput.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "./TagInput";

function setup(value: string[] = []) {
  const onValueChange = vi.fn();
  render(<TagInput id="tags" value={value} suggestions={["frontend", "backend"]} onValueChange={onValueChange} />);
  const field = screen.getByRole("combobox");
  return { onValueChange, field };
}

describe("TagInput", () => {
  it("uebernimmt mit Enter normalisiert", () => {
    const { onValueChange, field } = setup(["alt"]);
    fireEvent.change(field, { target: { value: "UX Review" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith(["alt", "ux-review"]);
  });

  it("uebernimmt mit Komma und teilt eingefuegte Kommalisten", () => {
    const { onValueChange, field } = setup();
    fireEvent.change(field, { target: { value: "a, b" } });
    fireEvent.keyDown(field, { key: "," });
    expect(onValueChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("uebernimmt beim Verlassen des Felds", () => {
    const { onValueChange, field } = setup();
    fireEvent.change(field, { target: { value: "frontend" } });
    fireEvent.blur(field);
    expect(onValueChange).toHaveBeenCalledWith(["frontend"]);
  });

  it("laesst Strg+Enter zum Sichern durch", () => {
    const { onValueChange, field } = setup();
    fireEvent.change(field, { target: { value: "frontend" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("nimmt mit Backspace im leeren Feld den letzten Chip weg", () => {
    const { onValueChange, field } = setup(["a", "b"]);
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(onValueChange).toHaveBeenCalledWith(["a"]);
  });

  it("entfernt einen Tag ueber seinen Chip", () => {
    const { onValueChange } = setup(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: "Tag a entfernen" }));
    expect(onValueChange).toHaveBeenCalledWith(["b"]);
  });

  it("bietet nur Vorschlaege an, die noch nicht gesetzt sind", () => {
    const { container } = render(
      <TagInput value={["frontend"]} suggestions={["frontend", "backend"]} onValueChange={() => {}} />
    );
    const options = [...container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(["backend"]);
  });
});
```

(Ein `<input list=…>` hat die Rolle `combobox`.)

Run: `npx vitest run src/TagInput.test.tsx` → FAIL.

- [ ] **Step 2: TagInput implementieren**

`src/TagInput.tsx`:

```tsx
// Eingabe fuer die Tags einer Aufgabe: die gesetzten als Chips, dahinter ein
// Textfeld. Enter oder Komma uebernimmt, Verlassen des Felds auch -- sonst
// ginge ein getippter, nicht bestaetigter Tag beim Sichern verloren.
// Backspace im leeren Feld nimmt den letzten Chip weg. Vorschlaege kommen
// ueber ein <datalist>.
//
// Eigene Datei, kein Baustein in src/ui: es gibt sie nur im Detailfenster.

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { normalizeTag, normalizeTags } from "./types";
import { TagChip } from "./ui";

export interface TagInputProps {
  id?: string;
  value: string[];
  suggestions: string[];
  onValueChange: (tags: string[]) => void;
}

export function TagInput({ id, value, suggestions, onValueChange }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commit() {
    // Eingefuegtes "a, b" sind zwei Tags, nicht einer mit Komma.
    const added = draft
      .split(",")
      .map(normalizeTag)
      .filter((tag): tag is string => tag !== null);
    // Ein unbrauchbarer Entwurf (zu lang) bleibt stehen, statt still zu verschwinden.
    if (added.length === 0) return;
    onValueChange(normalizeTags([...value, ...added]));
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Strg+Enter gehoert dem Fenster: es sichert, der Tag wird vorher beim
    // Verlassen des Felds uebernommen.
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      onValueChange(value.slice(0, -1));
    }
  }

  const offered = suggestions.filter((tag) => !value.includes(tag));

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <TagChip
          key={tag}
          tag={tag}
          onRemove={() => onValueChange(value.filter((t) => t !== tag))}
        />
      ))}
      <input
        id={id}
        className="tag-input-field"
        type="text"
        list={listId}
        value={draft}
        placeholder={value.length === 0 ? "Tag eintippen, Enter übernimmt" : ""}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
      <datalist id={listId}>
        {offered.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
}
```

Hinweis zum Strg+Enter-Fall: beim Sichern per Strg+Enter wird der Entwurf nicht übernommen (kein Blur). Das ist bewusst nicht gelöst — YAGNI; der Test hält nur fest, dass das Feld die Taste durchlässt.

CSS in `src/App.css` nach `.tag-list`:

```css
/* Tag-Eingabe im Detailfenster: Chips und Textfeld in einem gerahmten Feld,
   im Rahmen von .edit-input. */
.tag-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.tag-input:focus-within {
  box-shadow: var(--shadow-sm);
}

.tag-input-field {
  flex: 1 1 140px;
  min-width: 140px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  outline: none;
}
```

Run: `npx vitest run src/TagInput.test.tsx` → PASS.

- [ ] **Step 3: Failing tests Detailfenster**

In `src/TodoDetailModal.test.tsx` `makeTodo` hat seit Task 1 `tags: []`. `renderModal` ansehen und, falls es die Props fest verdrahtet, um einen optionalen `tagSuggestions`-Parameter nicht erweitern — die Tests unten rendern selbst. Anfügen:

```tsx
describe("TodoDetailModal tags", () => {
  it("schreibt geaenderte Tags in den Patch", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailModal
        todo={makeTodo({ tags: ["alt"] })}
        categories={categories}
        tagSuggestions={["frontend"]}
        onSave={onSave}
        onClose={() => {}}
      />
    );

    const field = screen.getByLabelText("Tags");
    fireEvent.change(field, { target: { value: "Neu Tag" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("neu-tag")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { tags: ["alt", "neu-tag"] }));
  });

  it("laesst unveraenderte Tags aus dem Patch", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailModal
        todo={makeTodo({ tags: ["alt"] })}
        categories={categories}
        onSave={onSave}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Anders" } });
    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { title: "Anders" }));
  });

  it("uebernimmt einen nicht bestaetigten Tag beim Klick auf Sichern", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailModal todo={makeTodo()} categories={categories} onSave={onSave} onClose={() => {}} />
    );

    const field = screen.getByLabelText("Tags");
    fireEvent.change(field, { target: { value: "frontend" } });
    fireEvent.blur(field);
    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(7, { tags: ["frontend"] }));
  });
});
```

Run: `npx vitest run src/TodoDetailModal.test.tsx` → FAIL.

- [ ] **Step 4: Detailfenster erweitern**

In `src/TodoDetailModal.tsx`:
- Kopfkommentar: „Titel, Beschreibung, Typ, Faelligkeit, Kategorie und Tags".
- Import `import { TagInput } from "./TagInput";`
- Props:

```ts
  /** Vorschlaege fuer das Tag-Feld; ohne Angabe keine. */
  tagSuggestions?: string[];
```

  und in der Destrukturierung `tagSuggestions = []`.
- State nach `categoryId`: `const [tags, setTags] = useState<string[]>(todo.tags);`
- In `buildPatch` vor `return patch;`:

```ts
    // Beide Seiten sind normalisiert und sortiert, ein Vergleich Stelle fuer
    // Stelle reicht also.
    const tagsChanged =
      tags.length !== original.tags.length || tags.some((tag, i) => tag !== original.tags[i]);
    if (tagsChanged) patch.tags = tags;
```

- Nach dem `todo-modal-row`-Block, vor `{error && …}`:

```tsx
        <div className="todo-modal-field">
          <label htmlFor="todo-detail-tags">Tags</label>
          <TagInput
            id="todo-detail-tags"
            value={tags}
            suggestions={tagSuggestions}
            onValueChange={setTags}
          />
        </div>
```

Run: `npx vitest run src/TodoDetailModal.test.tsx src/TagInput.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/TagInput.tsx src/TagInput.test.tsx src/TodoDetailModal.tsx src/TodoDetailModal.test.tsx src/App.css
git commit -m "feat: Tags im Detailfenster bearbeiten"
```

---

### Task 12: Baustein `TagFilterSelect` und `TagFilterEditor`

**Files:**
- Create: `src/ui/TagFilterSelect.tsx`, `src/ui/TagFilterSelect.test.tsx`, `src/TagFilterEditor.tsx`, `src/TagFilterEditor.test.tsx`
- Modify: `src/ui/Modal.tsx`, `src/ui/index.ts`, `src/App.css`

- [ ] **Step 1: Failing tests TagFilterSelect**

`src/ui/TagFilterSelect.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagFilterSelect } from "./TagFilterSelect";
import type { TagFilter } from "../tagFilter";

const FILTERS: TagFilter[] = [
  { id: "f1", name: "Frontend", match: "all", rules: [] },
  { id: "f2", name: "Backend", match: "all", rules: [] },
];

function setup(activeId: string | null) {
  const props = { onActiveChange: vi.fn(), onEdit: vi.fn(), onCreate: vi.fn() };
  render(<TagFilterSelect filters={FILTERS} activeId={activeId} {...props} />);
  return props;
}

describe("TagFilterSelect", () => {
  it("bietet keinen und alle gespeicherten Filter an", () => {
    setup(null);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Kein Tag-Filter", "Frontend", "Backend"]);
  });

  it("meldet die Auswahl, leer als null", () => {
    const { onActiveChange } = setup("f1");
    const select = screen.getByLabelText("Tag-Filter");
    fireEvent.change(select, { target: { value: "f2" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(onActiveChange.mock.calls).toEqual([["f2"], [null]]);
  });

  it("sperrt Bearbeiten ohne gewaehlten Filter", () => {
    setup(null);
    expect(screen.getByRole("button", { name: "Tag-Filter bearbeiten" })).toBeDisabled();
  });

  it("ruft Bearbeiten und Neu", () => {
    const { onEdit, onCreate } = setup("f1");
    fireEvent.click(screen.getByRole("button", { name: "Tag-Filter bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Neuer Tag-Filter" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
```

Run: `npx vitest run src/ui/TagFilterSelect.test.tsx` → FAIL.

- [ ] **Step 2: TagFilterSelect implementieren**

`src/ui/TagFilterSelect.tsx`:

```tsx
// Auswahl des Tag-Filters samt Knoepfen zum Bearbeiten und Anlegen.
// Steht zweimal: in der Filterleiste der Liste und ueber dem Brett. Beide
// zeigen denselben aktiven Filter -- was gewaehlt ist, haelt App.tsx.

import type { HTMLAttributes } from "react";
import type { TagFilter } from "../tagFilter";
import { IconButton } from "./IconButton";
import { PencilIcon, PlusIcon } from "./icons";

export interface TagFilterSelectProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "children"> {
  filters: TagFilter[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  onEdit: () => void;
  onCreate: () => void;
}

export function TagFilterSelect({
  filters,
  activeId,
  onActiveChange,
  onEdit,
  onCreate,
  className,
  ...rest
}: TagFilterSelectProps) {
  const classes = ["tag-filter-select", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={classes} {...rest}>
      <select
        className="filter-select"
        aria-label="Tag-Filter"
        value={activeId ?? ""}
        onChange={(e) => onActiveChange(e.currentTarget.value || null)}
      >
        <option value="">Kein Tag-Filter</option>
        {filters.map((filter) => (
          <option key={filter.id} value={filter.id}>
            {filter.name}
          </option>
        ))}
      </select>
      <IconButton
        variant="icon"
        onClick={onEdit}
        disabled={activeId === null}
        aria-label="Tag-Filter bearbeiten"
      >
        <PencilIcon />
      </IconButton>
      <IconButton variant="icon" onClick={onCreate} aria-label="Neuer Tag-Filter">
        <PlusIcon />
      </IconButton>
    </div>
  );
}
```

Export in `src/ui/index.ts` nach `TypeFilterBar`:

```ts
export { TagFilterSelect } from "./TagFilterSelect";
export type { TagFilterSelectProps } from "./TagFilterSelect";
```

Run: `npx vitest run src/ui/TagFilterSelect.test.tsx` → PASS.

- [ ] **Step 3: Failing tests Editor**

`src/TagFilterEditor.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagFilterEditor } from "./TagFilterEditor";
import type { TagFilter } from "./tagFilter";

function setup(filter: TagFilter | null, knownTags = ["frontend", "blocked"]) {
  const props = { onSave: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
  render(<TagFilterEditor filter={filter} knownTags={knownTags} {...props} />);
  return props;
}

describe("TagFilterEditor", () => {
  it("baut einen neuen Filter aus hat und hat nicht", () => {
    const { onSave } = setup(null);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Frontend offen " } });
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "Frontend" } });
    fireEvent.click(screen.getByRole("button", { name: "Regel hinzufügen" }));
    fireEvent.change(screen.getByLabelText("Regel 2 Art"), { target: { value: "lacks" } });
    fireEvent.change(screen.getByLabelText("Regel 2 Tag"), { target: { value: "blocked" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as TagFilter;
    expect(saved).toMatchObject({
      name: "Frontend offen",
      match: "all",
      rules: [
        { kind: "has", tag: "frontend" },
        { kind: "lacks", tag: "blocked" },
      ],
    });
    expect(saved.id).not.toBe("");
  });

  it("stellt auf mindestens eine um", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "N" } });
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Mindestens eine" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ match: "any" });
  });

  it("hat keine Tags braucht kein Tag-Feld", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ungetaggt" } });
    fireEvent.change(screen.getByLabelText("Regel 1 Art"), { target: { value: "untagged" } });
    expect(screen.queryByLabelText("Regel 1 Tag")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ rules: [{ kind: "untagged" }] });
  });

  it("verlangt einen Namen", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Der Filter braucht einen Namen.")).toBeInTheDocument();
  });

  it("verlangt einen Tag in jeder hat-Regel", () => {
    const { onSave } = setup(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "N" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Regel 1: Tag fehlt.")).toBeInTheDocument();
  });

  it("markiert einen Tag, den keine Aufgabe traegt", () => {
    setup({ id: "f1", name: "Alt", match: "all", rules: [{ kind: "has", tag: "weg" }] }, []);
    expect(screen.getByText("unbekannt")).toBeInTheDocument();
  });

  it("behaelt beim Bearbeiten die Id und kann loeschen", () => {
    const filter: TagFilter = { id: "f1", name: "Alt", match: "any", rules: [{ kind: "has", tag: "frontend" }] };
    const { onSave, onDelete } = setup(filter);

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave.mock.calls[0][0]).toEqual(filter);

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(onDelete).toHaveBeenCalledWith("f1");
  });

  it("entfernt eine Regel", () => {
    const { onSave } = setup({
      id: "f1", name: "N", match: "all",
      rules: [{ kind: "has", tag: "frontend" }, { kind: "lacks", tag: "blocked" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Regel 1 entfernen" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ rules: [{ kind: "lacks", tag: "blocked" }] });
  });
});
```

Run: `npx vitest run src/TagFilterEditor.test.tsx` → FAIL.

- [ ] **Step 4: Modal-Variante**

In `src/ui/Modal.tsx`: `ModalVariant` um `"tagFilter"` erweitern, in `VARIANT_CLASS` `tagFilter: "tag-filter-modal",`.

In `src/App.css` im Selektor `.category-modal, .todo-modal, .trash-modal, .stats-modal {` (Zeile ~1013) `.tag-filter-modal` ergänzen, und nach `.stats-modal { max-width: 560px; }`:

```css
.tag-filter-modal {
  max-width: 560px;
}

.tag-filter-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
}

.tag-rule-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tag-rule {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-rule-tag {
  flex: 1;
  min-width: 0;
}

/* Eine Regel auf einen Tag, den keine Aufgabe mehr traegt. */
.tag-rule-unknown {
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

/* Loeschen steht links, abgesetzt von Abbrechen und Speichern. */
.tag-filter-delete {
  margin-right: auto;
}

.tag-filter-select {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 5: Editor implementieren**

`src/TagFilterEditor.tsx`:

```tsx
// Editor fuer einen benannten Tag-Filter: Name, Verknuepfung und eine flache
// Liste von Regeln. Arbeitet auf einem Entwurf und gibt erst beim Speichern
// einen fertigen Filter heraus -- wie das Detail-Fenster einer Aufgabe.
// Eigene Datei, weil App.tsx schon zu gross ist.

import { useId, useRef, useState } from "react";
import { normalizeTag } from "./types";
import { newTagFilterId, type TagFilter, type TagMatch, type TagRule } from "./tagFilter";
import { FilterChip, IconButton, Modal, PlusIcon, TrashIcon } from "./ui";

type RuleKind = TagRule["kind"];

/** Eine Regel im Entwurf: der Tag ist noch Rohtext, `key` haelt React stabil. */
interface DraftRule {
  key: number;
  kind: RuleKind;
  tag: string;
}

const RULE_LABELS: Record<RuleKind, string> = {
  has: "hat",
  lacks: "hat nicht",
  untagged: "hat keine Tags",
};
const RULE_KINDS = Object.keys(RULE_LABELS) as RuleKind[];

function toDraft(rules: TagRule[]): DraftRule[] {
  return rules.map((rule, key) => ({
    key,
    kind: rule.kind,
    tag: rule.kind === "untagged" ? "" : rule.tag,
  }));
}

export interface TagFilterEditorProps {
  /** `null` legt einen neuen Filter an. */
  filter: TagFilter | null;
  /** Alle vorhandenen Tags -- Vorschlaege und Grundlage fuer "unbekannt". */
  knownTags: string[];
  onSave: (filter: TagFilter) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function TagFilterEditor({ filter, knownTags, onSave, onDelete, onClose }: TagFilterEditorProps) {
  const listId = useId();
  const [name, setName] = useState(filter?.name ?? "");
  const [match, setMatch] = useState<TagMatch>(filter?.match ?? "all");
  // Ein neuer Filter beginnt mit einer leeren "hat"-Regel: ohne Regel gaebe
  // es nichts, das man ausfuellen koennte.
  const [rules, setRules] = useState<DraftRule[]>(() =>
    toDraft(filter?.rules ?? [{ kind: "has", tag: "" }])
  );
  const nextKey = useRef(rules.length);
  const [error, setError] = useState<string | null>(null);

  function updateRule(key: number, change: Partial<DraftRule>) {
    setRules((prev) => prev.map((rule) => (rule.key === key ? { ...rule, ...change } : rule)));
  }

  function addRule() {
    const key = nextKey.current++;
    setRules((prev) => [...prev, { key, kind: "has", tag: "" }]);
  }

  function removeRule(key: number) {
    setRules((prev) => prev.filter((rule) => rule.key !== key));
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Der Filter braucht einen Namen.");
      return;
    }
    const built: TagRule[] = [];
    for (const [index, rule] of rules.entries()) {
      if (rule.kind === "untagged") {
        built.push({ kind: "untagged" });
        continue;
      }
      const tag = normalizeTag(rule.tag);
      if (tag === null) {
        setError(`Regel ${index + 1}: Tag fehlt.`);
        return;
      }
      built.push({ kind: rule.kind, tag });
    }
    onSave({ id: filter?.id ?? newTagFilterId(), name: trimmed, match, rules: built });
  }

  return (
    <Modal
      variant="tagFilter"
      title={filter ? "Tag-Filter bearbeiten" : "Neuer Tag-Filter"}
      onClose={onClose}
      closeLabel="Schließen"
    >
      <div className="tag-filter-editor">
        <div className="todo-modal-field">
          <label htmlFor="tag-filter-name">Name</label>
          <input
            id="tag-filter-name"
            className="edit-input"
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </div>

        <div className="status-filter" role="group" aria-label="Verknüpfung der Regeln">
          <FilterChip variant="segment" active={match === "all"} onClick={() => setMatch("all")}>
            Alle Regeln
          </FilterChip>
          <FilterChip variant="segment" active={match === "any"} onClick={() => setMatch("any")}>
            Mindestens eine
          </FilterChip>
        </div>

        <ul className="tag-rule-list">
          {rules.map((rule, index) => {
            const tag = normalizeTag(rule.tag);
            const unknown = rule.kind !== "untagged" && tag !== null && !knownTags.includes(tag);
            return (
              <li key={rule.key} className="tag-rule">
                <select
                  className="filter-select"
                  aria-label={`Regel ${index + 1} Art`}
                  value={rule.kind}
                  onChange={(e) => updateRule(rule.key, { kind: e.currentTarget.value as RuleKind })}
                >
                  {RULE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {RULE_LABELS[kind]}
                    </option>
                  ))}
                </select>
                {rule.kind !== "untagged" && (
                  <input
                    className="edit-input tag-rule-tag"
                    type="text"
                    list={listId}
                    aria-label={`Regel ${index + 1} Tag`}
                    value={rule.tag}
                    onChange={(e) => updateRule(rule.key, { tag: e.currentTarget.value })}
                  />
                )}
                {unknown && <span className="tag-rule-unknown">unbekannt</span>}
                <IconButton
                  variant="icon"
                  danger
                  onClick={() => removeRule(rule.key)}
                  aria-label={`Regel ${index + 1} entfernen`}
                >
                  <TrashIcon />
                </IconButton>
              </li>
            );
          })}
        </ul>
        <datalist id={listId}>
          {knownTags.map((known) => (
            <option key={known} value={known} />
          ))}
        </datalist>

        <IconButton variant="icon" onClick={addRule} aria-label="Regel hinzufügen">
          <PlusIcon />
          Regel
        </IconButton>

        {error && <p className="todo-modal-error">{error}</p>}
      </div>

      <div className="todo-modal-actions">
        {filter && (
          <button
            type="button"
            className="todo-modal-cancel tag-filter-delete"
            onClick={() => onDelete(filter.id)}
          >
            Löschen
          </button>
        )}
        <button type="button" className="todo-modal-cancel" onClick={onClose}>
          Abbrechen
        </button>
        <button type="button" className="todo-modal-save" onClick={handleSave}>
          Speichern
        </button>
      </div>
    </Modal>
  );
}
```

Run: `npx vitest run src/TagFilterEditor.test.tsx src/ui/TagFilterSelect.test.tsx && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TagFilterSelect.tsx src/ui/TagFilterSelect.test.tsx src/TagFilterEditor.tsx src/TagFilterEditor.test.tsx src/ui/Modal.tsx src/ui/index.ts src/App.css
git commit -m "feat: Tag-Filter auswaehlen und bearbeiten"
```

---

### Task 13: Verdrahtung in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Mock ergänzen und failing tests**

In `src/App.test.tsx` im `vi.mock("./db", …)` ergänzen: `listTags: vi.fn(() => Promise.resolve([])),`. Imports ergänzen: `TAG_FILTERS_KEY, ACTIVE_TAG_FILTER_KEY` aus `./listPrefs`.

Am Ende des Haupt-`describe("App")` (oder als eigener `describe` mit demselben `beforeEach` wie oben: `vi.clearAllMocks(); localStorage.clear(); insideTauri = true; handlers.clear();`):

```tsx
  describe("Tag-Filter", () => {
    const FRONTEND_OPEN = {
      id: "f1",
      name: "Frontend offen",
      match: "all",
      rules: [
        { kind: "has", tag: "frontend" },
        { kind: "lacks", tag: "blocked" },
      ],
    };

    const TODOS = [
      makeTodo({ id: 1, title: "Login-Seite", tags: ["frontend"] }),
      makeTodo({ id: 2, title: "Blockierte Seite", tags: ["blocked", "frontend"] }),
      makeTodo({ id: 3, title: "Backend-Job", tags: ["backend"] }),
    ];

    function activate(filter = FRONTEND_OPEN) {
      localStorage.setItem(TAG_FILTERS_KEY, JSON.stringify([filter]));
      localStorage.setItem(ACTIVE_TAG_FILTER_KEY, filter.id);
    }

    it("zeigt die Tags einer Aufgabe in der Zeile", async () => {
      vi.mocked(db.listTodos).mockResolvedValue([TODOS[0]]);
      render(<App />);
      expect(await screen.findByText("frontend")).toHaveClass("tag-chip");
    });

    it("filtert die Liste mit dem gemerkten Tag-Filter", async () => {
      activate();
      vi.mocked(db.listTodos).mockResolvedValue(TODOS);
      render(<App />);

      expect(await screen.findByText("Login-Seite")).toBeInTheDocument();
      expect(screen.queryByText("Blockierte Seite")).toBeNull();
      expect(screen.queryByText("Backend-Job")).toBeNull();
      expect(screen.getByText(/Tags: Frontend offen/)).toBeInTheDocument();
    });

    it("Zuruecksetzen nimmt den Tag-Filter mit", async () => {
      activate();
      vi.mocked(db.listTodos).mockResolvedValue(TODOS);
      render(<App />);
      await screen.findByText("Login-Seite");

      fireEvent.click(screen.getByRole("button", { name: "Zurücksetzen" }));

      expect(await screen.findByText("Backend-Job")).toBeInTheDocument();
      expect(localStorage.getItem(ACTIVE_TAG_FILTER_KEY)).toBeNull();
    });

    it("legt einen Filter ueber den Editor an und waehlt ihn", async () => {
      vi.mocked(db.listTodos).mockResolvedValue(TODOS);
      render(<App />);
      await screen.findByText("Backend-Job");

      fireEvent.click(screen.getAllByRole("button", { name: "Neuer Tag-Filter" })[0]);
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Backend" } });
      fireEvent.change(screen.getByLabelText("Regel 1 Tag"), { target: { value: "backend" } });
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

      await waitFor(() => expect(screen.queryByText("Login-Seite")).toBeNull());
      expect(screen.getByText("Backend-Job")).toBeInTheDocument();
      const stored = JSON.parse(localStorage.getItem(TAG_FILTERS_KEY) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(localStorage.getItem(ACTIVE_TAG_FILTER_KEY)).toBe(stored[0].id);
    });

    it("loescht den aktiven Filter und zeigt wieder alles", async () => {
      activate();
      vi.mocked(db.listTodos).mockResolvedValue(TODOS);
      render(<App />);
      await screen.findByText("Login-Seite");

      fireEvent.click(screen.getAllByRole("button", { name: "Tag-Filter bearbeiten" })[0]);
      fireEvent.click(screen.getByRole("button", { name: "Löschen" }));

      expect(await screen.findByText("Backend-Job")).toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem(TAG_FILTERS_KEY) ?? "[]")).toEqual([]);
    });

    it("filtert auch das Brett", async () => {
      activate();
      vi.mocked(db.listTodos).mockResolvedValue(TODOS);
      render(<App />);
      await screen.findByText("Login-Seite");

      fireEvent.click(screen.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }));

      await screen.findByRole("button", { name: "Alle Kategorien" });
      expect(screen.getByText("Login-Seite")).toBeInTheDocument();
      expect(screen.queryByText("Backend-Job")).toBeNull();
    });

    it("gibt dem Detailfenster die Tag-Vorschlaege", async () => {
      vi.mocked(db.listTags).mockResolvedValue(["backend", "frontend"]);
      vi.mocked(db.listTodos).mockResolvedValue([TODOS[2]]);
      const { container } = render(<App />);

      fireEvent.doubleClick(await screen.findByText("Backend-Job"));

      await waitFor(() => {
        const options = [...container.ownerDocument.querySelectorAll("datalist option")].map((o) =>
          o.getAttribute("value")
        );
        expect(options).toContain("frontend");
      });
    });
  });
```

Hinweis: „Zurücksetzen" heißt der Knopf `.clear-filters` in App.tsx. Im Brett-Test stehen die Tag-Chips „frontend" mehrfach auf der Seite — deshalb wird dort nur über Titel geprüft.

Run: `npx vitest run src/App.test.tsx` → FAIL.

- [ ] **Step 2: State und Filter**

In `src/App.tsx`:

Imports:
- aus `./db`: `listTags`
- aus `./ui`: `TagChip`, `TagFilterSelect`
- `import { TagFilterEditor } from "./TagFilterEditor";`
- `import { matchesTagFilter, type TagFilter } from "./tagFilter";`
- aus `./listPrefs`: `loadTagFilters, saveTagFilters, loadActiveTagFilterId, saveActiveTagFilterId`
- aus `./types`: `normalizeTags`

Nach `const [searchQuery, setSearchQuery] = useState("");` (Zeile ~187):

```tsx
  // Tag-Filter: gespeichert wie der Statusfilter in localStorage, ein aktiver
  // fuer Liste und Brett zugleich.
  const [tagFilters, setTagFilters] = useState<TagFilter[]>(loadTagFilters);
  const [activeTagFilterId, setActiveTagFilterId] = useState<string | null>(() =>
    loadActiveTagFilterId(tagFilters)
  );
  const activeTagFilter = tagFilters.find((f) => f.id === activeTagFilterId) ?? null;
  // undefined: Editor zu; null: neuer Filter; sonst der zu bearbeitende.
  const [editingTagFilter, setEditingTagFilter] = useState<TagFilter | null | undefined>(undefined);
  // Vorschlaege fuer Tag-Feld und Editor -- alle Tags, auch die im Papierkorb.
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
```

Nach `changeTypeFilter`:

```tsx
  const changeActiveTagFilter = useCallback((id: string | null) => {
    setActiveTagFilterId(id);
    saveActiveTagFilterId(id);
  }, []);

  // Speichern waehlt den Filter zugleich -- wer ihn gerade gebaut hat, will
  // sehen, was er trifft.
  function handleSaveTagFilter(filter: TagFilter) {
    const next = tagFilters.some((f) => f.id === filter.id)
      ? tagFilters.map((f) => (f.id === filter.id ? filter : f))
      : [...tagFilters, filter];
    setTagFilters(next);
    saveTagFilters(next);
    changeActiveTagFilter(filter.id);
    setEditingTagFilter(undefined);
  }

  function handleDeleteTagFilter(id: string) {
    const next = tagFilters.filter((f) => f.id !== id);
    setTagFilters(next);
    saveTagFilters(next);
    if (activeTagFilterId === id) changeActiveTagFilter(null);
    setEditingTagFilter(undefined);
  }
```

In `refresh()`:

```tsx
      const [items, cats, tags] = await Promise.all([
        listTodos(),
        listCategories(),
        listTags(),
      ]);
      setTodos(items);
      setCategories(cats);
      setTagSuggestions(tags);
```

In `handleSaveDetail` nach `setTodos(...)`:

```tsx
    // Neue Tags gleich vorschlagen, ohne Nachladen. Weggenommene bleiben bis
    // zum naechsten refresh stehen -- eine andere Aufgabe kann sie noch tragen.
    setTagSuggestions((prev) => normalizeTags([...prev, ...updated.tags]));
```

`boardTodos`:

```tsx
  const boardTodos = useMemo(
    () =>
      todos.filter(
        (t) =>
          (boardCategories.size === 0 || boardCategories.has(t.category_id)) &&
          (boardType === "all" || t.type === boardType) &&
          (activeTagFilter === null || matchesTagFilter(t.tags, activeTagFilter))
      ),
    [todos, boardCategories, boardType, activeTagFilter]
  );
```

`filteredTodos` nach der `categoryFilter`-Zeile:

```tsx
    if (activeTagFilter && !matchesTagFilter(todo.tags, activeTagFilter)) return false;
```

`hasActiveFilter`: `|| activeTagFilter !== null` anhängen.

- [ ] **Step 3: Oberfläche**

Listen-Filterleiste, zweite `filter-row`, nach dem `CategorySelect`:

```tsx
            <TagFilterSelect
              filters={tagFilters}
              activeId={activeTagFilterId}
              onActiveChange={changeActiveTagFilter}
              onEdit={() => setEditingTagFilter(activeTagFilter)}
              onCreate={() => setEditingTagFilter(null)}
            />
```

Band `active-filters`, nach der `categoryFilter`-Zeile:

```tsx
              {activeTagFilter ? ` • Tags: ${activeTagFilter.name}` : ""}
```

Zurücksetzen-Handler: `changeActiveTagFilter(null);` ergänzen.

Listenzeile, nach dem `CategoryBadge`-Block:

```tsx
                {todo.tags.length > 0 && (
                  <span className="tag-list">
                    {todo.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                  </span>
                )}
```

Brett: in `.board-filter-bar` nach `<TypeFilterBar … />` dieselbe `<TagFilterSelect … />` wie oben. In `.kanban-card-meta` nach dem `CategoryBadge`:

```tsx
                            {todo.tags.map((tag) => (
                              <TagChip key={tag} variant="kanban" tag={tag} />
                            ))}
```

`<TodoDetailModal …>`: `tagSuggestions={tagSuggestions}` ergänzen.

Nach dem `{showTrash && …}`-Block:

```tsx
      {editingTagFilter !== undefined && (
        <TagFilterEditor
          filter={editingTagFilter}
          knownTags={tagSuggestions}
          onSave={handleSaveTagFilter}
          onDelete={handleDeleteTagFilter}
          onClose={() => setEditingTagFilter(undefined)}
        />
      )}
```

- [ ] **Step 4: Tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. Bestehende App-Tests, die über „Zurücksetzen" oder über die Anzahl Buttons/Selects gehen, können durch den neuen Select stolpern — dann den Selektor im Test präzisieren (z. B. `getByLabelText("Tag-Filter")` statt „das zweite select"), nicht die Oberfläche.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: Tag-Filter in Liste und Brett"
```

---

### Task 14: E2E, Doku, Gesamtprüfung

**Files:**
- Modify: `e2e/todolist.spec.ts`, `AGENTS.md`, `STYLEGUIDE.md`

- [ ] **Step 1: E2E-Test**

Am Ende des `test.describe("TodoList App", …)` in `e2e/todolist.spec.ts`:

```ts
  test("filters by tags with has and lacks rules, and keeps the filter", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const add = page.getByRole("button", { name: /Aufgabe hinzufügen/i });
    for (const title of ["Login-Seite", "Blockierte Seite", "Backend-Job"]) {
      await input.fill(title);
      await add.click();
    }

    async function tag(title: string, tags: string[]) {
      await page.locator(".todo-list .title", { hasText: title }).dblclick();
      const field = page.getByLabel("Tags", { exact: true });
      for (const t of tags) {
        await field.fill(t);
        await field.press("Enter");
      }
      await page.getByRole("button", { name: "Sichern" }).click();
      await expect(page.getByRole("heading", { name: "Aufgabe bearbeiten" })).toHaveCount(0);
    }
    await tag("Login-Seite", ["frontend"]);
    await tag("Blockierte Seite", ["frontend", "blocked"]);
    await tag("Backend-Job", ["backend"]);

    await page.getByRole("button", { name: "Neuer Tag-Filter" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Frontend offen");
    await page.getByLabel("Regel 1 Tag").fill("frontend");
    await page.getByRole("button", { name: "Regel hinzufügen" }).click();
    await page.getByLabel("Regel 2 Art").selectOption("lacks");
    await page.getByLabel("Regel 2 Tag").fill("blocked");
    await page.getByRole("button", { name: "Speichern" }).click();

    const list = page.locator(".todo-list");
    await expect(list.getByText("Login-Seite")).toBeVisible();
    await expect(list.getByText("Blockierte Seite")).toHaveCount(0);
    await expect(list.getByText("Backend-Job")).toHaveCount(0);

    await page.reload();
    await expect(page.locator(".todo-list").getByText("Login-Seite")).toBeVisible();
    await expect(page.locator(".todo-list").getByText("Backend-Job")).toHaveCount(0);
  });
```

Run: `npm run test:e2e`
Expected: PASS (alle, auch die bestehenden).

- [ ] **Step 2: AGENTS.md**

- Test-Dateien-Liste ergänzen:
  - `src/tagFilter.test.ts` — Tag-Filter: Regeln, Verknüpfung, Lesen aus `localStorage`
  - `src/TagInput.test.tsx` — die Tag-Eingabe des Detailfensters
  - `src/TagFilterEditor.test.tsx` — der Editor für Tag-Filter
  - `src/ui/TagChip.test.tsx` — das Tag-Etikett
  - `src/ui/TagFilterSelect.test.tsx` — die Auswahl des Tag-Filters
  - bei `src/types.test.ts`: „… und `normalizeTag` gegen `src-tauri/src/tag_cases.json`"
- Rust-Absatz: „Sie decken `replace_time_day_tx` und `set_todo_tags_tx` ab, jeweils inklusive des Falls, dass ein Fehler mitten im Schreibvorgang den Stand unverändert lässt. `src-tauri/src/tags.rs` prüft die Tag-Regel gegen dieselbe Tabelle wie `types.test.ts`."
- Persistenz, Absatz „Oberflächen-Vorlieben": nach `todolist.typeFilter` ergänzen „— sowie die gespeicherten Tag-Filter (`todolist.tagFilters`) und der gewählte (`todolist.activeTagFilter`)".
- Persistenz, neuer Absatz nach den vier Fallen:

  > **Tags** liegen in `todo_tags(todo_id, name)`, ohne eigene Tabelle `tags`. Was ein Tag ist, entscheidet `normalizeTag` in `types.ts` — und zum zweiten Mal `tags::normalize_tag` in Rust für MCP und den Command `set_todo_tags`. Beide prüfen sich gegen `src-tauri/src/tag_cases.json`; wer die Regel ändert, ändert beide Seiten und die Tabelle. `updateTodoFields` mit `tags` ist im SQL-Store bewusst zwei Schritte (UPDATE über das Plugin, dann der Command) — die Begründung steht in `storeTypes.ts`.

- MCP-Abschnitt nach dem Typ-Absatz:

  > Eine Aufgabe trägt außerdem **Tags**. `list_todos` liefert sie, `add_todo` nimmt sie optional, `update_todo` ersetzt sie mit `tags` vollständig. Weglassen, `null` und `[]` lassen sie unverändert; geleert werden sie ausschließlich über `clear_tags: true`, beides zugleich ist ein Tool-Fehler — dieselbe Regel wie bei der Beschreibung. Ein Tag mit Steuerzeichen, eines, das nach der Normalisierung leer oder länger als 40 Zeichen ist, und mehr als 20 Tags sind Tool-Fehler; anders als die Oberfläche verwirft die Tool-Grenze nichts still.

- [ ] **Step 3: STYLEGUIDE.md**

Im Baustein-Katalog nach `TypeBadge` zwei Einträge im dortigen Format (Überschrift, Satz, Prop-Tabelle):

```markdown
### `TagChip`

Ein Tag als Pille. Keine Farbe aus den Daten: Tags haben keine, die Fläche ist
fest `--surface-muted`. Mit `onRemove` trägt der Chip einen Entfernen-Knopf —
nur dort, wo Tags bearbeitet werden.

| Prop | Typ | Bedeutung |
|---|---|---|
| `tag` | `string` | Der Tag, schon normalisiert. |
| `variant` | `"list" \| "kanban"` | Größe für Zeile/Fenster oder Karte. |
| `onRemove` | `() => void` | Optional; zeigt den Knopf „Tag … entfernen". |

### `TagFilterSelect`

Auswahl des Tag-Filters samt „Bearbeiten" und „Neu". Steht über der Liste und
über dem Brett und zeigt in beiden denselben aktiven Filter.

| Prop | Typ | Bedeutung |
|---|---|---|
| `filters` | `TagFilter[]` | Die gespeicherten Filter. |
| `activeId` | `string \| null` | Gewählter Filter, `null` für keinen. |
| `onActiveChange` | `(id: string \| null) => void` | Neue Auswahl. |
| `onEdit` / `onCreate` | `() => void` | Editor öffnen; Bearbeiten ist ohne Auswahl gesperrt. |
```

Falls der Katalog `Modal`-Varianten aufzählt, `tagFilter` ergänzen.

- [ ] **Step 4: Gesamtprüfung**

Run:

```bash
npm run typecheck && npm run lint && npm test && npm run test:rust && npm run lint:rust && npm run test:e2e
```

Expected: alles grün. Ausgabe lesen, nicht nur den Exit-Code.

- [ ] **Step 5: Handprüfung MCP** (laut AGENTS.md nicht automatisiert)

App starten, Token aus `app_settings` lesen (Memory `mcp-test-from-wsl.md`: Windows-App, `curl.exe`), dann `add_todo` mit `tags`, `list_todos`, `update_todo` mit `clear_tags` aufrufen und prüfen, dass die offene Oberfläche die Tags ohne Neustart zeigt.

- [ ] **Step 6: Commit**

```bash
git add e2e/todolist.spec.ts AGENTS.md STYLEGUIDE.md
git commit -m "docs: Tags und Tag-Filter dokumentiert, E2E-Fall"
```

---

## Self-Review (erledigt beim Schreiben)

- **Spec-Abdeckung:** Regel (T1/T2), Tabelle + Migration (T3), Store-Vertrag inkl. Papierkorb-Vorschläge und begründeter Abweichung (T4/T5), localStorage-Migration (T5), MCP lesen/setzen/clear/Grenzen (T6/T7), Filtermodell inkl. „unbekannt" (T8), Speicherung (T9), `TagChip` (T10), Detailfenster (T11), Auswahl + Editor (T12), Liste + Brett + Band + Zurücksetzen (T13), E2E + Doku (T14).
- **Typen konsistent:** `TagFilter`/`TagRule`/`TagMatch` aus `tagFilter.ts`; `normalizeTag`/`normalizeTags`/`parseTags` aus `types.ts`; Rust `tags::{normalize_tag, normalize_tags, parse_tag_column, replace_tags, MAX_TAG_CHARS}`; `store::add_todo_tagged`; Command `set_todo_tags(id, tags)` ↔ `invoke("set_todo_tags", { id, tags })`.
- **Bekannte Lücke, bewusst:** Strg+Enter im Tag-Feld sichert ohne den getippten, unbestätigten Tag (Task 11, Step 2).
