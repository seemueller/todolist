//! Die sieben Tools: Parameterpruefung, Aufruf des Stores, MCP-Antwort.
//!
//! Diese Datei ist duenn mit Absicht -- das SQL steht in `store.rs`, die
//! Uhrzeitrechnung in `slots.rs`. Hier bleiben drei Dinge:
//!
//! * **Die Fehlerart ist eine Entscheidung fuer den Aufrufer, keine Stilfrage.**
//!   `Ok(CallToolResult::error(...))` traegt Text, den das Modell liest und auf
//!   den es reagieren kann; `Err(ErrorData)` rendern MCP-Clients undurchsichtig
//!   ("Tool result missing due to internal error"). Also wird jeder
//!   `StoreError::Request` zum Tool-Fehler und nur `StoreError::Db` zum
//!   Protokollfehler. Andersherum saehe das Modell "interner Fehler", wo
//!   "Es gibt keine Kategorie \"Kundenprojekt\"" stehen muesste, und kaeme nicht
//!   mehr weiter.
//! * **Die Beschreibungen sind die API-Dokumentation, die das Modell liest**,
//!   bevor es ein Tool aufruft -- keine Kommentare. Drei Bedeutungen kann ein
//!   Aufrufer nicht erraten und sie stehen deshalb ausdruecklich drin:
//!   `due_before` ist ausschliesslich und laesst Aufgaben ohne Faelligkeit weg,
//!   `get_week_time` normalisiert jeden Tag auf den Montag seiner Woche, und
//!   `book_time` hat ein ausschliessliches Ende auf einer Viertelstunde.
//! * **Kein Panic.** Ein Panic im Tool-Rumpf erzeugt gar keine Antwort: es gibt
//!   kein `catch_unwind` im Dispatch, der Client wartet in sein eigenes Timeout
//!   und sieht einen toten Server statt eines Fehlers.

use rmcp::{
    ErrorData as McpError,
    handler::server::wrapper::Parameters,
    model::{CallToolResult, ContentBlock},
    schemars, tool, tool_router,
};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::json;

use super::TodoServer;
use super::slots::parse_slot;
use super::store::{self, StoreError, TodoUpdate};

// --- Antworten --------------------------------------------------------------

/// Ein Tool-Fehler: Text, den der Aufrufer liest und auf den er reagieren kann.
fn tool_error(message: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(message)])
}

/// Ein Protokollfehler fuer das, wogegen der Aufrufer nichts tun kann.
///
/// Der Text kommt beim Modell ohnehin nicht an; der Grund wandert nach `data`,
/// damit er beim Debuggen ueber die Leitung noch sichtbar ist. Das Token taucht
/// hier nie auf -- `sqlx::Error` kennt es nicht.
fn db_error(error: sqlx::Error) -> McpError {
    McpError::internal_error(
        "Der Zugriff auf die Datenbank der TodoList-App ist fehlgeschlagen.",
        Some(json!({ "reason": error.to_string() })),
    )
}

/// Bildet ein Store-Ergebnis auf eine MCP-Antwort ab -- die eine Stelle, an der
/// die Unterscheidung aus `StoreError` in die beiden Fehlerarten uebergeht.
fn respond<T: Serialize>(result: Result<T, StoreError>) -> Result<CallToolResult, McpError> {
    match result {
        Ok(value) => Ok(CallToolResult::success(vec![ContentBlock::json(value)?])),
        Err(StoreError::Request(message)) => Ok(tool_error(message)),
        Err(StoreError::Db(error)) => Err(db_error(error)),
    }
}

impl TodoServer {
    /// Wie `respond`, sagt der Oberflaeche vorher aber, dass sie neu laden
    /// soll. Genau die vier schreibenden Tools nehmen diesen Weg.
    ///
    /// Gemeldet wird ausschliesslich bei `Ok`: ein Tool-Fehler ("keine
    /// Kategorie dieses Namens") und ein Datenbankfehler haben nichts
    /// geschrieben, und ein Nachladen, dem kein Schreiben vorausging, waere
    /// eine Falschaussage ueber den Zustand.
    fn respond_write<T: Serialize>(
        &self,
        result: Result<T, StoreError>,
    ) -> Result<CallToolResult, McpError> {
        if result.is_ok() {
            self.notifier.data_changed();
        }
        respond(result)
    }
}

// --- Grenzen fuer freien Text -----------------------------------------------

// Geprueft wird hier an der Tool-Grenze, nicht im Store. Wer den Titel selbst
// in die App tippt, darf weiterhin schreiben, was er will -- das ist bestehendes
// Verhalten und nicht Sache dieser Phase. Neu ist, dass ein Modell durch eine
// Schnittstelle schreiben kann, und ein 10.000 Zeichen langer Titel macht aus
// der Aufgabenkarte mehrere Bildschirmhoehen: fuer den Leser sieht die App
// kaputt aus. Die Grenzen sollen Unsinn abfangen, nicht streng sein.
//
// Gezaehlt werden Zeichen, nicht Bytes -- sonst haette ein deutscher Text nur
// die halbe Laenge zur Verfuegung.

/// Ein Aufgabentitel ist eine Zeile. 500 Zeichen sind etwa sieben Zeilen Prosa
/// und damit weit jenseits dessen, was ein Titel je braucht.
const MAX_TITLE_CHARS: usize = 500;
/// Eine Notiz an einer Zeitbuchung darf ein Absatz sein, keine Akte.
const MAX_NOTE_CHARS: usize = 2000;
/// Ein Kategoriename ist ein Wort oder zwei.
///
/// Dass `resolve_category` den unbekannten Namen zurueckgibt, ist hier kein
/// Argument mehr: gekappt wird beim Zitieren (`echo::quoted`), fuer jedes Feld
/// nach derselben Regel. `MAX_ECHO_CHARS` liegt bewusst oberhalb dieser Grenze,
/// damit ein zulaessiger Name vollstaendig in der Absage steht.
const MAX_CATEGORY_CHARS: usize = 100;

/// Prueft ein Textfeld auf Laenge und Steuerzeichen.
///
/// Steuerzeichen werden abgelehnt und nicht entfernt -- auch der
/// Zeilenumbruch. Er ueberlebt die Speicherung und wird in der Oberflaeche als
/// Leerzeichen gerendert, ein Nullbyte ebenso; wer ihn geschickt hat, bekaeme
/// also stillschweigend etwas anderes zurueck, als er geschrieben hat. Das ist
/// dieselbe Entscheidung wie bei "09:07" in `slots.rs`: eine Absage ist
/// besser als eine stillschweigend veraenderte Eingabe.
///
/// `label` ist der Feldname im Nominativ, damit die Meldung ein Satz wird.
fn check_text(label: &str, value: &str, max: usize) -> Result<(), String> {
    let length = value.chars().count();
    if length > max {
        return Err(format!(
            "{label} ist mit {length} Zeichen zu lang; erlaubt sind hoechstens {max}."
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(format!(
            "{label} darf keine Steuerzeichen enthalten -- kein Nullbyte, keinen \
             Zeilenumbruch und keinen Tabulator; erlaubt ist eine einzelne Zeile Text."
        ));
    }
    Ok(())
}

/// Wie `check_text`, laesst ein nicht angegebenes Feld aber durch.
fn check_optional(label: &str, value: Option<&str>, max: usize) -> Result<(), String> {
    match value {
        Some(text) => check_text(label, text, max),
        None => Ok(()),
    }
}

/// Der Kategoriename, wie er in jedem Tool geprueft wird.
fn check_category(name: Option<&str>) -> Result<(), String> {
    check_optional("Der Kategoriename", name, MAX_CATEGORY_CHARS)
}

/// `None` fuer einen Parameter, der leer oder nur Leerraum ist.
///
/// Ein Modell schickt fuer "nicht gesetzt" gerne `""` statt das Feld wegzulassen;
/// ein leerer Filter oder eine leere Notiz sind beide bedeutungslos.
fn non_empty(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// Haelt `null` von "gar nicht angegeben" auseinander.
///
/// Serde faltet beides sonst auf `None` zusammen, und damit waere ueber
/// `update_todo` nicht mehr auszudruecken, dass eine Faelligkeit weg soll.
/// Mit `#[serde(default)]` bleibt ein fehlendes Feld `None`, waehrend `null`
/// hier durchlaeuft und `Some(None)` ergibt.
fn double_option<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::deserialize(deserializer).map(Some)
}

/// `Some(None)` heisst "leeren", `Some(Some(_))` "setzen", `None` "unveraendert".
///
/// `null` ist der dokumentierte Weg zu leeren; ein leerer String kommt hier
/// genauso an. Das ist Nachsicht mit Absicht: `""` ist weder ein Datum noch ein
/// Kategoriename, und ein Modell, das es statt `null` schickt, meint dasselbe.
fn clearable(value: &Option<Option<String>>) -> Option<Option<String>> {
    value.as_ref().map(|inner| {
        inner
            .as_deref()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    })
}

// --- Parameter --------------------------------------------------------------

/// Filter fuer `list_todos`. Alle Felder sind optional; ohne Angabe kommt alles.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTodos {
    /// Nur Aufgaben in diesem Status: "todo", "in_progress" oder "done".
    pub status: Option<String>,
    /// Nur Aufgaben in dieser Kategorie, angesprochen ueber ihren Namen
    /// (Gross-/Kleinschreibung egal). "list_categories" nennt die vorhandenen.
    pub category: Option<String>,
    /// Nur Aufgaben, die vor diesem Tag faellig sind, ISO-Format YYYY-MM-DD.
    /// Der Tag selbst gehoert NICHT dazu, und eine Aufgabe ohne Faelligkeit
    /// kommt nie zurueck -- fuer "faellig bis einschliesslich Freitag" ist also
    /// der Samstag anzugeben.
    pub due_before: Option<String>,
}

/// Eine neue Aufgabe.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AddTodo {
    /// Titel der Aufgabe; darf nicht leer sein. Eine einzelne Zeile bis 500
    /// Zeichen -- Steuerzeichen, auch Zeilenumbrueche, werden abgelehnt.
    pub title: String,
    /// Prioritaet: "low", "medium" oder "high". Vorgabe ist "medium".
    pub priority: Option<String>,
    /// Faelligkeitstag, ISO-Format YYYY-MM-DD. Ohne Angabe hat die Aufgabe
    /// keine Faelligkeit.
    pub due_date: Option<String>,
    /// Name einer bereits bestehenden Kategorie (Gross-/Kleinschreibung egal).
    /// Ein unbekannter Name ist ein Fehler; ueber dieses Tool entsteht keine
    /// neue Kategorie. Ohne Angabe bleibt die Aufgabe ohne Kategorie.
    pub category: Option<String>,
}

/// Eine Aenderung an einer Aufgabe. Nur die angegebenen Felder aendern sich.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTodo {
    /// Id der Aufgabe, wie "list_todos" sie liefert.
    pub id: i64,
    /// Neuer Titel; darf nicht leer sein. Eine einzelne Zeile bis 500 Zeichen
    /// -- Steuerzeichen, auch Zeilenumbrueche, werden abgelehnt.
    pub title: Option<String>,
    /// Neuer Status: "todo", "in_progress" oder "done".
    pub status: Option<String>,
    /// Neue Prioritaet: "low", "medium" oder "high".
    pub priority: Option<String>,
    /// Neuer Faelligkeitstag, ISO-Format YYYY-MM-DD. null entfernt die
    /// Faelligkeit; das Feld wegzulassen laesst sie unveraendert. Das ist ein
    /// Unterschied: null loescht, weglassen aendert nichts.
    #[serde(default, deserialize_with = "double_option")]
    #[schemars(with = "Option<String>")]
    pub due_date: Option<Option<String>>,
    /// Name einer bereits bestehenden Kategorie (Gross-/Kleinschreibung egal).
    /// null nimmt die Aufgabe aus ihrer Kategorie heraus; das Feld wegzulassen
    /// laesst sie unveraendert. Das ist ein Unterschied: null loescht,
    /// weglassen aendert nichts. Ein unbekannter Name ist ein Fehler; ueber
    /// dieses Tool entsteht keine neue Kategorie.
    #[serde(default, deserialize_with = "double_option")]
    #[schemars(with = "Option<String>")]
    pub category: Option<Option<String>>,
}

/// Die zu loeschende Aufgabe.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteTodo {
    /// Id der Aufgabe, wie "list_todos" sie liefert.
    pub id: i64,
}

/// Die abzufragende Woche.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetWeekTime {
    /// Ein beliebiger Tag der Woche, ISO-Format YYYY-MM-DD. Der Montag ist
    /// nicht selbst auszurechnen: jeder Tag wird auf den Montag seiner Woche
    /// zurueckgerechnet, wobei der Sonntag noch zur Woche davor gehoert. Fuer
    /// "diese Woche" genuegt also das heutige Datum. Welcher Montag es geworden
    /// ist, steht im Ergebnis unter "monday".
    pub date: String,
}

/// Ein zu buchender Block Arbeitszeit.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct BookTime {
    /// Tag der Buchung, ISO-Format YYYY-MM-DD.
    pub date: String,
    /// Beginn als HH:MM auf einer vollen Viertelstunde, die Minute also genau
    /// 00, 15, 30 oder 45 -- z.B. "09:00" oder "09:15". Andere Minuten werden
    /// abgelehnt und nicht gerundet: "09:07" ist ein Fehler und bleibt einer,
    /// die Uhrzeit ist auf eine der vier Minuten zu legen. Der Beginn gehoert
    /// zur Buchung dazu.
    pub from: String,
    /// Ende als HH:MM auf einer vollen Viertelstunde, die Minute also genau 00,
    /// 15, 30 oder 45 -- dieselbe Regel wie beim Beginn, und ebenfalls ohne
    /// Rundung. Muss nach dem Beginn liegen. Das Ende gehoert NICHT mehr zur
    /// Buchung: 09:00 bis 10:00 sind vier Viertelstunden, also genau eine
    /// Stunde. "24:00" ist als Ende erlaubt und meint Mitternacht.
    pub to: String,
    /// Name einer bereits bestehenden Kategorie (Gross-/Kleinschreibung egal).
    /// Ein unbekannter Name ist ein Fehler; ueber dieses Tool entsteht keine
    /// neue Kategorie. "list_categories" nennt die vorhandenen.
    pub category: String,
    /// Notiz fuer den Block, hoechstens 2000 Zeichen und ohne Steuerzeichen.
    /// Ohne Angabe bleibt die Notiz leer.
    pub note: Option<String>,
}

// --- Die sieben Tools -------------------------------------------------------

// `vis`, weil `TodoServer::new` in `mod.rs` liegt und ein privates
// `tool_router()` dieses Untermoduls dort nicht sichtbar waere.
#[tool_router(vis = "pub(crate)")]
impl TodoServer {
    #[tool(
        description = "Listet die Aufgaben der TodoList-App, neueste zuerst, wahlweise nach Status, Kategorie und Faelligkeit gefiltert. Ohne Filter kommen alle Aufgaben. Jede Aufgabe enthaelt ihre Id, mit der \"update_todo\" und \"delete_todo\" arbeiten."
    )]
    async fn list_todos(
        &self,
        Parameters(params): Parameters<ListTodos>,
    ) -> Result<CallToolResult, McpError> {
        if let Err(message) = check_category(non_empty(&params.category)) {
            return Ok(tool_error(message));
        }
        let todos = store::list_todos(
            &self.pool,
            non_empty(&params.status),
            non_empty(&params.category),
            non_empty(&params.due_before),
        )
        .await;
        respond(todos.map(|todos| json!({ "count": todos.len(), "todos": todos })))
    }

    #[tool(
        description = "Legt eine neue Aufgabe an und gibt sie samt ihrer Id zurueck. Ohne weitere Angaben bekommt sie die Prioritaet \"medium\", den Status \"todo\", keine Faelligkeit und keine Kategorie."
    )]
    async fn add_todo(
        &self,
        Parameters(params): Parameters<AddTodo>,
    ) -> Result<CallToolResult, McpError> {
        let checked = check_text("Der Titel", params.title.trim(), MAX_TITLE_CHARS)
            .and_then(|()| check_category(non_empty(&params.category)));
        if let Err(message) = checked {
            return Ok(tool_error(message));
        }
        self.respond_write(
            store::add_todo(
                &self.pool,
                params.title.trim(),
                non_empty(&params.priority),
                non_empty(&params.due_date),
                non_empty(&params.category),
            )
            .await,
        )
    }

    #[tool(
        description = "Aendert eine bestehende Aufgabe und gibt sie danach zurueck. Es aendern sich ausschliesslich die angegebenen Felder; alles Weggelassene bleibt, wie es war. Um eine Aufgabe abzuhaken, ist der Status auf \"done\" zu setzen."
    )]
    async fn update_todo(
        &self,
        Parameters(params): Parameters<UpdateTodo>,
    ) -> Result<CallToolResult, McpError> {
        let checked = check_optional(
            "Der Titel",
            params.title.as_deref().map(str::trim),
            MAX_TITLE_CHARS,
        )
        .and_then(|()| check_category(clearable(&params.category).flatten().as_deref()));
        if let Err(message) = checked {
            return Ok(tool_error(message));
        }
        let update = TodoUpdate {
            title: params.title.as_deref().map(str::trim).map(str::to_string),
            status: non_empty(&params.status).map(str::to_string),
            priority: non_empty(&params.priority).map(str::to_string),
            due_date: clearable(&params.due_date),
            category: clearable(&params.category),
        };
        self.respond_write(store::update_todo(&self.pool, params.id, update).await)
    }

    #[tool(
        description = "Loescht eine Aufgabe endgueltig und gibt zurueck, was geloescht wurde. Nicht rueckgaengig zu machen -- zum Abhaken ist stattdessen \"update_todo\" mit dem Status \"done\" gedacht."
    )]
    async fn delete_todo(
        &self,
        Parameters(params): Parameters<DeleteTodo>,
    ) -> Result<CallToolResult, McpError> {
        self.respond_write(store::delete_todo(&self.pool, params.id).await)
    }

    #[tool(
        description = "Nennt alle Kategorien der App mit Name, Farbe und Id, sortiert wie in der Oberflaeche. Aufgaben und Zeitbuchungen sprechen ihre Kategorie ueber den Namen an, und nur ein hier genannter Name wird angenommen -- ueber MCP lassen sich keine Kategorien anlegen, umbenennen oder loeschen."
    )]
    async fn list_categories(&self) -> Result<CallToolResult, McpError> {
        let categories = store::list_categories(&self.pool).await;
        respond(categories.map(|categories| {
            json!({ "count": categories.len(), "categories": categories })
        }))
    }

    #[tool(
        description = "Liefert die Zeitbuchungen einer Woche: jede gebuchte Viertelstunde mit Tag, Uhrzeit und Kategorie, dazu die Summen je Kategorie und die Gesamtdauer. Angegeben wird irgendein Tag der Woche; er wird auf den Montag seiner Woche zurueckgerechnet, wobei der Sonntag noch zur Woche davor gehoert. Der so bestimmte Montag steht im Ergebnis."
    )]
    async fn get_week_time(
        &self,
        Parameters(params): Parameters<GetWeekTime>,
    ) -> Result<CallToolResult, McpError> {
        respond(store::week_time(&self.pool, params.date.trim()).await)
    }

    #[tool(
        description = "Bucht einen zusammenhaengenden Block Arbeitszeit auf eine bestehende Kategorie. Gebucht wird in Viertelstunden: Beginn und Ende muessen auf einer Viertelstunde liegen und werden nicht gerundet, und das Ende gehoert nicht mehr dazu -- 09:00 bis 10:00 ist genau eine Stunde. Bereits gebuchte Viertelstunden in diesem Zeitraum werden ersetzt, alles ausserhalb bleibt unangetastet."
    )]
    async fn book_time(
        &self,
        Parameters(params): Parameters<BookTime>,
    ) -> Result<CallToolResult, McpError> {
        let checked = check_text("Der Kategoriename", params.category.trim(), MAX_CATEGORY_CHARS)
            .and_then(|()| check_optional("Die Notiz", non_empty(&params.note), MAX_NOTE_CHARS));
        if let Err(message) = checked {
            return Ok(tool_error(message));
        }
        let from_slot = match parse_slot(params.from.trim()) {
            Ok(slot) => slot,
            Err(message) => return Ok(tool_error(message)),
        };
        let to_slot = match parse_slot(params.to.trim()) {
            Ok(slot) => slot,
            // "24:00" ist als Ende zulaessig, als Uhrzeit aber keine gueltige
            // Eingabe fuer `parse_slot` -- der Sonderfall gehoert hierher, nicht
            // in die Umrechnung.
            Err(_) if params.to.trim() == "24:00" => super::slots::SLOTS_PER_DAY,
            Err(message) => return Ok(tool_error(message)),
        };
        self.respond_write(
            store::book_time(
                &self.pool,
                params.date.trim(),
                from_slot,
                to_slot,
                params.category.trim(),
                non_empty(&params.note),
            )
            .await,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::super::TodoServer;
    use rmcp::handler::server::wrapper::Parameters;
    use rmcp::model::CallToolResult;
    use serde_json::Value;
    use sqlx::{Pool, Sqlite, SqlitePool};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Dasselbe Schema wie in `store.rs` -- das echte nach Migration 9.
    const SCHEMA: &[&str] = &[
        "CREATE TABLE categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            color TEXT NOT NULL DEFAULT '#a78bfa',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
        "CREATE TABLE todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            due_date TEXT DEFAULT NULL,
            category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'todo'
        );",
        "CREATE TABLE time_slots (
            date TEXT NOT NULL,
            slot INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (date, slot)
        );",
        "CREATE TABLE time_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            target_slots_per_day INTEGER NOT NULL DEFAULT 32,
            show_weekend INTEGER NOT NULL DEFAULT 0
        );",
        "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    ];

    async fn setup() -> Pool<Sqlite> {
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
        pool
    }

    /// Zaehlt, wie oft die Oberflaeche zum Nachladen aufgefordert wurde.
    #[derive(Default)]
    struct CountingNotifier(AtomicUsize);

    impl super::super::Notifier for CountingNotifier {
        fn data_changed(&self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    async fn server() -> (TodoServer, Pool<Sqlite>) {
        let (server, pool, _) = server_with_notifier().await;
        (server, pool)
    }

    /// Wie `server`, gibt den Zaehler aber mit heraus.
    async fn server_with_notifier() -> (TodoServer, Pool<Sqlite>, Arc<CountingNotifier>) {
        let pool = setup().await;
        let notifier = Arc::new(CountingNotifier::default());
        (
            TodoServer::new(pool.clone(), notifier.clone()),
            pool,
            notifier,
        )
    }

    /// Wie oft bisher gemeldet wurde.
    fn notified(notifier: &CountingNotifier) -> usize {
        notifier.0.load(Ordering::SeqCst)
    }

    async fn category(pool: &Pool<Sqlite>, name: &str) -> i64 {
        sqlx::query_scalar::<_, i64>(
            "INSERT INTO categories (name, color, created_at)
             VALUES (?, '#111111', '2026-01-01T00:00:00.000Z') RETURNING id",
        )
        .bind(name)
        .fetch_one(pool)
        .await
        .expect("insert category")
    }

    /// Der Text aller Textbloecke einer Antwort.
    fn text_of(result: &CallToolResult) -> String {
        result
            .content
            .iter()
            .filter_map(|block| block.as_text().map(|text| text.text.clone()))
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Erfolg: kein Fehler-Flag, und der Inhalt ist JSON.
    fn ok_json(result: &CallToolResult) -> Value {
        assert_ne!(
            result.is_error,
            Some(true),
            "should be a success, got: {}",
            text_of(result)
        );
        serde_json::from_str(&text_of(result)).expect("content should be JSON")
    }

    /// Tool-Fehler: `is_error`, und der Text benennt das Problem.
    fn tool_error(result: &CallToolResult, needle: &str) -> String {
        assert_eq!(
            result.is_error,
            Some(true),
            "should be a tool error, got: {}",
            text_of(result)
        );
        let message = text_of(result);
        assert!(
            message.contains(needle),
            "message should name the problem ({needle}), got: {message}"
        );
        message
    }

    // --- list_todos ---------------------------------------------------------

    #[tokio::test]
    async fn list_todos_returns_the_todos() {
        let (server, pool) = server().await;
        let id = category(&pool, "Kundenprojekt").await;
        sqlx::query(
            "INSERT INTO todos (title, created_at, category_id, due_date)
             VALUES ('Angebot schreiben', '2026-01-02T00:00:00.000Z', ?, '2026-03-01')",
        )
        .bind(id)
        .execute(&pool)
        .await
        .expect("insert todo");

        let result = server
            .list_todos(Parameters(super::ListTodos {
                status: None,
                category: None,
                due_before: None,
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["count"], 1);
        assert_eq!(json["todos"][0]["title"], "Angebot schreiben");
        assert_eq!(json["todos"][0]["category_name"], "Kundenprojekt");
    }

    #[tokio::test]
    async fn list_todos_reports_an_unknown_category_as_a_tool_error() {
        let (server, _pool) = server().await;
        let result = server
            .list_todos(Parameters(super::ListTodos {
                status: None,
                category: Some("Kundenprojekt".into()),
                due_before: None,
            }))
            .await
            .expect("an unknown category is not a protocol error");
        tool_error(&result, "Kundenprojekt");
    }

    // --- add_todo -----------------------------------------------------------

    #[tokio::test]
    async fn add_todo_creates_a_todo() {
        let (server, pool) = server().await;
        category(&pool, "Intern").await;
        let result = server
            .add_todo(Parameters(super::AddTodo {
                title: "Rechnung pruefen".into(),
                priority: Some("high".into()),
                due_date: Some("2026-04-01".into()),
                category: Some("intern".into()),
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["title"], "Rechnung pruefen");
        assert_eq!(json["priority"], "high");
        assert_eq!(json["status"], "todo");
        assert_eq!(json["due_date"], "2026-04-01");
        assert_eq!(json["category_name"], "Intern");
    }

    #[tokio::test]
    async fn add_todo_reports_an_unknown_category_as_a_tool_error() {
        let (server, pool) = server().await;
        category(&pool, "Intern").await;
        let result = server
            .add_todo(Parameters(super::AddTodo {
                title: "Rechnung pruefen".into(),
                priority: None,
                due_date: None,
                category: Some("Urlaub".into()),
            }))
            .await
            .expect("an unknown category is not a protocol error");
        tool_error(&result, "Urlaub");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM todos")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 0, "nothing should have been written");
    }

    // --- update_todo --------------------------------------------------------

    #[tokio::test]
    async fn update_todo_changes_only_the_given_fields() {
        let (server, pool) = server().await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at, priority, due_date)
             VALUES ('Alt', '2026-01-02T00:00:00.000Z', 'low', '2026-05-05') RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id,
                title: None,
                status: Some("done".into()),
                priority: None,
                due_date: None,
                category: None,
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["title"], "Alt", "title must be untouched");
        assert_eq!(json["priority"], "low", "priority must be untouched");
        assert_eq!(json["due_date"], "2026-05-05");
        assert_eq!(json["status"], "done");
        assert_eq!(json["done"], true);
    }

    #[tokio::test]
    async fn update_todo_clears_a_due_date_when_given_null() {
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
                title: None,
                status: None,
                priority: None,
                due_date: Some(None),
                category: None,
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert!(json["due_date"].is_null(), "due date should be cleared");
    }

    /// Die ganze Unterscheidung haengt daran, dass `null` und ein fehlendes
    /// Feld verschieden ankommen -- serde faltet beides von sich aus auf `None`
    /// zusammen, und dann waere "Faelligkeit entfernen" nicht ausdrueckbar.
    #[test]
    fn null_and_a_missing_field_mean_different_things_on_the_wire() {
        let cleared: super::UpdateTodo =
            serde_json::from_str(r#"{"id":1,"due_date":null,"category":null}"#)
                .expect("null parses");
        assert_eq!(cleared.due_date, Some(None), "null must mean: clear it");
        assert_eq!(cleared.category, Some(None), "null must mean: clear it");

        let untouched: super::UpdateTodo =
            serde_json::from_str(r#"{"id":1,"status":"done"}"#).expect("missing fields parse");
        assert_eq!(
            untouched.due_date, None,
            "a missing field must mean: leave it alone"
        );
        assert_eq!(
            untouched.category, None,
            "a missing field must mean: leave it alone"
        );

        let set: super::UpdateTodo =
            serde_json::from_str(r#"{"id":1,"due_date":"2026-12-24"}"#).expect("a value parses");
        assert_eq!(set.due_date, Some(Some("2026-12-24".into())));
    }

    #[tokio::test]
    async fn update_todo_reports_an_unknown_id_as_a_tool_error() {
        let (server, _pool) = server().await;
        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id: 404,
                title: Some("Neu".into()),
                status: None,
                priority: None,
                due_date: None,
                category: None,
            }))
            .await
            .expect("an unknown id is not a protocol error");
        tool_error(&result, "404");
    }

    // --- delete_todo --------------------------------------------------------

    #[tokio::test]
    async fn delete_todo_removes_the_todo() {
        let (server, pool) = server().await;
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO todos (title, created_at) VALUES ('Weg damit', '2026-01-02T00:00:00.000Z')
             RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert todo");

        let result = server
            .delete_todo(Parameters(super::DeleteTodo { id }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["title"], "Weg damit");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM todos")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn delete_todo_reports_an_unknown_id_as_a_tool_error() {
        let (server, _pool) = server().await;
        let result = server
            .delete_todo(Parameters(super::DeleteTodo { id: 7 }))
            .await
            .expect("an unknown id is not a protocol error");
        tool_error(&result, "7");
    }

    // --- list_categories ----------------------------------------------------

    #[tokio::test]
    async fn list_categories_returns_them_sorted() {
        let (server, pool) = server().await;
        category(&pool, "Ärzte").await;
        category(&pool, "Backoffice").await;
        category(&pool, "Admin").await;

        let result = server.list_categories().await.expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["count"], 3);
        assert_eq!(json["categories"][0]["name"], "Admin");
        assert_eq!(json["categories"][1]["name"], "Ärzte");
        assert_eq!(json["categories"][2]["name"], "Backoffice");
    }

    /// `list_categories` nimmt keine Parameter, also kann der Aufrufer nichts
    /// falsch machen -- der einzige Fehler ist die Datenbank. Der muss die
    /// andere Haelfte der Abbildung nehmen: `Err`, nicht `is_error`.
    #[tokio::test]
    async fn a_broken_database_is_a_protocol_error_not_a_tool_error() {
        let (server, pool) = server().await;
        sqlx::query("DROP TABLE categories")
            .execute(&pool)
            .await
            .expect("drop table");
        let result = server.list_categories().await;
        assert!(
            result.is_err(),
            "a database failure the caller cannot act on must be a protocol error"
        );
    }

    // --- get_week_time ------------------------------------------------------

    #[tokio::test]
    async fn get_week_time_normalises_to_the_monday_and_sums_the_week() {
        let (server, pool) = server().await;
        let id = category(&pool, "Kundenprojekt").await;
        for slot in 36..40 {
            sqlx::query("INSERT INTO time_slots (date, slot, category_id, note) VALUES (?, ?, ?, '')")
                .bind("2026-09-02")
                .bind(slot)
                .bind(id)
                .execute(&pool)
                .await
                .expect("insert slot");
        }

        // Sonntag, 2026-09-06 -- gehoert zur Woche ab Montag, 2026-08-31.
        let result = server
            .get_week_time(Parameters(super::GetWeekTime {
                date: "2026-09-06".into(),
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["monday"], "2026-08-31");
        assert_eq!(json["total_slots"], 4);
        assert_eq!(json["total_duration"], "1:00");
        assert_eq!(json["totals"][0]["category_name"], "Kundenprojekt");
        assert_eq!(json["slots"][0]["time"], "09:00");
    }

    #[tokio::test]
    async fn get_week_time_reports_a_malformed_date_as_a_tool_error() {
        let (server, _pool) = server().await;
        let result = server
            .get_week_time(Parameters(super::GetWeekTime {
                date: "naechste Woche".into(),
            }))
            .await
            .expect("a malformed date is not a protocol error");
        tool_error(&result, "YYYY-MM-DD");
    }

    // --- book_time ----------------------------------------------------------

    #[tokio::test]
    async fn book_time_books_a_run_of_quarter_hours() {
        let (server, pool) = server().await;
        category(&pool, "Kundenprojekt").await;
        let result = server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-02".into(),
                from: "09:00".into(),
                to: "10:00".into(),
                category: "kundenprojekt".into(),
                note: Some("Angebot".into()),
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["slot_count"], 4);
        assert_eq!(json["duration"], "1:00");
        assert_eq!(json["from"], "09:00");
        assert_eq!(json["to"], "10:00");
        assert_eq!(json["category_name"], "Kundenprojekt");

        let slots: Vec<(i64, String)> =
            sqlx::query_as("SELECT slot, note FROM time_slots WHERE date = ? ORDER BY slot")
                .bind("2026-09-02")
                .fetch_all(&pool)
                .await
                .expect("read slots");
        assert_eq!(slots.len(), 4);
        assert_eq!(slots.first().map(|s| s.0), Some(36));
        assert!(slots.iter().all(|s| s.1 == "Angebot"));
    }

    #[tokio::test]
    async fn book_time_reports_a_time_off_the_quarter_hour_as_a_tool_error() {
        let (server, pool) = server().await;
        category(&pool, "Kundenprojekt").await;
        let result = server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-02".into(),
                from: "09:07".into(),
                to: "10:00".into(),
                category: "Kundenprojekt".into(),
                note: None,
            }))
            .await
            .expect("a malformed time is not a protocol error");
        tool_error(&result, "Viertelstunde");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM time_slots")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 0, "nothing should have been written");
    }

    // --- Die Meldung an die Oberflaeche --------------------------------------

    #[tokio::test]
    async fn a_write_tells_the_ui_to_reload() {
        let (server, _pool, notifier) = server_with_notifier().await;
        server
            .add_todo(Parameters(super::AddTodo {
                title: "Rechnung pruefen".into(),
                priority: None,
                due_date: None,
                category: None,
            }))
            .await
            .expect("no protocol error");
        assert_eq!(notified(&notifier), 1);

        server
            .update_todo(Parameters(super::UpdateTodo {
                id: 1,
                title: Some("Rechnung bezahlen".into()),
                status: None,
                priority: None,
                due_date: None,
                category: None,
            }))
            .await
            .expect("no protocol error");
        assert_eq!(notified(&notifier), 2);

        server
            .delete_todo(Parameters(super::DeleteTodo { id: 1 }))
            .await
            .expect("no protocol error");
        assert_eq!(notified(&notifier), 3);
    }

    #[tokio::test]
    async fn book_time_tells_the_ui_to_reload() {
        let (server, pool, notifier) = server_with_notifier().await;
        category(&pool, "Intern").await;
        server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-02".into(),
                from: "09:00".into(),
                to: "10:00".into(),
                category: "Intern".into(),
                note: None,
            }))
            .await
            .expect("no protocol error");
        assert_eq!(notified(&notifier), 1);
    }

    #[tokio::test]
    async fn a_read_tells_the_ui_nothing() {
        let (server, _pool, notifier) = server_with_notifier().await;
        server
            .list_todos(Parameters(super::ListTodos {
                status: None,
                category: None,
                due_before: None,
            }))
            .await
            .expect("no protocol error");
        server
            .list_categories()
            .await
            .expect("no protocol error");
        server
            .get_week_time(Parameters(super::GetWeekTime {
                date: "2026-09-02".into(),
            }))
            .await
            .expect("no protocol error");
        assert_eq!(notified(&notifier), 0);
    }

    /// Ein Nachladen, dem kein Schreiben vorausging, waere eine Falschaussage
    /// ueber den Zustand -- die Oberflaeche wuerde sich neu laden, obwohl sich
    /// nichts geaendert hat.
    #[tokio::test]
    async fn a_failed_write_tells_the_ui_nothing() {
        let (server, _pool, notifier) = server_with_notifier().await;

        // Kategorie gibt es nicht: Tool-Fehler, nichts geschrieben.
        server
            .add_todo(Parameters(super::AddTodo {
                title: "Rechnung pruefen".into(),
                priority: None,
                due_date: None,
                category: Some("Kundenprojekt".into()),
            }))
            .await
            .expect("an unknown category is not a protocol error");

        // Id gibt es nicht.
        server
            .update_todo(Parameters(super::UpdateTodo {
                id: 404,
                title: Some("egal".into()),
                status: None,
                priority: None,
                due_date: None,
                category: None,
            }))
            .await
            .expect("an unknown id is not a protocol error");

        server
            .delete_todo(Parameters(super::DeleteTodo { id: 404 }))
            .await
            .expect("an unknown id is not a protocol error");

        // Ende vor Beginn: die Pruefung greift, bevor der Store ueberhaupt
        // gerufen wird.
        server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-02".into(),
                from: "10:00".into(),
                to: "09:00".into(),
                category: "Intern".into(),
                note: None,
            }))
            .await
            .expect("an empty range is not a protocol error");

        // Auch eine unbrauchbare Uhrzeit, die schon in `book_time` selbst
        // abgefangen wird und den Store nie erreicht.
        server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-02".into(),
                from: "neun".into(),
                to: "10:00".into(),
                category: "Intern".into(),
                note: None,
            }))
            .await
            .expect("a malformed time is not a protocol error");

        assert_eq!(notified(&notifier), 0);
    }

    // --- Robustheit ---------------------------------------------------------

    /// Ein Panic in einem Tool erzeugt gar keine Antwort: der Client wartet in
    /// sein eigenes Timeout und sieht einen toten Server. Also darf feindliche
    /// Eingabe hoechstens einen Fehler erzeugen -- nie einen Panic.
    #[tokio::test]
    async fn hostile_input_never_panics() {
        let (server, _pool) = server().await;

        let empty_title = server
            .add_todo(Parameters(super::AddTodo {
                title: "   ".into(),
                priority: None,
                due_date: None,
                category: None,
            }))
            .await
            .expect("no protocol error");
        tool_error(&empty_title, "Titel");

        let negative_id = server
            .delete_todo(Parameters(super::DeleteTodo { id: -1 }))
            .await
            .expect("no protocol error");
        tool_error(&negative_id, "-1");

        let huge_id = server
            .update_todo(Parameters(super::UpdateTodo {
                id: i64::MIN,
                title: Some("x".into()),
                status: None,
                priority: None,
                due_date: None,
                category: None,
            }))
            .await
            .expect("no protocol error");
        assert_eq!(huge_id.is_error, Some(true));

        let bad_due = server
            .list_todos(Parameters(super::ListTodos {
                status: None,
                category: None,
                due_before: Some("irgendwann".into()),
            }))
            .await
            .expect("no protocol error");
        tool_error(&bad_due, "YYYY-MM-DD");

        let backwards = server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-02".into(),
                from: "12:00".into(),
                to: "09:00".into(),
                category: "Egal".into(),
                note: None,
            }))
            .await
            .expect("no protocol error");
        assert_eq!(backwards.is_error, Some(true));

        let empty_time = server
            .book_time(Parameters(super::BookTime {
                date: String::new(),
                from: String::new(),
                to: String::new(),
                category: String::new(),
                note: None,
            }))
            .await
            .expect("no protocol error");
        assert_eq!(empty_time.is_error, Some(true));
    }

    // --- Der Router ---------------------------------------------------------

    #[test]
    fn the_router_lists_all_seven_tools_with_documented_parameters() {
        let tools = TodoServer::tool_router().list_all();
        let names: Vec<&str> = tools.iter().map(|tool| tool.name.as_ref()).collect();
        assert_eq!(
            names,
            [
                "add_todo",
                "book_time",
                "delete_todo",
                "get_week_time",
                "list_categories",
                "list_todos",
                "update_todo",
            ]
        );
        for tool in &tools {
            assert!(
                tool.description.as_ref().is_some_and(|d| !d.is_empty()),
                "{} needs a description",
                tool.name
            );
            // Die Doc-Kommentare der Felder sind die Doku, die das Modell liest.
            if let Some(properties) = tool.input_schema.get("properties") {
                let properties = properties.as_object().expect("properties is an object");
                for (field, schema) in properties {
                    assert!(
                        schema.get("description").is_some(),
                        "{}.{field} needs a description in the schema",
                        tool.name
                    );
                }
            }
        }
    }

    // --- Getrimmte Eingaben -------------------------------------------------

    /// Ein Datum mit Leerraum drumherum wurde bisher angenommen, eine Uhrzeit
    /// nicht. Beides geht denselben Weg, also gilt dieselbe Regel.
    #[tokio::test]
    async fn book_time_trims_its_string_fields() {
        let (server, pool) = server().await;
        category(&pool, "Kundenprojekt").await;

        let result = server
            .book_time(Parameters(super::BookTime {
                date: " 2026-09-07 ".to_string(),
                from: " 09:00 ".to_string(),
                to: " 10:00 ".to_string(),
                category: " Kundenprojekt ".to_string(),
                note: None,
            }))
            .await
            .expect("no protocol error");
        let json = ok_json(&result);
        assert_eq!(json["from"], "09:00");
        assert_eq!(json["to"], "10:00");
        assert_eq!(json["slot_count"], 4);
    }

    #[tokio::test]
    async fn book_time_still_refuses_a_time_that_is_not_a_quarter_hour() {
        let (server, pool) = server().await;
        category(&pool, "Kundenprojekt").await;

        let result = server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-07".to_string(),
                from: " 09:07 ".to_string(),
                to: "10:00".to_string(),
                category: "Kundenprojekt".to_string(),
                note: None,
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "Viertelstunde");
    }

    #[tokio::test]
    async fn get_week_time_trims_its_date() {
        let (server, _pool) = server().await;
        let result = server
            .get_week_time(Parameters(super::GetWeekTime {
                date: " 2026-09-07 ".to_string(),
            }))
            .await
            .expect("no protocol error");
        assert_eq!(ok_json(&result)["monday"], "2026-09-07");
    }

    // --- Grenzen fuer freien Text -------------------------------------------

    /// Ein Titel aus `count` Zeichen.
    fn long(count: usize) -> String {
        "a".repeat(count)
    }

    fn add_todo_params(title: &str) -> super::AddTodo {
        super::AddTodo {
            title: title.to_string(),
            priority: None,
            due_date: None,
            category: None,
        }
    }

    #[tokio::test]
    async fn add_todo_refuses_a_title_over_the_limit_and_names_it() {
        let (server, pool) = server().await;
        let result = server
            .add_todo(Parameters(add_todo_params(&long(super::MAX_TITLE_CHARS + 1))))
            .await
            .expect("no protocol error");
        let message = tool_error(&result, "Titel");
        assert!(
            message.contains(&super::MAX_TITLE_CHARS.to_string()),
            "the message should name the limit, got: {message}"
        );

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM todos")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 0, "nothing should have been written");
    }

    #[tokio::test]
    async fn add_todo_accepts_a_title_right_at_the_limit() {
        let (server, _pool) = server().await;
        let title = long(super::MAX_TITLE_CHARS);
        let result = server
            .add_todo(Parameters(add_todo_params(&title)))
            .await
            .expect("no protocol error");
        assert_eq!(ok_json(&result)["title"], title);
    }

    /// Die Grenze zaehlt Zeichen, nicht Bytes -- sonst haette ein deutscher
    /// Titel nur die halbe Laenge zur Verfuegung.
    #[tokio::test]
    async fn the_title_limit_counts_characters_not_bytes() {
        let (server, _pool) = server().await;
        let title = "\u{e4}".repeat(super::MAX_TITLE_CHARS);
        assert!(title.len() > super::MAX_TITLE_CHARS, "the byte length is larger");
        let result = server
            .add_todo(Parameters(add_todo_params(&title)))
            .await
            .expect("no protocol error");
        assert_eq!(ok_json(&result)["title"], title);
    }

    #[tokio::test]
    async fn add_todo_refuses_control_characters_in_the_title() {
        let (server, _pool) = server().await;
        // Ein Nullbyte wird gespeichert und als Leerzeichen gerendert, ein
        // Zeilenumbruch ueberlebt die Speicherung ebenso. Beides wird
        // abgelehnt statt entfernt: eine stillschweigend veraenderte Eingabe
        // ist schlimmer als eine Absage, dieselbe Regel wie bei "09:07".
        for bad in ["Titel\u{0}mit Null", "Zeile eins\nZeile zwei", "Tab\there"] {
            let result = server
                .add_todo(Parameters(add_todo_params(bad)))
                .await
                .expect("no protocol error");
            tool_error(&result, "Steuerzeichen");
        }
    }

    #[tokio::test]
    async fn update_todo_refuses_an_over_long_title() {
        let (server, pool) = server().await;
        sqlx::query("INSERT INTO todos (title, created_at) VALUES ('Alt', '2026-01-01T00:00:00.000Z')")
            .execute(&pool)
            .await
            .expect("insert todo");

        let result = server
            .update_todo(Parameters(super::UpdateTodo {
                id: 1,
                title: Some(long(super::MAX_TITLE_CHARS + 1)),
                status: None,
                priority: None,
                due_date: None,
                category: None,
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "Titel");

        let title: String = sqlx::query_scalar("SELECT title FROM todos WHERE id = 1")
            .fetch_one(&pool)
            .await
            .expect("title");
        assert_eq!(title, "Alt", "nothing should have been written");
    }

    #[tokio::test]
    async fn book_time_refuses_an_over_long_note() {
        let (server, pool) = server().await;
        category(&pool, "Kundenprojekt").await;
        let result = server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-07".to_string(),
                from: "09:00".to_string(),
                to: "10:00".to_string(),
                category: "Kundenprojekt".to_string(),
                note: Some(long(super::MAX_NOTE_CHARS + 1)),
            }))
            .await
            .expect("no protocol error");
        let message = tool_error(&result, "Notiz");
        assert!(
            message.contains(&super::MAX_NOTE_CHARS.to_string()),
            "the message should name the limit, got: {message}"
        );

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM time_slots")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 0, "nothing should have been written");
    }

    #[tokio::test]
    async fn book_time_accepts_a_note_right_at_the_limit() {
        let (server, pool) = server().await;
        category(&pool, "Kundenprojekt").await;
        let result = server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-07".to_string(),
                from: "09:00".to_string(),
                to: "09:15".to_string(),
                category: "Kundenprojekt".to_string(),
                note: Some(long(super::MAX_NOTE_CHARS)),
            }))
            .await
            .expect("no protocol error");
        ok_json(&result);
    }

    #[tokio::test]
    async fn book_time_refuses_control_characters_in_the_note() {
        let (server, pool) = server().await;
        category(&pool, "Kundenprojekt").await;
        let result = server
            .book_time(Parameters(super::BookTime {
                date: "2026-09-07".to_string(),
                from: "09:00".to_string(),
                to: "09:15".to_string(),
                category: "Kundenprojekt".to_string(),
                note: Some("Notiz\u{0}mit Null".to_string()),
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "Steuerzeichen");
    }

    #[tokio::test]
    async fn a_category_name_beyond_the_limit_is_refused_before_it_is_echoed_back() {
        let (server, _pool) = server().await;
        // Ohne Grenze wandert der ganze Name in die Absage ("Es gibt keine
        // Kategorie \"...\"") und blaeht die Antwort auf die Groesse der
        // Anfrage auf.
        let result = server
            .list_todos(Parameters(super::ListTodos {
                status: None,
                category: Some(long(super::MAX_CATEGORY_CHARS + 1)),
                due_before: None,
            }))
            .await
            .expect("no protocol error");
        let message = tool_error(&result, "Kategoriename");
        assert!(
            message.len() < super::MAX_CATEGORY_CHARS * 2,
            "the message must not repeat the whole name, got {} bytes",
            message.len()
        );
    }

    #[tokio::test]
    async fn a_category_name_with_control_characters_is_refused() {
        let (server, pool) = server().await;
        category(&pool, "Kundenprojekt").await;
        let result = server
            .add_todo(Parameters(super::AddTodo {
                title: "Angebot".to_string(),
                priority: None,
                due_date: None,
                category: Some("Kunden\u{0}projekt".to_string()),
            }))
            .await
            .expect("no protocol error");
        tool_error(&result, "Steuerzeichen");
    }
}
