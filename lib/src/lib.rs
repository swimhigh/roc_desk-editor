//! 编辑器：文本、代码、二进制与预览
//!
//! This crate is the stable integration boundary for the host and standalone
//! shell, and the embeddable boundary for `roc_desk-workspace` (which embeds
//! this tool's editor pane rather than re-implementing one -- see
//! `docs/MULTI_REPO_SPLIT_PLAN.md` §9 in the host repository).
//!
//! Local filesystem read/write (open/save/binary preview/EXE-JAR inspection)
//! is intentionally NOT re-implemented here -- it is fully owned by
//! `roc_desk-explorer`, which already ported the 19 `local_*` commands from
//! the host's `commands/local_fs.rs`. Callers (this crate's `standalone`
//! shell, and eventually the host) register `roc_desk_explorer::cmd::local_*`
//! directly alongside the two command groups this crate does own:
//!
//! - [`ocr`]: `editor_ocr_image`, Windows `Media.Ocr`-backed text recognition
//!   for the image preview panel.
//! - [`symbols`]: `editor_symbols_*`, a lightweight regex-based "go to
//!   definition/declaration" index over a local file tree.
//!
//! Both are genuinely editor-specific additions -- OCR belongs to the image
//! preview panel, and the symbol index's underlying logic
//! (`roc_desk_common::symbols`) is shared with `roc_desk-workspace`, but the
//! Tauri command handlers and the state that backs them belong to whichever
//! tool's UI triggers them.
pub const TOOL_NAME: &str = "roc_desk-editor";
pub const TOOL_DESCRIPTION: &str = "编辑器：文本、代码、二进制与预览";

/// Returns the user-visible metadata used by the standalone shell and host launcher.
pub fn tool_info() -> (&'static str, &'static str) {
    (TOOL_NAME, TOOL_DESCRIPTION)
}

pub mod ocr;
pub mod symbols;

pub use roc_desk_common::fsops::{FileOps, LocalFileOps};
