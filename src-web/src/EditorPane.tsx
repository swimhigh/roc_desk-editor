import React from "react";
import { CodeEditor } from "./components/Editor/CodeEditor";
import { ToastStack } from "./components/shared/Toast";

export interface EditorPaneProps {
  /** 传 `null` 表示"没有工作区"（游离文件/独立编辑器模式）；嵌入方
   * （比如 `roc_desk-workspace`）传自己的工作区 id，文件读写会走 `fs_*` 命令
   * （需要嵌入方自己在合并后的宿主里也注册好这些命令，本工具不提供）。 */
  workspaceId: string | null;
  /** `workspaceId` 非空时用于面包屑第一段展示；`workspaceId` 为 `null` 时忽略。 */
  workspaceName?: string;
  /** 本地根目录（原生目录选择器选出来的绝对路径）。`workspaceId` 为 `null` 时，
   * 只要传了 `rootPath`，符号索引（转到定义）依然会针对这个目录工作——这是
   * 本工具相对宿主版本的改进,见 `CodeEditor.tsx` 顶部注释。 */
  rootPath?: string;
  /** 见 `CodeEditorProps.onRevealInWorkspace`。 */
  onRevealInWorkspace?: (workspaceId: string, path: string) => void;
}

/**
 * 可嵌入的编辑器面板——`roc_desk-editor` 对外的稳定集成边界，供本工具自己的
 * 独立壳（`standalone/`）和其它工具（`roc_desk-workspace` 内嵌一个编辑器面板）
 * 使用。不含文件树/标签栏之外的布局决定权，嵌入方自己决定左侧放什么、整体
 * 尺寸怎么分配——这个组件只负责"标签页 + Monaco + 各类预览面板"这一块。
 *
 * 前置条件：嵌入方的 Tauri 后端需要注册好这个组件依赖的 IPC 命令——
 * `workspaceId` 为 `null` 的本地模式只需要 `roc_desk_explorer::cmd::local_*`
 * （本仓库的 `standalone` 就是这样接的，见 `standalone/src/main.rs`）；
 * `workspaceId` 非空的工作区模式还需要嵌入方自己实现 `fs_*` 系列命令
 * （工作区边界校验、SFTP/Agent 远程读写——这是 `roc_desk-workspace` 的职责，
 * 不是这个包的）。
 */
export const EditorPane: React.FC<EditorPaneProps> = ({
  workspaceId,
  workspaceName = "",
  rootPath = "",
  onRevealInWorkspace,
}) => {
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <CodeEditor
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        rootPath={rootPath}
        onRevealInWorkspace={onRevealInWorkspace}
      />
      <ToastStack />
    </div>
  );
};
