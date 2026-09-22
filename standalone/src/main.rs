#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[tauri::command]
async fn read_file(path: String) -> Result<roc_desk_common::fsops::FileContent, String> { roc_desk_editor::read_local_file(&path).await.map_err(|e| e.to_string()) }
#[tauri::command]
async fn write_file(path: String, text: String, expected_mtime: Option<i64>) -> Result<roc_desk_common::fsops::WriteOutcome, String> { roc_desk_editor::write_local_file(&path, &text, expected_mtime).await.map_err(|e| e.to_string()) }

fn main() { tauri::Builder::default().invoke_handler(tauri::generate_handler![read_file, write_file]).run(tauri::generate_context!()).expect("failed to run standalone tool"); }
