# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the app's todos, categories and time bookings over MCP, so Claude Code and Claude Desktop can read and write them while the app is running.

**Architecture:** An `rmcp` server runs inside the Tauri backend, mounted into an axum router on `127.0.0.1:4319/mcp`, behind a Bearer-token middleware. It reads and writes through the sqlx pool `tauri-plugin-sql` already owns. Writes emit a Tauri event so the open UI reloads.

**Tech Stack:** Rust, `rmcp` 3.2.0, `axum` 0.8, `tokio-util` 0.7, `sqlx` 0.8 (already present), Tauri v2, React 19.

This is Phase 2 of `docs/superpowers/specs/2026-09-03-mcp-server-design.md`. Phase 1 (SQLite persistence) is done and merged as its own change; this plan builds on it.

---

## Background for someone new to this codebase

**The app.** A desktop todo list: a Rust shell hosting a React frontend in a webview. Todos carry a title, status (`todo`/`in_progress`/`done`), priority, due date and an optional category. A second view books work time in quarter-hour slots on a week grid, each slot belonging to a category and optionally carrying a note.

**Persistence, after Phase 1.** Inside Tauri everything lives in SQLite (`todolist.db`); in a plain browser — Vite dev and the Playwright suite — it lives in `localStorage`. `src/db.ts` and `src/timeDb.ts` dispatch per call. The MCP server is Rust-side and therefore always talks to SQLite.

**Schema:**

```
categories:    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
               color TEXT NOT NULL DEFAULT '#a78bfa', created_at TEXT NOT NULL
todos:         id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, due_date TEXT NULL,
               category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL,
               priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'todo'
time_slots:    date TEXT NOT NULL, slot INTEGER NOT NULL, category_id INTEGER NOT NULL,
               note TEXT NOT NULL DEFAULT '', PRIMARY KEY (date, slot)
time_settings: id INTEGER PRIMARY KEY CHECK (id = 1), target_slots_per_day INTEGER NOT NULL DEFAULT 32,
               show_weekend INTEGER NOT NULL DEFAULT 0
app_settings:  key TEXT PRIMARY KEY, value TEXT NOT NULL
```

`app_settings` was added in Phase 1 specifically for this phase and is still empty. `time_slots.category_id` deliberately carries **no** foreign key: a booking outlives its category and the UI labels it "Gelöschte Kategorie".

A slot index is `hour * 4 + minute / 15`, so 09:00 is slot 36 and a slot covers fifteen minutes. `time_slots` stores one row per quarter hour; a "block" in the UI is just a run of adjacent slots sharing a category, and its note is stored on every slot of the run.

**Prior art in the Rust code.** `src-tauri/src/lib.rs` already has `replace_time_day`, a Tauri command that replaces one day's bookings inside a real sqlx transaction, plus its tests against an in-memory pool. Read it before starting — it shows how to get at the pool and how the existing commands map errors.

**Conventions** (`AGENTS.md`): `npm run typecheck && npm test` before committing; `cd src-tauri && cargo test` for the Rust side; `npx playwright test` for UI changes. `STYLEGUIDE.md` governs any UI work — no emoji, no gradients, colors only through tokens, build from the existing pieces in `src/ui/`.

Three known flaky tests predate this work and pass on retry: `e2e/timetracking.spec.ts:160`, `e2e/todolist.spec.ts:569`, and `TimeTrackingView > zeigt eine positive Differenz, sobald das Soll erreicht ist`. Do not chase them.

---

## What the research established

These facts were verified against `rmcp` 3.2.0 by building and running a prototype. Trust them over anything you find on the web, which is mostly about 0.x and 1.x and describes an API that no longer exists.

**The crate.** `rmcp` 3.2.0, published 2026-08-31, MSRV 1.88. Features needed: `server` and `transport-streamable-http-server`. Do **not** enable the `local` feature — it compiles out the `tower` submodule this plan depends on.

**There is no SSE server any more.** `SseServer`, the `transport-sse-server` feature and the `/sse` + `/message` endpoint pair were removed in 3.x. SSE survives only as the response encoding inside Streamable HTTP. Any tutorial calling `SseServer::serve(...)` is obsolete.

**The transport has no listener of its own.** `StreamableHttpService` implements `tower_service::Service` with `Error = Infallible`, which is exactly what `axum::Router::nest_service` wants. So it mounts into an ordinary axum app and ordinary axum middleware can wrap it.

**Bearer auth belongs in that middleware.** `rmcp`'s own `auth` feature is OAuth 2.0 — discovery, dynamic client registration, refresh — and is not meant for a static shared token.

**Two error kinds, and the difference matters.** From the crate's own documentation on `CallToolResult::error`:

> - **Tool-level error** — `Ok(CallToolResult::error(...))`. The request was valid and routed to your tool, but executing the tool failed in a way the caller should see […] **This is the right choice for almost every "the tool ran and didn't work" case.**
> - **Protocol error** — `Err(ErrorData)` […] MCP clients typically render protocol errors opaquely (e.g. "Tool result missing due to internal error") — the caller does **not** see your message.

So "no category named X", "no todo with id N", a constraint violation — all `Ok(CallToolResult::error(...))`, so Claude reads the reason and can act on it. Reserve `Err(McpError::…)` for infrastructure failures the caller cannot do anything about.

**A panicking tool produces no response at all.** There is no `catch_unwind` in the dispatch path. The request task dies, the process survives, and the client waits for its own timeout — which looks like a dead server rather than an error. Tool bodies therefore contain no `unwrap`, no `expect`, no `panic!`, no indexing that can be out of bounds, and no numeric cast that can overflow.

**`#[tool_handler]` on the `ServerHandler` impl is mandatory.** Without it everything compiles and `tools/list` comes back empty. The crate's own `tests/common/calculator.rs` omits it because it only checks schemas — do not use that file as a template for the whole server.

**`ServerInfo::new()` names your server `rmcp`.** It reads `CARGO_CRATE_NAME` of the rmcp crate itself. Without an explicit `with_server_info(Implementation::new("todolist", …))` the server shows up as "rmcp" in Claude Desktop.

**Tools must be stateless.** Protocol versions from 2026-07-28 onward are always stateless (SEP-2567). No cursors, handles or open transactions carried across calls.

**Shutdown needs both ends.** The `CancellationToken` passed to `StreamableHttpServerConfig` terminates sessions; `axum::serve(...).with_graceful_shutdown(...)` stops the listener. Wire only one and the process hangs on exit, because `axum::serve` waits for open connections and SSE streams are long-lived by nature.

**Versions.** `axum 0.8` (resolves 0.8.9) and `tokio-util 0.7` become new direct dependencies. No conflicts: the prototype resolved `tokio` to 1.53.1 and `serde` to 1.0.229, matching this app's lockfile exactly, and rmcp does not touch `sqlx` or `tauri`. Twelve new crates; expect well under a minute of extra build time.

**Request bodies are capped at 4 MiB**, which returns `413`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/mcp/mod.rs` | create | Server start, router assembly, shutdown |
| `src-tauri/src/mcp/auth.rs` | create | Token generation, storage, constant-time check, axum middleware |
| `src-tauri/src/mcp/store.rs` | create | Every SQL query the tools need; the only file with SQL |
| `src-tauri/src/mcp/slots.rs` | create | `HH:MM` ↔ slot conversion |
| `src-tauri/src/mcp/tools.rs` | create | The seven tools, their parameter types and their schemas |
| `src-tauri/src/lib.rs` | modify | Start the server in `setup`, cancel it on exit, expose the token to the UI |
| `src-tauri/Cargo.toml` | modify | `rmcp`, `axum`, `tokio-util`, `subtle`, `rand`, `base64` |
| `src/McpSettings.tsx` | create | The settings section: status, token, client configuration line |
| `src/App.tsx` | modify | Mount that section; reload on the data-changed event |
| `src/TimeTrackingView.tsx` | modify | Reload on the data-changed event |

`store.rs` holds the SQL so that `tools.rs` stays a thin layer of parameter validation and formatting, and so the queries can be tested against a pool without going through MCP at all. `slots.rs` is separate because the conversion is pure and deserves its own tests.

---

## Task 1: Dependencies and an empty server that answers 401

The first task proves the hardest part — that the thing starts, mounts, and rejects unauthenticated requests — before any tool exists.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/mcp/mod.rs`, `src-tauri/src/mcp/auth.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the dependencies**

In `src-tauri/Cargo.toml`, under `[dependencies]`:

```toml
rmcp = { version = "3.2.0", features = ["server", "transport-streamable-http-server"] }
axum = "0.8"
tokio-util = "0.7"
subtle = "2"
rand = "0.9"
base64 = "0.22"
```

Run `cd src-tauri && cargo check`. Expect it to compile and to add roughly a dozen crates. Confirm `Cargo.lock` still has exactly one `tokio` and one `serde` major, and that `tokio` is still 1.53.1.

- [ ] **Step 2: Write the failing test for the token**

Create `src-tauri/src/mcp/auth.rs` with tests but no implementation yet:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_generated_token_is_url_safe_and_long_enough() {
        let token = generate_token();
        assert!(token.len() >= 43, "32 bytes of base64url should be at least 43 chars");
        assert!(
            token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
            "token must be safe to put in a header without quoting: {token}"
        );
    }

    #[test]
    fn two_generated_tokens_differ() {
        assert_ne!(generate_token(), generate_token());
    }

    #[test]
    fn the_check_accepts_only_the_exact_token() {
        assert!(token_matches("abc", "abc"));
        assert!(!token_matches("abc", "abd"));
        assert!(!token_matches("abc", "ab"));
        assert!(!token_matches("abc", ""));
    }
}
```

Run: `cd src-tauri && cargo test mcp::auth`
Expected: FAIL — `generate_token` and `token_matches` do not exist.

- [ ] **Step 3: Implement token generation and checking**

In `src-tauri/src/mcp/auth.rs`, above the tests:

```rust
use base64::Engine;
use subtle::ConstantTimeEq;

/// 32 random bytes, base64url without padding: safe in a header, no quoting.
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::fill(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Constant time, so a wrong token cannot be found one character at a time.
pub fn token_matches(expected: &str, given: &str) -> bool {
    if expected.len() != given.len() {
        return false;
    }
    expected.as_bytes().ct_eq(given.as_bytes()).into()
}
```

If `rand::fill` does not exist in the version that resolved, use whatever that version's documented way of filling a byte array from the OS entropy source is, and say in your report which you used. Do not reach for a non-cryptographic generator.

Note the length check before the constant-time compare: it leaks only the length, which is fixed anyway.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src-tauri && cargo test mcp::auth`
Expected: PASS — three tests.

- [ ] **Step 5: Store the token in `app_settings`**

Still in `auth.rs`:

```rust
use sqlx::{Pool, Sqlite};

const TOKEN_KEY: &str = "mcp_token";

/// Reads the token, generating and storing one on first call.
pub async fn load_or_create_token(pool: &Pool<Sqlite>) -> Result<String, sqlx::Error> {
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = ?")
            .bind(TOKEN_KEY)
            .fetch_optional(pool)
            .await?;
    if let Some((token,)) = existing {
        return Ok(token);
    }
    let token = generate_token();
    sqlx::query("INSERT INTO app_settings (key, value) VALUES (?, ?)")
        .bind(TOKEN_KEY)
        .bind(&token)
        .execute(pool)
        .await?;
    Ok(token)
}
```

Add a test against an in-memory pool — follow the pattern already in `src-tauri/src/lib.rs`, which creates a pool and the tables it needs. Two cases: the first call generates and persists a token; a second call returns the same one.

- [ ] **Step 6: The auth middleware**

```rust
use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};
use std::sync::Arc;

#[derive(Clone)]
pub struct ExpectedToken(pub Arc<String>);

pub async fn require_bearer(
    axum::extract::State(expected): axum::extract::State<ExpectedToken>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let ok = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(|given| token_matches(&expected.0, given))
        .unwrap_or(false);
    if ok {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}
```

The 401 carries no body and no hint about what was wrong. The token must never appear in a log line or an error message.

- [ ] **Step 7: Start the server**

Create `src-tauri/src/mcp/mod.rs`:

```rust
pub mod auth;

use std::sync::Arc;

use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use sqlx::{Pool, Sqlite};
use tokio_util::sync::CancellationToken;

pub const PORT: u16 = 4319;

/// Serves MCP on 127.0.0.1 until `cancel` fires.
pub async fn serve(
    pool: Pool<Sqlite>,
    token: String,
    cancel: CancellationToken,
) -> Result<(), std::io::Error> {
    // ... build the service, mount it, serve with graceful shutdown ...
}
```

The body, using the shapes the research verified:

```rust
    let service = StreamableHttpService::new(
        move || Ok(TodoServer::new(pool.clone())),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default().with_cancellation_token(cancel.child_token()),
    );

    let router = axum::Router::new()
        .nest_service("/mcp", service)
        .layer(axum::middleware::from_fn_with_state(
            auth::ExpectedToken(Arc::new(token)),
            auth::require_bearer,
        ));

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await?;
    axum::serve(listener, router)
        .with_graceful_shutdown(async move { cancel.cancelled().await })
        .await
```

For this task `TodoServer` is a placeholder with no tools — Task 3 fills it in. Give it enough to satisfy `StreamableHttpService`: a struct holding the pool, an empty `#[tool_router] impl`, and a `#[tool_handler] impl ServerHandler` returning `ServerInfo`.

**Both shutdown ends must be wired**, as above: the token on the config *and* `with_graceful_shutdown`. With only one, the process hangs when the window closes, because `axum::serve` waits on open connections and SSE streams never close on their own.

**Set the server name explicitly**, or it reports itself as "rmcp":

```rust
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(rmcp::model::Implementation::new(
                "todolist",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions("Todos, Kategorien und Zeitbuchungen der TodoList-App")
    }
```

- [ ] **Step 8: Hook it into the app**

In `src-tauri/src/lib.rs`:

- `mod mcp;`
- In `setup`: resolve the pool from `DbInstances` the way `replace_time_day` already does, `load_or_create_token`, create a root `CancellationToken`, `app.manage(...)` it, and `tauri::async_runtime::spawn(mcp::serve(pool, token, cancel.child_token()))`.
- On `RunEvent::ExitRequested`: `cancel.cancel()`.

Note the ordering constraint Phase 1 ran into: `DbInstances` holds no entry until the JS side has called `Database.load` at least once. In `setup` that has not happened yet. So the server task must wait for the pool rather than assuming it: poll `DbInstances` with a short delay until the entry appears, with a bounded number of attempts, and log once if it never does. Report what you chose.

If a bind on port 4319 fails because something else holds it, log it and leave the app running — a busy port must not stop the todo list from working. The UI in Task 5 shows the server as not running.

- [ ] **Step 9: Verify by hand**

Run the app with `npm run tauri dev`, then:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:4319/mcp
```

Expected: `401`.

```bash
TOKEN=$(sqlite3 ~/.config/com.roomote.todolist/todolist.db \
  "SELECT value FROM app_settings WHERE key='mcp_token';")
curl -s -D- -o /dev/null -X POST http://127.0.0.1:4319/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

Expected: `200`, `content-type: text/event-stream`, and an `mcp-session-id` header.

Then close the app window and confirm the process actually exits — `pgrep -f target/debug/todolist` finds nothing. This is the check that catches a half-wired shutdown.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/mcp/ src-tauri/src/lib.rs
git commit -m "feat: serve an authenticated MCP endpoint from the app"
```

---

## Task 2: The store layer

Every query the tools need, in one file, testable without MCP.

**Files:**
- Create: `src-tauri/src/mcp/store.rs`
- Create: `src-tauri/src/mcp/slots.rs`

- [ ] **Step 1: Write the failing tests for slot conversion**

Create `src-tauri/src/mcp/slots.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_a_time_to_a_slot_index() {
        assert_eq!(parse_slot("00:00"), Ok(0));
        assert_eq!(parse_slot("09:00"), Ok(36));
        assert_eq!(parse_slot("09:15"), Ok(37));
        assert_eq!(parse_slot("23:45"), Ok(95));
    }

    #[test]
    fn rejects_times_that_are_not_on_a_quarter_hour() {
        assert!(parse_slot("09:07").is_err());
    }

    #[test]
    fn rejects_malformed_and_out_of_range_times() {
        for bad in ["", "9:00", "09", "09:60", "24:00", "aa:bb", "-1:00"] {
            assert!(parse_slot(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn renders_a_slot_back_to_a_time() {
        assert_eq!(slot_label(36), "09:00");
        assert_eq!(slot_label(95), "23:45");
    }
}
```

Run: `cd src-tauri && cargo test mcp::slots`
Expected: FAIL — the functions do not exist.

- [ ] **Step 2: Implement it**

`parse_slot(&str) -> Result<i64, String>` splitting on `:`, parsing both halves, rejecting an hour above 23, a minute above 59 and any minute not divisible by 15, returning `hour * 4 + minute / 15`. `slot_label(i64) -> String` formatting `slot / 4` and `(slot % 4) * 15` as `HH:MM`. The error strings are user-visible through MCP, so write them for a reader: `"09:07 liegt nicht auf einer Viertelstunde"`.

This mirrors `timeToSlot` and `slotToLabel` in `src/timeSlots.ts`. Keep the semantics identical; if you find a disagreement, report it rather than picking one.

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd src-tauri && cargo test mcp::slots`
Expected: PASS — four tests.

- [ ] **Step 4: Write the failing tests for the store**

Create `src-tauri/src/mcp/store.rs` with tests against an in-memory pool, following the pattern already in `src-tauri/src/lib.rs`. Create the full schema in the fixture — the real one, including `categories.name UNIQUE COLLATE NOCASE` and `time_slots` without a foreign key. A test schema that differs from production is how the cascade bug in Phase 1 stayed hidden.

Cover:

- `list_todos` with no filter returns everything, newest first
- `list_todos` filtered by status, by category name, and by a due-date cutoff
- `add_todo` inserts and returns the row, with defaults applied
- `add_todo` with an unknown category name returns an error, and inserts nothing
- `update_todo` changes only the fields that were given
- `update_todo` with an unknown id returns an error
- `delete_todo` removes the row; deleting an unknown id returns an error
- `list_categories` returns them sorted the way the app sorts them
- `week_time` returns the slots of a week plus per-category totals
- `book_time` writes a run of slots with the note on each
- `book_time` with an unknown category returns an error and writes nothing
- `book_time` over slots that are already booked replaces them

Run: `cd src-tauri && cargo test mcp::store`
Expected: FAIL — nothing is implemented.

- [ ] **Step 5: Implement the store**

Plain `async fn`s taking `&Pool<Sqlite>`, returning `Result<T, StoreError>` where `StoreError` distinguishes "the caller asked for something that does not exist or is invalid" from "the database failed". Task 3 maps the first to a tool error and the second to a protocol error, so the distinction has to exist here.

Categories are addressed **by name**, not id — a language model knows "Kundenprojekt", not `category_id = 4`. Resolve a name to an id with the same case-insensitive rule the frontend uses (`categoryNameKey` in `src/types.ts`: trim, lowercase). An unknown name is an error; never create a category implicitly.

`book_time` writes the whole run in one transaction, the way `replace_time_day_tx` does. Use `?` placeholders — this is sqlx directly, not the JS plugin layer that wants `$N`.

Sorting: the app sorts categories with `compareCategoryNames`, which lowercases before comparing because WebKit and Chromium disagree about case weighting. SQLite cannot express that. Sort in Rust after reading, and mirror the JavaScript rule; if you cannot match it exactly, say so rather than shipping a third ordering.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test mcp::store`
Expected: PASS — every case above.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/mcp/store.rs src-tauri/src/mcp/slots.rs
git commit -m "feat: add the MCP store and slot conversion layers"
```

---

## Task 3: The seven tools

**Files:**
- Create: `src-tauri/src/mcp/tools.rs`
- Modify: `src-tauri/src/mcp/mod.rs`

| Tool | Input | Effect |
|---|---|---|
| `list_todos` | `status?`, `category?`, `due_before?` | Reads todos, filtered |
| `add_todo` | `title`, `priority?`, `due_date?`, `category?` | Creates one, returns it |
| `update_todo` | `id`, plus any of `title`, `status`, `priority`, `due_date`, `category` | Changes only what was given |
| `delete_todo` | `id` | Deletes it |
| `list_categories` | — | Names, colors, ids |
| `get_week_time` | `date` (any day of that week, ISO) | The week's slots plus per-category totals |
| `book_time` | `date`, `from`, `to` (HH:MM), `category`, `note?` | Books a run of quarter hours |

> **Amended during Task 3.** The parameter was originally called `monday`. A field
> named `monday` that accepts any day is the kind of contradiction a model reads
> wrongly, and the name invites it to compute the Monday itself — weekday
> arithmetic being something models get wrong, especially around Sundays and year
> boundaries. The store normalises any day to that week's Monday and reports which
> one it picked.
>
> Three semantics were settled while building the store, and they live in the tool
> descriptions because a caller cannot infer them: `due_before` is **exclusive** and
> never returns undated todos; `book_time`'s `to` is **exclusive** and both times
> must land on minute 00, 15, 30 or 45, with no rounding; and in `update_todo`,
> JSON `null` clears a field while omitting it leaves the field alone — expressed
> with `Option<Option<String>>` plus a `double_option` deserializer, because serde
> otherwise folds "null" and "absent" into the same `None`.

- [ ] **Step 1: Write the failing tests**

In `tools.rs`, against an in-memory pool with the real schema. For each of the seven: one success case asserting the returned content, one failure case asserting that a bad input comes back as a **tool error** (`CallToolResult::is_error`) with a message naming the problem — not as `Err`.

Add one test that a tool never panics on hostile input: an empty title, a negative id, a `due_before` that is not a date, a `from` later than its `to`.

Run: `cd src-tauri && cargo test mcp::tools`
Expected: FAIL.

- [ ] **Step 2: Declare the parameter types**

One `#[derive(Debug, Deserialize, JsonSchema)]` struct per tool that takes arguments, with a doc comment on every field — those comments become the schema descriptions the model reads, so they are worth writing carefully. For example:

```rust
#[derive(Debug, Deserialize, JsonSchema)]
pub struct BookTime {
    /// Tag der Buchung, ISO-Format YYYY-MM-DD
    pub date: String,
    /// Beginn, HH:MM auf einer Viertelstunde
    pub from: String,
    /// Ende, HH:MM auf einer Viertelstunde; exklusiv
    pub to: String,
    /// Name einer bestehenden Kategorie
    pub category: String,
    /// Notiz für den Block
    pub note: Option<String>,
}
```

- [ ] **Step 3: Implement the tools**

```rust
#[tool_router]
impl TodoServer {
    #[tool(description = "Listet Aufgaben, optional gefiltert")]
    async fn list_todos(
        &self,
        Parameters(params): Parameters<ListTodos>,
    ) -> Result<CallToolResult, McpError> {
        // ...
    }
}
```

Every body maps a `StoreError` of the "caller asked for something impossible" kind to `Ok(CallToolResult::error(vec![ContentBlock::text(msg)]))` and a database failure to `Err(McpError::internal_error(...))`. No `unwrap`, no `expect`, no indexing, no lossy casts.

Return content as JSON text — one `ContentBlock::text` holding a serialized object — so the model gets structured data rather than prose it has to parse.

Keep the `#[tool_handler] impl ServerHandler` from Task 1 and confirm `tools/list` now returns seven entries; if it returns zero, the `#[tool_handler]` attribute is missing or the router is not wired.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test mcp`
Expected: PASS — everything in `auth`, `slots`, `store` and `tools`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mcp/tools.rs src-tauri/src/mcp/mod.rs
git commit -m "feat: add the seven MCP tools"
```

---

## Task 4: Tell the UI that data changed

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs`, `src-tauri/src/mcp/mod.rs`
- Modify: `src/App.tsx`, `src/TimeTrackingView.tsx`
- Test: `src/App.test.tsx`, `src/TimeTrackingView.test.tsx`

Without this, a todo created through Claude appears only after a restart, which makes the whole feature feel broken.

- [ ] **Step 1: Emit the event from every writing tool**

Give `TodoServer` an `AppHandle` alongside the pool, and after each successful write emit `todolist:data-changed`. `add_todo`, `update_todo`, `delete_todo` and `book_time` emit; the three reading tools do not.

- [ ] **Step 2: Write the failing frontend test**

In `src/App.test.tsx`, mock `@tauri-apps/api/event` and assert that `App` subscribes to `todolist:data-changed` on mount and reloads when the event fires. Watch it fail.

- [ ] **Step 3: Listen in both views**

A `useEffect` in each that subscribes with `listen` and calls the existing reload path, unsubscribing on unmount. Outside Tauri `listen` is unavailable, so guard the subscription the same way the stores guard themselves — the browser build must not break.

- [ ] **Step 4: Verify**

`npm run typecheck && npm test`, then `npx playwright test`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: reload the views when MCP changes data"
```

---

## Task 5: The settings section

**Files:**
- Create: `src/McpSettings.tsx`
- Modify: `src/App.tsx`, `src-tauri/src/lib.rs`
- Test: `src/McpSettings.test.tsx`

**Read `STYLEGUIDE.md` before writing any of this.** Build from the pieces in `src/ui/`; a new building block is justified only when a pattern appears a second time.

- [ ] **Step 1: Expose the token to the frontend**

A Tauri command `mcp_status() -> { running: bool, port: u16, token: String }`. It returns the token only to the app's own frontend, which is the one place entitled to display it.

- [ ] **Step 2: Write the failing test**

`src/McpSettings.test.tsx`, with the command mocked: the token is masked by default, a button reveals it, another copies it, and the client configuration line contains the port and the token.

- [ ] **Step 3: Build it**

Three things: status with the port; the token, masked, with reveal and copy; and the ready-made client line to copy:

```
claude mcp add --transport http todolist http://127.0.0.1:4319/mcp --header "Authorization: Bearer <token>"
```

The token is a credential. It is masked by default, it never lands in a log, and copying it must not put it anywhere except the clipboard.

- [ ] **Step 4: Verify**

`npm run typecheck && npm test`, then `npx playwright test` — this is UI, so the E2E suite matters.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: show the MCP server status and token in the settings"
```

---

## Task 6: End to end against a real client

The only step that proves the feature works. Everything before it is tested against mocks and in-memory pools.

- [ ] **Step 1: Run every automated check**

```bash
npm run typecheck && npm test && npx playwright test
cd src-tauri && cargo check && cargo test && cd ..
```

- [ ] **Step 2: Connect Claude Code**

With the app running:

```bash
claude mcp add --transport http todolist http://127.0.0.1:4319/mcp --header "Authorization: Bearer <token>"
```

Then confirm `tools/list` shows all seven, and call each one at least once. Write down what each returned.

- [ ] **Step 3: Confirm the UI reacts**

Create a todo through Claude with the app open, and confirm it appears without a restart. Book time through Claude and confirm the same in the time view.

- [ ] **Step 4: Confirm the failure modes**

- A wrong token gets `401`
- An unknown category name comes back as a readable tool error, and nothing is written
- A malformed time comes back as a readable tool error
- Closing the app window terminates the process; `pgrep -f target/debug/todolist` finds nothing

- [ ] **Step 5: Documentation**

`AGENTS.md`: a section on the MCP server — what it exposes, where the token lives, that tool bodies must not panic, and that the error kind decides whether the caller sees the message. `CHANGELOG.md`: an entry under `## [Unreleased]`.

- [ ] **Step 6: Commit**

```bash
git commit -m "docs: document the MCP server"
```

---

## Done when

- `npm run typecheck && npm test`, `npx playwright test`, `cargo check` and `cargo test` all pass
- Claude Code connects and all seven tools work
- A todo created through Claude appears in the open app without a restart
- A wrong token is refused, and bad input produces a readable error rather than silence
- Closing the window ends the process

## Deliberately not in scope

- Access while the app is closed — no sidecar, no standalone process
- MCP client functionality, i.e. talking to other servers
- Creating, renaming or deleting categories over MCP
- CSV export over MCP
- A configurable port; 4319 is fixed
- OAuth; the static Bearer token is the whole authentication story
