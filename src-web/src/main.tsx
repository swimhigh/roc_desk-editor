import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openFilePickerDialog } from "@tauri-apps/plugin-dialog";
import { Code2, FilePlus2 } from "lucide-react";
import "./monacoSetup";
import { LocalFileTree } from "./components/Editor/LocalFileTree";
import { EditorPane } from "./EditorPane";
import { ThemeToggle } from "./components/shared/ThemeToggle";
import { useToastStore } from "./components/shared/Toast";
import { useEditorStore } from "./stores/editorStore";
import { formatError } from "./utils/error";
import "./styles.css";

/**
 * 独立编辑器壳的挂载入口——UltraEdit 式布局：左侧本地文件树（`LocalFileTree`，
 * 默认展示"此电脑"全部盘符，支持钉常用目录/多选/剪切复制/新建/删除/重命名，和
 * 宿主 `roc_desk` 里编辑器工作台左侧面板是同一份实现），右侧 `<EditorPane/>`
 * （Monaco 多标签编辑 + 图片/PDF 预览 + OCR）。
 *
 * 早期版本这里挂载的是一个 27 行的极简 `StandaloneFileTree`（只有点击展开/
 * 打开，没有多选、剪切复制、新建、删除、重命名），`LocalFileTree` 虽然已经
 * 完整搬过来了但没有接进这个入口——用户反馈"编辑器的功能要和原始的 roc_desk
 * 保持一致"后改成这样接。
 *
 * 顶部工具条/侧栏宽度拖拽这部分的 markup、CSS class（`.tab-bar`/`.app-icon`/
 * `.workspace-name-btn`/`.quick-tools`/`.sidebar-resize-handle`）、"打开文件
 * (Ctrl+O)"按钮都直接照抄宿主 `roc_desk.exe` 的 `mode === "editor"` 独立编辑器
 * 模块窗口（`App.tsx` 对应那一段）——2026-10 用户反馈这个独立 exe 的界面式样
 * 和宿主差距太大，要求保持一致。宿主那个模式窗口还有一个"返回首页"按钮和底部
 * 可折叠终端面板，前者没有意义（这个 exe 没有宿主那个多模块首页/启动器概念），
 * 后者需要整套本地 PTY 终端支持（宿主走 `portable-pty` + 一堆 `pty_*` 命令），
 * 这个工具目前完全没有这部分后端，属于比"界面式样"大得多的另一个功能，这次
 * 没有一并加上。
 */
const App: React.FC = () => {
  const [root, setRoot] = React.useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    const stored = Number(localStorage.getItem("roc_desk-editor-sidebar-width"));
    return stored >= 160 && stored <= 600 ? stored : 260;
  });
  const sidebarDragRef = React.useRef<{ startX: number; startWidth: number } | null>(null);
  const push = useToastStore((s) => s.push);

  // Windows"打开方式"/双击已关联的 .txt 等文件：冷启动带的路径存在后端
  // `PendingOpenPaths` 里，这里挂载时取走一次；已运行实例收到的第二次启动
  // 转发走 `open-file-paths` 事件，两条路径最终都汇到同一个处理函数（和 host
  // `roc_desk.exe` 的 `App.tsx` 同一套机制）。
  React.useEffect(() => {
    void invoke<string[]>("take_pending_open_paths").then((paths) => {
      for (const p of paths) void useEditorStore.getState().openStandaloneFile(p);
    });
  }, []);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const fn = await listen<string[]>("open-file-paths", (event) => {
        for (const p of event.payload) void useEditorStore.getState().openStandaloneFile(p);
      });
      if (cancelled) fn();
      else unlisten = fn;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const openFileDialog = React.useCallback(async () => {
    const selected = await openFilePickerDialog({ directory: false, multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const p of paths) {
      await useEditorStore.getState().openStandaloneFile(p).catch((e) => push("error", `打开失败：${formatError(e)}`));
    }
  }, [push]);

  // Ctrl+O 全局快捷键，和宿主同一套（`App.tsx` 对应那段注释）。
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openFileDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openFileDialog]);

  const onSidebarDragStart = (e: React.MouseEvent) => {
    sidebarDragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    let latest = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!sidebarDragRef.current) return;
      const delta = ev.clientX - sidebarDragRef.current.startX;
      latest = Math.max(160, Math.min(600, sidebarDragRef.current.startWidth + delta));
      setSidebarWidth(latest);
    };
    const onUp = () => {
      sidebarDragRef.current = null;
      localStorage.setItem("roc_desk-editor-sidebar-width", String(latest));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="tab-bar">
        <Code2 className="app-icon" />
        <span className="workspace-name-btn" style={{ cursor: "default" }}>
          本地文件
        </span>
        <div className="quick-tools">
          <button className="quick-tool-btn" title="打开文件 (Ctrl+O)" onClick={() => void openFileDialog()}>
            <FilePlus2 />
          </button>
          <ThemeToggle />
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: sidebarWidth, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-surface)" }}>
          <LocalFileTree
            root={root}
            onRootChange={setRoot}
            onOpenFile={(p) =>
              void useEditorStore.getState().openStandaloneFile(p).catch((e) => push("error", `打开失败：${formatError(e)}`))
            }
          />
        </div>
        <div className="sidebar-resize-handle" onMouseDown={onSidebarDragStart} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* `<EditorPane/>` 自己已经挂了一份 `<ToastStack/>`（见其定义），这里
              不用再挂一份——两份会把同一个 zustand store 里的 toast 渲染两遍。 */}
          <EditorPane workspaceId={null} rootPath={root ?? undefined} />
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
