use std::sync::Arc;

use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};
use base64::Engine;
use sqlx::{Pool, Sqlite};
use subtle::ConstantTimeEq;

const TOKEN_KEY: &str = "mcp_token";

/// 32 zufaellige Bytes, base64url ohne Padding: ohne Quoting in einem Header
/// transportierbar.
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::fill(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Vergleicht in konstanter Zeit, damit ein falscher Token nicht Zeichen fuer
/// Zeichen erraten werden kann. Die Laengenpruefung davor verraet nur die
/// Laenge, und die ist ohnehin fest.
pub fn token_matches(expected: &str, given: &str) -> bool {
    if expected.len() != given.len() {
        return false;
    }
    expected.as_bytes().ct_eq(given.as_bytes()).into()
}

/// Liest den Token und erzeugt ihn beim ersten Aufruf.
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

/// Der erwartete Token, als State der Middleware.
#[derive(Clone)]
pub struct ExpectedToken(pub Arc<String>);

/// Laesst nur Anfragen mit exakt passendem Bearer-Token durch. Die 401 traegt
/// weder Body noch Hinweis darauf, was gefehlt hat; der Token selbst darf in
/// keiner Log-Zeile und keiner Fehlermeldung auftauchen.
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

    /// Muss dem echten Schema aus Migration 8 entsprechen.
    const APP_SETTINGS_SCHEMA: &str = "CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );";

    async fn setup() -> Pool<Sqlite> {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        sqlx::query(APP_SETTINGS_SCHEMA)
            .execute(&pool)
            .await
            .expect("create app_settings");
        pool
    }

    #[tokio::test]
    async fn the_first_call_generates_and_persists_a_token() {
        let pool = setup().await;

        let token = load_or_create_token(&pool).await.expect("load or create");

        let stored: (String,) = sqlx::query_as("SELECT value FROM app_settings WHERE key = ?")
            .bind(TOKEN_KEY)
            .fetch_one(&pool)
            .await
            .expect("token row");
        assert_eq!(stored.0, token);
        assert!(token.len() >= 43);
    }

    #[tokio::test]
    async fn a_second_call_returns_the_same_token() {
        let pool = setup().await;

        let first = load_or_create_token(&pool).await.expect("first call");
        let second = load_or_create_token(&pool).await.expect("second call");

        assert_eq!(first, second);
        let rows: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM app_settings")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(rows.0, 1, "the token must be stored exactly once");
    }
}
