use serde::Serialize;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, Serialize)]
struct UpdateCheckResponse {
    update_available: bool,
    version: Option<String>,
    download_url: Option<String>,
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
                .add_migrations("sqlite:todolist.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![check_for_update, install_update])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
