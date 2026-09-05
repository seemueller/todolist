//! Jede Abfrage, die die MCP-Tools brauchen -- und die einzige Datei mit SQL.
//!
//! Die Tools in `tools.rs` bleiben dadurch eine duenne Schicht aus Parameter-
//! pruefung und Formatierung, und alles hier ist gegen einen Pool testbar, ohne
//! ueberhaupt durch MCP zu gehen.
//!
//! Drei Dinge gelten in dieser Datei durchgehend:
//!
//! * **Kategorien werden ueber den Namen angesprochen, nie ueber die Id.** Ein
//!   Sprachmodell kennt "Kundenprojekt", nicht `category_id = 4`. Aufgeloest
//!   wird mit derselben Regel wie im Frontend (`categoryNameKey` in
//!   `src/types.ts`): trimmen, kleinschreiben. Ein unbekannter Name ist ein
//!   Fehler; eine Kategorie entsteht hier niemals nebenbei.
//! * **Kein Panic.** Diese Funktionen laufen in Tool-Ruempfen, und ein Panic
//!   dort erzeugt gar keine Antwort: der Client wartet in sein eigenes Timeout
//!   und sieht einen toten Server statt eines Fehlers. Also kein `unwrap`, kein
//!   `expect`, keine Indizierung und keine verlustbehaftete Umwandlung.
//! * **Platzhalter sind `?`.** Das hier ist sqlx direkt, wie
//!   `replace_time_day_tx` in `lib.rs`, nicht die JS-Plugin-Schicht mit `$N`.

// Wird erst von den Tools in Task 3 benutzt.
#![allow(dead_code)]

use std::cmp::Ordering;

use serde::Serialize;
use sqlx::{Pool, Sqlite};

use super::slots::{SLOT_MINUTES, SLOTS_PER_DAY, slot_label};

/// Die beiden Fehlerarten, die Task 3 unterschiedlich beantwortet.
///
/// `Request` wird zu `Ok(CallToolResult::error(...))`: der Aufrufer liest den
/// Text und kann etwas damit anfangen. `Db` wird zu `Err(McpError::…)` und
/// kommt beim Aufrufer nur als undurchsichtiger interner Fehler an. Stuende die
/// Unterscheidung nicht im Typ, koennte Task 3 sie nicht treffen.
#[derive(Debug)]
pub enum StoreError {
    /// Der Aufrufer hat nach etwas gefragt, das es nicht gibt oder das so nicht
    /// geht. Der Text ist fuer einen Leser geschrieben und wird ausgeliefert.
    Request(String),
    /// Die Datenbank hat versagt. Nichts davon geht nach draussen.
    Db(sqlx::Error),
}

impl From<sqlx::Error> for StoreError {
    fn from(error: sqlx::Error) -> Self {
        StoreError::Db(error)
    }
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Request(message) => f.write_str(message),
            StoreError::Db(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for StoreError {}

/// Kuerzt `Err(StoreError::Request(...))`.
fn bad_request<T>(message: impl Into<String>) -> Result<T, StoreError> {
    Err(StoreError::Request(message.into()))
}

// --- Zeilen und Rueckgabetypen ---------------------------------------------

/// Eine Aufgabe samt der Kategorie, an der sie haengt.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Todo {
    pub id: i64,
    pub title: String,
    pub done: bool,
    pub status: String,
    pub priority: String,
    pub created_at: String,
    pub due_date: Option<String>,
    pub category_id: Option<i64>,
    pub category_name: Option<String>,
    pub category_color: Option<String>,
}

#[derive(sqlx::FromRow)]
struct TodoRow {
    id: i64,
    title: String,
    done: i64,
    status: String,
    priority: String,
    created_at: String,
    due_date: Option<String>,
    category_id: Option<i64>,
    category_name: Option<String>,
    category_color: Option<String>,
}

impl From<TodoRow> for Todo {
    fn from(row: TodoRow) -> Self {
        Todo {
            // `done` und `status` werden beim Schreiben zusammen gesetzt; bei
            // Altbestand aus der Zeit vor Migration 6 gewinnt der Status, genau
            // wie `fromRow` in src/types.ts es aufloest.
            done: row.status == STATUS_DONE || (row.status.is_empty() && row.done == 1),
            id: row.id,
            title: row.title,
            status: row.status,
            priority: row.priority,
            created_at: row.created_at,
            due_date: row.due_date,
            category_id: row.category_id,
            category_name: row.category_name,
            category_color: row.category_color,
        }
    }
}

/// Eine Kategorie, so wie `list_categories` sie liefert.
#[derive(Debug, Clone, PartialEq, Serialize, sqlx::FromRow)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

/// Was an einer Aufgabe geaendert werden soll.
///
/// Zwei Ebenen `Option`, und beide tragen Bedeutung: das aeussere `None` heisst
/// "nicht angegeben, bitte unveraendert lassen", das innere `None` bei
/// `due_date` und `category` heisst "ausdruecklich leeren".
#[derive(Debug, Default, Clone)]
pub struct TodoUpdate {
    pub title: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<Option<String>>,
    pub category: Option<Option<String>>,
}

impl TodoUpdate {
    fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.status.is_none()
            && self.priority.is_none()
            && self.due_date.is_none()
            && self.category.is_none()
    }
}

/// Eine gebuchte Viertelstunde der Woche.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WeekSlot {
    pub date: String,
    pub slot: i64,
    /// Beginn der Viertelstunde als `HH:MM`, damit das Modell nicht rechnen muss.
    pub time: String,
    pub category_id: i64,
    /// `None`, wenn die Kategorie geloescht wurde -- die Buchung ueberlebt sie,
    /// die Wochenansicht beschriftet sie mit "Geloeschte Kategorie".
    pub category_name: Option<String>,
    pub note: String,
}

/// Summe je Kategorie ueber die Woche.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CategoryTotal {
    pub category_id: i64,
    pub category_name: Option<String>,
    pub slot_count: i64,
    /// `formatDuration` aus src/timeSlots.ts, also "1:00" fuer vier Slots.
    pub duration: String,
}

/// Eine Woche Zeiterfassung.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WeekTime {
    /// Der Montag der Woche -- immer der normalisierte, nicht der angefragte Tag.
    pub monday: String,
    pub slots: Vec<WeekSlot>,
    pub totals: Vec<CategoryTotal>,
    pub total_slots: i64,
    pub total_duration: String,
}

/// Was `book_time` geschrieben hat.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Booking {
    pub date: String,
    pub from: String,
    /// Ende ausschliesslich, wie im Frontend: 09:00-10:00 sind vier Slots.
    pub to: String,
    pub slot_count: i64,
    pub duration: String,
    pub category_id: i64,
    pub category_name: String,
    pub note: String,
}

// --- Pruefungen -------------------------------------------------------------

const STATUS_DONE: &str = "done";
const STATUSES: [&str; 3] = ["todo", "in_progress", STATUS_DONE];
const PRIORITIES: [&str; 3] = ["low", "medium", "high"];

fn check_status(status: &str) -> Result<(), StoreError> {
    if STATUSES.contains(&status) {
        return Ok(());
    }
    bad_request(format!(
        "\"{status}\" ist kein Status; erlaubt sind {}.",
        STATUSES.join(", ")
    ))
}

fn check_priority(priority: &str) -> Result<(), StoreError> {
    if PRIORITIES.contains(&priority) {
        return Ok(());
    }
    bad_request(format!(
        "\"{priority}\" ist keine Prioritaet; erlaubt sind {}.",
        PRIORITIES.join(", ")
    ))
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => 0,
    }
}

/// Prueft ein Datum als `YYYY-MM-DD` und gibt es getrimmt zurueck.
///
/// Bewusst in Rust und nicht SQLite ueberlassen: `date('2026-02-30')` liefert
/// dort klaglos den 2. Maerz zurueck, und eine stillschweigend verschobene
/// Buchung ist schlimmer als eine Absage.
fn check_date(date: &str) -> Result<String, StoreError> {
    let trimmed = date.trim();
    let malformed =
        || StoreError::Request(format!("\"{date}\" ist kein Datum im Format YYYY-MM-DD."));
    let parts: Vec<&str> = trimmed.split('-').collect();
    let [year, month, day] = parts.as_slice() else {
        return Err(malformed());
    };
    if year.len() != 4 || month.len() != 2 || day.len() != 2 {
        return Err(malformed());
    }
    if !trimmed.bytes().all(|b| b.is_ascii_digit() || b == b'-') {
        return Err(malformed());
    }
    let (Ok(year), Ok(month), Ok(day)) = (
        year.parse::<i64>(),
        month.parse::<i64>(),
        day.parse::<i64>(),
    ) else {
        return Err(malformed());
    };
    if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
        return bad_request(format!("Den Tag \"{date}\" gibt es nicht."));
    }
    Ok(trimmed.to_string())
}

/// "1:30" fuer sechs Viertelstunden; `formatDuration` aus src/timeSlots.ts.
fn format_duration(slot_count: i64) -> String {
    let minutes = slot_count.saturating_mul(SLOT_MINUTES);
    format!("{}:{:02}", minutes / 60, minutes % 60)
}

fn count_to_i64(count: usize) -> i64 {
    i64::try_from(count).unwrap_or(i64::MAX)
}

// --- Kategorien -------------------------------------------------------------

/// Normalisiert einen Kategorienamen auf den Schluessel, der ueber Gleichheit
/// entscheidet; `categoryNameKey` in src/types.ts.
///
/// `to_lowercase` ist Unicode-korrekt und deckt sich fuer Deutsch mit
/// `toLocaleLowerCase("de")`. Das ist der Grund, warum hier ueberhaupt in Rust
/// verglichen wird statt per `WHERE name = ?`: SQLites `NOCASE` faltet nur
/// ASCII, "ärzte" wuerde "Ärzte" also nicht finden.
fn category_name_key(name: &str) -> String {
    name.trim().to_lowercase()
}

/// Primaerschluessel der Sortierung: Umlaute und ß auf ihre Grundbuchstaben,
/// wie es die deutsche Sortierung (DIN 5007-1, und so auch die CLDR-Kollation
/// "de") auf der ersten Stufe tut.
fn category_sort_key(name: &str) -> String {
    let mut key = String::new();
    for ch in category_name_key(name).chars() {
        match ch {
            'ä' => key.push('a'),
            'ö' => key.push('o'),
            'ü' => key.push('u'),
            'ß' => key.push_str("ss"),
            other => key.push(other),
        }
    }
    key
}

/// Gross-/Kleinschreibung als eigene, nachrangige Stufe: klein vor gross, so
/// wie `localeCompare(…, "de")` es auf der tertiaeren Stufe gewichtet.
fn category_case_ranks(name: &str) -> Vec<u8> {
    name.trim()
        .chars()
        .map(|ch| u8::from(ch.is_uppercase()))
        .collect()
}

/// Sortiert Kategorienamen wie `compareCategoryNames` in src/types.ts.
///
/// Das Frontend vergleicht in drei Stufen: erst die kleingeschriebenen
/// Schluessel mit `localeCompare(…, "de")`, dann die Rohnamen -- damit WebKit
/// und Chromium sich einig sind, obwohl sie Gross-/Kleinschreibung
/// unterschiedlich gewichten. Hier wird dieselbe Staffelung nachgebaut: erst
/// der umlautgefaltete Schluessel, dann der reine Kleinbuchstaben-Schluessel,
/// dann die Gross-/Kleinschreibung, zuletzt der Rohname als letzter Halt.
///
/// **Nicht exakt dieselbe Ordnung.** Rust hat ohne zusaetzliche Abhaengigkeit
/// keine ICU-Kollation, hier wird darum nach Codepoint verglichen. Das deckt
/// sich mit ICU fuer Buchstaben samt Umlauten und ß, fuer Ziffern und fuer
/// Akzente (é, ø, å) -- und ueberall dort, wo ein Name mit einem Buchstaben
/// beginnt.
///
/// Es weicht in genau einem Fall ab: wenn ein Name mit einem der Zeichen
/// `@ [ \ ] ^ _ ` { | } ~` beginnt und mit einem verglichen wird, der mit einer
/// Ziffer oder einem der niedrigeren Satzzeichen (`! # ( . + -`) beginnt. ICU
/// stellt Satzzeichen geschlossen vor die Ziffern, der Codepoint zerschneidet
/// sie an der Ziffernreihe. `"_intern"` vs. `"2fa"` ist der Fall; `"#tag"` vs.
/// `"2fa"` stimmt dagegen ueberein. Der Test weiter unten haelt beides fest.
pub fn compare_category_names(a: &str, b: &str) -> Ordering {
    category_sort_key(a)
        .cmp(&category_sort_key(b))
        .then_with(|| category_name_key(a).cmp(&category_name_key(b)))
        .then_with(|| category_case_ranks(a).cmp(&category_case_ranks(b)))
        .then_with(|| a.cmp(b))
}

/// Alle Kategorien, sortiert wie in der App.
pub async fn list_categories(pool: &Pool<Sqlite>) -> Result<Vec<Category>, StoreError> {
    // Sortiert in Rust, nicht in SQL: SQLite kann `compareCategoryNames` nicht
    // ausdruecken, und es sind ohnehin nur eine Handvoll Zeilen. Dieselbe
    // Begruendung steht in `listCategories` in src/todoStoreSql.ts.
    let mut categories: Vec<Category> =
        sqlx::query_as("SELECT id, name, color, created_at FROM categories")
            .fetch_all(pool)
            .await?;
    categories.sort_by(|a, b| compare_category_names(&a.name, &b.name));
    Ok(categories)
}

/// Sucht die Kategorie zu einem Namen. Ein unbekannter Name ist ein Fehler --
/// eine Kategorie wird hier nie stillschweigend angelegt.
pub async fn resolve_category(pool: &Pool<Sqlite>, name: &str) -> Result<Category, StoreError> {
    let key = category_name_key(name);
    let categories = list_categories(pool).await?;
    if let Some(found) = categories
        .iter()
        .find(|c| category_name_key(&c.name) == key)
    {
        return Ok(found.clone());
    }
    // Die vorhandenen Namen mitzuschicken macht aus einer Absage einen
    // brauchbaren naechsten Zug: das Modell sieht sofort, was es haette
    // schreiben muessen.
    let known: Vec<&str> = categories.iter().map(|c| c.name.as_str()).collect();
    let hint = if known.is_empty() {
        "Es ist bisher keine Kategorie angelegt.".to_string()
    } else {
        format!("Vorhanden sind: {}.", known.join(", "))
    };
    bad_request(format!(
        "Es gibt keine Kategorie \"{}\". {hint}",
        name.trim()
    ))
}

// --- Aufgaben ---------------------------------------------------------------

const TODO_COLUMNS: &str = "t.id, t.title, t.done, t.status, t.priority, t.created_at,
     t.due_date, t.category_id, c.name AS category_name, c.color AS category_color";

async fn select_todo(pool: &Pool<Sqlite>, id: i64) -> Result<Todo, StoreError> {
    let row: Option<TodoRow> = sqlx::query_as(&format!(
        "SELECT {TODO_COLUMNS}
         FROM todos t LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.id = ?"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;
    match row {
        Some(row) => Ok(row.into()),
        None => bad_request(format!("Es gibt keine Aufgabe mit der Id {id}.")),
    }
}

/// Aufgaben, wahlweise gefiltert.
///
/// `due_before` ist ausschliesslich: ein Todo, das genau an dem Tag faellig ist,
/// gehoert nicht dazu, und eines ganz ohne Faelligkeit ist vor keinem Datum
/// faellig.
pub async fn list_todos(
    pool: &Pool<Sqlite>,
    status: Option<&str>,
    category: Option<&str>,
    due_before: Option<&str>,
) -> Result<Vec<Todo>, StoreError> {
    if let Some(status) = status {
        check_status(status)?;
    }
    let due_before = due_before.map(check_date).transpose()?;
    let category_id = match category {
        Some(name) => Some(resolve_category(pool, name).await?.id),
        None => None,
    };

    let mut conditions: Vec<&str> = Vec::new();
    if status.is_some() {
        conditions.push("t.status = ?");
    }
    if category_id.is_some() {
        conditions.push("t.category_id = ?");
    }
    if due_before.is_some() {
        conditions.push("t.due_date IS NOT NULL AND t.due_date < ?");
    }
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // Dieselbe Ordnung wie `listTodos` in src/todoStoreSql.ts.
    let sql = format!(
        "SELECT {TODO_COLUMNS}
         FROM todos t LEFT JOIN categories c ON c.id = t.category_id
         {where_clause}
         ORDER BY t.created_at DESC, t.id DESC"
    );

    let mut query = sqlx::query_as::<_, TodoRow>(&sql);
    if let Some(status) = status {
        query = query.bind(status.to_string());
    }
    if let Some(category_id) = category_id {
        query = query.bind(category_id);
    }
    if let Some(due_before) = due_before {
        query = query.bind(due_before);
    }
    let rows = query.fetch_all(pool).await?;
    Ok(rows.into_iter().map(Todo::from).collect())
}

/// Legt eine Aufgabe an und gibt sie zurueck.
///
/// Ohne Angabe gelten dieselben Vorgaben wie im Frontend: Prioritaet "medium",
/// Status "todo", nicht erledigt, keine Faelligkeit, keine Kategorie.
pub async fn add_todo(
    pool: &Pool<Sqlite>,
    title: &str,
    priority: Option<&str>,
    due_date: Option<&str>,
    category: Option<&str>,
) -> Result<Todo, StoreError> {
    let title = title.trim();
    if title.is_empty() {
        return bad_request("Der Titel darf nicht leer sein.");
    }
    let priority = priority.unwrap_or("medium");
    check_priority(priority)?;
    let due_date = due_date.map(check_date).transpose()?;
    let category_id = match category {
        Some(name) => Some(resolve_category(pool, name).await?.id),
        None => None,
    };

    // `strftime` statt einer Zeit-Crate: dasselbe ISO-Format mit Millisekunden
    // und Z, das `new Date().toISOString()` im Frontend schreibt, und ohne neue
    // Abhaengigkeit.
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO todos (title, done, status, priority, created_at, due_date, category_id)
         VALUES (?, 0, 'todo', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?)
         RETURNING id",
    )
    .bind(title)
    .bind(priority)
    .bind(due_date)
    .bind(category_id)
    .fetch_one(pool)
    .await?;

    select_todo(pool, id).await
}

/// Aendert genau die Felder, die angegeben wurden, und gibt die Aufgabe zurueck.
pub async fn update_todo(
    pool: &Pool<Sqlite>,
    id: i64,
    update: TodoUpdate,
) -> Result<Todo, StoreError> {
    if update.is_empty() {
        return bad_request("Es wurde kein zu aenderndes Feld angegeben.");
    }
    let title = match &update.title {
        Some(title) if title.trim().is_empty() => {
            return bad_request("Der Titel darf nicht leer sein.");
        }
        Some(title) => Some(title.trim().to_string()),
        None => None,
    };
    if let Some(status) = &update.status {
        check_status(status)?;
    }
    if let Some(priority) = &update.priority {
        check_priority(priority)?;
    }
    let due_date = match &update.due_date {
        Some(Some(date)) => Some(Some(check_date(date)?)),
        Some(None) => Some(None),
        None => None,
    };
    // Erst alles pruefen, dann schreiben: eine unbekannte Kategorie darf den
    // Titel nicht schon geaendert haben.
    let category_id = match &update.category {
        Some(Some(name)) => Some(Some(resolve_category(pool, name).await?.id)),
        Some(None) => Some(None),
        None => None,
    };
    let existing = select_todo(pool, id).await?;

    let mut assignments: Vec<&str> = Vec::new();
    if title.is_some() {
        assignments.push("title = ?");
    }
    if update.status.is_some() {
        // `done` wird mitgefuehrt, genau wie `updateTodoStatus` in
        // src/todoStoreSql.ts es tut; sonst laufen Spalte und Status
        // auseinander und die Altbestands-Regel in `fromRow` schlaegt zu.
        assignments.push("status = ?");
        assignments.push("done = ?");
    }
    if update.priority.is_some() {
        assignments.push("priority = ?");
    }
    if due_date.is_some() {
        assignments.push("due_date = ?");
    }
    if category_id.is_some() {
        assignments.push("category_id = ?");
    }

    let sql = format!("UPDATE todos SET {} WHERE id = ?", assignments.join(", "));
    let mut query = sqlx::query(&sql);
    if let Some(title) = title {
        query = query.bind(title);
    }
    if let Some(status) = &update.status {
        let done = i64::from(status == STATUS_DONE);
        query = query.bind(status.clone()).bind(done);
    }
    if let Some(priority) = &update.priority {
        query = query.bind(priority.clone());
    }
    if let Some(due_date) = due_date {
        query = query.bind(due_date);
    }
    if let Some(category_id) = category_id {
        query = query.bind(category_id);
    }
    query.bind(existing.id).execute(pool).await?;

    select_todo(pool, id).await
}

/// Loescht eine Aufgabe und gibt zurueck, was geloescht wurde.
pub async fn delete_todo(pool: &Pool<Sqlite>, id: i64) -> Result<Todo, StoreError> {
    let todo = select_todo(pool, id).await?;
    sqlx::query("DELETE FROM todos WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(todo)
}

// --- Zeiterfassung ----------------------------------------------------------

#[derive(sqlx::FromRow)]
struct WeekSlotRow {
    date: String,
    slot: i64,
    category_id: i64,
    category_name: Option<String>,
    note: String,
}

/// Eine Woche Zeitbuchungen samt Summen je Kategorie.
///
/// `day` darf ein beliebiger Tag der Woche sein; zurueck kommt immer die Woche
/// ab ihrem Montag, nach derselben Regel wie `startOfWeek` in
/// `src/timeSlots.ts` (der Sonntag gehoert zur Woche davor).
pub async fn week_time(pool: &Pool<Sqlite>, day: &str) -> Result<WeekTime, StoreError> {
    let day = check_date(day)?;

    // strftime('%w'): 0 = Sonntag … 6 = Samstag. (%w + 6) % 7 ist der Abstand
    // zum Montag, fuer den Sonntag also sechs Tage zurueck.
    let monday: String = sqlx::query_scalar(
        "SELECT date(?, '-' || ((CAST(strftime('%w', ?) AS INTEGER) + 6) % 7) || ' days')",
    )
    .bind(&day)
    .bind(&day)
    .fetch_one(pool)
    .await?;

    let rows: Vec<WeekSlotRow> = sqlx::query_as(
        "SELECT s.date, s.slot, s.category_id, c.name AS category_name, s.note
         FROM time_slots s LEFT JOIN categories c ON c.id = s.category_id
         WHERE s.date >= ? AND s.date <= date(?, '+6 days')
         ORDER BY s.date ASC, s.slot ASC",
    )
    .bind(&monday)
    .bind(&monday)
    .fetch_all(pool)
    .await?;

    let slots: Vec<WeekSlot> = rows
        .into_iter()
        .map(|row| WeekSlot {
            date: row.date,
            slot: row.slot,
            time: slot_label(row.slot),
            category_id: row.category_id,
            category_name: row.category_name,
            note: row.note,
        })
        .collect();

    // Summiert in Rust statt per GROUP BY, damit die Ordnung dieselbe ist wie
    // in `sumByCategory` (src/timeSlots.ts): absteigend nach Dauer, bei
    // Gleichstand nach Id.
    let mut totals: Vec<CategoryTotal> = Vec::new();
    for slot in &slots {
        match totals
            .iter_mut()
            .find(|t| t.category_id == slot.category_id)
        {
            Some(total) => total.slot_count += 1,
            None => totals.push(CategoryTotal {
                category_id: slot.category_id,
                category_name: slot.category_name.clone(),
                slot_count: 1,
                duration: String::new(),
            }),
        }
    }
    totals.sort_by(|a, b| {
        b.slot_count
            .cmp(&a.slot_count)
            .then_with(|| a.category_id.cmp(&b.category_id))
    });
    for total in &mut totals {
        total.duration = format_duration(total.slot_count);
    }

    let total_slots = count_to_i64(slots.len());
    Ok(WeekTime {
        monday,
        slots,
        totals,
        total_slots,
        total_duration: format_duration(total_slots),
    })
}

/// Bucht einen Lauf von Viertelstunden auf eine Kategorie.
///
/// `from_slot` einschliesslich, `to_slot` ausschliesslich -- 09:00 bis 10:00
/// sind also die Slots 36 bis 39. Bereits gebuchte Slots in diesem Bereich
/// werden ersetzt, alles ausserhalb bleibt unangetastet.
///
/// Die Notiz landet auf jedem Slot des Laufs. Das ist keine Verdopplung,
/// sondern das Speichermodell: eine Notiz gehoert dem Block, liegt physisch aber
/// am Slot, damit Teilen und Verschmelzen ohne Sonderfall auskommt (siehe
/// `normalizeNotes` in src/timeSlots.ts).
///
/// Der ganze Lauf geht in eine einzige Transaktion, so wie `replace_time_day_tx`
/// in lib.rs: ein Fehler in der Mitte laesst den Tag unveraendert.
pub async fn book_time(
    pool: &Pool<Sqlite>,
    date: &str,
    from_slot: i64,
    to_slot: i64,
    category: &str,
    note: Option<&str>,
) -> Result<Booking, StoreError> {
    let date = check_date(date)?;
    if from_slot < 0 || to_slot > SLOTS_PER_DAY {
        return bad_request("Der Zeitraum liegt nicht innerhalb eines Tages.");
    }
    if to_slot <= from_slot {
        return bad_request(format!(
            "Das Ende {} muss nach dem Beginn {} liegen.",
            slot_label(to_slot),
            slot_label(from_slot)
        ));
    }
    let category = resolve_category(pool, category).await?;
    let note = note.unwrap_or_default().to_string();

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM time_slots WHERE date = ? AND slot >= ? AND slot < ?")
        .bind(&date)
        .bind(from_slot)
        .bind(to_slot)
        .execute(&mut *tx)
        .await?;
    for slot in from_slot..to_slot {
        sqlx::query("INSERT INTO time_slots (date, slot, category_id, note) VALUES (?, ?, ?, ?)")
            .bind(&date)
            .bind(slot)
            .bind(category.id)
            .bind(&note)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    let slot_count = to_slot - from_slot;
    Ok(Booking {
        date,
        from: slot_label(from_slot),
        to: slot_label(to_slot),
        slot_count,
        duration: format_duration(slot_count),
        category_id: category.id,
        category_name: category.name,
        note,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    /// Muss dem echten Schema nach Migration 9 entsprechen -- insbesondere
    /// `categories.name` mit `UNIQUE COLLATE NOCASE` und `time_slots` OHNE
    /// Fremdschluessel auf die Kategorie. Ein Testschema, das vom echten
    /// abweicht, ist der Grund, warum das ON DELETE CASCADE aus Migration 7
    /// drei Reviews lang unbemerkt blieb.
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
        "CREATE TABLE app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
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

    fn expect_request_error(error: StoreError, needle: &str) -> String {
        match error {
            StoreError::Request(message) => {
                assert!(
                    message.contains(needle),
                    "message should name the problem, got: {message}"
                );
                message
            }
            StoreError::Db(e) => panic!("expected a request error, got a database error: {e}"),
        }
    }

    // --- list_todos ---------------------------------------------------------

    #[tokio::test]
    async fn list_todos_without_a_filter_returns_everything_newest_first() {
        let pool = setup().await;
        for title in ["erste", "zweite", "dritte"] {
            add_todo(&pool, title, None, None, None)
                .await
                .expect("add todo");
        }

        let todos = list_todos(&pool, None, None, None).await.expect("list");

        // Gleiche Ordnung wie `listTodos` in src/todoStoreSql.ts:
        // ORDER BY created_at DESC, id DESC. Innerhalb derselben Millisekunde
        // entscheidet die Id, darum ist das hier stabil.
        assert_eq!(
            todos.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(),
            vec!["dritte", "zweite", "erste"]
        );
    }

    #[tokio::test]
    async fn list_todos_filters_by_status() {
        let pool = setup().await;
        let offen = add_todo(&pool, "offen", None, None, None)
            .await
            .expect("add");
        let fertig = add_todo(&pool, "fertig", None, None, None)
            .await
            .expect("add");
        update_todo(
            &pool,
            fertig.id,
            TodoUpdate {
                status: Some("done".into()),
                ..TodoUpdate::default()
            },
        )
        .await
        .expect("update");

        let done = list_todos(&pool, Some("done"), None, None)
            .await
            .expect("list");
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].id, fertig.id);

        let todo = list_todos(&pool, Some("todo"), None, None)
            .await
            .expect("list");
        assert_eq!(todo.len(), 1);
        assert_eq!(todo[0].id, offen.id);
    }

    #[tokio::test]
    async fn list_todos_filters_by_category_name_case_insensitively() {
        let pool = setup().await;
        category(&pool, "Kundenprojekt").await;
        add_todo(&pool, "mit", None, None, Some("Kundenprojekt"))
            .await
            .expect("add");
        add_todo(&pool, "ohne", None, None, None)
            .await
            .expect("add");

        let found = list_todos(&pool, None, Some("  kundenPROJEKT "), None)
            .await
            .expect("list");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "mit");
        assert_eq!(found[0].category_name.as_deref(), Some("Kundenprojekt"));
    }

    #[tokio::test]
    async fn list_todos_filters_by_a_due_date_cutoff() {
        let pool = setup().await;
        add_todo(&pool, "frueh", None, Some("2026-09-01"), None)
            .await
            .expect("add");
        add_todo(&pool, "genau", None, Some("2026-09-10"), None)
            .await
            .expect("add");
        add_todo(&pool, "spaet", None, Some("2026-09-20"), None)
            .await
            .expect("add");
        add_todo(&pool, "ohne", None, None, None)
            .await
            .expect("add");

        let found = list_todos(&pool, None, None, Some("2026-09-10"))
            .await
            .expect("list");

        // `due_before` ist ausschliesslich, und ein Todo ohne Faelligkeit ist
        // vor keinem Datum faellig.
        assert_eq!(
            found.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(),
            vec!["frueh"]
        );
    }

    #[tokio::test]
    async fn list_todos_rejects_an_unknown_category_and_an_invalid_status_or_date() {
        let pool = setup().await;

        expect_request_error(
            list_todos(&pool, None, Some("Gibtsnicht"), None)
                .await
                .expect_err("unknown category"),
            "Gibtsnicht",
        );
        expect_request_error(
            list_todos(&pool, Some("erledigt"), None, None)
                .await
                .expect_err("bad status"),
            "erledigt",
        );
        expect_request_error(
            list_todos(&pool, None, None, Some("10.09.2026"))
                .await
                .expect_err("bad date"),
            "10.09.2026",
        );
    }

    // --- add_todo -----------------------------------------------------------

    #[tokio::test]
    async fn add_todo_inserts_and_returns_the_row_with_defaults() {
        let pool = setup().await;

        let todo = add_todo(&pool, "  Einkaufen  ", None, None, None)
            .await
            .expect("add");

        assert_eq!(todo.title, "Einkaufen");
        assert_eq!(todo.status, "todo");
        assert_eq!(todo.priority, "medium");
        assert!(!todo.done);
        assert_eq!(todo.due_date, None);
        assert_eq!(todo.category_id, None);
        assert!(
            todo.created_at.starts_with("20") && todo.created_at.ends_with('Z'),
            "created_at should be an ISO timestamp, got {}",
            todo.created_at
        );

        let stored = list_todos(&pool, None, None, None).await.expect("list");
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].id, todo.id);
    }

    #[tokio::test]
    async fn add_todo_stores_the_given_priority_due_date_and_category() {
        let pool = setup().await;
        let id = category(&pool, "Kundenprojekt").await;

        let todo = add_todo(
            &pool,
            "Angebot",
            Some("high"),
            Some("2026-09-30"),
            Some("kundenprojekt"),
        )
        .await
        .expect("add");

        assert_eq!(todo.priority, "high");
        assert_eq!(todo.due_date.as_deref(), Some("2026-09-30"));
        assert_eq!(todo.category_id, Some(id));
        assert_eq!(todo.category_color.as_deref(), Some("#111111"));
    }

    #[tokio::test]
    async fn add_todo_with_an_unknown_category_errors_and_inserts_nothing() {
        let pool = setup().await;

        let error = add_todo(&pool, "Angebot", None, None, Some("Gibtsnicht"))
            .await
            .expect_err("unknown category");
        expect_request_error(error, "Gibtsnicht");

        assert!(
            list_todos(&pool, None, None, None)
                .await
                .expect("list")
                .is_empty()
        );
        // Eine Kategorie darf dabei auch nicht stillschweigend entstehen.
        assert!(list_categories(&pool).await.expect("list").is_empty());
    }

    #[tokio::test]
    async fn add_todo_rejects_an_empty_title_and_bad_values() {
        let pool = setup().await;

        expect_request_error(
            add_todo(&pool, "   ", None, None, None)
                .await
                .expect_err("empty title"),
            "Titel",
        );
        expect_request_error(
            add_todo(&pool, "Angebot", Some("dringend"), None, None)
                .await
                .expect_err("bad priority"),
            "dringend",
        );
        expect_request_error(
            add_todo(&pool, "Angebot", None, Some("morgen"), None)
                .await
                .expect_err("bad due date"),
            "morgen",
        );
        assert!(
            list_todos(&pool, None, None, None)
                .await
                .expect("list")
                .is_empty()
        );
    }

    // --- update_todo --------------------------------------------------------

    #[tokio::test]
    async fn update_todo_changes_only_the_fields_that_were_given() {
        let pool = setup().await;
        category(&pool, "Kundenprojekt").await;
        let todo = add_todo(
            &pool,
            "Angebot",
            Some("high"),
            Some("2026-09-30"),
            Some("Kundenprojekt"),
        )
        .await
        .expect("add");

        let updated = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                title: Some("Angebot v2".into()),
                ..TodoUpdate::default()
            },
        )
        .await
        .expect("update");

        assert_eq!(updated.title, "Angebot v2");
        assert_eq!(updated.priority, "high");
        assert_eq!(updated.due_date.as_deref(), Some("2026-09-30"));
        assert_eq!(updated.category_id, todo.category_id);
        assert_eq!(updated.status, "todo");
    }

    #[tokio::test]
    async fn update_todo_keeps_done_in_step_with_status() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Angebot", None, None, None)
            .await
            .expect("add");

        let done = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                status: Some("done".into()),
                ..TodoUpdate::default()
            },
        )
        .await
        .expect("update");
        assert!(done.done, "status done must set the done column");

        let back = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                status: Some("in_progress".into()),
                ..TodoUpdate::default()
            },
        )
        .await
        .expect("update");
        assert!(!back.done, "leaving done must clear the done column");
    }

    #[tokio::test]
    async fn update_todo_can_clear_the_due_date_and_the_category() {
        let pool = setup().await;
        category(&pool, "Kundenprojekt").await;
        let todo = add_todo(
            &pool,
            "Angebot",
            None,
            Some("2026-09-30"),
            Some("Kundenprojekt"),
        )
        .await
        .expect("add");

        let cleared = update_todo(
            &pool,
            todo.id,
            TodoUpdate {
                due_date: Some(None),
                category: Some(None),
                ..TodoUpdate::default()
            },
        )
        .await
        .expect("update");

        assert_eq!(cleared.due_date, None);
        assert_eq!(cleared.category_id, None);
        assert_eq!(cleared.category_name, None);
    }

    #[tokio::test]
    async fn update_todo_without_any_field_is_an_error() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Angebot", None, None, None)
            .await
            .expect("add");

        expect_request_error(
            update_todo(&pool, todo.id, TodoUpdate::default())
                .await
                .expect_err("nothing to change"),
            "kein",
        );
    }

    #[tokio::test]
    async fn update_todo_with_an_unknown_id_errors() {
        let pool = setup().await;

        expect_request_error(
            update_todo(
                &pool,
                4711,
                TodoUpdate {
                    title: Some("egal".into()),
                    ..TodoUpdate::default()
                },
            )
            .await
            .expect_err("unknown id"),
            "4711",
        );
        expect_request_error(
            update_todo(
                &pool,
                -1,
                TodoUpdate {
                    title: Some("egal".into()),
                    ..TodoUpdate::default()
                },
            )
            .await
            .expect_err("negative id"),
            "-1",
        );
    }

    #[tokio::test]
    async fn update_todo_with_an_unknown_category_errors_and_changes_nothing() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Angebot", None, None, None)
            .await
            .expect("add");

        expect_request_error(
            update_todo(
                &pool,
                todo.id,
                TodoUpdate {
                    title: Some("Angebot v2".into()),
                    category: Some(Some("Gibtsnicht".into())),
                    ..TodoUpdate::default()
                },
            )
            .await
            .expect_err("unknown category"),
            "Gibtsnicht",
        );

        let stored = list_todos(&pool, None, None, None).await.expect("list");
        assert_eq!(stored[0].title, "Angebot");
    }

    // --- delete_todo --------------------------------------------------------

    #[tokio::test]
    async fn delete_todo_removes_the_row() {
        let pool = setup().await;
        let todo = add_todo(&pool, "Angebot", None, None, None)
            .await
            .expect("add");

        let deleted = delete_todo(&pool, todo.id).await.expect("delete");
        assert_eq!(deleted.id, todo.id);
        assert!(
            list_todos(&pool, None, None, None)
                .await
                .expect("list")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn delete_todo_with_an_unknown_id_errors() {
        let pool = setup().await;

        expect_request_error(
            delete_todo(&pool, 4711).await.expect_err("unknown id"),
            "4711",
        );
    }

    // --- list_categories ----------------------------------------------------

    #[tokio::test]
    async fn list_categories_sorts_them_the_way_the_app_does() {
        let pool = setup().await;
        // Genau das Beispiel aus dem Doc-Kommentar von `compareCategoryNames`
        // in src/types.ts: erwartet wird "ärzte, Ärzte, foo#, Sport, xxx".
        for name in ["xxx", "Sport", "Ärzte", "foo#", "ärzte"] {
            category(&pool, name).await;
        }

        let names: Vec<String> = list_categories(&pool)
            .await
            .expect("list")
            .into_iter()
            .map(|c| c.name)
            .collect();

        assert_eq!(names, vec!["ärzte", "Ärzte", "foo#", "Sport", "xxx"]);
    }

    /// Haelt fest, wie weit die Rust-Sortierung mit der JavaScript-Kollation
    /// mitgeht -- und wo nicht.
    ///
    /// Die Erwartung stammt nicht aus dem Kopf, sondern aus dem echten
    /// `compareCategoryNames`:
    ///
    /// ```text
    /// node -e 'const k=n=>n.trim().toLocaleLowerCase("de");
    ///   const c=(a,b)=>k(a).localeCompare(k(b),"de")||a.localeCompare(b,"de");
    ///   console.log([…].sort(c))'
    /// ```
    ///
    /// Fuer alles, was ein deutscher Kategoriename ueblicherweise enthaelt,
    /// stimmen beide Ordnungen ueberein: Umlaute stehen bei ihrem
    /// Grundbuchstaben, ß bei "ss", "Cafe" vor "Café", "Strasse" vor "Straße".
    /// Nicht uebereinstimmen tut die Gewichtung der Zeichen
    /// `@ [ \ ] ^ _ ` { | } ~` gegenueber Ziffern: ICU stellt "_intern" vor
    /// "2fa", der Vergleich nach Codepoint andersherum. Bei den niedrigeren
    /// Satzzeichen -- "#tag" gegen "2fa" -- sind sich beide wieder einig, darum
    /// steht dieser Fall hier daneben. Das ist ein bekannter Unterschied und
    /// kein Fehler; die Begruendung steht an `compare_category_names`.
    #[test]
    fn the_sort_matches_the_javascript_collation_except_for_punctuation() {
        let mut names = vec![
            "Öl", "Zebra", "Apfel", "über", "ßeta", "Straße", "Strasse", "Café", "Cafe",
        ];
        names.sort_by(|a, b| compare_category_names(a, b));
        assert_eq!(
            names,
            vec![
                "Apfel", "Cafe", "Café", "Öl", "ßeta", "Strasse", "Straße", "über", "Zebra"
            ],
            "same order as compareCategoryNames in src/types.ts"
        );

        let mut agrees = vec!["2fa", "#tag", "Apfel"];
        agrees.sort_by(|a, b| compare_category_names(a, b));
        assert_eq!(
            agrees,
            vec!["#tag", "2fa", "Apfel"],
            "the lower punctuation still sorts ahead of the digits, as ICU does"
        );

        let mut mixed = vec!["_intern", "2fa", "Apfel"];
        mixed.sort_by(|a, b| compare_category_names(a, b));
        assert_eq!(
            mixed,
            vec!["2fa", "_intern", "Apfel"],
            "known divergence: JavaScript puts \"_intern\" first"
        );
    }

    #[tokio::test]
    async fn list_categories_returns_name_color_and_id() {
        let pool = setup().await;
        let id = category(&pool, "Kundenprojekt").await;

        let categories = list_categories(&pool).await.expect("list");
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].id, id);
        assert_eq!(categories[0].name, "Kundenprojekt");
        assert_eq!(categories[0].color, "#111111");
    }

    // --- week_time ----------------------------------------------------------

    #[tokio::test]
    async fn week_time_returns_the_slots_of_the_week_plus_per_category_totals() {
        let pool = setup().await;
        let kunde = category(&pool, "Kundenprojekt").await;
        let intern = category(&pool, "Intern").await;

        // Montag 2026-09-07 bis Sonntag 2026-09-13.
        book_time(&pool, "2026-09-07", 36, 40, "Kundenprojekt", Some("Sprint"))
            .await
            .expect("book");
        book_time(&pool, "2026-09-08", 36, 38, "Intern", None)
            .await
            .expect("book");
        // Ausserhalb der Woche und darf nicht auftauchen.
        book_time(&pool, "2026-09-14", 36, 44, "Intern", None)
            .await
            .expect("book");

        let week = week_time(&pool, "2026-09-07").await.expect("week");

        assert_eq!(week.monday, "2026-09-07");
        assert_eq!(week.slots.len(), 6);
        assert_eq!(week.slots[0].date, "2026-09-07");
        assert_eq!(week.slots[0].slot, 36);
        assert_eq!(week.slots[0].time, "09:00");
        assert_eq!(week.slots[0].category_id, kunde);
        assert_eq!(
            week.slots[0].category_name.as_deref(),
            Some("Kundenprojekt")
        );
        assert_eq!(week.slots[0].note, "Sprint");

        // Absteigend nach Dauer, wie `sumByCategory` in src/timeSlots.ts.
        assert_eq!(week.totals.len(), 2);
        assert_eq!(week.totals[0].category_id, kunde);
        assert_eq!(week.totals[0].slot_count, 4);
        assert_eq!(week.totals[0].duration, "1:00");
        assert_eq!(week.totals[1].category_id, intern);
        assert_eq!(week.totals[1].slot_count, 2);
        assert_eq!(week.totals[1].duration, "0:30");
        assert_eq!(week.total_slots, 6);
    }

    #[tokio::test]
    async fn week_time_normalises_any_day_to_its_monday() {
        let pool = setup().await;
        category(&pool, "Intern").await;
        book_time(&pool, "2026-09-07", 36, 37, "Intern", None)
            .await
            .expect("book");

        // Sonntag 2026-09-13 gehoert zu der Woche, die am 07.09. begann --
        // dieselbe Regel wie `startOfWeek` in src/timeSlots.ts.
        for day in ["2026-09-07", "2026-09-10", "2026-09-13"] {
            let week = week_time(&pool, day).await.expect("week");
            assert_eq!(week.monday, "2026-09-07", "{day} belongs to that week");
            assert_eq!(week.slots.len(), 1);
        }
    }

    #[tokio::test]
    async fn week_time_labels_a_deleted_category_as_unknown() {
        let pool = setup().await;
        let id = category(&pool, "Intern").await;
        book_time(&pool, "2026-09-07", 36, 37, "Intern", None)
            .await
            .expect("book");
        sqlx::query("DELETE FROM categories WHERE id = ?")
            .bind(id)
            .execute(&pool)
            .await
            .expect("delete category");

        // Die Buchung ueberlebt ihre Kategorie -- time_slots hat bewusst keinen
        // Fremdschluessel. Die Wochenansicht nennt sie "Geloeschte Kategorie".
        let week = week_time(&pool, "2026-09-07").await.expect("week");
        assert_eq!(week.slots.len(), 1);
        assert_eq!(week.slots[0].category_id, id);
        assert_eq!(week.slots[0].category_name, None);
        assert_eq!(week.totals[0].category_name, None);
    }

    #[tokio::test]
    async fn week_time_rejects_a_date_that_is_not_a_date() {
        let pool = setup().await;

        expect_request_error(
            week_time(&pool, "07.09.2026").await.expect_err("bad date"),
            "07.09.2026",
        );
        expect_request_error(
            week_time(&pool, "2026-02-30")
                .await
                .expect_err("no such day"),
            "2026-02-30",
        );
    }

    // --- book_time ----------------------------------------------------------

    #[tokio::test]
    async fn book_time_writes_a_run_of_slots_with_the_note_on_each() {
        let pool = setup().await;
        let id = category(&pool, "Kundenprojekt").await;

        let booking = book_time(&pool, "2026-09-07", 36, 40, "Kundenprojekt", Some("Sprint"))
            .await
            .expect("book");

        assert_eq!(booking.date, "2026-09-07");
        assert_eq!(booking.from, "09:00");
        assert_eq!(booking.to, "10:00");
        assert_eq!(booking.slot_count, 4);
        assert_eq!(booking.duration, "1:00");
        assert_eq!(booking.category_id, id);
        assert_eq!(booking.category_name, "Kundenprojekt");

        // Die Notiz liegt physisch an jedem Slot des Blocks, so wie es
        // `normalizeNotes` in src/timeSlots.ts herstellt.
        let rows = sqlx::query_as::<_, (i64, i64, String)>(
            "SELECT slot, category_id, note FROM time_slots WHERE date = ? ORDER BY slot",
        )
        .bind("2026-09-07")
        .fetch_all(&pool)
        .await
        .expect("select");
        assert_eq!(
            rows,
            vec![
                (36, id, "Sprint".to_string()),
                (37, id, "Sprint".to_string()),
                (38, id, "Sprint".to_string()),
                (39, id, "Sprint".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn book_time_replaces_slots_that_were_already_booked() {
        let pool = setup().await;
        let kunde = category(&pool, "Kundenprojekt").await;
        let intern = category(&pool, "Intern").await;

        book_time(&pool, "2026-09-07", 36, 44, "Kundenprojekt", Some("Sprint"))
            .await
            .expect("book");
        book_time(&pool, "2026-09-07", 38, 40, "Intern", Some("Jour fixe"))
            .await
            .expect("rebook");

        let rows = sqlx::query_as::<_, (i64, i64, String)>(
            "SELECT slot, category_id, note FROM time_slots WHERE date = ? ORDER BY slot",
        )
        .bind("2026-09-07")
        .fetch_all(&pool)
        .await
        .expect("select");
        assert_eq!(
            rows,
            vec![
                (36, kunde, "Sprint".to_string()),
                (37, kunde, "Sprint".to_string()),
                (38, intern, "Jour fixe".to_string()),
                (39, intern, "Jour fixe".to_string()),
                (40, kunde, "Sprint".to_string()),
                (41, kunde, "Sprint".to_string()),
                (42, kunde, "Sprint".to_string()),
                (43, kunde, "Sprint".to_string()),
            ],
            "only the booked range may change"
        );
    }

    #[tokio::test]
    async fn book_time_with_an_unknown_category_errors_and_writes_nothing() {
        let pool = setup().await;

        expect_request_error(
            book_time(&pool, "2026-09-07", 36, 40, "Gibtsnicht", None)
                .await
                .expect_err("unknown category"),
            "Gibtsnicht",
        );

        let count = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM time_slots")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 0);
        assert!(list_categories(&pool).await.expect("list").is_empty());
    }

    #[tokio::test]
    async fn book_time_rejects_an_empty_or_backwards_range_and_a_bad_date() {
        let pool = setup().await;
        category(&pool, "Intern").await;

        expect_request_error(
            book_time(&pool, "2026-09-07", 40, 36, "Intern", None)
                .await
                .expect_err("backwards"),
            "10:00",
        );
        expect_request_error(
            book_time(&pool, "2026-09-07", 36, 36, "Intern", None)
                .await
                .expect_err("empty"),
            "09:00",
        );
        expect_request_error(
            book_time(&pool, "2026-09-07", -1, 40, "Intern", None)
                .await
                .expect_err("out of range"),
            "Tages",
        );
        expect_request_error(
            book_time(&pool, "2026-09-07", 36, 97, "Intern", None)
                .await
                .expect_err("out of range"),
            "Tages",
        );
        expect_request_error(
            book_time(&pool, "07.09.2026", 36, 40, "Intern", None)
                .await
                .expect_err("bad date"),
            "07.09.2026",
        );

        let count = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM time_slots")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 0);
    }

    // --- Kategorie-Aufloesung ------------------------------------------------

    #[tokio::test]
    async fn a_category_name_resolves_by_the_frontends_key_rule() {
        let pool = setup().await;
        // NOCASE in SQLite faltet nur ASCII; "ärzte" muss trotzdem "Ärzte"
        // finden, weil `categoryNameKey` in src/types.ts unicode-korrekt
        // kleinschreibt.
        let id = category(&pool, "Ärzte").await;

        for given in ["Ärzte", "ärzte", "  ÄRZTE  "] {
            let found = resolve_category(&pool, given).await.expect("resolve");
            assert_eq!(found.id, id, "{given} should resolve");
        }
    }

    #[tokio::test]
    async fn an_unknown_category_name_is_a_request_error_naming_it() {
        let pool = setup().await;
        category(&pool, "Intern").await;

        let message = expect_request_error(
            resolve_category(&pool, "Kundenprojekt")
                .await
                .expect_err("unknown"),
            "Kundenprojekt",
        );
        // Die Meldung soll dem Modell weiterhelfen, nicht nur absagen.
        assert!(
            message.contains("Intern"),
            "the message should list what does exist: {message}"
        );
    }

    // --- Fehlerarten --------------------------------------------------------

    #[tokio::test]
    async fn a_database_failure_is_a_different_error_kind_than_a_bad_request() {
        // Ohne Schema schlaegt jede Abfrage in der Datenbank fehl. Task 3 macht
        // daraus einen Protokollfehler, waehrend StoreError::Request als
        // Tool-Fehler beim Aufrufer landet -- die Unterscheidung muss hier im
        // Typ stecken, sonst kann Task 3 sie nicht treffen.
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("in-memory pool");

        match list_todos(&pool, None, None, None).await {
            Err(StoreError::Db(_)) => {}
            other => panic!("expected a database error, got {other:?}"),
        }
    }
}
