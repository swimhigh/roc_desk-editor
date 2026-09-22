//! `editor_symbols_*` command handlers, built on the shared indexing logic
//! in `roc_desk_common::symbols`.
//!
//! Deviates from the host's `commands/symbols.rs` in one deliberate way: the
//! host keys its index by `workspace_id: Uuid` against a workspace registry
//! (`AppState.workspaces`) that only exists inside a "programming workspace"
//! session -- a concept this tool doesn't own (that's `roc_desk-workspace`'s
//! `AppState`). This crate's own UI (the standalone editor, and the "loose
//! file" editing mode embedded elsewhere) has no such registry, only a
//! filesystem root path someone opened. So the index here is keyed by the
//! workspace root path (`String`) instead of a `Uuid`, and only supports the
//! local filesystem (`LocalFileOps`) -- SSH/Agent-backed symbol indexing
//! stays a `roc_desk-workspace` concern, since that tool owns the remote
//! `FileOps` implementations and its own `workspace_id` registry.
//!
//! Commands are prefixed `editor_` (rather than reusing the host's bare
//! `symbols_*` names) so they don't collide when both this crate's commands
//! and `roc_desk-workspace`'s own `symbols_*` commands are registered in the
//! same merged host binary.

use std::collections::HashMap;

use tauri::State;
use tokio::sync::RwLock;

use roc_desk_common::fsops::LocalFileOps;
use roc_desk_common::symbols::{build_index, SymbolIndex};
pub use roc_desk_common::symbols::SymbolLocation;
use roc_desk_core::error::AppError;

/// Tauri-managed state holding one symbol index per opened workspace root.
/// `standalone/src/main.rs` registers this via `.manage(SymbolIndexState::default())`.
#[derive(Default)]
pub struct SymbolIndexState(pub RwLock<HashMap<String, SymbolIndex>>);

/// Scans `root` (a local directory) and rebuilds its symbol index from
/// scratch. Returns the number of indexed symbols, purely informational.
#[tauri::command]
pub async fn editor_symbols_build_index(
    state: State<'_, SymbolIndexState>,
    root: String,
) -> Result<usize, AppError> {
    let index = build_index(&LocalFileOps, &root).await?;
    let count = index.len();
    state.0.write().await.insert(root, index);
    Ok(count)
}

/// "Go to definition/declaration" -- looks up `symbol` in the index built
/// for `root`. Multiple matches are all returned; the frontend's Monaco
/// multi-result UI lets the user pick.
#[tauri::command]
pub async fn editor_symbols_go_to_definition(
    state: State<'_, SymbolIndexState>,
    root: String,
    symbol: String,
) -> Result<Vec<SymbolLocation>, AppError> {
    let indexes = state.0.read().await;
    Ok(indexes
        .get(&root)
        .map(|index| index.lookup(&symbol))
        .unwrap_or_default())
}

/// Incrementally reindexes a single file after it's saved, instead of
/// rescanning the whole tree. If `root` has no index yet (build_index was
/// never called), a fresh one containing just this file is created in
/// place -- a later full `editor_symbols_build_index` run will replace it.
#[tauri::command]
pub async fn editor_symbols_reindex_file(
    state: State<'_, SymbolIndexState>,
    root: String,
    path: String,
    content: String,
) -> Result<(), AppError> {
    let mut indexes = state.0.write().await;
    indexes.entry(root).or_default().index_file(&path, &content);
    Ok(())
}
