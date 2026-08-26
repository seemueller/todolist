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
            download_url: update.download_url.clone(),
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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build());
            Ok(())
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:todolist.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![check_for_update, install_update])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
