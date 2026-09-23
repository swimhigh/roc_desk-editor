#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use roc_desk_editor::symbols::SymbolIndexState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SymbolIndexState::default())
        .invoke_handler(tauri::generate_handler![
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
