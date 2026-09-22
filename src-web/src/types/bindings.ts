// Hand-written IPC type bindings, kept in sync with the Rust side by hand
// (the same interim approach the host repo uses -- see its
// `src-web/src/types/bindings.ts` for the full set this is a subset of).
//
// This subset covers only what roc_desk-editor's own components need. The
// long-term home for these types is `@roc_desk/ui-core`'s `bindings.ts`
// (`packages/ui-core/src/bindings.ts` in `roc_desk-common`), which already
// carries the full superset -- once this tool's `package.json` depends on
// that package, this file can be deleted in favor of importing from there.

/** "转到定义/声明"命中的一个候选位置（roc_desk_common::symbols::SymbolLocation）。*/
export interface SymbolLocation {
  path: string;
  /** 1-based 行号，和 Monaco Range 的行号约定一致。 */
  line: number;
  kind: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  modified: number | null;
}

export interface FileContent {
  text: string;
  encoding: string;
  mtime: number;
  /** 文件总字节数（不是 text 的长度——truncated 为 true 时 text 只是截断预览）。 */
  total_size: number;
  /** 文件过大、text 只是截断预览时为 true；此时编辑器应转只读，禁止保存。 */
  truncated: boolean;
}

export type WriteOutcome =
  | { type: "Written"; mtime: number }
  | { type: "Conflict"; current_mtime: number; current_preview: string };

/** 对应后端 `binary_info::BinaryInfo`——打开 EXE/DLL/SO 等可执行文件时展示
 * 的基本信息 + 依赖库列表。 */
export interface BinaryInfo {
  format: string;
  architecture: string;
  bitness: string;
  file_kind: string;
  entry_point: string | null;
  timestamp: string | null;
  subsystem: string | null;
  dependencies: string[];
  exports: string[];
  exports_truncated: boolean;
  total_exports: number;
  sections: BinarySection[];
}

export interface BinarySection {
  name: string;
  virtual_size: number;
  raw_size: number;
}

/** 对应后端 `jar_info::JarInfo`——打开 JAR 包时展示的基本信息（manifest/
 * Main-Class/Class-Path）+ 内部条目列表。 */
export interface JarInfo {
  total_entries: number;
  class_count: number;
  main_class: string | null;
  class_path: string[];
  manifest: ManifestAttribute[];
  entries: JarEntryInfo[];
  entries_truncated: boolean;
}

export interface ManifestAttribute {
  key: string;
  value: string;
}

export interface JarEntryInfo {
  path: string;
  is_dir: boolean;
  size: number;
  compressed_size: number;
}

export type SearchMode = "content" | "file_name";

export interface SearchOptions {
  case_sensitive: boolean;
  whole_word: boolean;
  use_regex: boolean;
}

export interface ReplaceSummary {
  files_changed: number;
  occurrences_replaced: number;
}

export type AppErrorKind =
  | "Connection"
  | "Auth"
  | "HostKeyRejected"
  | "PermissionDenied"
  | "NotFound"
  | "Database"
  | "Conflict"
  | "Internal";

export interface AppError {
  kind: AppErrorKind;
  message: string;
}

export function isAppError(e: unknown): e is AppError {
  return typeof e === "object" && e !== null && "kind" in e && "message" in e;
}
