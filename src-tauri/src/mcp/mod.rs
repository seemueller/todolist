pub mod auth;
pub mod slots;
pub mod store;

use std::sync::Arc;

use rmcp::{
    ServerHandler,
    handler::server::router::tool::ToolRouter,
    model::{ServerCapabilities, ServerInfo},
    tool_handler, tool_router,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use sqlx::{Pool, Sqlite};
use tokio_util::sync::CancellationToken;

/// Fest verdrahtet; ein konfigurierbarer Port ist ausdruecklich nicht vorgesehen.
pub const PORT: u16 = 4319;

/// Haelt den Pool, ueber den die Tools spaeter lesen und schreiben. Noch ohne
/// Tools -- die kommen in Task 3 dazu.
#[derive(Clone)]
pub struct TodoServer {
    #[allow(dead_code)]
    pool: Pool<Sqlite>,
    tool_router: ToolRouter<Self>,
}

impl TodoServer {
    pub fn new(pool: Pool<Sqlite>) -> Self {
        Self {
            pool,
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl TodoServer {}

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
    token: String,
    cancel: CancellationToken,
) -> Result<(), std::io::Error> {
    let service: StreamableHttpService<TodoServer, LocalSessionManager> =
        StreamableHttpService::new(
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
}
