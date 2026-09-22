//! 编辑器：文本、代码、二进制与预览
//! 
//! This crate is the stable integration boundary for the host and standalone shell.
pub const TOOL_NAME: &str = "roc_desk-editor";
pub const TOOL_DESCRIPTION: &str = "编辑器：文本、代码、二进制与预览";

/// Returns the user-visible metadata used by the standalone shell and host launcher.
pub fn tool_info() -> (&'static str, &'static str) {
    (TOOL_NAME, TOOL_DESCRIPTION)
}

pub use roc_desk_common::fsops::{FileOps, LocalFileOps};
