use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};
use tauri_plugin_updater::UpdaterExt;

/// Verbindungsstring der einzigen Datenbank; muss zu dem in sqlClient.ts und dem
/// `add_migrations`-Aufruf unten passen.
const DB_URL: &str = "sqlite:todolist.db";

#[derive(Clone, Serialize)]
struct UpdateCheckResponse {
    update_available: bool,
    version: Option<String>,
    download_url: Option<String>,
}

/// Eine zu speichernde Viertelstunde, wie sie aus dem Frontend hereinkommt.
/// Feldnamen sind bewusst snake_case: Tauris automatische camelCase-Konvertierung
/// gilt nur fuer die Top-Level-Argumentnamen eines Commands (hier `date`/`slots`),
/// nicht fuer Felder innerhalb eines Struct-Arguments. Das Frontend schickt bereits
/// `category_id`, das passt ohne `rename_all` exakt auf dieses Feld.
#[derive(Deserialize)]
struct TimeSlotInput {
    slot: i64,
    category_id: i64,
    note: String,
}

/// Ersetzt den kompletten Tagesstand in einer einzigen echten Transaktion auf
/// EINER gehaltenen Verbindung. Anders als bei separaten `db.execute()`-Aufrufen
/// vom JS-Plugin (die je Aufruf eine beliebige Verbindung aus dem sqlx-Pool ziehen
/// und darum BEGIN/COMMIT nicht zuverlaessig zusammenhalten) haelt `pool.begin()`
/// hier eine Verbindung fest, bis committet oder die Transaktion beim Drop
/// verworfen wird. Ein Fehler mitten im Loop laesst den Tag darum unveraendert.
async fn replace_time_day_tx(
    pool: &Pool<Sqlite>,
    date: &str,
    slots: &[TimeSlotInput],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM time_slots WHERE date = ?")
        .bind(date)
        .execute(&mut *tx)
        .await?;

    for slot in slots {
        sqlx::query(
            "INSERT INTO time_slots (date, slot, category_id, note) VALUES (?, ?, ?, ?)",
        )
        .bind(date)
        .bind(slot.slot)
        .bind(slot.category_id)
        .bind(&slot.note)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await
}

#[tauri::command]
async fn replace_time_day(
    app: tauri::AppHandle,
    date: String,
    slots: Vec<TimeSlotInput>,
) -> Result<(), String> {
    let instances = app.state::<DbInstances>();
    let pool = {
        let map = instances.0.read().await;
        let db_pool = map
            .get(DB_URL)
            .ok_or_else(|| format!("database {DB_URL} not loaded"))?;
        match db_pool {
            DbPool::Sqlite(pool) => pool.clone(),
        }
    };

    replace_time_day_tx(&pool, &date, &slots)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateCheckResponse, String> {
    let result = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;

    Ok(match result {
        Some(update) => UpdateCheckResponse {
            update_available: true,
            version: Some(update.version.to_string()),
            download_url: Some(update.download_url.to_string()),
        },
        None => UpdateCheckResponse {
            update_available: false,
            version: None,
            download_url: None,
        },
    })
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;

    let mut downloaded = 0;
    update
        .download_and_install(
            |chunk_length, content_length| {
                downloaded += chunk_length;
                if let Some(total) = content_length {
                    println!("Downloaded {downloaded}B out of {total}B");
                }
            },
            || {
                println!("Download finished");
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_todos_table",
            sql: "CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_categories_table",
            sql: "CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                color TEXT NOT NULL DEFAULT '#a78bfa',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_due_date_column",
            sql: "ALTER TABLE todos ADD COLUMN due_date TEXT DEFAULT NULL;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_category_id_to_todos",
            sql: "ALTER TABLE todos ADD COLUMN category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_priority_column",
            sql: "ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_status_column",
            sql: "ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'todo';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_time_tables",
            sql: "CREATE TABLE IF NOT EXISTS time_slots (
                date TEXT NOT NULL,
                slot INTEGER NOT NULL,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                note TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (date, slot)
            );
            CREATE TABLE IF NOT EXISTS time_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                target_slots_per_day INTEGER NOT NULL DEFAULT 32,
                show_weekend INTEGER NOT NULL DEFAULT 0
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_app_settings",
            sql: "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            check_for_update,
            install_update,
            replace_time_day
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    const TIME_SLOTS_SCHEMA: &str = "CREATE TABLE time_slots (
        date TEXT NOT NULL,
        slot INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (date, slot)
    );";

    async fn setup() -> Pool<Sqlite> {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        sqlx::query(TIME_SLOTS_SCHEMA)
            .execute(&pool)
            .await
            .expect("create time_slots");
        pool
    }

    async fn day_slots(pool: &Pool<Sqlite>, date: &str) -> Vec<(i64, i64, String)> {
        sqlx::query_as::<_, (i64, i64, String)>(
            "SELECT slot, category_id, note FROM time_slots WHERE date = ? ORDER BY slot",
        )
        .bind(date)
        .fetch_all(pool)
        .await
        .expect("select day")
    }

    fn slot(slot: i64, category_id: i64, note: &str) -> TimeSlotInput {
        TimeSlotInput {
            slot,
            category_id,
            note: note.to_string(),
        }
    }

    #[tokio::test]
    async fn replacing_a_day_stores_exactly_the_given_slots() {
        let pool = setup().await;

        replace_time_day_tx(
            &pool,
            "2026-09-03",
            &[slot(32, 1, ""), slot(33, 1, ""), slot(40, 2, "Meeting")],
        )
        .await
        .expect("replace should succeed");

        let stored = day_slots(&pool, "2026-09-03").await;
        assert_eq!(
            stored,
            vec![
                (32, 1, "".to_string()),
                (33, 1, "".to_string()),
                (40, 2, "Meeting".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn replacing_again_deletes_the_previous_slots() {
        let pool = setup().await;

        replace_time_day_tx(
            &pool,
            "2026-09-03",
            &[slot(32, 1, ""), slot(33, 1, ""), slot(40, 2, "Meeting")],
        )
        .await
        .expect("first replace should succeed");

        replace_time_day_tx(&pool, "2026-09-03", &[slot(36, 2, "")])
            .await
            .expect("second replace should succeed");

        let stored = day_slots(&pool, "2026-09-03").await;
        assert_eq!(stored, vec![(36, 2, "".to_string())]);
    }

    #[tokio::test]
    async fn a_failed_replace_leaves_the_original_day_untouched() {
        let pool = setup().await;

        replace_time_day_tx(&pool, "2026-09-03", &[slot(32, 1, ""), slot(33, 1, "")])
            .await
            .expect("initial replace should succeed");

        // Same (date, slot) twice in one batch violates the PRIMARY KEY on the
        // second INSERT, forcing the transaction to fail partway through.
        let result = replace_time_day_tx(
            &pool,
            "2026-09-03",
            &[slot(40, 2, ""), slot(40, 2, "")],
        )
        .await;
        assert!(result.is_err(), "duplicate slot should fail the replace");

        let stored = day_slots(&pool, "2026-09-03").await;
        assert_eq!(
            stored,
            vec![(32, 1, "".to_string()), (33, 1, "".to_string())],
            "the day must be exactly what it held before the failed replace"
        );
    }
}
