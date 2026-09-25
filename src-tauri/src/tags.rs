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
///
/// Leerraum ist Unicodes White_Space (`char::is_whitespace`), also auch U+0085
/// (NEL). U+FEFF (BOM) ist kein Leerraum, wird aber vorab ueberall entfernt --
/// vor dem NFC, damit er keine Zeichenfolge auseinanderhaelt. So sieht es auch
/// die JS-Seite, deren `\s` den BOM kennt und NEL nicht.
pub fn normalize_tag(raw: &str) -> Option<String> {
    let composed: String = raw.chars().filter(|c| *c != '\u{feff}').nfc().collect();
    let lowered = composed.to_lowercase();
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
