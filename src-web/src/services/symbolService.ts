import { invoke } from "@tauri-apps/api/core";
import type { SymbolLocation } from "../types/bindings";

/** 符号索引（"转到定义/声明"）：后端是自己写的轻量正则符号扫描器（不是真正的
 * ctags/LSP），只覆盖打开了一个根目录（本地文件树）的场景。
 *
 * 和宿主 `symbolService.ts` 的区别：宿主按 `workspaceId`（工作区注册表里的
 * Uuid）索引，因为那是"编程工作区"（`roc_desk-workspace`）自己的概念；这个
 * 工具（编辑器）没有工作区注册表，只有"打开了哪个本地根目录"，所以按根目录
 * 路径字符串索引——好处是"游离文件"模式（没有工作区、只是打开了一个本地
 * 文件夹）也能用上转到定义，宿主里这个功能之前是禁用的。 */
export const symbolService = {
  /** 打开一个根目录时调一次，全量扫描重建索引。返回索引到的符号总数，前端
   * 没有用来展示，失败也不影响正常编辑。 */
  buildIndex(root: string): Promise<number> {
    return invoke("editor_symbols_build_index", { root });
  },
  goToDefinition(root: string, symbol: string): Promise<SymbolLocation[]> {
    return invoke("editor_symbols_go_to_definition", { root, symbol });
  },
  /** 文件保存成功后调用，增量重建这一个文件的条目，不用重新扫全目录。 */
  reindexFile(root: string, path: string, content: string): Promise<void> {
    return invoke("editor_symbols_reindex_file", { root, path, content });
  },
};
