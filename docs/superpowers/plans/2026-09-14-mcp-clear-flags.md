# `clear_*`-Flags im MCP-Tool `update_todo` — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `update_todo` löscht Fälligkeit, Kategorie und Beschreibung nur noch auf ausdrückliches `clear_*: true`; `null`, ein leerer Text und ein fehlendes Feld lassen alle drei den Wert stehen (Issue #35).

**Architecture:** Geändert wird ausschließlich die MCP-Grenze in `src-tauri/src/mcp/tools.rs`: Die drei `Option<Option<String>>`-Parameter werden zu einfachen `Option<String>`, dazu kommen drei boolesche `clear_*`-Parameter. Eine kleine Abbildungsfunktion baut daraus weiterhin das `TodoUpdate` des Stores, dessen `Some(None)`-Semantik unverändert bleibt — `store.rs` und das Frontend werden nicht angefasst. Ein Feld zugleich zu setzen und zu leeren ist ein Tool-Fehler, geprüft vor jedem Schreibzugriff.

**Tech Stack:** Rust, `rmcp` (Tool-Router, `#[tool]`), `serde`/`schemars` (Parameter und deren Schema), `sqlx` mit SQLite, `tokio::test`.

---

## Dateien

| Datei | Rolle in diesem Plan |
|---|---|
| `src-tauri/src/mcp/tools.rs` | Einzige Codedatei. Parameterstruktur `UpdateTodo`, Prüf- und Abbildungshelfer, Tool-Rumpf `update_todo`, sämtliche Tests dazu. |
| `AGENTS.md` | Beschreibt die Regel für Aufrufer; Abschnitt zur Beschreibung (Zeile ~112). |
| `CHANGELOG.md` | Eintrag unter `## [Unreleased]`, Abschnitt `### Geändert`. |

Nicht angefasst: `src-tauri/src/mcp/store.rs`, `src/storeTypes.ts`, `src/todoStoreSql.ts`, ältere Dateien unter `docs/superpowers/`.

Alle Befehle laufen aus `src-tauri/`.

---

### Task 1: Der Fehler aus Issue #35, als Test

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs` — Testmodul, direkt nach `update_todo_changes_only_the_given_fields` (endet bei ~Zeile 724)

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Der Test geht bewusst über `serde_json::from_str` statt über ein Struct-Literal: Genau das Stück Weg — `null` auf dem Draht — ist das, was kaputt ist.

```rust
    /// Issue #35: Ein Modell, das sein Parameterobjekt vollstaendig ausfuellt,
    /// schickt `null` fuer alles mit, was es nicht anfassen wollte. Das darf
    /// nichts loeschen.
    #[tokio::test]
    async fn update_todo_keeps_everything_that_arrives_as_null() {
        let (server, pool) = server().await;
        let category_id = category(&pool, "iteratec").await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at, description, due_date, category_id)
             VALUES ('Angebot', '2026-01-02T00:00:00.000Z', 'Notiz', '2026-09-03', ?)
             RETURNING id",
        )
        .bind(category_id)
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        let params: super::UpdateTodo = serde_json::from_str(&format!(
            r#"{{"id":{id},"status":"done","description":null,"due_date":null,"category":null}}"#
        ))
        .expect("params parse");

        let result = server
            .update_todo(Parameters(params))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["status"], "done");
        assert_eq!(json["done"], true);
        assert_eq!(json["due_date"], "2026-09-03", "null must not clear");
        assert_eq!(json["category_name"], "iteratec", "null must not clear");
        assert_eq!(json["description"], "Notiz", "null must not clear");
    }
```

- [ ] **Step 2: Den Test laufen lassen und den Fehlschlag sehen**

Run: `cargo test --lib update_todo_keeps_everything_that_arrives_as_null`
Expected: FAIL — `assertion \`left == right\` failed: null must not clear`, links `Null`, rechts `"2026-09-03"`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/mcp/tools.rs
git commit -m "test: pin down the data loss from issue #35"
```

Ein roter Test wird hier ausnahmsweise committet: Er ist der Beleg für den Fehler und wird im nächsten Task grün. Wer zwischen den Tasks nicht committen will, hängt diesen Schritt an Task 2 an.

---

### Task 2: `clear_*`-Parameter statt doppelter Optionen

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs:186-213` (Helfer `double_option` und `clearable`)
- Modify: `src-tauri/src/mcp/tools.rs:255-287` (`struct UpdateTodo`)
- Modify: `src-tauri/src/mcp/tools.rs:392-429` (Tool-Rumpf `update_todo`)
- Modify: `src-tauri/src/mcp/tools.rs` — alle zehn `super::UpdateTodo { … }` im Testmodul

- [ ] **Step 1: `double_option` und `clearable` löschen**

Beide Funktionen samt ihrer Doc-Kommentare ersatzlos entfernen. `double_option` steht ab „Haelt `null` von "gar nicht angegeben" auseinander." bis zum Ende der Funktion, `clearable` direkt darunter ab „`Some(None)` heisst "leeren" …". `non_empty` darüber bleibt, `Deserializer` im `use`-Kopf der Datei wird damit unbenutzt und fliegt ebenfalls raus (der Compiler nennt die Zeile).

- [ ] **Step 2: Die beiden neuen Helfer schreiben**

An die Stelle der gelöschten Funktionen, also unter `non_empty`:

```rust
/// Ein Feld zugleich zu setzen und zu leeren ist ein Widerspruch.
///
/// Ihn nach einer Regel still aufzuloesen macht ihn unsichtbar, und genau das
/// Unsichtbare war der Schaden in Issue #35. Also ein Fehler, bevor irgendetwas
/// geschrieben ist.
fn check_not_both(
    value: Option<&str>,
    clear: Option<bool>,
    label: &str,
    field: &str,
    flag: &str,
) -> Result<(), String> {
    if value.is_some() && clear == Some(true) {
        return Err(format!(
            "{label} kann nicht zugleich gesetzt und geleert werden: \
             entweder \"{field}\" angeben oder \"{flag}\" setzen."
        ));
    }
    Ok(())
}

/// `Some(None)` heisst leeren, `Some(Some(_))` setzen, `None` unveraendert.
///
/// Geleert wird ausschliesslich ueber das Flag. Ein fehlendes Feld, `null` und
/// ein leerer Text sind alle drei "unveraendert" -- ein Modell, das sein
/// Parameterobjekt vollstaendig ausfuellt, soll nichts loeschen koennen.
fn set_or_clear(value: Option<&str>, clear: Option<bool>) -> Option<Option<String>> {
    if clear == Some(true) {
        return Some(None);
    }
    value.map(|text| Some(text.to_string()))
}
```

- [ ] **Step 3: `UpdateTodo` umbauen**

Die Struktur vollständig ersetzen. `Default` kommt dazu, damit die Tests nur noch die Felder nennen, um die es ihnen geht:

```rust
/// Eine Aenderung an einer Aufgabe. Nur die angegebenen Felder aendern sich.
#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct UpdateTodo {
    /// Id der Aufgabe, wie "list_todos" sie liefert.
    pub id: i64,
    /// Neuer Titel; darf nicht leer sein. Eine einzelne Zeile bis 500 Zeichen
    /// -- Steuerzeichen, auch Zeilenumbrueche, werden abgelehnt.
    pub title: Option<String>,
    /// Neue Beschreibung, hoechstens 4000 Zeichen. Zeilenumbrueche sind
    /// erlaubt und als \n zu schicken; andere Steuerzeichen werden abgelehnt.
    /// Weglassen, null und "" lassen die bestehende Beschreibung unveraendert;
    /// geleert wird sie ausschliesslich ueber "clear_description".
    pub description: Option<String>,
    /// Neuer Status: "todo", "in_progress" oder "done".
    pub status: Option<String>,
    /// Neue Prioritaet: "low", "medium" oder "high".
    pub priority: Option<String>,
    /// Neuer Faelligkeitstag, ISO-Format YYYY-MM-DD. Weglassen, null und ""
    /// lassen die bestehende Faelligkeit unveraendert; entfernt wird sie
    /// ausschliesslich ueber "clear_due_date".
    pub due_date: Option<String>,
    /// Name einer bereits bestehenden Kategorie (Gross-/Kleinschreibung egal).
    /// Ein unbekannter Name ist ein Fehler; ueber dieses Tool entsteht keine
    /// neue Kategorie. Weglassen, null und "" lassen die bestehende Kategorie
    /// unveraendert; herausgenommen wird die Aufgabe ausschliesslich ueber
    /// "clear_category".
    pub category: Option<String>,
    /// true leert die Beschreibung. Nicht zusammen mit "description" zu
    /// verwenden -- beides zugleich ist ein Fehler.
    pub clear_description: Option<bool>,
    /// true entfernt die Faelligkeit. Nicht zusammen mit "due_date" zu
    /// verwenden -- beides zugleich ist ein Fehler.
    pub clear_due_date: Option<bool>,
    /// true nimmt die Aufgabe aus ihrer Kategorie heraus. Nicht zusammen mit
    /// "category" zu verwenden -- beides zugleich ist ein Fehler.
    pub clear_category: Option<bool>,
}
```

`Option`-Felder sind für serde von sich aus optional; `#[serde(default)]` und `#[schemars(with = …)]` braucht hier keins mehr.

- [ ] **Step 4: Den Tool-Rumpf ersetzen**

Attribut und Funktion `update_todo` vollständig durch dieses Stück ersetzen:

```rust
    #[tool(
        description = "Aendert eine bestehende Aufgabe und gibt sie danach zurueck. Es aendern sich ausschliesslich die angegebenen Felder; alles Weggelassene bleibt, wie es war -- auch ein Feld, das als null oder als leerer Text ankommt. Um eine Aufgabe abzuhaken, ist der Status auf \"done\" zu setzen. Geleert wird ausschliesslich ueber \"clear_description\", \"clear_due_date\" und \"clear_category\"."
    )]
    async fn update_todo(
        &self,
        Parameters(params): Parameters<UpdateTodo>,
    ) -> Result<CallToolResult, McpError> {
        // Die Beschreibung wird nicht getrimmt -- Absaetze am Anfang und Ende
        // gehoeren dem Text. Leer heisst trotzdem "nicht angegeben".
        let description = params
            .description
            .as_deref()
            .filter(|text| !text.is_empty());
        let due_date = non_empty(&params.due_date);
        let category = non_empty(&params.category);

        let checked = check_optional(
            "Der Titel",
            params.title.as_deref().map(str::trim),
            MAX_TITLE_CHARS,
        )
        .and_then(|()| match description {
            Some(text) => check_multiline("Die Beschreibung", text, MAX_DESCRIPTION_CHARS),
            None => Ok(()),
        })
        .and_then(|()| check_category(category))
        .and_then(|()| {
            check_not_both(
                description,
                params.clear_description,
                "Die Beschreibung",
                "description",
                "clear_description",
            )
        })
        .and_then(|()| {
            check_not_both(
                due_date,
                params.clear_due_date,
                "Die Faelligkeit",
                "due_date",
                "clear_due_date",
            )
        })
        .and_then(|()| {
            check_not_both(
                category,
                params.clear_category,
                "Die Kategorie",
                "category",
                "clear_category",
            )
        });
        if let Err(message) = checked {
            return Ok(tool_error(message));
        }
        let update = TodoUpdate {
            title: params.title.as_deref().map(str::trim).map(str::to_string),
            description: set_or_clear(description, params.clear_description),
            status: non_empty(&params.status).map(str::to_string),
            priority: non_empty(&params.priority).map(str::to_string),
            due_date: set_or_clear(due_date, params.clear_due_date),
            category: set_or_clear(category, params.clear_category),
        };
        self.respond_write(store::update_todo(&self.pool, params.id, update).await)
    }
```

- [ ] **Step 5: Die Testliterale auf `..Default::default()` umstellen**

Zehn Stellen im Testmodul bauen `super::UpdateTodo { … }` mit allen Feldern aus. Jede wird auf die Felder eingedampft, die der jeweilige Test wirklich setzt, plus Rest aus `Default`. `id` steht in jedem Literal. Beispiel für `update_todo_changes_only_the_given_fields`:

```rust
            .update_todo(Parameters(super::UpdateTodo {
                id,
                status: Some("done".into()),
                ..Default::default()
            }))
```

und für `update_todo_reports_an_unknown_id_as_a_tool_error`:

```rust
            .update_todo(Parameters(super::UpdateTodo {
                id: 404,
                title: Some("Neu".into()),
                ..Default::default()
            }))
```

Drei dieser Stellen tragen Werte in umgebauten Feldern und werden dabei inhaltlich angepasst:

- `update_todo_clears_a_due_date_when_given_null` (bisher `due_date: Some(None)`) wird zu:

```rust
    #[tokio::test]
    async fn update_todo_clears_a_due_date_when_the_clear_flag_is_set() {
        let (server, pool) = server().await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at, due_date)
             VALUES ('Alt', '2026-01-02T00:00:00.000Z', '2026-05-05') RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id,
                clear_due_date: Some(true),
                ..Default::default()
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert!(json["due_date"].is_null(), "due date should be cleared");
    }
```

- `update_todo_sets_and_clears_the_description`: `description: Some(Some("neu\nmit Umbruch".into()))` wird zu `description: Some("neu\nmit Umbruch".into())`, der zweite Aufruf mit `description: Some(None)` zu `clear_description: Some(true)`.

- `update_todo_refuses_an_over_long_description`: `description: Some(Some(long(…)))` wird zu `description: Some(long(super::MAX_DESCRIPTION_CHARS + 1))`.

- [ ] **Step 6: Den serde-Test umschreiben**

`null_and_a_missing_field_mean_different_things_on_the_wire` hielt fest, was jetzt falsch ist. Er wird ersetzt durch den Test, der die neue Regel festhält:

```rust
    /// Die alte API unterschied `null` von einem fehlenden Feld. Sie tut es
    /// nicht mehr: beides heisst "unveraendert", und nur das Flag leert.
    #[test]
    fn null_and_a_missing_field_both_mean_leave_it_alone() {
        let with_nulls: super::UpdateTodo =
            serde_json::from_str(r#"{"id":1,"due_date":null,"category":null}"#)
                .expect("null parses");
        assert_eq!(with_nulls.due_date, None, "null must not mean: clear it");
        assert_eq!(with_nulls.category, None, "null must not mean: clear it");

        let missing: super::UpdateTodo =
            serde_json::from_str(r#"{"id":1,"status":"done"}"#).expect("missing fields parse");
        assert_eq!(missing.due_date, None);
        assert_eq!(missing.category, None);

        let cleared: super::UpdateTodo =
            serde_json::from_str(r#"{"id":1,"clear_due_date":true}"#).expect("the flag parses");
        assert_eq!(cleared.clear_due_date, Some(true));

        let set: super::UpdateTodo =
            serde_json::from_str(r#"{"id":1,"due_date":"2026-12-24"}"#).expect("a value parses");
        assert_eq!(set.due_date.as_deref(), Some("2026-12-24"));
    }
```

- [ ] **Step 7: Alle Tests laufen lassen**

Run: `cargo test --lib`
Expected: PASS, 110 Tests (109 wie bisher plus der Regressionstest aus Task 1). Insbesondere grün: `update_todo_keeps_everything_that_arrives_as_null`, `update_todo_changes_only_the_given_fields`, `update_todo_clears_a_due_date_when_the_clear_flag_is_set`, `update_todo_sets_and_clears_the_description` und `the_router_lists_all_seven_tools_with_documented_parameters` — letzterer verlangt für jedes Schema-Feld eine Beschreibung und deckt damit die drei neuen Flags ohne eigene Änderung ab.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/mcp/tools.rs
git commit -m "fix: clear a todo field only on an explicit clear flag"
```

---

### Task 3: Setzen und Leeren zugleich ist ein Fehler

Die Prüfung steht seit Task 2 im Code; dieser Task belegt sie und sichert, dass im Fehlerfall wirklich nichts geschrieben wurde.

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs` — Testmodul, hinter `update_todo_clears_a_due_date_when_the_clear_flag_is_set`

- [ ] **Step 1: Den Test schreiben**

```rust
    /// Ein Widerspruch ist ein Fehler des Aufrufers, und er darf die Aufgabe
    /// nicht halb angefasst zuruecklassen.
    #[tokio::test]
    async fn update_todo_refuses_to_set_and_clear_the_same_field() {
        let (server, pool) = server().await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at, due_date)
             VALUES ('Alt', '2026-01-02T00:00:00.000Z', '2026-05-05') RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id,
                title: Some("Neu".into()),
                due_date: Some("2026-12-24".into()),
                clear_due_date: Some(true),
                ..Default::default()
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "clear_due_date");

        let (title, due): (String, Option<String>) =
            sqlx::query_as("SELECT title, due_date FROM todos WHERE id = ?")
                .bind(id)
                .fetch_one(&pool)
                .await
                .expect("select todo");
        assert_eq!(title, "Alt", "a rejected call must not write anything");
        assert_eq!(due.as_deref(), Some("2026-05-05"));
    }
```

- [ ] **Step 2: Den Test laufen lassen**

Run: `cargo test --lib update_todo_refuses_to_set_and_clear_the_same_field`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/mcp/tools.rs
git commit -m "test: setting and clearing one field at once is an error"
```

---

### Task 4: Kategorie leeren, und ein `false` ändert nichts

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs` — Testmodul, hinter dem Test aus Task 3

- [ ] **Step 1: Beide Tests schreiben**

```rust
    #[tokio::test]
    async fn update_todo_takes_a_todo_out_of_its_category() {
        let (server, pool) = server().await;
        let category_id = category(&pool, "Kundenprojekt").await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at, category_id)
             VALUES ('Alt', '2026-01-02T00:00:00.000Z', ?) RETURNING id",
        )
        .bind(category_id)
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id,
                clear_category: Some(true),
                ..Default::default()
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert!(json["category_id"].is_null(), "category should be cleared");
        assert!(json["category_name"].is_null());
    }

    /// `false` ist kein Loeschbefehl, sondern ein ausgeschriebenes "nein".
    #[tokio::test]
    async fn update_todo_leaves_everything_alone_on_a_false_flag() {
        let (server, pool) = server().await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at, description, due_date)
             VALUES ('Alt', '2026-01-02T00:00:00.000Z', 'Notiz', '2026-05-05') RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id,
                status: Some("done".into()),
                clear_description: Some(false),
                clear_due_date: Some(false),
                clear_category: Some(false),
                ..Default::default()
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["due_date"], "2026-05-05");
        assert_eq!(json["description"], "Notiz");
    }
```

- [ ] **Step 2: Die Tests laufen lassen**

Run: `cargo test --lib update_todo`
Expected: PASS für alle `update_todo`-Tests, darunter die beiden neuen.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/mcp/tools.rs
git commit -m "test: cover clearing a category and a false clear flag"
```

---

### Task 5: Die Doku für Aufrufer und Leser

**Files:**
- Modify: `AGENTS.md` (Absatz zur Beschreibung, ~Zeile 112)
- Modify: `CHANGELOG.md` (Abschnitt `## [Unreleased]`)

- [ ] **Step 1: `AGENTS.md` anpassen**

Der Satz

> Bei `update_todo` leeren sowohl `null` als auch `""` die Beschreibung, Weglassen lässt sie unverändert — dieselbe Regel wie bei Fälligkeit und Kategorie.

wird ersetzt durch:

> Bei `update_todo` leert ausschließlich `clear_description: true` die Beschreibung; Weglassen, `null` und `""` lassen sie unverändert — dieselbe Regel wie bei Fälligkeit (`clear_due_date`) und Kategorie (`clear_category`). Ein Feld zugleich zu setzen und zu leeren ist ein Tool-Fehler. Der Grund ist Issue #35: `null` als Löschbefehl hat Aufgaben die Kategorie und die Fälligkeit gekostet, weil ein Modell sein Parameterobjekt vollständig ausfüllt.

- [ ] **Step 2: `CHANGELOG.md` ergänzen**

Unter `## [Unreleased]` in den bestehenden Abschnitt `### Geändert` als weiteren Punkt:

```markdown
- Ein KI-Assistent löscht Fälligkeit, Kategorie oder Beschreibung einer Aufgabe nur noch, wenn er es ausdrücklich verlangt (`clear_due_date`, `clear_category`, `clear_description`). Bisher genügte dafür ein mitgeschicktes `null`, und das hat beim bloßen Abhaken Kategorie und Fälligkeit gekostet.
```

- [ ] **Step 3: Die Tests ein letztes Mal laufen lassen**

Run: `cargo test --lib`
Expected: PASS, 113 Tests.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CHANGELOG.md
git commit -m "docs: write down that only a clear flag empties a field"
```

---

## Abschluss

- [ ] `cargo clippy --all-targets` läuft ohne neue Warnungen (insbesondere kein toter `Deserializer`-Import).
- [ ] `gh issue close 35 --comment "…"` erst nach dem Merge, mit einem Satz zur neuen Regel.
