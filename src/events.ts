/**
 * Ereignisse, die das Rust-Backend an die offene Oberflaeche schickt.
 *
 * Der Name steht auch in `src-tauri/src/mcp/mod.rs`; beide Seiten muessen
 * denselben String benutzen, sonst hoert niemand zu.
 */

/** Der MCP-Server hat geschrieben -- die betroffene Ansicht laedt neu. */
export const DATA_CHANGED_EVENT = "todolist:data-changed";
