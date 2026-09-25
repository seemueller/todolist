mod config_migration;
mod mcp;
mod tags;

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

/// Wird als Tauri-State gehalten, damit `RunEvent::ExitRequested` den
/// MCP-Server abraeumen kann.
struct McpCancel(tokio_util::sync::CancellationToken);

/// Was die Oberflaeche ueber den MCP-Server erfahren darf.
///
/// Der Token steht hier, weil das eigene Frontend die einzige Stelle ist, die
/// ihn anzeigen darf: ohne ihn kaeme kein Client herein, und niemand soll dafuer
/// die Datenbank mit `sqlite3` oeffnen muessen. In eine Log-Zeile gehoert er
/// nicht, darum taucht er in keinem `eprintln!` dieser Datei auf.
#[derive(Clone, Serialize)]
struct McpStatus {
    running: bool,
    port: u16,
    token: String,
}

impl Default for McpStatus {
    fn default() -> Self {
        Self {
            running: false,
            port: mcp::PORT,
            token: String::new(),
        }
    }
}

/// Tauri-State: `start_mcp` schreibt, `mcp_status` liest.
#[derive(Default)]
struct McpState(std::sync::Mutex<McpStatus>);

impl McpState {
    /// Ein vergifteter Mutex darf den Status nicht unlesbar machen -- hier wird
    /// nur ein Wert im Ganzen ersetzt, einen halb geschriebenen Zustand gibt es
    /// nicht.
    fn set(&self, status: McpStatus) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = status;
    }

    fn get(&self) -> McpStatus {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

#[tauri::command]
fn mcp_status(app: tauri::AppHandle) -> McpStatus {
    app.state::<McpState>().get()
}

/// `DbInstances` ist leer, bis das Frontend `Database.load` mindestens einmal
/// gerufen hat -- im `setup`-Hook ist das noch nicht passiert. Darum warten
/// statt annehmen: alle 100 ms nachsehen, hoechstens 300 Mal, also 30 Sekunden.
/// Das ueberdeckt auch einen langsam startenden Dev-Server und endet trotzdem,
/// statt einen Task fuer immer laufen zu lassen.
async fn wait_for_pool(app: &tauri::AppHandle) -> Option<Pool<Sqlite>> {
    const ATTEMPTS: u32 = 300;
    const INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);

    for _ in 0..ATTEMPTS {
        let instances = app.state::<DbInstances>();
        let found = {
            let map = instances.0.read().await;
            map.get(DB_URL).map(|db_pool| match db_pool {
                DbPool::Sqlite(pool) => pool.clone(),
            })
        };
        if let Some(pool) = found {
            return Some(pool);
        }
        tokio::time::sleep(INTERVAL).await;
    }
    None
}

/// Startet den MCP-Server, sobald der Pool da ist. Jeder Fehlschlag bleibt
/// folgenlos fuer die App selbst: ein besetzter Port darf die Todo-Liste nicht
/// aufhalten. Der Token taucht in keiner dieser Meldungen auf.
async fn start_mcp(app: tauri::AppHandle, cancel: tokio_util::sync::CancellationToken) {
    let Some(pool) = wait_for_pool(&app).await else {
        eprintln!("MCP: database {DB_URL} never showed up, server not started");
        return;
    };

    let token = match mcp::auth::load_or_create_token(&pool).await {
        Ok(token) => token,
        Err(e) => {
            eprintln!("MCP: could not read or create the token: {e}");
            return;
        }
    };

    // Der Handle ist der Weg zurueck zur offenen Oberflaeche: nach jedem
    // Schreiben ueber MCP geht darueber `todolist:data-changed` hinaus.
    let notifier: std::sync::Arc<dyn mcp::Notifier> = std::sync::Arc::new(app.clone());

    // Ab hier gilt der Server als laufend. Scheitert das Binden -- besetzter
    // Port --, kommt `serve` binnen Millisekunden mit einem Fehler zurueck und
    // der Status faellt zurueck, lange bevor jemand das Popup oeffnet.
    app.state::<McpState>().set(McpStatus {
        running: true,
        port: mcp::PORT,
        token: token.clone(),
    });

    let result = mcp::serve(pool, notifier, token, cancel).await;

    // Steht der Server nicht mehr, gibt es auch keinen Token mehr zu zeigen.
    app.state::<McpState>().set(McpStatus::default());

    if let Err(e) = result {
        eprintln!("MCP: server on port {} stopped: {e}", mcp::PORT);
    }
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
    // Vor allem anderen: tauri-plugin-sql loest `sqlite:todolist.db` gegen
    // `app_config_dir()` auf, und das haengt am Bundle-Identifier. Nach dessen
    // Umbenennung zeigt eine bestehende Installation auf ein leeres
    // Verzeichnis, in dem sonst kommentarlos eine frische Datenbank entstuende.
    config_migration::migrate_legacy_config_dir_in_place();

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
        // Noch von nichts gelesen oder geschrieben: Vorarbeit fuer den
        // MCP-Server (siehe docs/) -- nicht als ungenutzt entfernen.
        Migration {
            version: 8,
            description: "create_app_settings",
            sql: "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        // Nimmt den Fremdschluessel aus Migration 7 wieder zurueck. sqlx setzt
        // `PRAGMA foreign_keys = ON`, das ON DELETE CASCADE war also scharf:
        // eine geloeschte Kategorie riss jede Zeitbuchung mit, die sie benutzt
        // hatte. Der localStorage-Speicher tut das nicht, und die Wochenansicht
        // rechnet ausdruecklich mit ueberlebenden Buchungen -- sie beschriftet
        // eine unbekannte Kategorie mit "Geloeschte Kategorie". ON DELETE SET
        // NULL waere keine Alternative: `applyPaint` in timeSlots.ts liest
        // category_id === null als "Slot leeren", eine solche Zeile ist im
        // Datenmodell gar nicht darstellbar. SQLite kann keinen Constraint
        // loeschen, die Tabelle wird darum umgebaut.
        Migration {
            version: 9,
            description: "drop_time_slots_category_fk",
            sql: "CREATE TABLE time_slots_new (
                date TEXT NOT NULL,
                slot INTEGER NOT NULL,
                category_id INTEGER NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (date, slot)
            );
            INSERT INTO time_slots_new (date, slot, category_id, note)
                SELECT date, slot, category_id, note FROM time_slots;
            DROP TABLE time_slots;
            ALTER TABLE time_slots_new RENAME TO time_slots;",
            kind: MigrationKind::Up,
        },
        // Eine Aufgabe traegt zusaetzlich zum Titel einen frei formulierten
        // Text. `NOT NULL DEFAULT ''` statt NULL: "keine Beschreibung" soll
        // nur eine Schreibweise haben, und Altbestand bekommt den leeren
        // String von der Datenbank.
        Migration {
            version: 10,
            description: "add_description_column",
            sql: "ALTER TABLE todos ADD COLUMN description TEXT NOT NULL DEFAULT '';",
            kind: MigrationKind::Up,
        },
        // Eine geloeschte Aufgabe verschwindet nicht, sie bekommt einen
        // Zeitstempel: gesetzt heisst "liegt im Papierkorb". Der Wert traegt
        // zugleich die Aufbewahrungsfrist, eine zweite Spalte braucht es nicht.
        Migration {
            version: 11,
            description: "add_deleted_at_to_todos",
            sql: "ALTER TABLE todos ADD COLUMN deleted_at TEXT DEFAULT NULL;",
            kind: MigrationKind::Up,
        },
        // Bestehende Kategorien werden Arbeitszeit: das trifft die grosse
        // Mehrheit, und wer eine Kategorie anders eingestuft haben will, stellt
        // sie einmal im Kategorien-Fenster um. Bewusst kein Rateversuch anhand
        // des Namens.
        Migration {
            version: 12,
            description: "add_time_kind_to_categories",
            sql: "ALTER TABLE categories ADD COLUMN time_kind TEXT NOT NULL DEFAULT 'internal';",
            kind: MigrationKind::Up,
        },
        // Alle bestehenden Aufgaben starten auf 0 und sortieren sich damit
        // weiter nach der Faelligkeitsregel. Bewusst keine Vorab-Nummerierung
        // per ROW_NUMBER: die Reihenfolge waere dieselbe, aber jede Aufgabe
        // haette einen eingefrorenen Platz, den niemand gesetzt hat.
        Migration {
            version: 13,
            description: "add_board_order_to_todos",
            sql: "ALTER TABLE todos ADD COLUMN board_order REAL NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        // Der Typ ist eine Eigenschaft der Aufgabe, keine Stammdatenzeile:
        // drei feste Werte, geprueft in `toTodoType` (src/types.ts) und an der
        // MCP-Grenze in `check_type`. Bestandsaufgaben werden Aufgaben --
        // dieselbe Vorgabe, die auch die Oberflaeche anbietet.
        Migration {
            version: 14,
            description: "add_type_to_todos",
            sql: "ALTER TABLE todos ADD COLUMN type TEXT NOT NULL DEFAULT 'task';",
            kind: MigrationKind::Up,
        },
        // Ein DB-Backstop fuer die Eindeutigkeit von Kategorienamen. Bisher haelt
        // sie allein `assertNameAvailable` in src/todoStoreSql.ts (JavaScript,
        // Unicode-bewusst ueber `categoryNameKey`) -- ein Check-then-Act ohne
        // umspannende Transaktion, und der alte `UNIQUE COLLATE NOCASE` faltet
        // nur ASCII, laesst also "Ärzte"/"ärzte" nebeneinander zu. Diese Spalte
        // traegt den von JavaScript berechneten Schluessel; die Anwendung
        // schreibt ihn bei jedem Anlegen und Umbenennen mit, der eindeutige Index
        // macht ihn zur Invariante. Bestandszeilen werden mit `lower(trim(name))`
        // vorbefuellt -- das Beste, was SQLite ohne ICU kann; da bestehende
        // Namen bereits den JS-Check bestanden haben, kann der Index dabei nicht
        // an einem echten Duplikat scheitern. Fuer Namen mit Nicht-ASCII-Grosz-
        // schreibung wird der Schluessel erst beim naechsten Schreiben durch
        // JavaScript exakt; der JS-Check bleibt bis dahin die genaue Pruefung.
        Migration {
            version: 15,
            description: "add_name_key_to_categories",
            sql: "ALTER TABLE categories ADD COLUMN name_key TEXT;
            UPDATE categories SET name_key = lower(trim(name));
            CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_key ON categories(name_key);",
            kind: MigrationKind::Up,
        },
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
            mcp_status,
            replace_time_day,
            set_todo_tags
        ])
        .setup(|app| {
            let cancel = tokio_util::sync::CancellationToken::new();
            app.manage(McpCancel(cancel.clone()));
            app.manage(McpState::default());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(start_mcp(handle, cancel));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // Beendet Sessions und Listener zusammen; ohne das haengt der
            // Prozess beim Schliessen des Fensters an offenen SSE-Streams.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app.state::<McpCancel>().0.cancel();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    /// Muss dem echten Schema nach Migration 9 entsprechen -- insbesondere ohne
    /// `REFERENCES categories(id)`. Solange hier ein anderes Schema stand als in
    /// der Migration, konnte kein Rust-Test das ON DELETE CASCADE bemerken, das
    /// Migration 7 mitbrachte.
    const TIME_SLOTS_SCHEMA: &str = "CREATE TABLE time_slots (
        date TEXT NOT NULL,
        slot INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (date, slot)
    );";

    const CATEGORIES_SCHEMA: &str = "CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color TEXT NOT NULL DEFAULT '#a78bfa',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );";

    async fn setup() -> Pool<Sqlite> {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        // sqlx setzt das ohnehin per Default auf jeder Verbindung; hier steht es
        // ausdruecklich, weil sonst ein Fremdschluessel im Schema wirkungslos
        // waere und der Test unten nichts beweisen wuerde.
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("enable foreign keys");
        sqlx::query(CATEGORIES_SCHEMA)
            .execute(&pool)
            .await
            .expect("create categories");
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

    #[test]
    fn the_status_starts_out_not_running_and_without_a_token() {
        let state = McpState::default();
        let status = state.get();
        assert!(!status.running);
        assert_eq!(status.port, mcp::PORT);
        assert!(status.token.is_empty(), "no token before the server is up");
    }

    #[test]
    fn a_stopped_server_takes_its_token_out_of_the_status() {
        let state = McpState::default();
        state.set(McpStatus {
            running: true,
            port: mcp::PORT,
            token: "a-token".to_string(),
        });
        assert!(state.get().running);

        state.set(McpStatus::default());
        let status = state.get();
        assert!(!status.running);
        assert!(
            status.token.is_empty(),
            "a stopped server must not keep handing out a token"
        );
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
    async fn deleting_a_category_keeps_its_time_bookings() {
        let pool = setup().await;
        sqlx::query("INSERT INTO categories (id, name, color) VALUES (1, 'Kunde', '#111111')")
            .execute(&pool)
            .await
            .expect("insert category");

        replace_time_day_tx(&pool, "2026-09-03", &[slot(32, 1, "Meeting"), slot(33, 1, "")])
            .await
            .expect("replace should succeed");

        sqlx::query("DELETE FROM categories WHERE id = 1")
            .execute(&pool)
            .await
            .expect("delete category");

        // Die Buchungen behalten ihre jetzt ins Leere zeigende category_id; die
        // Wochenansicht beschriftet sie mit "Geloeschte Kategorie". Mit dem
        // ON DELETE CASCADE aus Migration 7 waeren sie hier verschwunden.
        let stored = day_slots(&pool, "2026-09-03").await;
        assert_eq!(
            stored,
            vec![(32, 1, "Meeting".to_string()), (33, 1, "".to_string())],
            "deleting a category must not delete the time bookings that used it"
        );
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
}
