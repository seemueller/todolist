pub mod auth;
pub mod slots;
pub mod store;
pub mod tools;

use std::sync::Arc;

use rmcp::{
    ServerHandler,
    handler::server::router::tool::ToolRouter,
    model::{ServerCapabilities, ServerInfo},
    tool_handler,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use sqlx::{Pool, Sqlite};
use tokio_util::sync::CancellationToken;

/// Fest verdrahtet; ein konfigurierbarer Port ist ausdruecklich nicht vorgesehen.
pub const PORT: u16 = 4319;

/// Der Name muss mit `src/events.ts` uebereinstimmen, sonst hoert niemand zu.
pub const DATA_CHANGED_EVENT: &str = "todolist:data-changed";

/// Sagt der offenen Oberflaeche, dass sich in der Datenbank etwas geaendert hat.
///
/// Ein eigener Trait statt eines `AppHandle` im Server: der Handle ist in einem
/// Test nicht zu bekommen, ohne Tauri mit seinem `test`-Feature hereinzuziehen.
/// So bleibt pruefbar, was hier tatsaechlich zu entscheiden ist -- naemlich
/// welcher Aufruf meldet und welcher nicht -- waehrend die eine echte
/// Implementierung darunter nur noch `emit` ruft.
pub trait Notifier: Send + Sync + 'static {
    fn data_changed(&self);
}

impl Notifier for tauri::AppHandle {
    fn data_changed(&self) {
        use tauri::Emitter;
        // Ein fehlgeschlagenes Senden ist folgenlos: geschrieben ist bereits,
        // und die Ansicht laedt spaetestens beim naechsten Start neu.
        if let Err(e) = self.emit(DATA_CHANGED_EVENT, ()) {
            eprintln!("MCP: could not emit {DATA_CHANGED_EVENT}: {e}");
        }
    }
}

/// Haelt den Pool, ueber den die Tools lesen und schreiben, und den Weg zurueck
/// zur Oberflaeche.
///
/// Die Tools selbst stehen in `tools.rs`; von dort kommt auch der
/// `#[tool_router]`-Block, der `Self::tool_router()` erzeugt.
#[derive(Clone)]
pub struct TodoServer {
    pub(crate) pool: Pool<Sqlite>,
    pub(crate) notifier: Arc<dyn Notifier>,
    tool_router: ToolRouter<Self>,
}

impl TodoServer {
    pub fn new(pool: Pool<Sqlite>, notifier: Arc<dyn Notifier>) -> Self {
        Self {
            pool,
            notifier,
            tool_router: Self::tool_router(),
        }
    }
}

// Ohne `#[tool_handler]` kompiliert alles, und `tools/list` kommt leer zurueck.
#[tool_handler(router = self.tool_router)]
impl ServerHandler for TodoServer {
    fn get_info(&self) -> ServerInfo {
        // Ohne `with_server_info` heisst der Server "rmcp": `ServerInfo::new`
        // liest den CARGO_CRATE_NAME der rmcp-Crate, nicht unseren.
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(rmcp::model::Implementation::new(
                "todolist",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions("Todos, Kategorien und Zeitbuchungen der TodoList-App")
    }
}

/// Serviert MCP auf 127.0.0.1, bis `cancel` feuert.
///
/// Beide Enden des Shutdowns muessen verdrahtet sein: das Token auf der Config
/// beendet die Sessions, `with_graceful_shutdown` den Listener. Nur eins davon
/// laesst den Prozess beim Schliessen des Fensters haengen, weil `axum::serve`
/// auf offene Verbindungen wartet und SSE-Streams von sich aus nie enden.
pub async fn serve(
    pool: Pool<Sqlite>,
    notifier: Arc<dyn Notifier>,
    token: String,
    cancel: CancellationToken,
) -> Result<(), std::io::Error> {
    let service: StreamableHttpService<TodoServer, LocalSessionManager> =
        StreamableHttpService::new(
            // Laeuft einmal je Session; Pool und Notifier sind beide billig zu
            // klonen.
            move || Ok(TodoServer::new(pool.clone(), notifier.clone())),
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
}
