#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use roc_desk_editor::symbols::SymbolIndexState;
use tauri::{Emitter, Manager};

/// Windows"打开方式"/双击已关联文件时，资源管理器把文件的完整路径直接拼进
/// argv（`roc_desk-editor.exe "C:\a\b.txt"`），不带任何前缀标记；这里只排除
/// 看起来像 flag 的参数（`-` 开头），防御性过滤，这个 exe 目前没有任何命令行
/// flag。和 host `roc_desk.exe` 的同名辅助函数（`roc_desk/src-tauri/src/
/// lib.rs::extract_open_paths`）逻辑一致，调用方各自负责跳过 argv[0]。
fn extract_open_paths(args: &[String]) -> Vec<String> {
    args.iter()
        .filter(|a| !a.starts_with('-'))
        .cloned()
        .collect()
}

/// 冷启动时带的待打开路径——前端挂载后调 `take_pending_open_paths` 取走并
/// 清空（和 host `AppState.pending_open_paths` 同一种模式）。
struct PendingOpenPaths(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending_open_paths(state: tauri::State<'_, PendingOpenPaths>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

fn main() {
    let mut builder = tauri::Builder::default();
    // 必须是第一个注册的插件（官方文档要求）：已有实例在跑时拦截这次启动，把
    // 新进程 argv 里的文件路径转发给已有窗口而不是真的再开一个窗口实例。
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        let paths = extract_open_paths(argv.get(1..).unwrap_or(&[]));
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        if !paths.is_empty() {
            let _ = app.emit("open-file-paths", paths);
        }
    }));

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SymbolIndexState::default())
        .manage(PendingOpenPaths(Mutex::new(extract_open_paths(
            &std::env::args().skip(1).collect::<Vec<_>>(),
        ))))
        .invoke_handler(tauri::generate_handler![
            take_pending_open_paths,
            // Local filesystem surface, reused as-is from roc_desk-explorer --
            // see lib/src/lib.rs for why this tool doesn't reimplement it.
            // `tauri::generate_handler!` requires the fully-qualified path
            // (not a `use`-imported bare name) because `#[tauri::command]`
            // emits a matching `__cmd__<name>` macro in the same module the
            // function lives in, and macro name resolution doesn't follow a
            // plain `use` the way the function item does.
            roc_desk_explorer::cmd::local_list_dir,
            roc_desk_explorer::cmd::local_list_drives,
            roc_desk_explorer::cmd::local_home_dir,
            roc_desk_explorer::cmd::local_is_dir,
            roc_desk_explorer::cmd::local_delete,
            roc_desk_explorer::cmd::local_rename,
            roc_desk_explorer::cmd::local_copy,
            roc_desk_explorer::cmd::local_create_dir,
            roc_desk_explorer::cmd::local_move,
            roc_desk_explorer::cmd::local_read_file,
            roc_desk_explorer::cmd::local_write_file,
            roc_desk_explorer::cmd::local_read_file_with_encoding,
            roc_desk_explorer::cmd::local_write_file_with_encoding,
            roc_desk_explorer::cmd::local_read_binary_preview,
            roc_desk_explorer::cmd::local_open_externally,
            roc_desk_explorer::cmd::local_convert_legacy_office_to_pdf,
            roc_desk_explorer::cmd::local_inspect_binary,
            roc_desk_explorer::cmd::local_peek_is_binary,
            roc_desk_explorer::cmd::local_inspect_jar,
            // Editor-owned commands.
            roc_desk_editor::ocr::editor_ocr_image,
            roc_desk_editor::symbols::editor_symbols_build_index,
            roc_desk_editor::symbols::editor_symbols_go_to_definition,
            roc_desk_editor::symbols::editor_symbols_reindex_file,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run standalone tool");
}
